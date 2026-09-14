#!/usr/bin/env python3
"""单次虚构离线示例：文件候选、缺链接的序列，以及任务构成造成的部门差异。

生成虚构会话 -> 跑 session_signals.extract -> 跑 compare_departments.compare。
用于验证脚本可用；所有数据均为虚构，不代表任何真实结论。
"""
import argparse
from datetime import datetime, timedelta, timezone
from pathlib import Path

from common import read_jsonl, write_jsonl
from session_signals import extract
from compare_departments import compare, save_report


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("out")
    out = Path(p.parse_args().out)
    out.mkdir(parents=True, exist_ok=False)
    start = datetime(2026, 9, 1, 9, tzinfo=timezone.utc)

    def event(eid, second, name, args, **extra):
        return {"event_id": eid, "ts": (start + timedelta(seconds=second)).isoformat(), "name": name,
                "status": "completed", "args": args, "model": "DEMO-MODEL", **extra}

    storage = {"storage_scope": "shared_persistent", "storage_namespace": "DEMO-volume-A", "storage_source": "manifest"}
    path = "/shared/skills/date/SKILL.md"
    sessions = [
        {"tenant_id": "DEMO", "session_id": "producer", "dept": "示例甲", "user_id": "demo-1",
         "task_type": "automation", "task_label_source": "fictional_fixture", "tool_events": [
            event("w", 0, "write", {"filePath": path, "content": "Version A"}, **storage),
            event("e", 10, "edit", {"filePath": path, "oldString": "A", "newString": "B"}, **storage),
            event("err1", 30, "query", {"date": "2026/09/01"}, status="error", error="invalid date"),
            event("err2", 40, "query", {"date": "2026/09/01"}, status="error", error="invalid date"),
            event("ok", 50, "query", {"date": "2026-09-01"}),
            event("shell", 60, "bash", {"command": "echo 'example > text'"}),
            event("skill", 70, "skill", {"name": "date-helper"})]},
        {"tenant_id": "DEMO", "session_id": "consumer", "dept": "示例乙", "user_id": "demo-2",
         "task_type": "lookup", "task_label_source": "fictional_fixture", "tool_events": [
            event("r", 90, "read", {"filePath": path}, output="<wrapped>Version B</wrapped>", **storage),
            event("q", 100, "question", {"questions": [{"question": "请选择目标批次"}]})]},
        {"tenant_id": "DEMO", "session_id": "other_volume", "dept": "示例乙", "user_id": "demo-3",
         "tool_events": [event("private-r", 120, "read", {"filePath": path}, **{**storage, "storage_namespace": "DEMO-volume-B"})]}
    ]
    write_jsonl(out / "sessions.jsonl", sessions)
    extract(sessions, "DEMO-session", out / "signals")
    links = read_jsonl(out / "signals/shared_path_candidates.jsonl")
    files = read_jsonl(out / "signals/session_file_events.jsonl")
    seq = [r for r in read_jsonl(out / "signals/session_candidates.jsonl") if r["name"] == "same_tool_after_error_candidate"]
    assert len(links) == 1 and links[0]["content_match"] == "unknown" and links[0]["consumer_session"] == "consumer"
    assert any(f["op"] == "edit" and f["hash_origin"] == "edit_fragments" for f in files)
    assert not any(f["event_id"] == "shell" for f in files)
    assert seq and all(x["manual_intervention"] == "unknown" for x in seq)

    # 独立的虚构计数表，不是上面三个会话计算出的统计，也不是真实数据。
    metrics = []
    for i, (org, task, n, d) in enumerate([
        ("示例甲", "difficult", 180, 900), ("示例甲", "routine", 2, 100),
        ("示例乙", "difficult", 20, 100), ("示例乙", "routine", 18, 900)]):
        metrics.append({"dataset_id": "DEMO-composition", "tenant_id": "DEMO", "org": org,
            "session_id": f"fictional-{i}", "user_id": f"demo-user-{i}", "period": "2026-09",
            "task_type": task, "task_label_source": "fictional_fixture", "model": "DEMO-MODEL", "tool": "query",
            "metric": "recorded_tool_error", "numerator": n, "denominator": d})
    write_jsonl(out / "department_metric_rows.jsonl", metrics)
    kwargs = dict(dataset_id="DEMO-composition", tenant_id="DEMO", org_a="示例甲", org_b="示例乙",
                  by=["period", "task_type", "model", "tool"])
    result, slices = compare(metrics, **kwargs)
    save_report(out / "department_comparison", result, slices)
    assert abs(result["standardized_rates"]["示例甲"] - 0.11) < 1e-9
    assert abs(result["standardized_rates"]["示例乙"] - 0.11) < 1e-9
    no_overlap = [{**r, "model": r["org"]} for r in metrics]
    empty, _ = compare(no_overlap, **kwargs)
    assert empty["triage_hint"] == "insufficient_common_evidence"
    print("虚构离线 demo 完成；请先看", out / "department_comparison/comparison.md")


if __name__ == "__main__":
    main()
