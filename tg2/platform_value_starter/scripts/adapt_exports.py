#!/usr/bin/env python3
"""Reference adapter for explicit export manifests, not an OpenCode schema SDK.

Supports JSON object/list, JSONL with one SESSION per line, strict role-heading MD.
Only files named in the manifest are read. Output files cannot become fake sessions.
"""
import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path

from common import digest, read_jsonl, write_jsonl
from value_loop import validate


def first(d, *keys):
    for k in keys:
        if d.get(k) is not None:
            return d[k]
    return None


def iso(value):
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value / 1000, timezone.utc).isoformat()
    return value


def md_messages(text):
    roles = {"user": "user", "用户": "user", "assistant": "assistant", "助手": "assistant", "tool": "tool"}
    result, fence = [], None
    head = re.compile(r"^#{1,4}\s+(User|Assistant|Tool|用户|助手)(?:\s*\([^\n]*\))?\s*[:：]?\s*$", re.I)
    for line in text.splitlines():
        stripped = line.lstrip()
        fm = re.match(r"(`{3,}|~{3,})", stripped)
        if fm:
            mark = fm.group(1)
            if fence is None:
                fence = (mark[0], len(mark))
            elif mark[0] == fence[0] and len(mark) >= fence[1] and not stripped[len(mark):].strip():
                fence = None
            if result:
                result[-1]["text"] += line + "\n"
            continue
        m = None if fence else head.match(line)
        if m:
            result.append({"role": roles[m[1].lower()], "text": "", "ts": None})
        elif result:
            result[-1]["text"] += line + "\n"
    if not result or not any(m["role"] == "user" for m in result):
        raise ValueError("no recognizable user headings; adapt parser, do not count as parsed")
    for m in result:
        m["text"] = m["text"].strip()
    return result


def convert(raw, meta):
    ss = raw.get("session", {})
    stats = raw.get("stats", {})
    warnings = []
    messages = []
    for m in raw.get("messages", []):
        role = m.get("role")
        text = first(m, "text", "content")
        if isinstance(text, list):
            if any(not isinstance(p, dict) or p.get("type") != "text" for p in text):
                warnings.append("nontext_content_not_materialized")
            text = "\n".join(p.get("text", "") for p in text if isinstance(p, dict) and p.get("type") == "text")
        if role not in {"user", "assistant", "tool", "system"} or not isinstance(text, str):
            raise ValueError("unknown message shape; add a company-specific field mapping")
        messages.append({"role": role, "text": text, "ts": iso(first(m, "ts", "timestamp", "created_at"))})
    result = {
        "tenant_id": raw.get("tenant_id") or meta.get("tenant_id"),
        "session_id": raw.get("session_id") or ss.get("id") or meta.get("session_id"),
        "user_id": raw.get("user_id") or meta.get("user_id"),
        "dept": raw.get("dept") or meta.get("dept"),
        "title": raw.get("title") or ss.get("title") or meta.get("title", ""),
        "start_at": iso(first(raw, "start_at", "start_ms") or first(ss, "start_at", "start_ms") or meta.get("start_at")),
        "end_at": iso(first(raw, "end_at", "end_ms") or first(ss, "end_at", "end_ms") or meta.get("end_at")),
        "messages": messages,
        "stats": {"input_tokens": first(stats, "input_tokens", "tokens_input", "token_input"),
                  "output_tokens": first(stats, "output_tokens", "tokens_output", "token_output"),
                  "user_turns": stats.get("user_turns"),
                  "usage_scope": stats.get("usage_scope") or meta.get("usage_scope", "unknown")},
        "requests": raw.get("requests", []),  # Must already follow our contract; never sum runs blindly.
        "tool_events": raw.get("tool_events", []),
        "artifact_events": raw.get("artifact_events", []),
        "coverage": raw.get("coverage", {}),
        "adapter_warnings": warnings,
        "source_record_hash": digest(raw),
    }
    validate(result)
    return result


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("manifest"); ap.add_argument("--out", required=True)
    a = ap.parse_args()
    base = Path(a.manifest).resolve().parent
    records, rejected = [], []
    ids = set()
    for meta in read_jsonl(a.manifest):
        try:
            p = base / meta["path"]
            text = p.read_text(encoding="utf-8-sig")
            fmt = meta["format"]
            if fmt == "md":
                raw_rows = [{"messages": md_messages(text)}]
            elif fmt == "jsonl_sessions":
                raw_rows = read_jsonl(p)
            elif fmt == "json":
                obj = json.loads(text)
                raw_rows = obj if isinstance(obj, list) else [obj]
            else:
                raise ValueError("unsupported format; message JSONL needs a separate explicit adapter")
            converted = []
            local_ids = set()
            for raw in raw_rows:
                if not isinstance(raw, dict):
                    raise ValueError("session must be object")
                r = convert(raw, meta)
                key = (r["tenant_id"], r["session_id"])
                if key in ids or key in local_ids:
                    raise ValueError("duplicate tenant/session id")
                local_ids.add(key); converted.append(r)
            records.extend(converted); ids.update(local_ids)
        except (ValueError, KeyError, TypeError, OSError) as e:
            rejected.append({"path": meta.get("path"), "reason": str(e)})
    write_jsonl(a.out, records)
    write_jsonl(str(a.out) + ".rejected.jsonl", rejected)
    print(json.dumps({"parsed_sessions": len(records), "rejected_files": len(rejected)}))
    if rejected:
        raise SystemExit(2)  # Successful subset is written but scheduled pipeline stops.


if __name__ == "__main__":
    main()
