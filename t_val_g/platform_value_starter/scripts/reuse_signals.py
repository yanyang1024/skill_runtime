#!/usr/bin/env python3
"""Asset reuse signals from artifact events: upload > read, cross-user > same-user.

Reads normalized sessions.jsonl. Standard library only.

Evidence ladder (strongest first):
  upload  — user actively attached an existing artifact into a new session
  read    — session observed the artifact
Both must reference a stable (tenant, artifact_id, version). Same-basename
matches are NOT evidence. Reuse by the same user who wrote it is reported
separately from cross-user reuse; only the latter supports platform-level
"asset" claims. No global reuse rate is computed — denominators are unknown.
"""
import argparse
from collections import defaultdict
from pathlib import Path

from common import cell, read_jsonl, timestamp, write_json, write_jsonl, write_text


def events(rows):
    writes, consumes = defaultdict(list), []
    seen = {}
    for s in rows:
        ident = (s.get("user_id") or "unknown", s.get("dept") or "unknown")
        for e in s.get("artifact_events", []):
            eid = (s["tenant_id"], e["event_id"])
            if eid in seen:
                if seen[eid] != (e["artifact_id"], e["version"], e["op"], e["ts"]):
                    raise ValueError(f"conflicting artifact event_id: {eid}")
                continue
            seen[eid] = (e["artifact_id"], e["version"], e["op"], e["ts"])
            if not e.get("success"):
                continue
            key = (s["tenant_id"], e["artifact_id"], e["version"])
            rec = {"session_id": s["session_id"], "user": ident[0], "dept": ident[1],
                   "ts": timestamp(e["ts"]), "op": e["op"]}
            if e["op"] == "write":
                writes[key].append(rec)
            else:
                consumes.append((key, rec))
    return writes, consumes


def edges(writes, consumes):
    out = []
    for key, c in consumes:
        eligible = [w for w in writes.get(key, []) if w["session_id"] != c["session_id"] and w["ts"] < c["ts"]]
        if not eligible:
            continue
        w = max(eligible, key=lambda w: w["ts"])
        out.append({"artifact": f"{key[1]}@{key[2]}", "tenant": key[0],
                    "op": c["op"],
                    "kind": "cross_user" if w["user"] != c["user"] else "same_user",
                    "cross_dept": w["dept"] != c["dept"],
                    "from_user": w["user"], "to_user": c["user"],
                    "from_session": w["session_id"], "to_session": c["session_id"],
                    "written_at": w["ts"].isoformat(), "consumed_at": c["ts"].isoformat()})
    out.sort(key=lambda e: (e["kind"] != "cross_user", e["op"] != "upload", e["consumed_at"]))
    return out


def skill_reuse(rows):
    """A skill/agent is itself a reusable asset: who adopted it, across how many depts."""
    per = defaultdict(lambda: {"users": set(), "depts": set(), "sessions": 0})
    for s in rows:
        for skill in s.get("skills_used", []):
            per[skill]["users"].add(s.get("user_id") or "unknown")
            per[skill]["depts"].add(s.get("dept") or "unknown")
            per[skill]["sessions"] += 1
    return sorted(({"skill": k, "users": len(v["users"]), "depts": len(v["depts"]),
                    "sessions": v["sessions"]} for k, v in per.items()),
                  key=lambda r: (-r["depts"], -r["users"]))


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("sessions")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    rows = read_jsonl(a.sessions)
    writes, consumes = events(rows)
    es = edges(writes, consumes)
    skills = skill_reuse(rows)

    cross_upload = [e for e in es if e["kind"] == "cross_user" and e["op"] == "upload"]
    cross_read = [e for e in es if e["kind"] == "cross_user" and e["op"] == "read"]
    same = [e for e in es if e["kind"] == "same_user"]

    lines = ["# 产物与技能复用信号", "",
             "只统计同租户内 artifact_id+version 稳定对齐、且消费发生在产出之后的事件。",
             "同名文件不是证据；没有事件记录不等于产物没有价值（观察覆盖见 coverage 字段）。", "",
             f"## 产物复用边（共 {len(es)} 条）", "",
             f"- 跨用户 upload（最强证据）：{len(cross_upload)} 条",
             f"- 跨用户 read：{len(cross_read)} 条",
             f"- 同用户接续使用（平台粘性，非资产扩散）：{len(same)} 条", ""]
    if es:
        lines += ["| 产物 | 信号 | 范围 | 产出方 | 使用方 | 使用时间 |", "|---|---|---|---|---|---|"]
        for e in es[:50]:
            scope = "跨部门" if e["cross_dept"] else ("跨用户" if e["kind"] == "cross_user" else "同用户")
            lines.append(f"| {cell(e['artifact'])} | {e['op']} | {scope} | {cell(e['from_user'])} | {cell(e['to_user'])} | {e['consumed_at'][:10]} |")
        if len(es) > 50:
            lines.append(f"| … | 其余 {len(es)-50} 条见 reuse_edges.jsonl | | | | |")
    lines += ["", "## 技能/Agent 作为可复用资产", "",
              "技能被多少部门、多少用户实际使用，是供给侧复用证据（与文件产物互补）。", "",
              "| 技能 | 覆盖部门数 | 用户数 | 会话数 |", "|---|---|---|---|"]
    for r in skills:
        lines.append(f"| {cell(r['skill'])} | {r['depts']} | {r['users']} | {r['sessions']} |")
    lines += ["", "提醒：跨用户 upload 是最值得放进汇报的复用证据；同用户接续使用只能说明粘性。",
              "不要把这两类加总成单一「复用率」——分母（全部产物中真正可被复用的）无法观测。"]

    out = Path(a.out)
    write_text(out / "reuse_report.md", "\n".join(lines) + "\n")
    write_jsonl(out / "reuse_edges.jsonl", es)
    write_json(out / "skill_reuse.json", skills)
    print(out / "reuse_report.md")


if __name__ == "__main__":
    main()
