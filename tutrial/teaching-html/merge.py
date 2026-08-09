# -*- coding: utf-8 -*-
"""Merge teaching HTML fragments into one standalone teaching guide."""
import re
from pathlib import Path

ROOT = Path(__file__).parent
PARTS_DIR = ROOT / "parts"
OUT = ROOT / "agent-platform-vibe-coding-teaching-guide.html"

CSS = """
:root{--ink:#1f2430;--muted:#5b6472;--line:#e4e8ef;--bg:#f7f8fa;--card:#fff;
--brand:#3b5bfd;--brand-soft:#eef1ff;--ok:#0e9f6e;--ok-soft:#e8f7f1;
--warn:#c2410c;--warn-soft:#fdf1e7;--key:#7c3aed;--key-soft:#f3edff;
--code-bg:#16181d;--code-ink:#e6e8ee;}
*{box-sizing:border-box}
body{margin:0;font-family:"Segoe UI","Microsoft YaHei","PingFang SC",system-ui,sans-serif;
color:var(--ink);background:var(--bg);line-height:1.75;}
.layout{display:flex;max-width:1280px;margin:0 auto;}
nav{position:sticky;top:0;align-self:flex-start;height:100vh;overflow-y:auto;
width:250px;flex:0 0 250px;padding:28px 18px;background:#fff;border-right:1px solid var(--line);}
nav h2{font-size:15px;margin:0 0 12px;color:var(--muted);}
nav ol{margin:0;padding-left:18px;font-size:13.5px;}
nav li{margin:5px 0;}
nav a{color:var(--ink);text-decoration:none;}
nav a:hover{color:var(--brand);}
main{flex:1;min-width:0;padding:36px 44px 90px;}
.cover{background:linear-gradient(135deg,#2b3a8f,#3b5bfd 60%,#6d8bff);color:#fff;
border-radius:16px;padding:44px 42px;margin-bottom:36px;}
.cover h1{margin:0 0 10px;font-size:30px;line-height:1.35;}
.cover p{margin:6px 0;opacity:.92;}
.cover .meta{margin-top:18px;font-size:13.5px;opacity:.85;}
.chapter{background:var(--card);border:1px solid var(--line);border-radius:14px;
padding:34px 38px;margin:0 0 34px;box-shadow:0 1px 3px rgba(20,30,60,.05);}
.chapter-tag{display:inline-block;background:var(--brand-soft);color:var(--brand);
font-size:12.5px;font-weight:600;padding:3px 12px;border-radius:99px;margin-bottom:8px;}
.chapter h2{margin:6px 0 14px;font-size:24px;border-bottom:2px solid var(--brand-soft);padding-bottom:12px;}
.chapter h3{margin:30px 0 12px;font-size:19px;color:#2b3a8f;}
.chapter h4{margin:20px 0 8px;font-size:16px;}
.lead{font-size:16.5px;color:var(--muted);border-left:4px solid var(--brand);padding-left:14px;margin:0 0 20px;}
.note{font-size:14px;color:var(--muted);background:var(--bg);border-radius:8px;padding:10px 14px;}
table{border-collapse:collapse;width:100%;margin:14px 0;font-size:14px;background:#fff;}
th,td{border:1px solid var(--line);padding:9px 12px;text-align:left;vertical-align:top;}
th{background:#f0f3fa;font-weight:600;}
tr:nth-child(even) td{background:#fafbfd;}
pre{background:var(--code-bg);color:var(--code-ink);border-radius:10px;padding:16px 18px;
overflow-x:auto;font-size:13px;line-height:1.6;}
code{font-family:"Cascadia Code",Consolas,monospace;font-size:.92em;}
p code,li code,td code{background:#eef0f5;color:#c0341d;padding:1px 6px;border-radius:5px;}
pre code{background:none;color:inherit;padding:0;}
.callout{border-radius:10px;padding:16px 20px;margin:16px 0;border:1px solid;}
.callout-title{font-weight:700;margin-bottom:6px;}
.callout.lecture{background:#eef6ff;border-color:#bcd8f7;}
.callout.key{background:var(--key-soft);border-color:#d8c8f5;}
.callout.warn{background:var(--warn-soft);border-color:#f2cdb2;}
.callout.takeaway{background:var(--ok-soft);border-color:#b7e4d2;}
.callout.practice{background:#fff8e6;border-color:#ecd9a0;}
.callout details{margin-top:10px;}
.callout summary{cursor:pointer;font-weight:600;color:var(--brand);}
.flow{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:16px 0;}
.flow.vertical{flex-direction:column;align-items:stretch;max-width:560px;}
.node{background:#fff;border:2px solid #c6cee4;border-radius:10px;padding:10px 16px;
font-size:14px;font-weight:600;text-align:center;}
.node small{font-weight:400;color:var(--muted);}
.node.accent{border-color:var(--brand);background:var(--brand-soft);}
.node.warn-node{border-color:#e5a26a;background:#fdf6ee;}
.arrow{color:var(--brand);font-weight:700;font-size:18px;text-align:center;}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:14px 0;}
.col-box{border:1px solid var(--line);border-radius:10px;padding:14px 18px;background:#fff;}
.col-box.ok{border-color:#b7e4d2;background:var(--ok-soft);}
.col-box.no{border-color:#f2c9c0;background:#fdf0ec;}
.col-title{font-weight:700;margin-bottom:6px;}
.step{border:1px solid var(--line);border-left:5px solid var(--brand);border-radius:10px;
padding:14px 20px;margin:14px 0;background:#fff;}
.step-num{display:inline-block;background:var(--brand);color:#fff;font-size:12.5px;
font-weight:700;padding:2px 12px;border-radius:99px;}
.step h4{margin:8px 0 6px;}
.step p{margin:6px 0;}
.myth{border:1px solid #f2c9c0;background:#fdf6f4;border-radius:10px;padding:12px 20px;margin:12px 0;}
.myth h4{margin:4px 0;color:#a33327;}
.myth p{margin:6px 0;}
.checklist{list-style:none;padding-left:4px;}
.checklist li{padding:4px 0 4px 30px;position:relative;}
.checklist li::before{content:"\\2610";position:absolute;left:4px;color:var(--brand);font-size:16px;}
.takeaway-list li{margin:10px 0;font-size:15.5px;}
ul.compact,ol.compact{margin:6px 0;}
ul.compact li,ol.compact li{margin:2px 0;}
.refs{font-size:14px;}
a{color:var(--brand);}
footer{color:var(--muted);font-size:13px;text-align:center;padding:20px 0 40px;}
@media(max-width:900px){.layout{flex-direction:column;}nav{position:static;width:auto;height:auto;flex:none;}
main{padding:20px;}.cols{grid-template-columns:1fr;}}
@media print{nav{display:none;}main{padding:0;}.chapter{break-inside:avoid-page;box-shadow:none;}}
"""

COVER = """
<header class="cover">
  <h1>Agent 平台架构、Skill 与 Vibe Coding</h1>
  <p>从"缸中之脑"到受控数字工人：Chatbot、RAG、Workflow 到 Agent 的演进，以及 Agent 平台的工程化落地</p>
  <div class="meta">面向：软件研发、算法工程、数据分析与 AI 应用开发人员 · 建议时长 75–100 分钟 · 版本 1.0（2026-08-09）</div>
</header>
"""

def chapter_title(html: str) -> str:
    m = re.search(r"<h2>(.*?)</h2>", html, re.S)
    return re.sub(r"<[^>]+>", "", m.group(1)).strip() if m else "未命名"

def main():
    files = sorted(PARTS_DIR.glob("*.html"))
    chapters = []
    nav_items = []
    for f in files:
        html = f.read_text(encoding="utf-8")
        for m in re.finditer(r'<section class="chapter" id="([^"]+)">(.*?)</section>', html, re.S):
            cid, body = m.group(1), m.group(2)
            full = f'<section class="chapter" id="{cid}">{body}</section>'
            chapters.append(full)
            nav_items.append((cid, chapter_title(full)))
    nav = "<nav><h2>课程目录</h2><ol>" + "".join(
        f'<li><a href="#{cid}">{t}</a></li>' for cid, t in nav_items) + "</ol></nav>"
    doc = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Agent 平台架构、Skill 与 Vibe Coding · 教学讲义</title>
<style>{CSS}</style>
</head>
<body>
<div class="layout">
{nav}
<main>
{COVER}
{''.join(chapters)}
<footer>本讲义由 Markdown 教学讲稿改写生成 · 共 {len(chapters)} 个章节 · 打印时自动隐藏目录</footer>
</main>
</div>
</body>
</html>
"""
    OUT.write_text(doc, encoding="utf-8")
    print(f"OK: {OUT} ({len(chapters)} chapters, {OUT.stat().st_size} bytes)")

if __name__ == "__main__":
    main()
