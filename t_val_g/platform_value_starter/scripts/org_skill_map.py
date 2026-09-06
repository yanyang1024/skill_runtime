#!/usr/bin/env python3
"""Dept x skill x tool-reliability attribution, with fairness guardrails.

Reads normalized sessions.jsonl (docs/02_data_contract.md). Standard library only.

Hard rules encoded here — do not relax them silently:
1. tool_dev sessions are separated from tool_use sessions before any error rate.
   A dept that builds custom tools is SUPPOSED to fail while testing them.
2. Failure tables are split by tool origin (builtin/custom); unknown is never
   attributed to either side.
3. Rows below --min-calls are marked 样本不足, never ranked.
4. This script deliberately does NOT output a single cross-dept failure ranking.
   Dept task mixes differ; a raw league table punishes tool-developing depts.
"""
import argparse
import json
from collections import defaultdict
from pathlib import Path

from common import cell, read_jsonl, rate, write_json, write_text


def collect(rows):
    skill_use = defaultdict(set)          # (dept, skill) -> {user_id}
    tool = defaultdict(lambda: [0, 0])    # (dept, name, origin, purpose) -> [calls, errors]
    users = defaultdict(set)              # dept -> {user_id}
    for s in rows:
        dept = s.get("dept") or "unknown"
        if s.get("user_id"):
            users[dept].add(s["user_id"])
        for skill in s.get("skills_used", []):
            if s.get("user_id"):
                skill_use[(dept, skill)].add(s["user_id"])
        purpose = s.get("purpose", "unknown")
        for e in s.get("tool_events", []):
            key = (dept, e.get("name") or "unnamed", e.get("origin", "unknown"), purpose)
            tool[key][0] += 1
            if e.get("status") == "error":
                tool[key][1] += 1
    return skill_use, tool, users


def gap_rows(rows, registry):
    """Skills with zero observed use in a dept the registry says they target."""
    out = []
    if not registry:
        return out
    used = defaultdict(set)  # skill -> {dept}
    for s in rows:
        for skill in s.get("skills_used", []):
            used[skill].add(s.get("dept") or "unknown")
    for skill, meta in registry.items():
        for dept in meta.get("target_depts", []):
            if dept not in used.get(skill, set()):
                out.append({"skill": skill, "target_dept": dept,
                            "note": "登记目标部门中零使用；需人工区分「没被宣传」与「匹配错」"})
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("sessions")
    ap.add_argument("--out", required=True)
    ap.add_argument("--min-calls", type=int, default=20,
                    help="below this many calls a row is 样本不足 and excluded from any fix list")
    ap.add_argument("--skill-registry", help="optional JSON: skill -> {target_depts, owner_dept}")
    a = ap.parse_args()

    rows = read_jsonl(a.sessions)
    registry = json.loads(Path(a.skill_registry).read_text(encoding="utf-8")) if a.skill_registry else None
    skill_use, tool, users = collect(rows)

    # Fix list: production use (purpose=tool_use) only, enough volume, sorted by error count.
    fixlist = []
    for (dept, name, origin, purpose), (calls, errors) in tool.items():
        if purpose == "tool_dev" or calls < a.min_calls or not errors:
            continue
        fixlist.append({"dept": dept, "tool": name, "origin": origin,
                        "calls": calls, "errors": errors, "error_rate": errors / calls})
    fixlist.sort(key=lambda r: (-r["errors"], -r["error_rate"]))

    lines = ["# 部门 × 技能 × 工具可靠性", "",
             "口径：tool_dev 会话单列，不进入生产使用的失败率；origin=unknown 不归因到任何一侧；",
             f"调用量 < {a.min_calls} 的行只列出、标「样本不足」，不参与修复优先级。", "",
             "⚠️ 本报告**故意不输出跨部门失败率总排名**：各部门任务结构不同，裸排名会惩罚工具开发部门。", "",
             "## 工具可靠性（按部门分列，先看本部门内部）", "",
             "| 部门 | 工具 | 来源 | 会话性质 | 调用 | 失败 | 失败率 |", "|---|---|---|---|---|---|---|"]
    for (dept, name, origin, purpose), (calls, errors) in sorted(tool.items()):
        n_note = "（样本不足）" if calls < a.min_calls else ""
        tag = {"tool_dev": "开发测试", "tool_use": "生产使用", "unknown": "未知"}[purpose]
        lines.append(f"| {cell(dept)} | {cell(name)} | {origin} | {tag} | {calls} | {errors} | {rate(errors, calls)}{n_note} |")

    lines += ["", "## 生产使用中的修复候选（已排除开发测试会话与小样本）", "",
              "| 部门 | 工具 | 来源 | 调用 | 失败 | 失败率 |", "|---|---|---|---|---|---|"]
    for r in fixlist:
        lines.append(f"| {cell(r['dept'])} | {cell(r['tool'])} | {r['origin']} | {r['calls']} | {r['errors']} | {r['error_rate']:.1%} |")
    if not fixlist:
        lines.append("| — | — | — | — | — | — |")

    lines += ["", "## 技能使用广度（按部门去重用户数）", "",
              "| 部门 | 技能 | 使用人数 | 本部门活跃渗透 |", "|---|---|---|---|"]
    for (dept, skill), us in sorted(skill_use.items()):
        lines.append(f"| {cell(dept)} | {cell(skill)} | {len(us)} | {rate(len(us), len(users[dept]))} |")

    gaps = gap_rows(rows, registry)
    lines += ["", "## 技能供给/需求错位候选", ""]
    if registry is None:
        lines.append("未提供 --skill-registry，无法判断「零使用」；会话数据里本就不出现没人用的技能。")
    elif gaps:
        for g in gaps:
            lines.append(f"- {cell(g['skill'])} → {cell(g['target_dept'])}：{g['note']}")
    else:
        lines.append("登记范围内未发现零使用技能。")

    lines += ["", "提醒：失败率高 ≠ 工具差。先确认 origin 与 purpose，再看绝对调用量；",
              "custom 工具的高失败若集中在 tool_dev 会话，是正常的打磨过程，不要进修复清单。"]
    out = Path(a.out)
    write_text(out / "org_skill_map.md", "\n".join(lines) + "\n")
    write_json(out / "org_skill_map.json", {
        "min_calls": a.min_calls, "fix_candidates": fixlist, "gaps": gaps,
        "note": "fairness rules: tool_dev separated; unknown origin unattributed; small-n never ranked"})
    print(out / "org_skill_map.md")


if __name__ == "__main__":
    main()
