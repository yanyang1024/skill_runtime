#!/usr/bin/env python3
"""Render a curl-based security verification script.

Usage:
  python scripts/render_security_check.py --host 192.168.1.10 --port 8000 --scheme http --out security_check.sh
"""
from __future__ import annotations

import argparse
from pathlib import Path

TEMPLATE = r'''#!/usr/bin/env bash
set -euo pipefail

HOST="{host}"
PORT="{port}"
SCHEME="{scheme}"
BASE="$SCHEME://$HOST:$PORT"
TOKEN="${{API_TOKEN:-REPLACE_WITH_API_TOKEN}}"

print_case() {{
  echo
  echo "=== $1 ==="
}}

print_case "1. no token should be rejected"
code=$(curl -s -o /dev/null -w "%{{http_code}}" --max-time 5 "$BASE/") || code="000"
echo "GET / without token => $code; expected 401 or 403"

print_case "2. wrong token should be rejected"
code=$(curl -s -o /dev/null -w "%{{http_code}}" --max-time 5 -H "Authorization: Bearer wrong" "$BASE/") || code="000"
echo "GET / with wrong token => $code; expected 401 or 403"

print_case "3. valid token should pass"
code=$(curl -s -o /dev/null -w "%{{http_code}}" --max-time 5 -H "Authorization: Bearer $TOKEN" "$BASE/") || code="000"
echo "GET / with valid token => $code; expected 200/204/expected app status"

print_case "4. docs should not be public"
for p in /docs /redoc /openapi.json; do
  code=$(curl -s -o /dev/null -w "%{{http_code}}" --max-time 5 "$BASE$p") || code="000"
  echo "$p without token => $code; expected 401/403/404"
done

print_case "5. headers"
curl -s -I --max-time 5 -H "Authorization: Bearer $TOKEN" "$BASE/" || true

echo
echo "Manual checks:"
echo "- confirm no traceback/path/version is returned on errors"
echo "- run: ss -tlnp | grep :$PORT"
echo "- confirm listener address matches deployment mode"
echo "- confirm firewall/Nginx rules are persisted"
'''


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", required=True)
    parser.add_argument("--port", required=True)
    parser.add_argument("--scheme", default="http", choices=["http", "https"])
    parser.add_argument("--out", default="security_check.sh")
    args = parser.parse_args()
    out = Path(args.out)
    out.write_text(TEMPLATE.format(host=args.host, port=args.port, scheme=args.scheme), encoding="utf-8")
    out.chmod(0o755)
    print(out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
