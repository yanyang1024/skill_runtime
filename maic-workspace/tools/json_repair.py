#!/usr/bin/env python3
"""json_repair.py — 从模型原文中提取并修复 JSON（零依赖）

对应 OpenMAIC 的 json-repair.ts 思路：模型经常把 JSON 包在散文、代码围栏里，
或带着尾随逗号、截断尾巴。本脚本做保守修复，修不了就如实报错。

用法:
  python3 tools/json_repair.py input.txt > output.json
  cat raw.txt | python3 tools/json_repair.py > output.json
  python3 tools/json_repair.py input.txt --array   # 期望顶层是数组

退出码 0 = 成功提取合法 JSON；1 = 失败。
"""
import json
import re
import sys


def strip_fences(text):
    # 去掉 ```json ... ``` 围栏，保留内部
    m = re.search(r"```(?:json)?\s*\n(.*?)```", text, re.DOTALL)
    return m.group(1) if m else text


def extract_span(text):
    """找到第一个 { 或 [，用括号配对找到对应的闭合位置。"""
    start = None
    open_ch = None
    for i, ch in enumerate(text):
        if ch in "{[":
            start, open_ch = i, ch
            break
    if start is None:
        return None
    close_ch = "}" if open_ch == "{" else "]"
    depth = 0
    in_str = False
    esc = False
    for i in range(start, len(text)):
        ch = text[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch in "{[":
            depth += 1
        elif ch in "}]":
            depth -= 1
            if depth == 0:
                return text[start:i + 1]
    return text[start:]  # 截断的 JSON，交给修复


def conservative_fix(s):
    out = s
    # 尾随逗号: , } 或 , ]
    out = re.sub(r",(\s*[}\]])", r"\1", out)
    # JS 注释
    out = re.sub(r"//[^\n]*", "", out)
    out = re.sub(r"/\*.*?\*/", "", out, flags=re.DOTALL)
    # 截断修复：砍掉最后一个不完整元素后补闭合括号
    try:
        json.loads(out)
        return out
    except json.JSONDecodeError:
        pass
    # 从尾部向前找最后一个完整的 , 或 [/{，截断后补齐
    opens = []
    in_str = esc = False
    last_good = -1
    for i, ch in enumerate(out):
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch in "{[":
            opens.append(ch)
        elif ch in "}]":
            if opens:
                opens.pop()
            if not in_str:
                last_good = i
        elif ch == "," and not in_str:
            last_good = i
    if last_good > 0 and opens:
        cut = out[:last_good]
        # 重新统计未闭合
        opens2 = []
        in_str = esc = False
        for ch in cut:
            if in_str:
                if esc:
                    esc = False
                elif ch == "\\":
                    esc = True
                elif ch == '"':
                    in_str = False
                continue
            if ch == '"':
                in_str = True
            elif ch in "{[":
                opens2.append(ch)
            elif ch in "}]" and opens2:
                opens2.pop()
        closing = "".join("}" if c == "{" else "]" for c in reversed(opens2))
        return cut + closing
    return out


def main():
    expect_array = "--array" in sys.argv
    files = [a for a in sys.argv[1:] if not a.startswith("--")]
    text = open(files[0], encoding="utf-8").read() if files else sys.stdin.read()
    text = strip_fences(text)
    span = extract_span(text)
    if span is None:
        print("json_repair: 找不到 JSON 起点 ({ 或 [)", file=sys.stderr)
        sys.exit(1)
    fixed = conservative_fix(span)
    try:
        data = json.loads(fixed)
    except json.JSONDecodeError as e:
        print(f"json_repair: 修复失败: {e}", file=sys.stderr)
        sys.exit(1)
    if expect_array and not isinstance(data, list):
        print("json_repair: 顶层不是数组", file=sys.stderr)
        sys.exit(1)
    print(json.dumps(data, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
