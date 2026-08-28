#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "Usage: $0 /path/to/otelcol-contrib [output.tar.gz]" >&2
  exit 64
fi

collector_binary=$1
output_archive=${2:-opencode-observability-runtime.tar.gz}
project_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

if [[ ! -f "$collector_binary" || ! -x "$collector_binary" ]]; then
  echo "Collector must be a staged executable file: $collector_binary" >&2
  exit 66
fi

if [[ ! -d "$project_root/node_modules" ]]; then
  echo "Run npm ci from an approved internal registry/cache before building the bundle." >&2
  exit 69
fi

cd "$project_root"
npm run typecheck
npm test
npm run build

bundle_root=$(mktemp -d)
cleanup() {
  rm -rf -- "$bundle_root"
}
trap cleanup EXIT

export OTEL_STORAGE_DIR="$bundle_root/queue"
export OTEL_FILE_DIR="$bundle_root/archive"
export OTEL_UPSTREAM_ENDPOINT="http://127.0.0.1:4318"
mkdir -p "$OTEL_STORAGE_DIR" "$OTEL_FILE_DIR"
"$collector_binary" validate --config="$project_root/otelcol/config-upstream.yaml"
"$collector_binary" validate --config="$project_root/otelcol/config-local-file.yaml"
"$collector_binary" validate --config="$project_root/otelcol/config-gateway.yaml"

runtime_dir="$bundle_root/opencode-observability"
mkdir -p "$runtime_dir/bin"
install -m 0755 "$collector_binary" "$runtime_dir/bin/otelcol-contrib"
cp -a dist node_modules otelcol package.json package-lock.json "$runtime_dir/"
cp -a systemd "$runtime_dir/"
install -m 0755 scripts/install-systemd.sh "$runtime_dir/install-systemd.sh"
npm prune --omit=dev --ignore-scripts --prefix "$runtime_dir"
"$collector_binary" --version > "$runtime_dir/COLLECTOR_VERSION"
collector_hash=$(sha256sum "$collector_binary" | awk '{print $1}')
printf '%s  otelcol-contrib\n' "$collector_hash" > "$runtime_dir/COLLECTOR_SHA256"

tar -C "$bundle_root" -czf "$output_archive" opencode-observability
echo "Created runtime bundle: $output_archive"
