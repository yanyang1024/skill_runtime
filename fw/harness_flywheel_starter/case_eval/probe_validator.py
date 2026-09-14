#!/usr/bin/env python3
"""针对本次 course_validate CLI 的 5 个小探针；只在临时副本注入错误。"""
import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from md_trace import sha, write_json


def run_probe(validator, course, args):
    cp = subprocess.run([sys.executable, str(validator), *args], cwd=course.parent,
                        capture_output=True, text=True, timeout=30)
    try:
        summary = json.loads(cp.stdout.strip().splitlines()[-1])
    except (ValueError, IndexError):
        summary = None
    return {"exit_code": cp.returncode, "summary": summary, "stdout": cp.stdout, "stderr": cp.stderr,
            "accepted": cp.returncode == 0 and isinstance(summary, dict) and summary.get("errors") == 0 and summary.get("passed") is True,
            "rejected_with_report": cp.returncode == 1 and isinstance(summary, dict)
                and isinstance(summary.get("errors"), int) and summary["errors"] > 0 and summary.get("passed") is False}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--validator", required=True); p.add_argument("--course", required=True); p.add_argument("--out", required=True)
    a = p.parse_args()
    validator, source, out = Path(a.validator).resolve(), Path(a.course).resolve(), Path(a.out)
    out.mkdir(parents=True, exist_ok=False)
    results = []
    with tempfile.TemporaryDirectory(prefix="harness-grader-probe-") as td:
        for case in ("baseline", "unindexed_bad_scene", "bad_scene_direct_control", "missing_requested_scene", "broken_material_ref"):
            course = Path(td) / case
            shutil.copytree(source, course)
            stage = json.loads((course / "stage.json").read_text(encoding="utf-8"))
            if not stage.get("scenes"):
                raise ValueError("探针要求原课程至少有一个已登记场景")
            target = (course / stage["scenes"][0]).resolve()
            if course not in target.parents:
                raise ValueError("场景必须在课程副本内")
            sid = json.loads(target.read_text(encoding="utf-8"))["id"]
            args = ["--course", str(course)]
            if case in {"unindexed_bad_scene", "bad_scene_direct_control"}:
                write_json(target, {"id": sid, "type": "INVALID_FIXTURE"})
                if case == "unindexed_bad_scene":
                    stage["scenes"] = []
                    write_json(course / "stage.json", stage)
                    args += ["--scene", sid]
                else:
                    args = ["--file", str(target)]
            elif case == "missing_requested_scene":
                args += ["--scene", "__nonexistent_probe_scene__"]
            elif case == "broken_material_ref":
                outline = json.loads((course / "outline.json").read_text(encoding="utf-8"))
                outline["outlines"][0]["materialRefs"] = ["materials/__nonexistent_probe_material__.md"]
                write_json(course / "outline.json", outline)
            result = run_probe(validator, course, args)
            expected_accept = case == "baseline"
            aligned = result["accepted"] if expected_accept else result["rejected_with_report"]
            result.update(case_id=case, expected_accept=expected_accept,
                          expectation="文件结构与实际选中对象/材料存在性这一增强契约；不是原工具已承诺全部实现",
                          result="as_expected" if aligned else "unexpected_accept" if result["accepted"] else "unexpected_reject_or_invalid_report")
            results.append(result)
    write_json(out / "validator_probes.json", {"validator_sha256": sha(validator.read_bytes()),
        "source_stage_sha256": sha((source / "stage.json").read_bytes()), "results": results,
        "note": "故障注入样例不是生产错误率。baseline 本身也只验证现有结构规则。"})
    for r in results:
        print(r["case_id"], r["result"], "exit=", r["exit_code"], "summary=", r["summary"])


if __name__ == "__main__":
    main()
