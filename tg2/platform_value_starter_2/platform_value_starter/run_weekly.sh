#!/bin/sh
# Reference batch entry. Configure your internal export/scheduler separately.
# Usage: sh run_weekly.sh sessions.jsonl /persistent/analysis START_ISO END_ISO
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SESSIONS=${1:?sessions.jsonl required}
OUTPUT_ROOT=${2:?persistent output directory required}
WINDOW_START=${3:?start timestamp with timezone required}
WINDOW_END=${4:?end timestamp with timezone required}
mkdir -p "$OUTPUT_ROOT"
LOCK_DIR="$OUTPUT_ROOT/.value-loop.lock"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "Another batch owns the lock; inspect before removing a stale lock." >&2
  exit 1
fi
trap 'rmdir "$LOCK_DIR"' EXIT HUP INT TERM
RUN_DIR="$OUTPUT_ROOT/run_$(date -u +%Y%m%dT%H%M%SZ)"
mkdir "$RUN_DIR"
python3 "$SCRIPT_DIR/scripts/value_loop.py" --db "$OUTPUT_ROOT/evidence.db" ingest "$SESSIONS"
python3 "$SCRIPT_DIR/scripts/value_loop.py" --db "$OUTPUT_ROOT/evidence.db" queue --out "$RUN_DIR/evidence"
python3 "$SCRIPT_DIR/scripts/value_loop.py" --db "$OUTPUT_ROOT/evidence.db" report --start "$WINDOW_START" --end "$WINDOW_END" --out "$RUN_DIR/report"
if [ -n "${CAPABILITY_CATALOG:-}" ]; then
  python3 "$SCRIPT_DIR/scripts/resource_diagnostics.py" report --cases "$RUN_DIR/evidence/cases.jsonl" --catalog "$CAPABILITY_CATALOG" --start "$WINDOW_START" --end "$WINDOW_END" --out "$RUN_DIR/resources"
else
  python3 "$SCRIPT_DIR/scripts/resource_diagnostics.py" report --cases "$RUN_DIR/evidence/cases.jsonl" --start "$WINDOW_START" --end "$WINDOW_END" --out "$RUN_DIR/resources"
fi
set -- --cases "$RUN_DIR/evidence/cases.jsonl" --start "$WINDOW_START" --end "$WINDOW_END" --out "$RUN_DIR/tasks"
if [ -n "${TASK_LABELS:-}" ]; then set -- "$@" --labels "$TASK_LABELS"; fi
if [ -n "${SPLIT_REGISTRY:-}" ]; then set -- "$@" --registry "$SPLIT_REGISTRY"; fi
python3 "$SCRIPT_DIR/scripts/task_atlas.py" "$@"
python3 "$SCRIPT_DIR/scripts/make_action_board.py" --metrics "$RUN_DIR/report/metrics.json" --tools "$RUN_DIR/resources/org_tool_metrics.jsonl" --capabilities "$RUN_DIR/resources/org_capability_usage.jsonl" --supply "$RUN_DIR/resources/supply_candidates.jsonl" --artifacts "$RUN_DIR/resources/artifact_relations.jsonl" --out "$RUN_DIR/brief"
echo "Evidence, task distribution and candidate seeds ready: $RUN_DIR"
