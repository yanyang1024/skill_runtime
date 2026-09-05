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
echo "Review evidence and copy only selected cards into the manual review file: $RUN_DIR"
