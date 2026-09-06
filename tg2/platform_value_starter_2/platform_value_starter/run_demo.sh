#!/bin/sh
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
DEMO_DIR=${1:-"$SCRIPT_DIR/demo_run"}
if [ -e "$DEMO_DIR" ]; then
  echo "Choose a new demo output directory: $DEMO_DIR" >&2
  exit 1
fi
mkdir -p "$DEMO_DIR"
python3 "$SCRIPT_DIR/scripts/make_demo.py" --out "$DEMO_DIR/input"
python3 "$SCRIPT_DIR/scripts/adapt_exports.py" "$DEMO_DIR/input/import_manifest.jsonl" --out "$DEMO_DIR/adapted.jsonl"
python3 "$SCRIPT_DIR/scripts/value_loop.py" --db "$DEMO_DIR/evidence.db" ingest "$DEMO_DIR/input/sessions.jsonl"
python3 "$SCRIPT_DIR/scripts/value_loop.py" --db "$DEMO_DIR/evidence.db" ingest "$DEMO_DIR/input/sessions.jsonl"
python3 "$SCRIPT_DIR/scripts/value_loop.py" --db "$DEMO_DIR/evidence.db" review "$DEMO_DIR/input/reviews.jsonl"
python3 "$SCRIPT_DIR/scripts/value_loop.py" --db "$DEMO_DIR/evidence.db" queue --out "$DEMO_DIR/evidence"
python3 "$SCRIPT_DIR/scripts/value_loop.py" --db "$DEMO_DIR/evidence.db" report --start '2026-08-01T00:00:00+08:00' --end '2026-09-01T00:00:00+08:00' --costs "$DEMO_DIR/input/costs.json" --out "$DEMO_DIR/report"
python3 "$SCRIPT_DIR/scripts/resource_diagnostics.py" report --cases "$DEMO_DIR/evidence/cases.jsonl" --catalog "$DEMO_DIR/input/capability_catalog.jsonl" --start '2026-08-01T00:00:00+08:00' --end '2026-09-01T00:00:00+08:00' --out "$DEMO_DIR/resources"
python3 "$SCRIPT_DIR/scripts/build_datasets.py" "$DEMO_DIR/input/curated.jsonl" --cases "$DEMO_DIR/evidence/cases.jsonl" --out "$DEMO_DIR/dataset_v1" --registry "$DEMO_DIR/split_registry.json"
python3 "$SCRIPT_DIR/scripts/task_atlas.py" --cases "$DEMO_DIR/evidence/cases.jsonl" --labels "$DEMO_DIR/input/task_labels.jsonl" --registry "$DEMO_DIR/split_registry.json" --out "$DEMO_DIR/tasks"
python3 "$SCRIPT_DIR/scripts/make_action_board.py" --metrics "$DEMO_DIR/report/metrics.json" --tools "$DEMO_DIR/resources/org_tool_metrics.jsonl" --capabilities "$DEMO_DIR/resources/org_capability_usage.jsonl" --supply "$DEMO_DIR/resources/supply_candidates.jsonl" --artifacts "$DEMO_DIR/resources/artifact_relations.jsonl" --out "$DEMO_DIR/brief"
python3 "$SCRIPT_DIR/scripts/synthesize_slots.py" "$DEMO_DIR/input/curated.jsonl" --cases "$DEMO_DIR/evidence/cases.jsonl" --out "$DEMO_DIR/synthetic_candidates.jsonl" --n 5
python3 "$SCRIPT_DIR/scripts/bench.py" freeze "$DEMO_DIR/dataset_v1/bench_candidates.jsonl" --out "$DEMO_DIR/bench_v1"
python3 "$SCRIPT_DIR/scripts/bench.py" run "$DEMO_DIR/bench_v1" --mock demo_v1 --out "$DEMO_DIR/model_a"
python3 "$SCRIPT_DIR/scripts/bench.py" run "$DEMO_DIR/bench_v1" --mock demo_v2 --out "$DEMO_DIR/model_b"
python3 "$SCRIPT_DIR/scripts/bench.py" compare "$DEMO_DIR/model_a" "$DEMO_DIR/model_b" --out "$DEMO_DIR/model_comparison.md"
echo "Demo complete: $DEMO_DIR/report/value_report.md"
