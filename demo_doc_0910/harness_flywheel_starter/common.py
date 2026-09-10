"""Small shared helpers. No network, database server, or third-party packages."""
import hashlib
import json
import math
import os
from datetime import datetime, timezone
from pathlib import Path


def canonical(obj):
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def digest(obj):
    return hashlib.sha256(canonical(obj).encode("utf-8")).hexdigest()


def read_jsonl(path):
    rows = []
    with open(path, encoding="utf-8-sig") as f:
        for n, line in enumerate(f, 1):
            if line.strip():
                try:
                    row = json.loads(line)
                    if not isinstance(row, dict):
                        raise ValueError("record must be an object")
                    rows.append(row)
                except (ValueError, TypeError) as e:
                    raise ValueError(f"{path}:{n}: {e}") from e
    return rows


def write_text(path, text):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + ".tmp")
    temp.write_text(text, encoding="utf-8")
    os.replace(temp, path)


def write_json(path, obj):
    write_text(path, json.dumps(obj, ensure_ascii=False, indent=2, allow_nan=False) + "\n")


def write_jsonl(path, rows):
    write_text(path, "".join(canonical(r) + "\n" for r in rows))


def timestamp(value):
    if not value:
        return None
    dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if dt.tzinfo is None:
        raise ValueError(f"timestamp needs timezone: {value}")
    return dt.astimezone(timezone.utc)


def number(value):
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
        raise ValueError(f"expected non-negative finite number, got {value!r}")
    return value


def fraction(n, d):
    return None if not d else n / d


def rate(n, d):
    return f"{n}/{d} ({n / d:.1%})" if d else "N/A (分母为 0)"


def cell(value):
    return str(value).replace("|", "\\|").replace("\n", " ")
