#!/usr/bin/env python3
"""Skill 规范校验器（零依赖，只标准库）。

用法: python3 validate_skill.py <skill目录>
覆盖 Agent Skills 规范硬性规则 + 两条最常见质量问题。
退出码: 0=通过(可含 warning), 1=存在 error。
"""

import re
import sys
from pathlib import Path

ALLOWED_KEYS = {"name", "description", "license", "allowed-tools", "metadata", "compatibility"}


def parse_frontmatter(text):
    """极简 YAML frontmatter 解析（仅支持扁平 key: value，够用于规范校验）。"""
    if not text.startswith("---"):
        return None, "缺少 YAML frontmatter（文件须以 --- 开头）"
    m = re.match(r"^---\n(.*?)\n---", text, re.DOTALL)
    if not m:
        return None, "frontmatter 格式错误（缺少闭合的 ---）"
    data = {}
    for line in m.group(1).splitlines():
        if not line.strip() or line.startswith((" ", "\t")):
            continue  # 跳过多行值的续行
        if ":" not in line:
            return None, f"frontmatter 存在无法解析的行: {line!r}"
        key, _, value = line.partition(":")
        data[key.strip()] = value.strip().strip('"').strip("'")
    return data, None


def validate(skill_dir):
    errors, warnings = [], []
    skill_dir = Path(skill_dir).resolve()
    skill_md = skill_dir / "SKILL.md"

    if not skill_md.exists():
        return [f"SKILL.md 不存在于 {skill_dir}"], warnings

    text = skill_md.read_text(encoding="utf-8")
    fm, err = parse_frontmatter(text)
    if err:
        return [err], warnings

    unexpected = set(fm) - ALLOWED_KEYS
    if unexpected:
        errors.append(f"frontmatter 含非法字段: {', '.join(sorted(unexpected))}（仅允许 {', '.join(sorted(ALLOWED_KEYS))}）")

    name = fm.get("name", "")
    desc = fm.get("description", "")
    if not name:
        errors.append("缺少必填字段 name")
    else:
        if not re.fullmatch(r"[a-z0-9-]+", name):
            errors.append(f"name {name!r} 必须是 kebab-case（仅小写字母、数字、连字符）")
        if name.startswith("-") or name.endswith("-") or "--" in name:
            errors.append(f"name {name!r} 不能以连字符开头/结尾或含连续连字符")
        if len(name) > 64:
            errors.append(f"name 超长（{len(name)} > 64 字符）")
        if name != skill_dir.name:
            errors.append(f"name {name!r} 与目录名 {skill_dir.name!r} 不一致（规范要求必须相同，否则静默不触发）")

    if not desc:
        errors.append("缺少必填字段 description")
    else:
        if "<" in desc or ">" in desc:
            errors.append("description 不能含尖括号 <>")
        if len(desc) > 1024:
            errors.append(f"description 超长（{len(desc)} > 1024 字符）")
        if len(desc) < 60:
            warnings.append(f"description 仅 {len(desc)} 字符，可能缺少触发场景信息（description 是路由代码，应同时写清做什么+何时用）")

    body = text[m.end():] if (m := re.match(r"^---\n.*?\n---", text, re.DOTALL)) else ""
    n_lines = len(body.splitlines())
    if n_lines > 500:
        warnings.append(f"正文 {n_lines} 行 > 500 行上限，应把细节拆入 references/ 并在正文给出读取指引")

    return errors, warnings


def main():
    if len(sys.argv) != 2:
        print("用法: python3 validate_skill.py <skill目录>")
        sys.exit(1)
    errors, warnings = validate(sys.argv[1])
    for w in warnings:
        print(f"[WARNING] {w}")
    for e in errors:
        print(f"[ERROR]   {e}")
    if errors:
        print(f"\n校验失败：{len(errors)} 个 error，{len(warnings)} 个 warning")
        sys.exit(1)
    print(f"\n校验通过（{len(warnings)} 个 warning）")
    sys.exit(0)


if __name__ == "__main__":
    main()
