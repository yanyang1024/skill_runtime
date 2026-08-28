#!/usr/bin/env bash
set -euo pipefail

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo "Run as root after reviewing paths and environment settings." >&2
  exit 77
fi

source_dir=${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}
install_root=/opt/opencode-observability
state_root=/var/lib/opencode-observability

for required in bin/otelcol-contrib dist/src/model-proxy.js node_modules otelcol systemd; do
  if [[ ! -e "$source_dir/$required" ]]; then
    echo "Missing runtime bundle entry: $source_dir/$required" >&2
    exit 66
  fi
done

if ! id opencode-observability >/dev/null 2>&1; then
  useradd --system --home-dir "$state_root" --shell /usr/sbin/nologin opencode-observability
fi

install -d -m 0755 "$install_root" "$install_root/bin"
install -d -o opencode-observability -g opencode-observability -m 0750 \
  "$state_root" "$state_root/queue" "$state_root/archive"
cp -a "$source_dir/dist" "$source_dir/node_modules" "$source_dir/otelcol" "$source_dir/package.json" "$install_root/"
install -m 0755 "$source_dir/bin/otelcol-contrib" "$install_root/bin/otelcol-contrib"
install -m 0644 "$source_dir/systemd/opencode-otelcol.service" /etc/systemd/system/opencode-otelcol.service
install -m 0644 "$source_dir/systemd/opencode-model-proxy.service" /etc/systemd/system/opencode-model-proxy.service

if [[ ! -e /etc/opencode-observability.env ]]; then
  install -m 0600 "$source_dir/systemd/opencode-observability.env.example" /etc/opencode-observability.env
  echo "Created /etc/opencode-observability.env; edit it before starting services."
fi

systemctl daemon-reload
echo "Review /etc/opencode-observability.env, then run:"
echo "  systemctl enable --now opencode-otelcol opencode-model-proxy"
