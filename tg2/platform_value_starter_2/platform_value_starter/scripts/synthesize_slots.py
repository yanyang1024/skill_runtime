#!/usr/bin/env python3
"""Construct checkable, narrow query-extraction candidates from TRAIN seeds only.

The label comes from generated slots, not from a teacher model's self-rating.
Output remains candidate until the task/template has been reviewed.
"""
import argparse
import copy
import random
from pathlib import Path

from build_datasets import validate_curated
from common import read_jsonl, write_jsonl
from evidence import trusted_target

TEMPLATES = ["查询批次 {lot_id} 的第 {wafer} 片晶圆的 {metric}，只提取查询条件。",
             "请查 {lot_id}，wafer={wafer}，指标={metric}；返回结构化查询参数。"]


def synthesize(rows, n, seed):
    rng = random.Random(seed)
    out = []
    for r in rows:
        if r["split"] != "train" or r["task_type"] != "query_extract" or "sft" not in r["allowed_uses"] or not trusted_target(r):
            continue
        if set(r["target"]) != {"lot_id", "wafer", "metric"}:
            raise ValueError("this generator only supports the documented three-slot schema")
        for i in range(n):
            slots = {"lot_id": f"LOT-DEMO-{rng.randrange(10000,99999)}", "wafer": rng.randint(1,25), "metric": rng.choice(["cd", "uniformity"])}
            item = copy.deepcopy(r)
            item.update({"id": f"{r['id']}:synthetic:{seed}:{i}", "parent_ids": [r["id"]],
                "target": slots, "review_status": "candidate", "allowed_uses": ["sft"],
                "synthetic": True, "generator": "slots-v1", "generator_seed": seed,
                "reviewer_id": "AUTO:slots-v1", "label_source":"programmatic_candidate", "template_index": i % len(TEMPLATES)})
            item["messages"][-1]["content"] = TEMPLATES[i % len(TEMPLATES)].format(**slots)
            out.append(item)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("curated"); ap.add_argument("--cases", required=True); ap.add_argument("--out", required=True)
    ap.add_argument("--n", type=int, default=10); ap.add_argument("--seed", type=int, default=42)
    a = ap.parse_args()
    if a.n < 1: raise ValueError("n must be positive")
    rows = validate_curated(read_jsonl(a.curated), read_jsonl(a.cases))
    if Path(a.out).exists(): raise ValueError("output exists")
    items = synthesize(rows,a.n,a.seed)
    write_jsonl(a.out, items)
    print(f"{len(items)} candidate rows; no holdout seeds used, no automatic training export.")


if __name__ == "__main__":
    main()
