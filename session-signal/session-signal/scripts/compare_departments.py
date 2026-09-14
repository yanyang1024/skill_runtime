#!/usr/bin/env python3
"""同一口径、共同切片、相同权重的部门描述性比较；不检验因果或部门独立性。"""
import argparse
from collections import defaultdict
from pathlib import Path

from common import cell, fraction, read_jsonl, write_json, write_jsonl, write_text

UNKNOWN = {None, "", "unknown", "unbound"}
PARTITION = ("session_id", "period", "task_type", "model", "tool", "phase", "origin", "tool_version")


def totals(rows):
    return {"numerator": sum(r["numerator"] for r in rows), "denominator": sum(r["denominator"] for r in rows),
            "sessions": len({r["session_id"] for r in rows}),
            "users": len({r["user_id"] for r in rows if r.get("user_id") not in UNKNOWN}),
            "unknown_user_sessions": len({r["session_id"] for r in rows if r.get("user_id") in UNKNOWN})}


def compare(rows, *, dataset_id, tenant_id, org_a, org_b, by, metric="recorded_tool_error", min_calls=20, gap=0.03):
    if org_a == org_b or not by or min_calls < 1 or not 0 <= gap <= 1:
        raise ValueError("需要不同部门、至少一个切片字段、正的最小调用数及 0..1 差异阈值")
    selected = [r for r in rows if r.get("dataset_id") == dataset_id and r.get("tenant_id") == tenant_id
                and r.get("org") in {org_a, org_b} and r.get("metric") == metric]
    if not selected:
        raise ValueError("所选数据集/租户/指标无记录")
    seen = set()
    for r in selected:
        n, d = r["numerator"], r["denominator"]
        if type(n) is not int or type(d) is not int or not 0 <= n <= d:
            raise ValueError("本脚本只接收计数率：整数分子/分母，0 <= n <= d")
        # 同会话可按工具、模型等分成多行；同一分区不能重复投影/重复求和。
        key = (r["org"], *(r.get(k) for k in PARTITION))
        if key in seen:
            raise ValueError("同会话分区重复；先去掉重复导出，或扩充 PARTITION 以表达真实分区")
        seen.add(key)
    groups = (org_a, org_b)
    raw = {g: totals([r for r in selected if r["org"] == g]) for g in groups}
    buckets = defaultdict(lambda: defaultdict(list))
    for r in selected:
        buckets[tuple(r.get(k) for k in by)][r["org"]].append(r)
    slices, eligible = [], []
    for key, bucket in sorted(buckets.items(), key=lambda x: str(x[0])):
        counts = {g: totals(bucket.get(g, [])) for g in groups}
        known = all(v not in UNKNOWN for v in key)
        common = known and all(counts[g]["denominator"] >= min_calls for g in groups)
        rates = {g: fraction(counts[g]["numerator"], counts[g]["denominator"]) for g in groups}
        row = {"slice": dict(zip(by, key)), "counts": counts, "rates": rates, "included": common,
               "reason": "common_observed_slice" if common else "unknown_slice_fields" if not known else "no_overlap_or_small_cell"}
        slices.append(row)
        if common:
            eligible.append(row)
    weight_total = sum(sum(x["counts"][g]["denominator"] for g in groups) for x in eligible)
    standardized = {g: None for g in groups}
    for x in eligible:
        x["weight"] = sum(x["counts"][g]["denominator"] for g in groups) / weight_total
    if eligible:
        standardized = {g: sum(x["weight"] * x["rates"][g] for x in eligible) for g in groups}
    coverage = {g: fraction(sum(x["counts"][g]["denominator"] for x in eligible), raw[g]["denominator"]) for g in groups}
    max_gap = max((abs(x["rates"][org_a] - x["rates"][org_b]) for x in eligible), default=None)
    # 阈值只帮助人工挑选复盘方向；不是等效检验、显著性检验或自动归因。
    hint = "insufficient_common_evidence" if not eligible else (
        "difference_to_investigate" if max_gap > gap else "descriptively_close_in_common_slices")
    result = {"dataset_id": dataset_id, "tenant_id": tenant_id, "metric": metric, "departments": list(groups),
              "strata": by, "raw": raw, "standardized_rates": standardized, "common_call_coverage": coverage,
              "common_slices": len(eligible), "excluded_rows_outside_selection": len(rows) - len(selected),
              "max_absolute_slice_gap": max_gap, "triage_hint": hint, "illustrative_gap_threshold": gap,
              "min_calls_per_department_per_cell": min_calls, "comparison_strength": "observational",
              "missing_context_rows": {k: sum(r.get(k) in UNKNOWN for r in selected)
                                       for k in ("task_type", "task_label_source", "model", "tool_version", "phase", "origin", "user_id")},
              "unadjusted_context": [k for k in ("phase", "origin", "tool_version", "task_label_source") if k not in by],
              "note": "只描述本次共同切片。相近不等于部门无关；不同不等于部门造成。未推断人员能力或模型缺陷。"}
    return result, slices


def save_report(out, result, slices):
    out = Path(out)
    out.mkdir(parents=True, exist_ok=False)
    write_json(out / "comparison.json", result)
    write_jsonl(out / "slices.jsonl", slices)
    pct = lambda v: "N/A" if v is None else f"{v:.1%}"
    lines = ["# 部门比较：观察范围与改进归属分开", "", result["note"], "",
             f"数据集：{result['dataset_id']}；指标：{result['metric']}；切片：{', '.join(result['strata'])}。", "",
             "| 部门 | 原始分子/分母 | 原始率 | 同权重率 | 共同切片调用覆盖 | 会话/已知用户数 |",
             "|---|---:|---:|---:|---:|---:|"]
    for g in result["departments"]:
        r = result["raw"][g]
        lines.append(f"| {cell(g)} | {r['numerator']}/{r['denominator']} | {pct(fraction(r['numerator'], r['denominator']))} | "
                     f"{pct(result['standardized_rates'][g])} | {pct(result['common_call_coverage'][g])} | {r['sessions']}/{r['users']} |")
    lines += ["", f"人工复盘提示：{result['triage_hint']}；共同切片 {result['common_slices']} 个。",
              "阈值是示例，不是统计达标线。共同覆盖较低、少数用户贡献大或标签很弱时，限制结论范围。",
              f"未调整的上下文：{', '.join(result['unadjusted_context']) or '见 JSON 中其他缺口'}。",
              "逐切片分子、分母、用户数及权重见 slices.jsonl；缺失上下文见 comparison.json。",
              "一名用户/一次会话的多个调用并非独立样本。本脚本不输出独立性结论或用 Wilson 区间自动做决策。",
              "下一步各取几条真实案例复核原因，再选择平台修复或部门适配；不要据此给部门或个人打分。"]
    write_text(out / "comparison.md", "\n".join(lines) + "\n")


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("input"); p.add_argument("--dataset-id", required=True); p.add_argument("--tenant-id", required=True)
    p.add_argument("--org-a", required=True); p.add_argument("--org-b", required=True)
    p.add_argument("--by", nargs="+", default=["period", "task_type", "model", "tool"])
    p.add_argument("--metric", default="recorded_tool_error"); p.add_argument("--min-calls", type=int, default=20)
    p.add_argument("--gap", type=float, default=0.03); p.add_argument("--out", required=True)
    a = p.parse_args()
    result, slices = compare(read_jsonl(a.input), dataset_id=a.dataset_id, tenant_id=a.tenant_id,
                             org_a=a.org_a, org_b=a.org_b, by=a.by, metric=a.metric, min_calls=a.min_calls, gap=a.gap)
    save_report(a.out, result, slices)
    print(a.out)


if __name__ == "__main__":
    main()
