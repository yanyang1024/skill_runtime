#!/usr/bin/env python3
"""Static security baseline checks for Flask/FastAPI projects.

This script is intentionally conservative. It reports likely issues and evidence;
it does not claim to prove security.
"""
from __future__ import annotations

import ast
import json
import re
import sys
from pathlib import Path

SECRET_RE = re.compile(r"(?i)(api[_-]?token|secret[_-]?key|password|passwd|private[_-]?key)\s*=\s*['\"][^'\"]{6,}['\"]")
BIND_ALL_RE = re.compile(r"(--host\s+0\.0\.0\.0|host\s*=\s*['\"]0\.0\.0\.0['\"])")
DEBUG_RE = re.compile(r"(?i)(debug\s*=\s*True|FLASK_DEBUG\s*=\s*1)")


def check_text(path: Path, text: str) -> list[dict]:
    issues = []
    for lineno, line in enumerate(text.splitlines(), start=1):
        if SECRET_RE.search(line):
            issues.append({"severity": "high", "rule": "hardcoded_secret", "file": str(path), "line": lineno, "message": "Possible hardcoded secret/token/password"})
        if BIND_ALL_RE.search(line):
            issues.append({"severity": "medium", "rule": "bind_0_0_0_0", "file": str(path), "line": lineno, "message": "Service may bind to 0.0.0.0"})
        if DEBUG_RE.search(line):
            issues.append({"severity": "high", "rule": "debug_enabled", "file": str(path), "line": lineno, "message": "Debug mode may be enabled"})
        if "docs_url" in line and "None" not in line:
            issues.append({"severity": "medium", "rule": "fastapi_docs_maybe_public", "file": str(path), "line": lineno, "message": "FastAPI docs_url may be public"})
        if "openapi_url" in line and "None" not in line:
            issues.append({"severity": "medium", "rule": "fastapi_openapi_maybe_public", "file": str(path), "line": lineno, "message": "FastAPI openapi_url may be public"})
    return issues


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    files = []
    for pattern in ("*.py", "*.sh", "*.service", "Dockerfile", "docker-compose*.yml", "*.env", "*.nginx", "*.conf"):
        files.extend(root.rglob(pattern))
    issues = []
    for path in sorted(set(files)):
        if any(part in {".git", ".venv", "venv", "node_modules"} for part in path.parts):
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        issues.extend(check_text(path, text))
    print(json.dumps({"root": str(root), "issues": issues}, indent=2, ensure_ascii=False))
    return 1 if any(i["severity"] == "high" for i in issues) else 0


if __name__ == "__main__":
    raise SystemExit(main())
