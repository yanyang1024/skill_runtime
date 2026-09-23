#!/usr/bin/env python3
"""check_dashboard.py — dashboard 交付闸门（防假成功，零依赖，仅标准库）

用法:
    python3 check_dashboard.py dashboard.html            # 检查，警告不阻断
    python3 check_dashboard.py dashboard.html --final    # 发布闸门：任何 WARN 也判失败

退出码: 0 = 通过, 1 = 未通过
"""
import re
import sys
import pathlib

FAIL = "FAIL"
WARN = "WARN"
OK = "OK"


def strip_code(html: str) -> str:
    """去掉 script/style，只留可见文本，用于检查"页面上是否真的写了"某内容。"""
    html = re.sub(r"<script\b[^>]*>.*?</script>", " ", html, flags=re.S | re.I)
    html = re.sub(r"<style\b[^>]*>.*?</style>", " ", html, flags=re.S | re.I)
    return re.sub(r"<[^>]+>", " ", html)


def check_no_external_resources(html: str):
    """内网铁律:不允许任何运行时外部资源。"""
    findings = []
    patterns = {
        r"<script[^>]+src\s*=\s*[\"']https?://": "外链 <script src>",
        r"<link[^>]+href\s*=\s*[\"']https?://": "外链 <link href>",
        r"\bfetch\s*\(\s*[\"'`]https?://": "运行时 fetch 远程数据",
        r"XMLHttpRequest": "XMLHttpRequest 远程请求",
        r"\bimport\s*\(\s*[\"'`]https?://": "动态 import 远程模块",
        r"url\(\s*[\"']?https?://": "CSS 外链资源(字体/图片)",
        r"<img[^>]+src\s*=\s*[\"']https?://": "外链图片",
    }
    for pat, desc in patterns.items():
        for m in re.finditer(pat, html, re.I):
            line = html[: m.start()].count("\n") + 1
            findings.append(f"{desc} (第 {line} 行附近)")
    if findings:
        return FAIL, "存在外部资源引用,内网/离线环境会白屏: " + "; ".join(findings)
    return OK, "无任何外链资源(script/css/fetch/img)"


def check_chartjs_embedded(html: str):
    if re.search(r"Chart\.js v?4", html) or "function Chart(" in html or "Chart=" in html:
        return OK, "Chart.js 已内嵌"
    if re.search(r"\bnew Chart\s*\(", html):
        return FAIL, "调用了 new Chart() 但文件中未内嵌 Chart.js 库"
    return WARN, "未检测到 Chart.js,也未检测到 new Chart() —— 若页面无图表可忽略"


def check_canvas_chart_pairing(html: str):
    canvas_ids = re.findall(r"<canvas[^>]+id\s*=\s*[\"']([^\"']+)[\"']", html, re.I)
    if not canvas_ids:
        return WARN, "未找到 <canvas> 元素 —— 纯 KPI/表格页面可忽略"
    orphans = []
    for cid in canvas_ids:
        if not re.search(
            r"getElementById\(\s*[\"']" + re.escape(cid) + r"[\"']\s*\)", html
        ) and not re.search(r"[\"']" + re.escape(cid) + r"[\"']", strip_code(html)):
            orphans.append(cid)
    if orphans:
        return FAIL, f"canvas 无对应图表初始化代码: {', '.join(orphans)}"
    return OK, f"{len(canvas_ids)} 个 canvas 均有对应初始化代码"


def check_data_embedded(html: str):
    m = re.search(r"(?:const|let|var)\s+DATA\s*=\s*(\[|\{)", html)
    if not m:
        return WARN, "未找到 `const DATA = ...` 形式的数据内嵌(若数据以其他变量名组织可忽略)"
    tail = html[m.end(): m.end() + 200]
    if m.group(1) == "[" and re.match(r"\s*\]", tail):
        return FAIL, "DATA 是空数组 —— 这是占位,不是交付物"
    return OK, "数据已内嵌且非空"


def check_sample_data_labeled(html: str):
    has_sample = re.search(r"sample[_\s]?data|demo[_\s]?data|mock[_\s]?data|示意数据|示例数据", html, re.I)
    if not has_sample:
        return OK, "未发现示意数据标记"
    visible = strip_code(html)
    if re.search(r"示意数据|示例数据|sample\s*data|demo\s*data|mock", visible, re.I):
        return OK, "使用了示意数据,且页面上有可见标注"
    return FAIL, "代码中使用示意数据,但页面上没有可见标注 —— 必须让读者一眼看出数据非真实"


def check_title(html: str):
    m = re.search(r"<title>(.*?)</title>", html, re.S | re.I)
    if not m or not m.group(1).strip():
        return FAIL, "<title> 为空"
    if re.search(r"dashboard\s*title|untitled|待填|xxx", m.group(1), re.I):
        return FAIL, f"<title> 仍是占位符: {m.group(1).strip()!r}"
    return OK, f"标题: {m.group(1).strip()[:50]}"


def check_data_date(html: str):
    visible = strip_code(html)
    if re.search(r"data[- ]date|数据日期|截至|data as of|更新于|as of", visible, re.I):
        return OK, "页面上标注了数据日期"
    return WARN, "页面上未找到数据日期标注(建议 footer 注明数据截至时间)"


def check_no_placeholders(html: str):
    hits = re.findall(r"TODO|FIXME|lorem ipsum|占位内容待补", html, re.I)
    if hits:
        return FAIL, f"发现 {len(hits)} 处占位符 ({hits[0]} 等)"
    return OK, "无 TODO/占位符残留"


CHECKS = [
    ("外部资源(内网铁律)", check_no_external_resources),
    ("Chart.js 内嵌", check_chartjs_embedded),
    ("canvas-图表配对", check_canvas_chart_pairing),
    ("数据内嵌", check_data_embedded),
    ("示意数据标注", check_sample_data_labeled),
    ("页面标题", check_title),
    ("数据日期", check_data_date),
    ("占位符残留", check_no_placeholders),
]


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    path = pathlib.Path(sys.argv[1])
    final = "--final" in sys.argv
    if not path.exists():
        print(f"文件不存在: {path}")
        sys.exit(1)
    html = path.read_text(encoding="utf-8", errors="replace")

    failed = warned = 0
    print(f"检查: {path.name}  ({len(html)/1024:.0f} KB)  模式: {'FINAL(发布)' if final else '普通'}")
    print("-" * 60)
    for name, fn in CHECKS:
        level, msg = fn(html)
        if level == FAIL or (final and level == WARN):
            failed += 1
            mark = "✗"
        elif level == WARN:
            warned += 1
            mark = "!"
        else:
            mark = "✓"
        print(f"  {mark} [{level:4}] {name}: {msg}")
    print("-" * 60)
    if failed:
        print(f"未通过: {failed} 项失败, {warned} 项警告")
        sys.exit(1)
    print(f"通过: {warned} 项警告" if warned else "全部通过")
    sys.exit(0)


if __name__ == "__main__":
    main()
