#!/bin/sh
# Reference four-arm experiment: same downstream tasks, model and gateway.
# Usage: sh run_prompt_ablation.sh BENCH MODEL API_BASE ROUTER_PKL NEW_OUT [DEV_CHOSEN_THRESHOLD] [KEYWORDS_JSON] [HINTS_JSON]
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
BENCH_DIR=${1:?downstream frozen benchmark required}
MODEL_NAME=${2:?fixed model required}
GATEWAY_BASE=${3:?internal gateway base required}
ROUTER_FILE=${4:?trusted router.pkl required}
ABLATION_OUT=${5:?new output directory required}
ROUTE_THRESHOLD=${6:-0.75}
# Pass the same reviewed taxonomy/templates to all arms; paths may contain spaces.
RULES_FILE=${7:-}
HINTS_FILE=${8:-}
set --
if [ -n "$RULES_FILE" ]; then set -- "$@" --keywords "$RULES_FILE"; fi
if [ -n "$HINTS_FILE" ]; then set -- "$@" --hints "$HINTS_FILE"; fi
if [ -e "$ABLATION_OUT" ]; then
  echo "Choose a new output directory: $ABLATION_OUT" >&2
  exit 1
fi
mkdir -p "$ABLATION_OUT"
for POLICY_NAME in none generic keywords classifier; do
  python3 "$SCRIPT_DIR/scripts/bench.py" run "$BENCH_DIR" \
    --model "$MODEL_NAME" --api-base "$GATEWAY_BASE" --trials 3 \
    --prompt-policy "$POLICY_NAME" --router-model "$ROUTER_FILE" --route-threshold "$ROUTE_THRESHOLD" \
    --out "$ABLATION_OUT/$POLICY_NAME" "$@"
done
for POLICY_NAME in generic keywords classifier; do
  python3 "$SCRIPT_DIR/scripts/bench.py" compare "$ABLATION_OUT/none" "$ABLATION_OUT/$POLICY_NAME" \
    --axis prompt --out "$ABLATION_OUT/compare_$POLICY_NAME.md"
done
python3 "$SCRIPT_DIR/scripts/bench.py" compare "$ABLATION_OUT/generic" "$ABLATION_OUT/classifier" \
  --axis prompt --out "$ABLATION_OUT/classifier_vs_generic.md"
python3 "$SCRIPT_DIR/scripts/bench.py" compare "$ABLATION_OUT/keywords" "$ABLATION_OUT/classifier" \
  --axis prompt --out "$ABLATION_OUT/classifier_vs_keywords.md"
