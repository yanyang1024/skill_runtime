#!/usr/bin/env python3
"""验收器/校验脚本探针：按用例清单执行，核对退出码与报告是否一致。

用例由你准备（含故障注入副本）：每行一个 JSONL：
{"name": "...", "workdir": "用例目录", "args": ["--course", "..."],
 "expect": "accept|reject|no_target_explicit|unknown", "note": "为什么这样期望"}

脚本不制造故障、不解析命令文本，只忠实执行并对比期望；结果不换算成"误判率"——
探针是刻意挑选的故障模式，分母不是生产请求。
"""
import argparse
import json
import subprocess
import sys
from pathlib import Path


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def run_case(validator, case, checked_field, timeout):
    workdir = Path(case["workdir"]).resolve()
    cp = subprocess.run([sys.executable, str(validator), *[str(x) for x in case.get("args", [])]],
                        cwd=workdir, capture_output=True, text=True, timeout=timeout)
    summary = None
    lines = cp.stdout.strip().splitlines()
    for line in reversed(lines):
        try:
            obj = json.loads(line)
            if isinstance(obj, dict):
                summary = obj
                break
        except ValueError:
            continue
    accepted = cp.returncode == 0 and isinstance(summary, dict) \
        and summary.get("errors") == 0 and summary.get("passed") is True
    rejected = cp.returncode == 1 and isinstance(summary, dict) \
        and isinstance(summary.get("errors"), int) and summary["errors"] > 0 and summary.get("passed") is False
    observed = "accept" if accepted else "reject" if rejected else "other"
    expect = case.get("expect", "unknown")
    if expect == "unknown":
        result = "unknown"
    elif expect == "no_target_explicit":
        # 目标不存在/未检查到时应显式报告；静默 accept 或 checked_count=0 都算漏检。
        zero_checked = isinstance(summary, dict) and summary.get(checked_field) == 0
        result = "fail" if accepted or zero_checked else "pass" if observed != "accept" else "unknown"
    else:
        result = "pass" if observed == expect else "fail"
    return {"name": case["name"], "expect": expect, "observed": observed, "result": result,
            "exit_code": cp.returncode, "summary": summary, "stderr_tail": cp.stderr[-500:],
            "note": case.get("note"), "workdir": str(workdir),
            "interpretation": "探针是该故障模式的检出能力证据；不代表生产请求的通过率或误判率"}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--validator", required=True, help="已人工审阅的校验脚本路径")
    p.add_argument("--cases", required=True, help="JSONL 用例清单")
    p.add_argument("--out", required=True)
    p.add_argument("--checked-field", default="checked_count", help="summary 中表示被检查对象数的字段名")
    p.add_argument("--timeout", type=int, default=30)
    a = p.parse_args()
    validator = Path(a.validator).resolve()
    if not validator.is_file():
        p.error("validator 不存在")
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=False)
    cases = [json.loads(l) for l in Path(a.cases).read_text(encoding="utf-8").splitlines() if l.strip()]
    results = [run_case(validator, c, a.checked_field, a.timeout) for c in cases]
    write_json(out / "probe_results.json", {"validator": str(validator), "cases": results,
        "note": "用例是人工构造的故障模式；expect 是人工声明的期望；结果需人工复核后再改校验器。"})
    print(json.dumps({"cases": len(results),
                      "results": {r["name"]: r["result"] for r in results}}, ensure_ascii=False))


if __name__ == "__main__":
    main()
