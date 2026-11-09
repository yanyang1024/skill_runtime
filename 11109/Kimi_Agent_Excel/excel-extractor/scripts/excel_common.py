#!/usr/bin/env python3
"""Shared helpers for excel-extractor. Standard library only."""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import math
import re
from pathlib import Path
from typing import Any

SCHEMA_VERSION = "1.0"


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def utc_now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def safe_name(value: str, limit: int = 80) -> str:
    cleaned = re.sub(r"[\\/:*?\"<>|\x00-\x1f]+", "_", value).strip(" .")
    return (cleaned or "unnamed")[:limit]


def dump_json(path: Path, data: Any, pretty: bool = True) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2 if pretty else None,
                  separators=None if pretty else (",", ":"), allow_nan=False)
        handle.write("\n")


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def column_name(number: int) -> str:
    if number < 1:
        raise ValueError(f"Invalid column: {number}")
    result = []
    while number:
        number, remainder = divmod(number - 1, 26)
        result.append(chr(65 + remainder))
    return "".join(reversed(result))


def coordinate(row: int, column: int) -> str:
    return f"{column_name(column)}{row}"


def a1_range(min_row: int, min_col: int, max_row: int, max_col: int) -> str:
    start = coordinate(min_row, min_col)
    end = coordinate(max_row, max_col)
    return start if start == end else f"{start}:{end}"


def split_coordinate(value: str) -> tuple[int, int]:
    match = re.fullmatch(r"\$?([A-Za-z]+)\$?([1-9][0-9]*)", value)
    if not match:
        raise ValueError(f"Invalid A1 coordinate: {value}")
    letters, row_text = match.groups()
    column = 0
    for letter in letters.upper():
        column = column * 26 + ord(letter) - 64
    return int(row_text), column


def json_value(value: Any) -> Any:
    """Convert common openpyxl values to JSON without pretending to recalculate."""
    if value is None or isinstance(value, (str, bool, int)):
        return value
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return str(value)
        return value
    if isinstance(value, (dt.datetime, dt.date, dt.time)):
        return value.isoformat()
    if isinstance(value, dt.timedelta):
        return value.total_seconds()
    if isinstance(value, bytes):
        return {"type": "bytes", "sha256": sha256_bytes(value), "size": len(value)}
    # CellRichText, ArrayFormula and other openpyxl objects retain a readable form.
    return str(value)


def cell_record_sort_key(record: dict[str, Any]) -> tuple[int, int]:
    return int(record["row"]), int(record["column"])


def iter_jsonl(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, 1):
            if line.strip():
                try:
                    yield json.loads(line)
                except json.JSONDecodeError as exc:
                    raise ValueError(f"{path}:{line_number}: invalid JSONL: {exc}") from exc


def sheet_cell_path(run_dir: Path, sheet: dict[str, Any]) -> Path:
    return run_dir / sheet["cells_file"]


def read_regions(run_dir: Path) -> dict[str, list[dict[str, Any]]]:
    path = run_dir / "regions.json"
    if not path.exists():
        return {}
    data = load_json(path)
    return {item["sheet"]: item.get("regions", []) for item in data.get("sheets", [])}


def fail(message: str, code: str = "error") -> None:
    print(json.dumps({"status": "failed", "error": {"code": code, "message": message}},
                     ensure_ascii=False))
    raise SystemExit(1)
