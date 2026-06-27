#!/usr/bin/env python3
"""Detect Flask/FastAPI entry files and route decorators.

Usage:
  python scripts/detect_webapp.py /path/to/project
"""
from __future__ import annotations

import ast
import json
import sys
from pathlib import Path

ROUTE_ATTRS = {"route", "get", "post", "put", "delete", "patch", "options", "head", "websocket"}


def decorator_name(node: ast.AST) -> str:
    if isinstance(node, ast.Call):
        node = node.func
    if isinstance(node, ast.Attribute):
        return node.attr
    if isinstance(node, ast.Name):
        return node.id
    return ""


def route_path(node: ast.AST) -> str | None:
    if isinstance(node, ast.Call) and node.args:
        arg = node.args[0]
        if isinstance(arg, ast.Constant) and isinstance(arg.value, str):
            return arg.value
    return None


def scan_file(path: Path) -> dict:
    result = {
        "file": str(path),
        "imports_flask": False,
        "imports_fastapi": False,
        "routes": [],
        "fastapi_docs_disabled": None,
        "debug_true": False,
    }
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"))
    except Exception as exc:
        result["parse_error"] = str(exc)
        return result

    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            names = []
            if isinstance(node, ast.Import):
                names = [alias.name for alias in node.names]
            elif node.module:
                names = [node.module]
            if any(name.startswith("flask") for name in names):
                result["imports_flask"] = True
            if any(name.startswith("fastapi") for name in names):
                result["imports_fastapi"] = True

        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name) and node.func.id == "FastAPI":
                kwargs = {kw.arg: kw.value for kw in node.keywords if kw.arg}
                disabled = all(
                    key in kwargs and isinstance(kwargs[key], ast.Constant) and kwargs[key].value is None
                    for key in ("docs_url", "redoc_url", "openapi_url")
                )
                result["fastapi_docs_disabled"] = disabled
            for kw in node.keywords:
                if kw.arg == "debug" and isinstance(kw.value, ast.Constant) and kw.value.value is True:
                    result["debug_true"] = True

        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            for dec in node.decorator_list:
                name = decorator_name(dec)
                if name in ROUTE_ATTRS:
                    result["routes"].append({
                        "function": node.name,
                        "method_or_decorator": name,
                        "path": route_path(dec),
                        "line": node.lineno,
                    })
    return result


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    py_files = [p for p in root.rglob("*.py") if ".venv" not in p.parts and "venv" not in p.parts]
    files = [scan_file(p) for p in py_files]
    summary = {
        "root": str(root),
        "frameworks": sorted({fw for f in files for fw, ok in (("flask", f["imports_flask"]), ("fastapi", f["imports_fastapi"])) if ok}),
        "candidate_files": [f for f in files if f["imports_flask"] or f["imports_fastapi"] or f["routes"]],
    }
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
