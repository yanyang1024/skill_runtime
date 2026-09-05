#!/usr/bin/env python3
"""Session evidence ledger: ingest -> queue -> human review -> report.

Standard library only. Canonical input is documented in docs/02_data_contract.md.
One session is one analysis unit; business work items are separately deduplicated.
"""
import argparse
import json
import sqlite3
from collections import Counter, defaultdict
from pathlib import Path
from statistics import median

from common import canonical, cell, digest, number, rate, read_jsonl, timestamp, write_json, write_jsonl, write_text

METRIC_VERSION = "evidence-v1"
OUTCOMES = {"usable", "partial", "not_usable", "unknown"}


def connect(path):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path)
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("PRAGMA busy_timeout=5000")
    db.executescript("""
      CREATE TABLE IF NOT EXISTS sessions(case_id TEXT PRIMARY KEY, revision TEXT, body TEXT);
      CREATE TABLE IF NOT EXISTS revisions(case_id TEXT, revision TEXT, body TEXT,
        PRIMARY KEY(case_id, revision));
      CREATE TABLE IF NOT EXISTS reviews(review_id TEXT PRIMARY KEY, case_id TEXT,
        source_revision TEXT, reviewed_at TEXT, body TEXT);
    """)
    return db


def case_id(row):
    return digest([row["tenant_id"], row["session_id"]])[:24]


def validate(row):
    for key in ("tenant_id", "session_id"):
        if not isinstance(row.get(key), str) or not row[key].strip():
            raise ValueError(f"missing {key}; do not infer it from a basename")
    start, end = timestamp(row.get("start_at")), timestamp(row.get("end_at"))
    if start and end and end < start:
        raise ValueError("end_at before start_at")
    for key in ("input_tokens", "output_tokens"):
        number(row.get("stats", {}).get(key))
    for m in row.get("messages", []):
        if m.get("role") not in {"user", "assistant", "tool", "system"} or not isinstance(m.get("text"), str):
            raise ValueError("invalid message; unknown role is a parse failure")
        timestamp(m.get("ts"))
    seen = set()
    for r in row.get("requests", []):
        if not r.get("request_id") or r["request_id"] in seen:
            raise ValueError("request_id missing or duplicated inside session")
        seen.add(r["request_id"])
        if not timestamp(r.get("ts")):
            raise ValueError("request needs event timestamp")
        for key in ("input_tokens", "output_tokens", "cache_read_tokens"):
            number(r.get(key))
    for event in row.get("artifact_events", []):
        if not all(event.get(k) for k in ("event_id", "artifact_id", "version", "ts")):
            raise ValueError("artifact event needs identity, version and timestamp")
        if event.get("op") not in {"read", "write"} or type(event.get("success")) is not bool:
            raise ValueError("artifact event must have explicit operation and success")
        timestamp(event["ts"])
    for event in row.get("tool_events", []):
        if not event.get("event_id") or event.get("status") not in {"success", "error", "cancelled", "unknown"}:
            raise ValueError("invalid tool event")
        timestamp(event.get("ts"))


def ingest(db, rows):
    counts = Counter()
    batch = set()
    with db:
        for row in rows:
            validate(row)
            cid, rev, body = case_id(row), digest(row), canonical(row)
            if cid in batch:
                raise ValueError("duplicate session in input snapshot; merge exports first")
            batch.add(cid)
            old = db.execute("SELECT revision FROM sessions WHERE case_id=?", (cid,)).fetchone()
            if old and old[0] == rev:
                counts["unchanged"] += 1
                continue
            db.execute("INSERT OR IGNORE INTO revisions VALUES(?,?,?)", (cid, rev, body))
            db.execute("INSERT OR REPLACE INTO sessions VALUES(?,?,?)", (cid, rev, body))
            counts["updated" if old else "inserted"] += 1
    return dict(counts)


def add_reviews(db, rows):
    with db:
        for r in rows:
            for key in ("review_id", "case_id", "source_revision", "reviewer_id", "reviewed_at"):
                if not r.get(key):
                    raise ValueError(f"review missing {key}")
            timestamp(r["reviewed_at"])
            if r.get("outcome") not in OUTCOMES or r.get("adoption") not in {"used", "not_used", "unknown"}:
                raise ValueError("invalid outcome/adoption")
            if r.get("adoption") == "used" and not r.get("work_item_id"):
                raise ValueError("used outcome needs a work_item_id to avoid double counting")
            for prefix in ("manual_minutes", "assisted_minutes"):
                lo, hi = number(r.get(prefix + "_low")), number(r.get(prefix + "_high"))
                if (lo is None) != (hi is None) or (lo is not None and hi < lo):
                    raise ValueError("time range missing endpoint or reversed")
            if not db.execute("SELECT 1 FROM revisions WHERE case_id=? AND revision=?", (r["case_id"], r["source_revision"])).fetchone():
                raise ValueError("review refers to an unknown source revision")
            old = db.execute("SELECT body FROM reviews WHERE review_id=?", (r["review_id"],)).fetchone()
            if old and old[0] != canonical(r):
                raise ValueError("review_id is immutable; append a new review to correct it")
            db.execute("INSERT OR IGNORE INTO reviews VALUES(?,?,?,?,?)", (r["review_id"], r["case_id"], r["source_revision"], r["reviewed_at"], canonical(r)))


def snapshot(db):
    latest = {}
    for (body,) in db.execute("SELECT body FROM reviews"):
        r = json.loads(body)
        key = (r["case_id"], r["source_revision"])
        rank = (timestamp(r["reviewed_at"]), r["review_id"])
        if key not in latest or rank > latest[key][0]:
            latest[key] = (rank, r)
    all_reviewed_ids = {key[0] for key in latest}
    rows = []
    for cid, rev, body in db.execute("SELECT case_id,revision,body FROM sessions ORDER BY case_id"):
        s = json.loads(body)
        r = latest.get((cid, rev), (None, None))[1]
        evidence = []
        errors = [t for t in s.get("tool_events", []) if t["status"] == "error"]
        if errors:
            evidence.append({"kind": "tool_error", "event_ids": [x["event_id"] for x in errors]})
        # These signals only order a review queue. They never label completion.
        for i, m in enumerate(s.get("messages", [])):
            if m["role"] == "user" and any(w in m["text"].lower() for w in ("报错", "不对", "算了", "wrong")):
                evidence.append({"kind": "language_candidate", "message_index": i})
        label = "review"
        if r and r["outcome"] == "usable":
            label = "good_reviewed"
        elif r and r["outcome"] == "not_usable":
            label = "bad_reviewed"
        rows.append({"case_id": cid, "source_revision": rev, "session": s,
                     "review": r, "stale_review": cid in all_reviewed_ids and r is None,
                     "case_label": label, "evidence": evidence})
    return rows


def queue(rows, out):
    write_jsonl(Path(out) / "cases.jsonl", rows)  # Full snapshot, never just the last delta.
    templates = []
    for c in rows:
        if c["review"] is not None:
            continue
        templates.append({"case_id": c["case_id"], "source_revision": c["source_revision"],
                          "review_id": "", "reviewer_id": "", "reviewed_at": "",
                          "outcome": "unknown", "adoption": "unknown", "work_item_id": "",
                          "task_type": "unknown", "business_use": "", "failure_reason": "",
                          "time_basis": "unknown", "manual_minutes_low": None,
                          "manual_minutes_high": None, "assisted_minutes_low": None,
                          "assisted_minutes_high": None, "evidence_ref": ""})
    write_jsonl(Path(out) / "review_template.jsonl", templates)
    lines = ["# 会话复核入口", "", "这是全量当前案例快照。信号仅供挑选；unknown 保留为未知。", "",
             "| case_id | 会话 | 候选信号 | 已复核结果 | 旧复核是否失效 |", "|---|---|---|---|---|"]
    for c in sorted(rows, key=lambda c: (-len(c["evidence"]), c["case_id"])):
        lines.append(f"| {c['case_id']} | {cell(c['session'].get('title', ''))} | {cell([e['kind'] for e in c['evidence']])} | {c['case_label']} | {c['stale_review']} |")
    write_text(Path(out) / "review_queue.md", "\n".join(lines) + "\n")


def token_rows(cases, start, end):
    """Request events win over aggregates. Aggregates require complete in-window span.

    Request ids deduplicate parent/subagent traces. Summary rows must be exclusive
    of child-session usage (an explicit adapter contract).
    """
    observations, seen = [], {}
    excluded = Counter()
    for c in cases:
        s = c["session"]
        if s.get("requests"):
            if not s.get("coverage", {}).get("requests_complete", False):
                excluded["partial_request_logs_sessions"] += 1
            for r in s["requests"]:
                key = (s["tenant_id"], r["request_id"])
                if key in seen:
                    if seen[key] != digest(r):
                        raise ValueError("conflicting duplicate request_id across sessions")
                    excluded["duplicate_request_observations"] += 1
                    continue
                seen[key] = digest(r)
                if start <= timestamp(r["ts"]) < end:
                    observations.append({**r, "case_id": c["case_id"], "dept": s.get("dept") or "unknown", "scope": "request"})
        else:
            a, b = timestamp(s.get("start_at")), timestamp(s.get("end_at"))
            stats = s.get("stats", {})
            if a and b and (b < start or a >= end):
                excluded["summary_outside_window"] += 1
                continue
            if a and b and start <= a <= b < end and stats.get("usage_scope") == "session_exclusive":
                if stats.get("input_tokens") is not None or stats.get("output_tokens") is not None:
                    observations.append({**stats, "case_id": c["case_id"], "dept": s.get("dept") or "unknown", "scope": "session_summary"})
                    continue
            excluded["summary_unattributable_or_missing"] += 1
    return observations, dict(excluded)


def reuse_edges(cases):
    writes, reads = defaultdict(list), []
    seen = {}
    for c in cases:
        s = c["session"]
        for e in s.get("artifact_events", []):
            eid = (s["tenant_id"], e["event_id"])
            if eid in seen:
                if seen[eid] != digest(e):
                    raise ValueError("conflicting artifact event_id")
                continue
            seen[eid] = digest(e)
            if not e["success"]:
                continue
            key = (s["tenant_id"], e["artifact_id"], e["version"])
            record = (c["case_id"], timestamp(e["ts"]), e["event_id"])
            if e["op"] == "write":
                writes[key].append(record)
            else:
                reads.append((key, record))
    edges = []
    for key, r in reads:
        eligible = [w for w in writes.get(key, []) if w[0] != r[0] and w[1] < r[1]]
        if eligible:
            w = max(eligible, key=lambda w: w[1])
            edges.append({"asset_version": list(key), "write_case": w[0], "read_case": r[0],
                          "write_event": w[2], "read_event": r[2], "read_at": r[1].isoformat()})
    return edges


def report(cases, start, end, out, costs=None):
    cohort = [c for c in cases if timestamp(c["session"].get("start_at")) and start <= timestamp(c["session"]["start_at"]) < end]
    known = [c for c in cohort if c["review"] and c["review"]["outcome"] != "unknown"]
    accepted = [c for c in known if c["review"]["outcome"] == "usable"]
    adoption_known = [c for c in cohort if c["review"] and c["review"]["adoption"] != "unknown"]
    used = [c for c in adoption_known if c["review"]["adoption"] == "used"]
    active, dept_users = set(), defaultdict(set)
    for c in cases:
        s = c["session"]
        if s.get("user_id") and any(m["role"] == "user" and timestamp(m.get("ts")) and start <= timestamp(m["ts"]) < end for m in s.get("messages", [])):
            key = (s["tenant_id"], s["user_id"])
            active.add(key)
            dept_users[s.get("dept") or "unknown"].add(key)
    tokens, excluded = token_rows(cases, start, end)
    dept_tokens = defaultdict(lambda: [0, 0, 0, 0])
    for r in tokens:
        for i, k in enumerate(("input_tokens", "output_tokens")):
            if r.get(k) is not None:
                dept_tokens[r["dept"]][i] += r[k]
                dept_tokens[r["dept"]][i+2] += 1
    # Choose one latest card per work item, never add multiple session estimates.
    work = {}
    for c in cohort:
        if not c["review"] or not c["review"].get("work_item_id"):
            continue
        r, s = c["review"], c["session"]
        key = (s["tenant_id"], r["work_item_id"])
        if key not in work or (timestamp(r["reviewed_at"]),r["review_id"]) > (timestamp(work[key]["reviewed_at"]),work[key]["review_id"]):
            work[key] = r
    work = {k:r for k,r in work.items() if r["adoption"] == "used"}
    savings = defaultdict(list)
    for r in work.values():
        keys = [p + s for p in ("manual_minutes", "assisted_minutes") for s in ("_low", "_high")]
        if r.get("time_basis") in {"user_estimate", "paired_observation"} and all(r.get(k) is not None for k in keys):
            savings[r["time_basis"]].append((r["manual_minutes_low"] - r["assisted_minutes_high"],
                                             r["manual_minutes_high"] - r["assisted_minutes_low"]))
    all_edges = reuse_edges(cases)
    edges = [e for e in all_edges if start <= timestamp(e["read_at"]) < end]
    def observed_sum(key):
        values = [r[key] for r in tokens if r.get(key) is not None]
        return sum(values) if values else None
    stats = {"metric_version": METRIC_VERSION, "window": [start.isoformat(), end.isoformat()],
             "all_current_sessions": len(cases),
             "sessions_missing_start_time": sum(not c["session"].get("start_at") for c in cases),
             "sessions_declaring_complete_messages": sum(c["session"].get("coverage",{}).get("messages_complete") is True for c in cases),
             "sessions_declaring_complete_artifact_events": sum(c["session"].get("coverage",{}).get("artifact_events_complete") is True for c in cases),
             "cohort_sessions": len(cohort), "outcome_known": len(known), "usable": len(accepted),
             "outcome_unknown_including_unreviewed": len(cohort) - len(known),
             "adoption_known": len(adoption_known), "used_sessions": len(used), "deduplicated_used_work_items": len(work),
             "active_users_with_timestamped_user_message": len(active),
             "input_tokens_observed": observed_sum("input_tokens"),
             "output_tokens_observed": observed_sum("output_tokens"),
             "usage_observations": len(tokens), "usage_input_known": sum(r.get("input_tokens") is not None for r in tokens),
             "usage_output_known": sum(r.get("output_tokens") is not None for r in tokens),
             "usage_exclusions": excluded, "observed_cross_session_read_edges": len(edges),
             "savings_minutes": {k: {"n": len(v), "low": sum(x[0] for x in v), "high": sum(x[1] for x in v)} for k,v in savings.items()}}
    lines = ["# 平台价值证据报告", "", f"窗口：[{start.isoformat()}, {end.isoformat()})；口径 {METRIC_VERSION}。",
             "会话结果按本期新建会话分组；活跃按窗口内用户消息；token 按请求发生时间或完整落窗的会话汇总。", "",
             "| 项目 | 已观测结果 | 解释 |", "|---|---|---|",
             f"| 新建会话 | {len(cohort)} | 会话不等于任务 |",
             f"| 有结果确认 | {rate(len(known), len(cohort))} | 展示确认覆盖率 |",
             f"| 确认可用 / 结果已知 | {rate(len(accepted), len(known))} | 仅复核子集，不外推全平台完成率 |",
             f"| 结果未知 | {len(cohort)-len(known)} | 含无反馈、未复核 |",
             f"| 已用于工作 / 采用情况已知 | {rate(len(used), len(adoption_known))} | 去重工作事项 {len(work)} 个 |",
             f"| 活跃用户 | {len(active)} | 身份+带时间戳的用户消息；累计对话数不参与 |",
             f"| 实测输入 token | {stats['input_tokens_observed']} | 字段覆盖 {rate(stats['usage_input_known'],len(tokens))}，不是货币成本 |",
             f"| 实测输出 token | {stats['output_tokens_observed']} | 字段覆盖 {rate(stats['usage_output_known'],len(tokens))} |",
             f"| 观察到的跨会话读取关系 | {len(edges)} | 同租户资产同版本、先写后读；不宣称总体复用率 |", "",
             "缺失与排除：`" + canonical(excluded) + "`。缺失字段不会补成已测得的零；None/null 表示未知。",
             f"全量当前会话 {len(cases)}；缺新建时间 {stats['sessions_missing_start_time']}；声明消息完整 {rate(stats['sessions_declaring_complete_messages'],len(cases))}；声明资产事件完整 {rate(stats['sessions_declaring_complete_artifact_events'],len(cases))}。部分请求日志/未覆盖会话存在时，token 仅为观测和。", "",
             "## 用户确认带来的业务证据", ""]
    for basis, v in stats["savings_minutes"].items():
        lines.append(f"- {basis}：{v['n']} 个去重事项，净人工时间变化 {v['low']}～{v['high']} 分钟（保留负值）；是该子集的区间和，不是统计置信区间或现金节省。")
    if not savings:
        lines.append("尚无完整人工基线与辅助后人工投入，只展示采用案例，不估算节省工时。")
    if costs:
        if timestamp(costs["period_start"]) != start or timestamp(costs["period_end"]) != end:
            raise ValueError("cost period differs from report period")
        names = ("fixed_capacity_cost", "variable_cash_cost", "operations_cost")
        if any(number(costs.get(k)) is None for k in names):
            raise ValueError("cost components need explicit values; unknown must not be zero")
        total = sum(costs[k] for k in names)
        stats["period_cost"] = {"total": total, "currency": costs["currency"], "basis": costs["basis"]}
        lines += ["", f"本期成本：{total:.2f} {cell(costs['currency'])}，来源/口径：{cell(costs['basis'])}。",
                  f"已确认采用事项数：{len(work)}。因确认覆盖不全，不自动用全平台成本除以这个子集，也不折算 ROI。"]
    lines += ["", "## 部门资源与覆盖切片", "", "部门为输入快照中的归属；项目线、职位价值和个人绩效均不由部门推断。跨部门/组织变更用户可能出现在多个切片，部门人数不能直接相加。", "",
              "| 部门 | 观测活跃用户 | 输入 token | 输出 token |", "|---|---|---|---|"]
    for dept in sorted(set(dept_tokens) | set(dept_users)):
        a,b,ni,no = dept_tokens[dept]
        lines.append(f"| {cell(dept)} | {len(dept_users[dept])} | {a if ni else 'N/A'}（已知 {ni} 条） | {b if no else 'N/A'}（已知 {no} 条） |")
    errors = Counter(t.get("error_kind", "unknown") for c in cohort for t in c["session"].get("tool_events", []) if t["status"] == "error")
    lines += ["", "## 待改进的证据", "", "错误事件分布（可能重试或重复投影，非任务失败率）：`" + canonical(errors) + "`。",
              "优先选择可复现的工具/skill 问题，补一条回归题；修复后按同题、同环境比较。", "",
              "本报告没有把轮次、文件数量、会话跨度或感谢词汇合成为价值总分。"]
    write_json(Path(out) / "metrics.json", stats)
    write_jsonl(Path(out) / "asset_read_evidence.jsonl", edges)
    write_text(Path(out) / "value_report.md", "\n".join(lines) + "\n")
    return stats


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--db", required=True)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("ingest"); p.add_argument("sessions")
    p = sub.add_parser("review"); p.add_argument("reviews")
    p = sub.add_parser("queue"); p.add_argument("--out", required=True)
    p = sub.add_parser("report"); p.add_argument("--start", required=True); p.add_argument("--end", required=True)
    p.add_argument("--out", required=True); p.add_argument("--costs")
    a = ap.parse_args()
    with connect(a.db) as db:
        if a.cmd == "ingest":
            print(canonical(ingest(db, read_jsonl(a.sessions))))
        elif a.cmd == "review":
            add_reviews(db, read_jsonl(a.reviews)); print("Reviews recorded.")
        elif a.cmd == "queue":
            queue(snapshot(db), a.out); print(a.out)
        else:
            start, end = timestamp(a.start), timestamp(a.end)
            if not start or not end or start >= end:
                raise ValueError("invalid report window")
            costs = json.loads(Path(a.costs).read_text()) if a.costs else None
            report(snapshot(db), start, end, a.out, costs); print(a.out)


if __name__ == "__main__":
    main()
