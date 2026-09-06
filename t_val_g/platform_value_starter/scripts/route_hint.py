#!/usr/bin/env python3
"""Route-conditioned prompt hints ("query rewrite" for routing) + honest A/B.

Idea (from IR query expansion): after the router classifies a request, prepend a
short per-intent guidance hint so one model can follow a better reasoning path —
potentially without switching to a bigger/smaller model.

⚠️ This is a HYPOTHESIS until measured. Rules encoded here:
1. Hint only when router confidence >= --threshold; below it, abstain (no hint).
   A wrong hint can actively mislead — measure that case, don't hide it.
2. A/B on the SAME frozen tasks, SAME model/config: one run plain, one hinted.
   `bench.py compare` refuses different bench hashes by design; use `ab` here,
   which pairs by task id and asserts the benches differ ONLY by hints.
3. Verdict needs pass rate AND cost (tokens/latency); "faster" alone is not a win.

Standard library only. --mock generates deterministic fake predictions so the
plumbing is demoable without sklearn.
"""
import argparse
import copy
import json
from pathlib import Path

from common import cell, digest, read_jsonl, rate, write_json, write_jsonl, write_text

DEFAULT_HINTS = {
    "knowledge": "【任务类型：知识查证】先给出结论，再列出依据；不确定处明确说明，不要编造。",
    "coding": "【任务类型：代码】先理解现有代码与报错，最小改动修复，给出可运行的完整结果。",
    "data_analysis": "【任务类型：数据分析】先确认口径与分组，再给数值；单位与分母写清楚。",
}


def predict_mock(tasks):
    """Deterministic fake router for plumbing demos only — not a real classifier."""
    preds = []
    for t in tasks:
        text = t["messages"][-1]["content"]
        if "统计" in text or "均值" in text or "分析" in text:
            label, conf = "data_analysis", 0.9
        elif any(w in text for w in ("脚本", "代码", "报错", "Python")):
            label, conf = "coding", 0.8
        else:
            label, conf = "knowledge", 0.6
        preds.append({"id": t["id"], "label": label, "confidence": conf, "mock": True})
    return preds


def apply(tasks_path, preds_path, hints_path, threshold, out):
    tasks = read_jsonl(tasks_path)
    preds = {p["id"]: p for p in (predict_mock(tasks) if preds_path == "mock" else read_jsonl(preds_path))}
    hints = json.loads(Path(hints_path).read_text(encoding="utf-8")) if hints_path else DEFAULT_HINTS
    if not 0 <= threshold <= 1:
        raise ValueError("threshold must be in [0,1]")
    out, hinted, abstained, missing = Path(out), 0, 0, []
    if out.exists():
        raise ValueError("output exists; create a new version directory")
    rows = []
    for t in tasks:
        p = preds.get(t["id"])
        if not p:
            missing.append(t["id"])
        row = copy.deepcopy(t)
        if p and p.get("confidence", 0) >= threshold and p.get("label") in hints:
            row["messages"][-1]["content"] = hints[p["label"]] + "\n\n" + row["messages"][-1]["content"]
            hinted += 1
        else:
            abstained += 1
        rows.append(row)
    write_jsonl(out / "tasks.jsonl", rows)
    write_json(out / "manifest.json", {
        "tasks_sha256": digest(rows), "grader": "json_exact_v1", "harness": "fixed-packet-v1",
        "n": len(rows), "script_sha256": digest((Path(__file__).parent / "bench.py").read_text(encoding="utf-8")),
        "hint_variant_of": digest(tasks), "hint_threshold": threshold,
        "hinted": hinted, "abstained_no_hint": abstained, "missing_predictions": missing,
        "note": "Same tasks/targets as the base bench; only hinted prompts differ. Compare with route_hint.py ab."})
    print(json.dumps({"hinted": hinted, "abstained": abstained, "missing": missing}, ensure_ascii=False))


def ab(plain_dir, hinted_dir, out):
    """Paired per-task comparison of two run dirs differing ONLY by the hint."""
    def load(d):
        root = Path(d)
        meta = json.loads((root / "run_manifest.json").read_text(encoding="utf-8"))
        rows = {(r["id"], r["trial"]): r for r in read_jsonl(root / "results.jsonl")}
        return meta, rows
    ma, a = load(plain_dir)
    mb, b = load(hinted_dir)
    if ma["model"] != mb["model"] or ma["config"] != mb["config"] or ma["mock"] != mb["mock"]:
        raise ValueError("A/B requires same model, config and real/mock mode")
    base_ids = set(ma["bench"].get("task_ids") or ma.get("task_ids") or [])
    ids = sorted({i for i, _ in a} & {i for i, _ in b})
    if base_ids and set(ids) - base_ids:
        raise ValueError("unexpected task ids in runs")
    wins = sum(b[k]["passed"] and not a[k]["passed"] for k in set(b) & set(a))
    losses = sum(a[k]["passed"] and not b[k]["passed"] for k in set(a) & set(b))
    tok_a = [r["usage"].get("total_tokens") for r in a.values() if isinstance(r.get("usage", {}).get("total_tokens"), (int, float))]
    tok_b = [r["usage"].get("total_tokens") for r in b.values() if isinstance(r.get("usage", {}).get("total_tokens"), (int, float))]
    lat_a = [r["latency_s"] for r in a.values()]
    lat_b = [r["latency_s"] for r in b.values()]
    lines = ["# 路由提示 A/B（同一模型，提示 vs 无提示）", "",
             f"模型：{cell(ma['model'])}；配对试次 {len(set(a)&set(b))}。", "",
             "| 指标 | 无提示 | 有提示 |", "|---|---|---|",
             f"| 通过/配对试次 | {rate(sum(r['passed'] for r in a.values()), len(a))} | {rate(sum(r['passed'] for r in b.values()), len(b))} |",
             f"| 提示后新增通过 | — | {wins} |",
             f"| 提示后退步（含路由错误误导） | — | {losses} |",
             f"| token 中位（已知 {len(tok_a)}/{len(tok_b)}） | {sorted(tok_a)[len(tok_a)//2] if tok_a else 'N/A'} | {sorted(tok_b)[len(tok_b)//2] if tok_b else 'N/A'} |",
             f"| 延迟中位秒 | {sorted(lat_a)[len(lat_a)//2]:.2f} | {sorted(lat_b)[len(lat_b)//2]:.2f} |", "",
             "判定顺序：先看退步题是不是路由错标导致（误导代价），再看通过差，最后才看 token/延迟节省。",
             "通过不降且成本降，才支持「不换模型也能加速」；样本少时只作试点结论。"]
    write_text(out, "\n".join(lines) + "\n")
    print(out)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("apply")
    p.add_argument("tasks"); p.add_argument("--pred", default="mock",
        help="predictions jsonl {id,label,confidence}, or 'mock' for plumbing demo")
    p.add_argument("--hints", help="JSON {label: hint text}; default built-in demo hints")
    p.add_argument("--threshold", type=float, default=0.5)
    p.add_argument("--out", required=True)
    p = sub.add_parser("ab")
    p.add_argument("plain_run"); p.add_argument("hinted_run"); p.add_argument("--out", required=True)
    a = ap.parse_args()
    if a.cmd == "apply":
        apply(a.tasks, a.pred, a.hints, a.threshold, a.out)
    else:
        ab(a.plain_run, a.hinted_run, a.out)


if __name__ == "__main__":
    main()
