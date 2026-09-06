#!/usr/bin/env python3
"""Task distribution atlas: what the platform is actually being used for.

Reads normalized sessions.jsonl plus OPTIONAL label sources, and reports the
intent x dept x month distribution with label-provenance tiers. Standard library
only; works without any classifier by reporting everything as unknown.

Label provenance tiers (highest wins when several exist for one session):
  human    — from value_loop reviews (task_type)          -> reported as-is
  router   — classifier predictions jsonl {session_id,label,confidence}
             confidence >= --threshold                    -> candidate
  keywords — substring rules {label: [words]}             -> candidate
  (none)                                                  -> unknown, never guessed

Honesty rules encoded here:
1. The label describes the FIRST user message only. A session with mixed goals
   is counted once under its primary candidate; it is not split automatically.
2. unknown stays unknown and is always shown with its count; coverage n/N is
   reported per dept so nobody mistakes the labeled subset for the whole.
3. Cells with fewer than --min-n sessions are suppressed (shown as "-"):
   small cells invite over-interpretation.
4. Interaction depth (user_turns buckets) is reported as depth, never as
   "task complexity".
5. The atlas outputs a sampling-quota table for benchmark curation — this is
   the bridge from observed distribution to representative bench design.
"""
import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path

from common import cell, rate, read_jsonl, timestamp, write_json, write_text

DEPTH = [("单轮", lambda t: t == 1), ("浅迭代", lambda t: 2 <= t <= 3), ("深迭代", lambda t: t >= 4)]
DEPTH_UNKNOWN = "未知"


def load_labels(path, keywords_path, threshold):
    """Return {session_id: (label, tier)} with provenance precedence applied."""
    best = {}  # session_id -> (rank, confidence, label, tier)
    def offer(sid, rank, conf, label, tier):
        cur = best.get(sid)
        if cur is None or (rank, conf) > (cur[0], cur[1]):
            best[sid] = (rank, conf, label, tier)
    if path:
        for r in read_jsonl(path):
            src = r.get("source", "router")
            conf = r.get("confidence")
            if not isinstance(r.get("session_id"), str) or not isinstance(r.get("label"), str):
                raise ValueError("labels jsonl needs session_id and label")
            if src == "human":
                offer(r["session_id"], 3, 1.0, r["label"], "human")
            elif src == "router":
                if conf is None or not 0 <= conf <= 1:
                    raise ValueError("router label needs confidence in [0,1]")
                offer(r["session_id"], 2, conf, r["label"],
                      "router" if conf >= threshold else "router_low")
            else:
                raise ValueError(f"unknown label source: {src}")
    if keywords_path:
        kw = json.loads(Path(keywords_path).read_text(encoding="utf-8"))
        if not isinstance(kw, dict) or not all(isinstance(v, list) for v in kw.values()):
            raise ValueError("keywords must be {label: [substring,...]}")
        best["_keywords"] = kw
    return best


def label_of(session, labels, threshold):
    sid = session["session_id"]
    hit = labels.get(sid)
    if hit:
        return hit[2], hit[3]
    kw = labels.get("_keywords")
    if kw:
        text = ""
        for m in session.get("messages", []):
            if m.get("role") == "user" and m.get("text"):
                text = m["text"]
                break
        if text:
            for label, words in kw.items():
                if any(w in text for w in words):
                    return label, "keywords"
    return None, "unknown"


def depth_of(session):
    t = (session.get("stats") or {}).get("user_turns")
    if not isinstance(t, int) or t < 1:
        return DEPTH_UNKNOWN
    for name, pred in DEPTH:
        if pred(t):
            return name
    return DEPTH_UNKNOWN


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("sessions")
    ap.add_argument("--out", required=True)
    ap.add_argument("--labels", help="jsonl {session_id,label,confidence,source:human|router}")
    ap.add_argument("--keywords", help="fallback JSON {label:[substring]} applied to first user message")
    ap.add_argument("--threshold", type=float, default=0.75, help="router confidence cutoff for candidate tier")
    ap.add_argument("--min-n", type=int, default=5)
    a = ap.parse_args()
    if not 0 <= a.threshold <= 1:
        raise ValueError("threshold must be in [0,1]")

    rows = read_jsonl(a.sessions)
    labels = load_labels(a.labels, a.keywords, a.threshold)

    cells = defaultdict(Counter)          # dept -> Counter(intent)
    months = defaultdict(Counter)         # month -> Counter(intent)
    depth = defaultdict(Counter)          # intent -> Counter(depth bucket)
    tiers = Counter()
    dept_n = Counter()
    for s in rows:
        dept = s.get("dept") or "unknown"
        dept_n[dept] += 1
        label, tier = label_of(s, labels, a.threshold)
        tiers[tier] += 1
        intent = label or "unknown"
        cells[dept][intent] += 1
        ts = timestamp(s.get("start_at"))
        if ts:
            months[ts.strftime("%Y-%m")][intent] += 1
        depth[intent][depth_of(s)] += 1

    intents = sorted({i for c in cells.values() for i in c})
    lines = ["# 任务分布图谱（候选标签，分级可信）", "",
             "标签只描述首条用户消息；一个会话只计一次。人工 > 路由(达阈值) > 路由(低置信)/关键词 > unknown。",
             f"单元格 < {a.min_n} 会话以 - 抑制，不做解读。", "",
             "## 标签来源覆盖", "",
             "| 来源层级 | 会话数 | 占比 |", "|---|---|---|"]
    total = len(rows)
    for tier in ("human", "router", "router_low", "keywords", "unknown"):
        if tiers.get(tier):
            lines.append(f"| {tier} | {tiers[tier]} | {rate(tiers[tier], total)} |")
    lines += ["", "human/router 之外的层级进入汇报前必须带「候选」字样；unknown 不消失、不外推。", "",
              "## 意图 × 部门 分布（行=部门，列为意图）", "",
              "| 部门 | 会话数 | " + " | ".join(intents) + " |",
              "|---|---|" + "---|" * len(intents)]
    for dept in sorted(cells):
        c = cells[dept]
        vals = []
        for i in intents:
            n = c.get(i, 0)
            vals.append(f"{n}（{n / dept_n[dept]:.0%}）" if n >= a.min_n else "-")
        lines.append(f"| {cell(dept)} | {dept_n[dept]} | " + " | ".join(vals) + " |")

    lines += ["", "## 意图 × 月份 趋势（按会话开始时间）", "",
              "| 月份 | " + " | ".join(intents) + " |",
              "|---|" + "---|" * len(intents)]
    for m in sorted(months):
        c = months[m]
        lines.append(f"| {m} | " + " | ".join(str(c.get(i, 0)) for i in intents) + " |")

    lines += ["", "## 交互深度 × 意图（user_turns 分桶；深度 ≠ 复杂度）", "",
              "| 意图 | 单轮 | 浅迭代(2-3) | 深迭代(4+) | 未知 |", "|---|---|---|---|---|"]
    for i in intents:
        d = depth[i]
        lines.append(f"| {cell(i)} | {d.get('单轮',0)} | {d.get('浅迭代',0)} | {d.get('深迭代',0)} | {d.get(DEPTH_UNKNOWN,0)} |")

    # Bridge to benchmark curation: sampling quotas proportional to observed share.
    lines += ["", "## Benchmark 选题配额参考（representative 子集）", "",
              "按已标注会话的真实占比建议抽样配额；回归子集另行从失败案例定向挑选，不按此比例。", "",
              "| 意图 | 观测占比（已标注子集） | 建议配额逻辑 |", "|---|---|---|"]
    labeled = sum(tiers[t] for t in ("human", "router", "router_low", "keywords"))
    for i in intents:
        if i == "unknown":
            continue
        n = sum(cells[d].get(i, 0) for d in cells)
        if labeled and n >= a.min_n:
            lines.append(f"| {cell(i)} | {rate(n, labeled)} | 配额 ≈ 占比 × 计划题量；< {a.min_n} 的族先进 unknown，不硬凑题 |")

    stats = {"metric_version": "atlas-v1", "total_sessions": total,
             "tiers": dict(tiers), "min_n": a.min_n, "threshold": a.threshold,
             "note": "first-message labels; unknown never redistributed; cells < min-n suppressed"}
    out = Path(a.out)
    write_text(out / "task_atlas.md", "\n".join(lines) + "\n")
    write_json(out / "task_atlas.json", stats)
    print(out / "task_atlas.md")


if __name__ == "__main__":
    main()
