# -*- coding: utf-8 -*-
import re
from pathlib import Path
html = Path(r"D:\AI_ram\HBF与NAND_CIM教学指南.html").read_text(encoding="utf-8")
print("section 数:", len(re.findall(r'<section id="ch\d"', html)))
print("h2:", re.findall(r"<h2>(.*?)</h2>", html))
print("图片注入:", html.count("data:image/png;base64"))
print("callout 数:", len(re.findall(r'class="callout ', html)))
print("表格数:", html.count("<table>"))
print("deep 折叠块:", html.count('details class="deep"'))
for pat in [r"\*\*", r"\|---", r"\[\^"]:
    m = re.findall(pat, html)
    if m:
        print("疑似 markdown 残留:", pat, len(m))
tags = set(re.findall(r"<(/?)([a-zA-Z0-9]+)", html))
allowed = {"html","head","meta","title","style","body","nav","div","span","a","h1","h2","h3","h4","p","ul","ol","li","table","thead","tbody","tr","th","td","details","summary","figure","figcaption","img","code","strong","em","hr","button","script","br","section"}
bad = sorted(t for _, t in tags if t not in allowed)
print("白名单外标签:", bad if bad else "无")
