#!/usr/bin/env python3
"""Curated task packets -> separated benchmark/router/SFT data.

This deliberately does not turn entire good conversations into training answers.
All records have an explicit target, complete input, allowed use and source split.
"""
import argparse
import json
import re
from pathlib import Path

from common import digest, read_jsonl, write_json, write_jsonl
from evidence import label_source, trusted_target

SPLITS = {"train", "dev", "holdout"}


def input_hash(messages):
    # Conservative exact-normalized duplicate guard; not a semantic deduplicator.
    return digest([(m["role"], re.sub(r"\s+", " ", m["content"]).strip().casefold()) for m in messages])


def validate_curated(rows, cases):
    by_case = {c["case_id"]: c for c in cases}
    ids, scope_splits, input_splits = {}, {}, {}
    for r in rows:
        for k in ("id", "source_group", "case_id", "source_revision", "reviewer_id", "task_type", "split"):
            if not isinstance(r.get(k), str) or not r[k]:
                raise ValueError(f"curated row missing {k}")
        if r["id"] in ids:
            raise ValueError("duplicate curated id")
        ids[r["id"]] = r
        if r["split"] not in SPLITS or r.get("review_status") not in {"approved","candidate"} or r.get("context_complete") is not True:
            raise ValueError("task packet must declare complete context, review status and split")
        c = by_case.get(r["case_id"])
        if not c or c["source_revision"] != r["source_revision"]:
            raise ValueError("curated source missing or stale; recurate before export")
        if not r.get("messages") or r["messages"][-1].get("role") != "user":
            raise ValueError("input packet must end at the user request")
        for m in r["messages"]:
            if m.get("role") not in {"system", "user", "assistant"} or not isinstance(m.get("content"), str):
                raise ValueError("v1 supports self-contained text tasks; tool traces need a runtime adapter")
        if "target" not in r or not isinstance(r["target"], dict) or not isinstance(r.get("rubric"), list) or not r["rubric"] or not all(isinstance(x,str) and x.strip() for x in r["rubric"]):
            raise ValueError("v1 requires reviewed JSON target and nonempty rubric")
        if not r.get("allowed_uses") or not set(r["allowed_uses"]) <= {"bench", "sft", "router"}:
            raise ValueError("allowed_uses missing or invalid")
        # Both human-assigned family and session identity must remain in one split.
        for scope in ("group:" + r["source_group"], "case:" + r["case_id"]):
            if scope in scope_splits and scope_splits[scope] != r["split"]:
                raise ValueError(f"source family crosses splits: {scope}")
            scope_splits[scope] = r["split"]
        h = input_hash(r["messages"])
        if h in input_splits and input_splits[h] != r["split"]:
            raise ValueError("normalized duplicate input crosses splits")
        input_splits[h] = r["split"]
    for r in rows:
        for parent in r.get("parent_ids", []):
            if parent not in ids or ids[parent]["split"] != r["split"] or ids[parent]["source_group"] != r["source_group"]:
                raise ValueError("derived example must inherit parent group and split")
    return rows


def build(rows, cases, out, registry_path, org_field=None, export_sft=False):
    validate_curated(rows, cases)
    out = Path(out)
    if out.exists():
        raise ValueError("dataset output exists; create a new version directory")
    registry_path = Path(registry_path)
    registry = json.loads(registry_path.read_text()) if registry_path.exists() else {}
    by_case = {c["case_id"]:c for c in cases}
    enriched = []
    for r in rows:
        s = by_case[r["case_id"]]["session"]
        tenant = s["tenant_id"]
        org = s.get(org_field) if org_field else s.get("org_section",s.get("dept"))
        if org_field and not org:
            raise ValueError("org holdout needs a known source-session org for every row")
        keys = ["group:" + r["source_group"], "case:" + r["case_id"], "input:" + input_hash(r["messages"])]
        if org_field: keys.append(f"org:{org_field}:{tenant}:{org}")
        for key in keys:
            if key in registry and registry[key] != r["split"]:
                raise ValueError("historical split changed; old holdout/derivatives must never become training data")
            registry[key] = r["split"]
        enriched.append({**r,"tenant_id":tenant,"org_section":org or "unknown","label_source":label_source(r)})
    rows = enriched
    outputs = {"bench_candidates.jsonl": [], "bench_diagnostic_candidates.jsonl": []}
    for split in SPLITS:
        outputs[f"router_{split}.jsonl"] = []
        if split != "holdout":
            outputs[f"sft_{split}.jsonl"] = []
    for r in rows:
        split = r["split"]
        provenance = {k: r[k] for k in ("id", "case_id", "source_revision", "source_group", "split","tenant_id","org_section","label_source")}
        provenance["source_kind"] = "synthetic" if r.get("synthetic") else "real"
        provenance["reference_quality"] = "validated" if trusted_target(r) else "weak_label"
        if split == "holdout" and "bench" in r["allowed_uses"]:
            name = "bench_candidates.jsonl" if trusted_target(r) else "bench_diagnostic_candidates.jsonl"
            outputs[name].append({**r, "grader": "json_exact_v1", "reference_quality":provenance["reference_quality"],"source_kind":provenance["source_kind"]})
        if "router" in r["allowed_uses"]:
            if r["task_type"] != "intent_routing" or not isinstance(r.get("route_text"), str) or r["route_text"] not in [m["content"] for m in r["messages"] if m["role"] == "user"]:
                raise ValueError("router needs an explicit user request visible at routing time")
            if not isinstance(r["target"].get("intent"), str):
                raise ValueError("router label must be a task intent, not good/bad or later turn count")
            outputs[f"router_{split}.jsonl"].append({**provenance, "text": r["route_text"], "label": r["target"]["intent"]})
        if export_sft and trusted_target(r) and split in {"train", "dev"} and "sft" in r["allowed_uses"]:
            outputs[f"sft_{split}.jsonl"].append({"prompt": r["messages"],
                "completion": [{"role": "assistant", "content": json.dumps(r["target"], ensure_ascii=False, sort_keys=True)}],
                "meta": provenance})
    manifest = {"version": "dataset-v2", "curated_sha256": digest(rows), "n_curated": len(rows),
                "org_holdout_field":org_field,"evaluation_goal":"cross_org_transfer" if org_field else "source_group_generalization",
                "sft_export_enabled":export_sft,
                "counts": {k: len(v) for k,v in outputs.items()}, "hashes": {k: digest(v) for k,v in outputs.items()},
                "source_groups": sorted({r["source_group"] for r in rows}),
                "note": "Weak labels may train routers but their evaluation is agreement, not gold accuracy. Org holdout is optional; holdout is never SFT."}
    for name, items in outputs.items():
        write_jsonl(out / name, items)
    write_json(out / "manifest.json", manifest)
    write_json(registry_path, registry)
    return manifest


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("curated"); ap.add_argument("--cases", required=True); ap.add_argument("--out", required=True)
    ap.add_argument("--registry", required=True, help="persistent split registry shared by every dataset version")
    ap.add_argument("--org-field",help="optional source session field, e.g. org_section, for cross-org holdout")
    ap.add_argument("--export-sft",action="store_true",help="opt in to exporting approved human/programmatic-gold train/dev targets")
    a = ap.parse_args()
    result = build(read_jsonl(a.curated), read_jsonl(a.cases), a.out, a.registry,a.org_field,a.export_sft)
    print(json.dumps({"n_curated": result["n_curated"], "counts": result["counts"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
