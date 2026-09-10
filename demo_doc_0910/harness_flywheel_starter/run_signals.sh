#!/bin/sh
# Run manually or from your existing scheduler. No cron is installed by this script.
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
INPUT_FILE=${1:?cases.jsonl or normalized sessions.jsonl}
START_AT=${2:?inclusive ISO timestamp}
END_AT=${3:?exclusive ISO timestamp}
OUTPUT_DIR=${4:?new output directory}
CATALOG_FILE=${5:-}
set --
if [ -n "$CATALOG_FILE" ]; then set -- --catalog "$CATALOG_FILE"; fi
python3 "$SCRIPT_DIR/collect_signals.py" "$INPUT_FILE" --start "$START_AT" --end "$END_AT" --out "$OUTPUT_DIR" "$@"
