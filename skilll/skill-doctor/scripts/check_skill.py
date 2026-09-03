#!/usr/bin/env python3
"""Skill 体检脚本（零依赖，只标准库）。

用法: python3 check_skill.py <skill目录或SKILL.md路径>
输出 error / warning / info 三级报告；存在 error 时退出码为 1。

覆盖四类检查：
1. 规范：frontmatter 字段、name/description 硬性规则、name==目录名
2. 结构：正文行数、引用文件完整性、死文件、路径分隔符
3. 描述质量：触发信息启发式检查
4. 安全排雷：少量高危模式（快速排雷，不替代专业安全扫描）
"""

import re
import sys
from pathlib import Path

ALLOWED_KEYS = {"name", "description", "license", "allowed-tools", "metadata", "compatibility"}
TEXT_EXTS = {".md", ".py", ".sh", ".txt", ".yaml", ".yml", ".json", ".js", ".ts"}

# 含此标记的文件视为检查器自身（其源码必然包含危险模式定义），跳过安全排雷
_SELF_MARKER = "DANGER_PATTERNS"

CODE_EXTS = {".py", ".sh", ".js", ".ts"}

# 代码模式只扫代码文件（文档中"提及"这些模式不构成风险，如本检查器自身）
CODE_PATTERNS = [
    (r"os\.system\(", "warning", "os.system 调用，建议改为 subprocess 并避免拼接"),
    (r"shell\s*=\s*True", "warning", "subprocess shell=True，存在注入面"),
    (r"\beval\(|\bexec\(", "warning", "eval/exec 动态执行"),
    (r"(api_key|token|secret|password)[^\n]{0,40}requests\.(post|put)", "warning", "疑似凭据随请求外发"),
]
# 高危模式扫所有文本文件（含 .md——指令里藏 curl|sh 是真实的注入载体）
DANGER_PATTERNS = [
    (r"curl[^|\n]*\|\s*(sudo\s+)?(ba)?sh", "error", "远程脚本管道执行（curl | sh）"),
    (r"wget[^|\n]*\|\s*(sudo\s+)?(ba)?sh", "error", "远程脚本管道执行（wget | sh）"),
    (r"\b(sk-[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16}|ghp_[A-Za-z0-9]{36,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)", "error", "疑似硬编码密钥/私钥"),
]


def parse_frontmatter(text):
    if not text.startswith("---"):
        return None, None, "缺少 YAML frontmatter（文件须以 --- 开头）"
    m = re.match(r"^---\n(.*?)\n---", text, re.DOTALL)
    if not m:
        return None, None, "frontmatter 格式错误（缺少闭合的 ---）"
    data = {}
    for line in m.group(1).splitlines():
        if not line.strip() or line.startswith((" ", "\t")):
            continue
        if ":" not in line:
            return None, None, f"frontmatter 存在无法解析的行: {line!r}"
        key, _, value = line.partition(":")
        data[key.strip()] = value.strip().strip('"').strip("'")
    return data, m.end(), None


def check(skill_dir):
    findings = []  # (level, category, message)

    def add(level, cat, msg):
        findings.append((level, cat, msg))

    skill_dir = Path(skill_dir).resolve()
    if skill_dir.is_file():
        skill_dir = skill_dir.parent
    skill_md = skill_dir / "SKILL.md"
    if not skill_md.exists():
        add("error", "规范", f"SKILL.md 不存在于 {skill_dir}")
        return findings

    text = skill_md.read_text(encoding="utf-8")
    fm, body_start, err = parse_frontmatter(text)
    if err:
        add("error", "规范", err)
        return findings

    # --- 1. 规范 ---
    unexpected = set(fm) - ALLOWED_KEYS
    if unexpected:
        add("error", "规范", f"frontmatter 非法字段: {', '.join(sorted(unexpected))}")

    name = fm.get("name", "")
    if not name:
        add("error", "规范", "缺少必填字段 name")
    else:
        if not re.fullmatch(r"[a-z0-9-]+", name) or name.startswith("-") or name.endswith("-") or "--" in name:
            add("error", "规范", f"name {name!r} 不符合 kebab-case 规则")
        if len(name) > 64:
            add("error", "规范", f"name 超长（{len(name)} > 64）")
        if name != skill_dir.name:
            add("error", "规范", f"name {name!r} ≠ 目录名 {skill_dir.name!r}（会静默不触发）")

    desc = fm.get("description", "")
    if not desc:
        add("error", "规范", "缺少必填字段 description")
    else:
        if "<" in desc or ">" in desc:
            add("error", "规范", "description 含尖括号 <>")
        if len(desc) > 1024:
            add("error", "规范", f"description 超长（{len(desc)} > 1024）")
        # --- 3. 描述质量启发式 ---
        if len(desc) < 60:
            add("warning", "描述", f"description 仅 {len(desc)} 字符，疑似缺少触发场景（应写清做什么+何时用）")
        if not re.search(r"当|用于|触发|使用|use when|when |use for", desc, re.IGNORECASE):
            add("warning", "描述", "description 未见任何触发场景词（当…时 / use when），可能只在说'做什么'")

    body = text[body_start:]

    # --- 2. 结构 ---
    n_lines = len(body.splitlines())
    if n_lines > 500:
        add("warning", "结构", f"正文 {n_lines} 行 > 500，细节应拆入 references/")
    if re.search(r"\[.*?\]\([^)]*\\[^)]*\)", body) or re.search(r"(?:scripts|references|assets)\\[\w.-]+", body):
        add("warning", "结构", "正文存在反斜杠路径，规范要求一律正斜杠")

    # 正文引用的本地文件是否存在
    referenced = set()
    for m in re.finditer(r"\[[^\]]*\]\(([^)]+)\)", body):
        link = m.group(1).split("#")[0].strip()
        if not link or link.startswith(("http://", "https://", "mailto:")):
            continue
        referenced.add(link)
        if not (skill_dir / link).exists():
            add("error", "结构", f"引用的文件不存在: {link}")
    # 代码块/行内提到的 scripts/ references/ assets/ 路径
    for m in re.finditer(r"`((?:scripts|references|assets)/[^`\s]+)`", body):
        referenced.add(m.group(1))
        if not (skill_dir / m.group(1)).exists():
            add("error", "结构", f"引用的路径不存在: {m.group(1)}")

    # 死文件：存在但从未被正文提及（非 SKILL.md 本身）
    for f in skill_dir.rglob("*"):
        if not f.is_file() or f.name == "SKILL.md":
            continue
        rel = f.relative_to(skill_dir).as_posix()
        if rel not in referenced and f.name not in referenced:
            add("info", "结构", f"文件未被 SKILL.md 引用: {rel}（确认是否白打包，或在正文加读取指引）")

    # --- 4. 安全排雷 ---
    for f in skill_dir.rglob("*"):
        if not f.is_file() or f.suffix.lower() not in TEXT_EXTS:
            continue
        try:
            content = f.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        if _SELF_MARKER in content:
            continue
        rel = f.relative_to(skill_dir).as_posix()
        patterns = list(DANGER_PATTERNS)
        if f.suffix.lower() in CODE_EXTS:
            patterns += CODE_PATTERNS
        for pattern, level, label in patterns:
            if re.search(pattern, content):
                add(level, "安全", f"{rel}: {label}")

    return findings


def main():
    if len(sys.argv) != 2:
        print("用法: python3 check_skill.py <skill目录或SKILL.md路径>")
        sys.exit(1)
    findings = check(sys.argv[1])
    order = {"error": 0, "warning": 1, "info": 2}
    findings.sort(key=lambda x: order[x[0]])
    counts = {"error": 0, "warning": 0, "info": 0}
    for level, cat, msg in findings:
        counts[level] += 1
        print(f"[{level.upper():7s}] [{cat}] {msg}")
    print(f"\n合计: {counts['error']} error / {counts['warning']} warning / {counts['info']} info")
    if counts["error"]:
        print("存在 error 级问题，必须修复。")
        sys.exit(1)
    print("无 error 级问题。")
    sys.exit(0)


if __name__ == "__main__":
    main()
