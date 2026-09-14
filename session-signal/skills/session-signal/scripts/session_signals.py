#!/usr/bin/env python3
"""会话优先的信号提取：单会话到多部门共用同一入口，没有 branch/version 也能产生候选。

输入：标准化 session JSONL（每行一个会话快照，或 {"session": {...}} 包装）。
输出是观测与候选，不升级为根因、复用确认或任务验收。只用 Python 标准库。
"""
import argparse
import posixpath
import re
from collections import Counter, defaultdict
from datetime import timedelta
from pathlib import Path

from common import digest, read_jsonl, timestamp, write_json, write_jsonl

VERSION = "session-signal-v1.1"
TRUSTED_METADATA = {"runtime", "registry", "manifest", "human"}


def phase_of(e):
    phase = e.get("usage_phase", "unknown")
    return phase if e.get("phase_source") in TRUSTED_METADATA and phase in {
        "development", "acceptance", "production"} else "unknown"


def origin_of(e):
    return e.get("tool_origin") if e.get("origin_source") in TRUSTED_METADATA \
        and e.get("tool_origin") in {"native", "custom"} else "unknown"


def tool_part_to_event(part, *, event_id, ts, **metadata):
    """接到你自己的 adapter 中；ts 用带时区的完成时间，event_id 沿用原始 ID。

    只示意 state.input/output/error 的映射，不假装支持全部原始导出格式。
    开始/结束快照先合并为一次调用；metadata 可传真实 turn/branch/storage 信息。
    """
    state = part.get("state", {})
    return {**metadata, "event_id": event_id, "ts": ts, "name": part.get("tool"),
            "status": state.get("status", "unknown"), "args": state.get("input"),
            "output": state.get("output"), "error": state.get("error")}


def status_of(e):
    return {"completed": "success", "success": "success", "error": "error",
            "cancelled": "cancelled", "canceled": "cancelled"}.get(e.get("status"), "unknown")


def file_record(s, e, ref):
    name = e.get("tool_id") or e.get("name")
    if name not in {"read", "write", "edit"}:
        return None
    args = e.get("args") if isinstance(e.get("args"), dict) else {}
    path = args.get("filePath") or args.get("path")
    if not isinstance(path, str) or not path:
        return None
    if not path.startswith("/"):
        cwd = e.get("cwd")
        path = posixpath.join(cwd, path) if cwd and cwd.startswith("/") else None
    path = posixpath.normpath(path) if path else None  # 不解析符号链接，不读磁盘。
    storage_known = e.get("storage_source") in TRUSTED_METADATA
    scope = e.get("storage_scope", "unknown") if storage_known else "unknown"
    namespace = e.get("storage_namespace") if storage_known else None
    payload = e.get("output") if name == "read" else args.get("content") if name == "write" else {
        "oldString": args.get("oldString"), "newString": args.get("newString")}
    role = "memory_candidate" if path and ("/memory/" in path or path.endswith("/context.json")) else (
        "skill_doc_candidate" if path and path.endswith("/SKILL.md") else "other")
    return {"tenant_id": s["tenant_id"], "session_id": s["session_id"], "org": org_of(s),
            "event_id": e["event_id"], "ts": e.get("ts"), "started_ts": e.get("started_ts"),
            "op": name, "status": status_of(e), "path": path, "path_raw": args.get("filePath") or args.get("path"),
            "storage_scope": scope, "storage_namespace": namespace, "storage_source": e.get("storage_source"),
            "role_hint": role, "role_evidence": "path_rule", "evidence_ref": ref,
            "payload_hash": digest(payload) if payload is not None else None,
            "hash_origin": {"read": "tool_output", "write": "tool_input_content", "edit": "edit_fragments"}[name],
            "content_version": "unknown", "observation": "tool_reported_operation"}


def path_candidates(files):
    groups = defaultdict(list)
    for f in files:
        if f["status"] == "success" and f["ts"] and f["path"] and f["storage_namespace"] and f["storage_scope"] == "shared_persistent":
            groups[(f["tenant_id"], f["storage_namespace"], f["path"])].append(f)
    candidates = []
    for key, items in groups.items():
        # 同一完成时刻的读写不定先后；保留最近一组已观测修改者的歧义。
        by_time = defaultdict(list)
        for f in items:
            by_time[timestamp(f["ts"])].append(f)
        latest = []
        for at, batch in sorted(by_time.items()):
            for f in batch:
                if f["op"] != "read" or not latest or any(w["session_id"] == f["session_id"] for w in latest):
                    continue
                if f.get("started_ts") and timestamp(f["started_ts"]) <= timestamp(latest[0]["ts"]):
                    continue
                candidates.append({"kind": "rule_inference", "name": "shared_path_read_after_mutation_candidate",
                    "resource_key": digest(key)[:24], "tenant_id": key[0], "storage_namespace": key[1], "path": key[2],
                    "consumer_session": f["session_id"], "producer_sessions": sorted({w["session_id"] for w in latest}),
                    "producer_ambiguous": len(latest) > 1, "content_match": "unknown", "business_adoption": "unknown",
                    "evidence_refs": [w["evidence_ref"] for w in latest] + [f["evidence_ref"]],
                    "limitations": ["latest_observed_mutation_is_not_proven_origin", "unobserved_writes_possible",
                        "completion_time_order_only" if not f.get("started_ts") else "read_started_after_observed_mutation"]})
            mutations = [f for f in batch if f["op"] in {"write", "edit"}]
            if mutations:
                latest = mutations
    return candidates


def sequence_candidates(s, events, horizon):
    by_tool = defaultdict(list)
    for e in events:
        if e.get("ts"):
            by_tool[e.get("tool_id") or e.get("name") or "unknown"].append(e)
    result = []
    for tool, items in by_tool.items():
        items.sort(key=lambda e: timestamp(e["ts"]))
        for i, e in enumerate(items):
            if status_of(e) != "error":
                continue
            end = timestamp(e["ts"]) + timedelta(seconds=horizon)
            later = []
            for other in items[i + 1:]:
                at = timestamp(other["ts"])
                if at > end:
                    break
                if at <= timestamp(e["ts"]):
                    continue
                # 有真实标识时不用近似跨过去；没有时如实降低证据强度。
                if any(e.get(k) is not None and other.get(k) is not None and e[k] != other[k]
                       for k in ("user_turn_id", "branch_id", "run_id")):
                    continue
                if other.get("started_ts") and timestamp(other["started_ts"]) < timestamp(e["ts"]):
                    continue
                later.append(other)
            success = next((x for x in later if status_of(x) == "success"), None)
            repeat = [x for x in later if status_of(x) == "error" and e.get("args") is not None
                      and x.get("args") is not None and digest(x["args"]) == digest(e["args"])]
            observed_end = timestamp(s.get("observation_end_ts"))
            covered = s.get("coverage", {}).get("tool_events_complete") is True and observed_end and observed_end >= end
            state = "later_success_observed" if success else "no_success_seen_in_window" if covered else "window_incomplete_or_unknown"
            evidence = [e] + repeat + ([success] if success else [])
            result.append({"kind": "rule_inference", "name": "same_tool_after_error_candidate", "tool": tool,
                "state": state, "window_seconds": horizon, "same_args_later_errors": len(repeat),
                "later_success_same_args": digest(e.get("args")) == digest(success.get("args"))
                    if success and e.get("args") is not None and success.get("args") is not None else None,
                "task_outcome": "unknown", "manual_intervention": "unknown",
                "evidence_refs": list(dict.fromkeys(x["_ref"] for x in evidence)),
                "limitations": [k + "_missing" for k in ("user_turn_id", "branch_id", "run_id", "started_ts")
                                if any(x.get(k) is None for x in evidence)] + ["same_tool_is_not_same_issue"]})
    return result


def org_of(s):
    return s.get("org_section") or s.get("dept") or "unknown"


def extract(rows, dataset_id, out, horizon=300):
    out = Path(out)
    out.mkdir(parents=True, exist_ok=False)
    files, signals, contacts, metrics = [], [], [], []
    seen_sessions, seen_events = set(), set()
    coverage = Counter()
    task_map = {}
    for row in rows:
        s = row.get("session", row)
        sid = (s["tenant_id"], s["session_id"])
        if sid in seen_sessions:
            raise ValueError("每个会话只提供一份当前快照")
        seen_sessions.add(sid)
        revision = row.get("source_revision") or digest(s)
        scope = {"dataset_id": dataset_id, "tenant_id": sid[0], "session_id": sid[1],
                 "org": org_of(s), "user_id": s.get("user_id"), "task_type": s.get("task_type") or "unknown",
                 "task_label_source": s.get("task_label_source") or "unknown"}
        tk = (sid[0], scope["org"], scope["task_type"], scope["task_label_source"])
        tg = task_map.setdefault(tk, {"sessions": 0, "users": set(), "unknown_user_sessions": 0})
        tg["sessions"] += 1
        if scope["user_id"]:
            tg["users"].add(scope["user_id"])
        else:
            tg["unknown_user_sessions"] += 1
        grouped, local = {}, []
        coverage["sessions"] += 1
        coverage["tool_events_field_present"] += int("tool_events" in s)
        coverage["tool_events_declared_complete"] += int(s.get("coverage", {}).get("tool_events_complete") is True)
        for original in s.get("tool_events", []):
            e = dict(original)
            ek = (sid[0], e["event_id"])
            if ek in seen_events:
                raise ValueError("重复调用 ID：先合并调用快照，父/子会话投影只保留原始归属")
            seen_events.add(ek)
            e["_ref"] = f"{sid[0]}/{sid[1]}@{revision}/{e['event_id']}"
            local.append(e)
            coverage["tool_events"] += 1
            for field in ("ts", "args", "run_id", "branch_id", "user_turn_id", "tool_version", "model"):
                coverage[field + "_present"] += int(e.get(field) is not None)
            coverage["test_assertion_present"] += int(isinstance(e.get("assertion_passed"), bool))
            name, status = e.get("tool_id") or e.get("name") or "unknown", status_of(e)
            args = e.get("args") if isinstance(e.get("args"), dict) else {}
            f = file_record(s, e, e["_ref"])
            if f:
                files.append(f)
                coverage[f["op"] + "_file_events"] += 1
            if name == "bash":
                coverage["shell_events_unexpanded"] += 1
                if re.search(r">|\b(?:tee|cp|mv)\b", str(args.get("command", ""))):
                    signals.append({**scope, "kind": "rule_inference", "name": "shell_possible_write_review",
                        "evidence_refs": [e["_ref"]], "observation": "command_text_pattern_only",
                        "next_check": "可能只是引号内文本、条件分支或失败命令；未登记为实际文件写入"})
            if name == "question":
                signals.append({**scope, "kind": "observation", "name": "question_call_review",
                    "evidence_refs": [e["_ref"]], "status": status, "question_type": "unknown",
                    "next_check": "读问题和前文，区分必要澄清、业务决策、授权确认、偏好、重复询问；不默认追问有害"})
            if name in {"skill", "task"}:
                cap = args.get("name") if name == "skill" else args.get("subagent_type")
                if cap:
                    contacts.append({**scope, "kind": "skill" if name == "skill" else "agent", "capability_id": cap,
                        "action": "load_attempt" if name == "skill" else "invoke_attempt", "status": status,
                        "event_id": e["event_id"], "ts": e.get("ts"), "evidence_ref": e["_ref"],
                        "meaning": "skill_load_call" if name == "skill" else "agent_dispatch_call",
                        "downstream_outcome": "unknown", "historical_registration": "unknown"})
            at = timestamp(e.get("ts"))
            model = e.get("model") or (s.get("model") if s.get("model_scope") == "single_model" else None) or "unknown"
            key = (at.strftime("%Y-%m") if at else "unknown", model, name, phase_of(e), origin_of(e), e.get("tool_version") or "unknown")
            g = grouped.setdefault(key, Counter())
            g["events"] += 1
            g[status] += 1
            g["assertions_observed"] += int(isinstance(e.get("assertion_passed"), bool))
            g["expected_errors_confirmed"] += int(status == "error" and e.get("expected_error") is True
                and e.get("expectation_source") == "test_definition" and e.get("assertion_passed") is True)
        for key, g in grouped.items():
            metrics.append({**scope, **dict(zip(("period", "model", "tool", "phase", "origin", "tool_version"), key)),
                "metric": "recorded_tool_error", "numerator": g["error"], "denominator": g["success"] + g["error"],
                "cancelled_calls": g["cancelled"], "unknown_status_calls": g["unknown"],
                "assertions_observed": g["assertions_observed"], "expected_errors_confirmed": g["expected_errors_confirmed"]})
        signals.extend({**scope, **x} for x in sequence_candidates(s, local, horizon))
    paths = path_candidates(files)
    for x in signals:
        x.update(extractor_version=VERSION, state=x.get("state", "candidate"))
        x["signal_id"] = digest(x)[:24]
    for x in paths:
        x.update(dataset_id=dataset_id, extractor_version=VERSION, state="candidate")
        x["signal_id"] = digest(x)[:24]
    for name, data in (("session_file_events", files), ("shared_path_candidates", paths),
                       ("session_candidates", signals), ("capability_contacts", contacts), ("tool_metric_rows", metrics)):
        write_jsonl(out / (name + ".jsonl"), data)
    write_jsonl(out / "task_map.jsonl", [{"dataset_id": dataset_id,
        **dict(zip(("tenant_id", "org", "task_type", "task_label_source"), k)), "sessions": g["sessions"],
        "observed_users": len(g["users"]), "unknown_user_sessions": g["unknown_user_sessions"]} for k, g in sorted(task_map.items())])
    write_json(out / "manifest.json", {"extractor_version": VERSION, "dataset_id": dataset_id,
        "source_hash": digest(rows), "coverage_counts": dict(coverage), "window_seconds": horizon,
        "shared_path_candidates": len(paths), "note": "输出是导出范围内观测；未运行 Judge、未确认复用/恢复/价值。"})


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("input"); p.add_argument("--dataset-id", required=True)
    p.add_argument("--out", required=True); p.add_argument("--window-seconds", type=int, default=300)
    a = p.parse_args()
    if a.window_seconds <= 0:
        p.error("window must be positive")
    extract(read_jsonl(a.input), a.dataset_id, a.out, a.window_seconds)
    print(a.out)


if __name__ == "__main__":
    main()
