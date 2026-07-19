# -*- coding: utf-8 -*-
"""组装教学版 HTML：模板 + 9 个章节片段 + base64 图片注入。"""
import base64, re, sys
from pathlib import Path

ROOT = Path(r"D:\AI_ram")
BUILD = ROOT / "teach_build"
OUT = ROOT / "HBF与NAND_CIM教学指南.html"

HEAD = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>深入浅出：HBF 与 NAND CIM —— AI 推理的存储革命（教学版）</title>
<style>
:root{
  --bg:#f6f7f9; --paper:#ffffff; --ink:#1f2430; --ink2:#5b6472;
  --brand:#2f6fed; --brand-dark:#1d4fc4; --line:#e5e8ef;
  --analogy:#fff8e6; --analogy-bd:#f0c94d;
  --key:#eaf3ff;  --key-bd:#2f6fed;
  --warn:#fdf0ef; --warn-bd:#e2574c;
  --verdict:#eefaf1; --verdict-bd:#2e9e5b;
  --take:#f4effd; --take-bd:#7c4ddb;
  --mono:Consolas,"Courier New",monospace;
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--ink);
  font:16px/1.85 "Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif;}
/* 侧边导航 */
#sidebar{position:fixed;top:0;left:0;width:264px;height:100vh;overflow-y:auto;
  background:#171b26;color:#cfd6e4;padding:22px 0 40px;z-index:10}
#sidebar h1{font-size:15px;line-height:1.5;color:#fff;margin:0 22px 4px;font-weight:700}
#sidebar .sub{font-size:12px;color:#8a93a8;margin:0 22px 18px}
#sidebar a{display:block;padding:9px 22px;color:#cfd6e4;text-decoration:none;
  font-size:13.5px;border-left:3px solid transparent;line-height:1.45}
#sidebar a:hover{background:#222839;color:#fff}
#sidebar a.active{background:#222839;color:#fff;border-left-color:var(--brand)}
#sidebar a .no{color:#6f7avoid}
/* 主区 */
#main{margin-left:264px;max-width:980px;padding:0 44px 120px}
.cover{background:linear-gradient(135deg,#1d2b53 0%,#2f6fed 100%);color:#fff;
  border-radius:14px;margin:36px 0 8px;padding:44px 40px 38px}
.cover h1{margin:0 0 10px;font-size:30px;line-height:1.35}
.cover p{margin:6px 0;color:#dbe6ff;font-size:15px}
.cover .tags{margin-top:16px}
.cover .tag{display:inline-block;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.35);
  border-radius:999px;padding:2px 14px;font-size:12.5px;margin:3px 6px 0 0;color:#fff}
.howto{background:var(--paper);border:1px solid var(--line);border-radius:12px;
  padding:18px 24px;margin:18px 0 40px;font-size:14px;color:var(--ink2)}
.howto b{color:var(--ink)}
/* 章节 */
.chapter{background:var(--paper);border:1px solid var(--line);border-radius:14px;
  padding:38px 44px;margin:0 0 42px;box-shadow:0 1px 3px rgba(20,30,60,.05)}
.chapter h2{font-size:24px;line-height:1.4;margin:0 0 18px;padding-bottom:14px;
  border-bottom:2px solid var(--brand);color:var(--brand-dark)}
.chapter h3{font-size:19px;margin:34px 0 10px;padding-left:12px;border-left:4px solid var(--brand)}
.chapter h4{font-size:16.5px;margin:24px 0 8px;color:#28304a}
.chapter p{margin:10px 0}
.chapter ul,.chapter ol{margin:10px 0 10px 4px;padding-left:22px}
.chapter li{margin:5px 0}
code{background:#eef1f6;border-radius:4px;padding:1px 6px;font-family:var(--mono);font-size:13.5px;color:#b03a5b}
strong{color:#141a2e}
hr{border:none;border-top:1px dashed var(--line);margin:26px 0}
/* 表格 */
table{border-collapse:collapse;width:100%;margin:16px 0;font-size:14px;background:#fff}
th{background:#f0f4fb;color:#28304a;font-weight:700}
th,td{border:1px solid var(--line);padding:8px 12px;text-align:left;vertical-align:top;line-height:1.6}
tbody tr:nth-child(even){background:#fafbfe}
/* 提示框 */
.callout{border-radius:10px;padding:14px 18px;margin:18px 0;border:1px solid;border-left-width:5px;font-size:14.5px}
.callout .callout-title{display:block;font-weight:700;margin-bottom:6px;font-size:15px}
.callout p{margin:6px 0}
.callout.analogy{background:var(--analogy);border-color:var(--analogy-bd)}
.callout.analogy .callout-title{color:#8a6d00}
.callout.keypoint{background:var(--key);border-color:var(--key-bd)}
.callout.keypoint .callout-title{color:var(--brand-dark)}
.callout.warn{background:var(--warn);border-color:var(--warn-bd)}
.callout.warn .callout-title{color:#b03226}
.callout.verdict{background:var(--verdict);border-color:var(--verdict-bd)}
.callout.verdict .callout-title{color:#1d7a43}
.callout.takeaway{background:var(--take);border-color:var(--take-bd)}
.callout.takeaway .callout-title{color:#5a33b8}
/* 深入细节折叠块 */
details.deep{background:#f2f4f8;border:1px dashed #b9c2d4;border-radius:10px;
  padding:12px 18px;margin:18px 0;font-size:14px}
details.deep summary{cursor:pointer;font-weight:700;color:#4a5570;outline:none}
details.deep[open]{background:#f8fafd}
/* 图 */
figure{margin:22px 0;text-align:center}
figure img{max-width:100%;border:1px solid var(--line);border-radius:10px;background:#fff}
figcaption{font-size:13px;color:var(--ink2);margin-top:8px}
/* 回到顶部 */
#top{position:fixed;right:28px;bottom:28px;background:var(--brand);color:#fff;border:none;
  border-radius:50%;width:44px;height:44px;font-size:20px;cursor:pointer;display:none;box-shadow:0 2px 8px rgba(0,0,0,.25)}
#top:hover{background:var(--brand-dark)}
@media (max-width:900px){
  #sidebar{position:static;width:100%;height:auto}
  #main{margin-left:0;padding:0 14px 80px}
  .chapter{padding:24px 18px}
}
</style>
</head>
<body>
<nav id="sidebar">
  <h1>深入浅出：HBF 与 NAND CIM</h1>
  <div class="sub">AI 推理的存储革命 · 教学版<br>原报告：AI 模型与存储技术调研（专家验证）</div>
__NAV__
</nav>
<div id="main">
  <div class="cover">
    <h1>深入浅出：HBF 与 NAND CIM<br>—— AI 推理的存储革命</h1>
    <p>把一份 470+ 引用的专家级调研报告，改写成谁都读得懂的教学指南。</p>
    <p>主线问题只有一个：大模型推理越来越快地被「存不下、搬不动」卡住，高带宽闪存（HBF）和闪存存内计算（NAND CIM）能不能破局？</p>
    <div class="tags">
      <span class="tag">预备章 + 9 章</span><span class="tag">半导体零基础友好</span><span class="tag">类比驱动讲解</span>
      <span class="tag">关键数据全保留</span><span class="tag">争议与判定透明呈现</span>
    </div>
  </div>
  <div class="howto">
    <b>阅读建议：</b>每章开头都有一个 💡 生活类比，帮助你先建立直觉；正文保留所有关键数据；
    遇到 ⚠️ 表示此处学界/业界尚有争议，🧭 表示专家验证后的判定结论；每章结尾 ✅ 要点速记可用来复习。
    想挖得更深，展开「深入细节」折叠块即可。左侧目录可随时跳转。
  </div>
__BODY__
</div>
<button id="top" onclick="window.scrollTo({top:0,behavior:'smooth'})" title="回到顶部">↑</button>
<script>
var btn=document.getElementById('top');
var links=document.querySelectorAll('#sidebar a');
var secs=document.querySelectorAll('.chapter');
window.addEventListener('scroll',function(){
  btn.style.display=window.scrollY>600?'block':'none';
  var cur='';
  for(var i=0;i<secs.length;i++){
    if(window.scrollY>=secs[i].offsetTop-160)cur=secs[i].id;
  }
  for(var j=0;j<links.length;j++){
    links[j].classList.toggle('active',links[j].getAttribute('href')==='#'+cur);
  }
});
</script>
</body>
</html>
"""

def main():
    frags = []
    nav = []
    for cid in ["chpre"] + [f"ch{i}" for i in range(9)]:
        p = BUILD / f"frag_{cid}.html"
        if not p.exists():
            sys.exit(f"缺少片段: {p}")
        html = p.read_text(encoding="utf-8")
        m = re.search(r"<h2>(.*?)</h2>", html, re.S)
        title = re.sub(r"<[^>]+>", "", m.group(1)).strip() if m else cid
        nav.append(f'  <a href="#{cid}">{title}</a>')
        frags.append(html)

    body = "\n".join(frags)

    # 注入图片
    img_path = ROOT / "hbf_report_sec06_fig1.png"
    b64 = base64.b64encode(img_path.read_bytes()).decode("ascii")
    img_tag = f'<img src="data:image/png;base64,{b64}" alt="第 6 章配图">'
    if "<!--IMG:sec06_fig1-->" not in body:
        sys.exit("未找到图片占位符 <!--IMG:sec06_fig1-->")
    body = body.replace("<!--IMG:sec06_fig1-->", img_tag)

    out = HEAD.replace("__NAV__", "\n".join(nav)).replace("__BODY__", body)
    OUT.write_text(out, encoding="utf-8")
    print(f"OK -> {OUT}  ({OUT.stat().st_size/1024:.0f} KB)")

if __name__ == "__main__":
    main()
