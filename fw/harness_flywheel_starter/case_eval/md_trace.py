#!/usr/bin/env python3
"""读取本次 OpenCode Markdown 导出；只解析文本，不执行会话里的命令。"""
import argparse
import hashlib
import json
import re
from collections import Counter
from pathlib import Path


def sha(data):
    return hashlib.sha256(data).hexdigest()


def write_json(path, value):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_jsonl(path, rows):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows), encoding="utf-8")


def receipt(output):
    """同时保留严格 JSON 契约和可恢复 JSON；修复解析不掩盖格式偏离。"""
    m = re.search(r"<task_result>(.*?)</task_result>", output, re.S)
    body = m[1].strip() if m else output.strip()
    try:
        obj = json.loads(body)
        if isinstance(obj, dict):
            return obj, "exact_json"
    except ValueError:
        pass
    objects = []
    decoder = json.JSONDecoder()
    for m in re.finditer(r"\{", body):
        try:
            obj, _ = decoder.raw_decode(body[m.start():])
            if isinstance(obj, dict) and any(k in obj for k in ("status", "verdict", "outline_path", "scene_path")):
                objects.append(obj)
        except ValueError:
            pass
    return (objects[0], "recoverable_json_with_extra_text") if len(objects) == 1 else (None, "missing_or_ambiguous_json")


def parse(path):
    path = Path(path)
    raw = path.read_bytes()
    text = raw.decode("utf-8-sig").replace("\r\n", "\n")
    revision = sha(raw)
    sid = re.search(r"\*\*Session ID:\*\*\s*(\S+)", text)
    sid = sid[1] if sid else path.stem
    # 用导出器分隔符限制消息边界；不把普通文档标题当会话角色。
    boundaries = list(re.finditer(r"(?:\A|\n---\n\n)## (User|Assistant)([^\n]*)\n", text))
    events, messages, turn = [], [], 0
    for i, mark in enumerate(boundaries):
        end = boundaries[i + 1].start() if i + 1 < len(boundaries) else len(text)
        body = text[mark.end():end]
        if mark[1] == "User":
            turn += 1
        heading = mark[2].strip().strip("()")
        fields = [x.strip() for x in heading.split("·")]
        tool_marks = list(re.finditer(r"^\*\*Tool: ([^\n*]+)\*\*", body, re.M)) if mark[1] == "Assistant" else []
        line = text.count("\n", 0, mark.start()) + 1
        messages.append({"session_id": sid, "message_index": i, "role": mark[1].lower(), "user_turn": turn,
                         "agent_label": fields[0] if heading else None, "line": line,
                         "user_text": body.strip() if mark[1] == "User" else None})
        for j, tm in enumerate(tool_marks):
            block = body[tm.end():tool_marks[j + 1].start() if j + 1 < len(tool_marks) else len(body)]
            im = re.search(r"\*\*Input:\*\*\s*\n```json\s*\n", block)
            args, input_state, after = None, "missing", 0
            if im:
                try:
                    args, used = json.JSONDecoder().raw_decode(block[im.end():])
                    input_state, after = "parsed", im.end() + used
                except ValueError:
                    input_state = "unparsed"
            om = re.search(r"\*\*Output:\*\*\s*\n```[^\n]*\n", block[after:])
            output = block[after + om.end():].rstrip() if om else ""
            if output.endswith("```"):
                output = output[:-3].rstrip()
            event_line = text.count("\n", 0, mark.end() + tm.start()) + 1
            ref = f"{path.name}@{revision}:L{event_line}"
            event = {"session_id": sid, "message_index": i, "user_turn": turn, "agent_label": fields[0] if heading else None,
                     "model_label": fields[1] if len(fields) > 1 else None, "tool": tm[1], "input": args,
                     "input_parse": input_state, "output": output, "output_present": bool(om), "source_line": event_line,
                     "evidence_ref": ref, "event_id": sha(ref.encode())[:24], "status": "unknown", "exit_code": None}
            # task 包装确实提供 state 与子会话 ID；它与业务回执的 status/verdict 分开。
            if tm[1] == "task":
                task = re.search(r'<task\s+id="([^"]+)"\s+state="([^"]+)"', output)
                event.update(child_session_id=task[1] if task else None, dispatch_state=task[2] if task else "unknown")
                obj, fmt = receipt(output)
                event.update(receipt=obj, receipt_format=fmt, receipt_kind="subagent_claim")
            events.append(event)
    stats = {"source_file": path.name, "source_sha256": revision, "session_id": sid, "user_turns": turn,
             "tool_counts": dict(Counter(e["tool"] for e in events)), "parsed_tool_inputs": sum(e["input_parse"] == "parsed" for e in events),
             "events": len(events), "coverage": "this_export_only; child traces/exit codes/tokens not generally present"}
    return events, messages, stats


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("sessions", nargs="+"); p.add_argument("--out", required=True)
    a = p.parse_args()
    out = Path(a.out); out.mkdir(parents=True, exist_ok=False)
    events, messages, manifests = [], [], []
    for source in a.sessions:
        e, m, s = parse(source); events += e; messages += m; manifests.append(s)
    write_jsonl(out / "events.jsonl", events)
    write_jsonl(out / "messages.jsonl", messages)
    write_json(out / "manifest.json", manifests)
    print(json.dumps({"sessions": len(manifests), "tool_events": len(events), "out": str(out)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
