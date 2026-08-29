#!/usr/bin/env python3
"""build_player.py — 把课程目录编译成离线 HTML 站点 / 单文件播放器（零 CDN、零依赖）

对齐 dsl/SPEC.md v0.2：场景类型只有 quiz / interactive / pbl。
  - quiz: 单选/多选本地批改（选项集合相等即满分）；short_answer 展示
          commentPrompt 评分量规 + analysis 参考评语
  - interactive: iframe srcdoc + sandbox="allow-scripts allow-forms allow-popups"，
          按 1280×720 逻辑视口用 CSS transform scale 适配
  - pbl: 项目文档视图
  - 导览动作: spotlight/annotate 经宿主 → iframe 的 postMessage 桥下发
          （HIGHLIGHT_ELEMENT / ANNOTATE_ELEMENT），wait/next 本地执行；
          widget 未实现桥时动作静默跳过（SPEC 第 6 节）

契约:
  - 构建前先 subprocess 调 course_validate.py --course；ERROR > 0 时打印校验
    输出并以退出码 1 拒绝构建。
  - 产物零外链、自包含；场景 JSON 内嵌进 HTML 时对 "</" 转义，防止 </script>
    提前闭合。

用法:
  python3 tools/build_player.py <course_dir> [--mode site|single] [-o 输出路径]
    site   （默认）-o 为输出目录，默认 <course_dir>/site/；
           生成 index.html（课程首页）+ scenes/<scene_id>.html（每场景一页），
           并复制 assets/（若存在）。
    single -o 为输出文件，默认 <course_dir>/player.html；
           全部场景 JSON 内联 + 左侧导航的单文件播放器。

退出码: 0 = 构建成功; 1 = 校验有 ERROR 或输入文件问题。
"""
import argparse
import json
import shutil
import subprocess
import sys
from html import escape as hesc
from pathlib import Path

# ---------------------------------------------------------------------------
# 共享内联 CSS：site 的 index/场景页与 single 播放器共用同一段基础样式
# ---------------------------------------------------------------------------
COMMON_CSS = r"""
  :root { --theme: #5b7a5e; --bg: #f7f5f1; --panel: #ffffff; --ink: #2c2a26; --muted: #8a857c; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
         background: var(--bg); color: var(--ink); }
  .wrap { max-width: 1080px; margin: 0 auto; padding: 0 20px; }
  a { color: var(--theme); text-decoration: none; }
  button { font: inherit; padding: 8px 18px; border-radius: 8px; border: 1px solid #d8d3c8;
           background: var(--panel); cursor: pointer; color: var(--ink); }
  button:hover { border-color: var(--theme); }
  button.primary { background: var(--theme); color: #fff; border-color: var(--theme); }
  button:disabled { opacity: .45; cursor: default; }
  .badge { font-size: 11px; color: var(--theme); margin-right: 6px; }
  .tag { display: inline-block; font-size: 11px; background: #eef2ec; color: var(--theme);
         border-radius: 999px; padding: 2px 10px; margin-right: 6px; }
  /* ---- quiz ---- */
  .quiz-card { background: var(--panel); border-radius: 12px; padding: 24px;
               box-shadow: 0 2px 16px rgba(0,0,0,.06); margin-bottom: 16px; }
  .quiz-q { font-size: 16px; font-weight: 600; margin-bottom: 12px; }
  .quiz-opt { display: block; padding: 10px 14px; border: 1px solid #e5e1d8; border-radius: 8px;
              margin-bottom: 8px; cursor: pointer; font-size: 14px; }
  .quiz-opt:hover { border-color: var(--theme); }
  .quiz-opt.selected { border-color: var(--theme); background: #eef2ec; }
  .quiz-opt.correct { border-color: #4d7c52; background: #edf5ee; }
  .quiz-opt.wrong { border-color: #b4552f; background: #faf0ea; }
  .quiz-analysis { display: none; margin-top: 10px; font-size: 13px; color: var(--muted);
                   border-top: 1px dashed #e5e1d8; padding-top: 10px; }
  .quiz-card.graded .quiz-analysis { display: block; }
  .quiz-card textarea { width: 100%; min-height: 90px; font: inherit; padding: 10px;
                        border: 1px solid #e5e1d8; border-radius: 8px; }
  .quiz-score { font-size: 15px; font-weight: 600; color: var(--theme); }
  /* ---- interactive：1280×720 逻辑视口 + transform scale ---- */
  .widget-viewport { position: relative; width: 100%; overflow: hidden; background: #fff;
                     border-radius: 12px; box-shadow: 0 2px 16px rgba(0,0,0,.08); }
  .widget-frame { border: 0; display: block; transform-origin: top left; background: #fff; }
  /* ---- pbl ---- */
  .pbl-doc h2 { border-bottom: 2px solid var(--theme); padding-bottom: 8px; }
  .pbl-issue { background: var(--panel); border-radius: 12px; padding: 18px 22px;
               margin-bottom: 14px; box-shadow: 0 1px 8px rgba(0,0,0,.05); }
  .pbl-issue .deliver { font-size: 13px; color: var(--theme); margin-top: 8px; }
  /* ---- site 模式：页头 / 目录卡片 / 场景页导航 ---- */
  .site-header { background: var(--panel); border-bottom: 1px solid #e5e1d8; padding: 14px 0; }
  .site-header .wrap { display: flex; align-items: center; gap: 14px; }
  .site-header .back { font-size: 13px; white-space: nowrap; }
  .site-header .crumb { font-size: 13px; color: var(--muted); }
  .site-header .crumb .course { color: var(--ink); font-weight: 600; }
  .hero { padding: 52px 0 40px; text-align: center; }
  .hero .wrap { display: block; }
  .hero h1 { margin: 0 0 12px; font-size: 28px; }
  .hero .desc { color: var(--muted); margin: 0 auto 10px; max-width: 640px; line-height: 1.7; }
  .hero .meta { font-size: 12px; color: var(--muted); }
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
           gap: 14px; padding: 28px 0 48px; }
  .scene-card { display: block; background: var(--panel); border: 1px solid #e5e1d8;
                border-radius: 12px; padding: 16px 18px; color: var(--ink); }
  .scene-card:hover { border-color: var(--theme); }
  .scene-card .num { font-size: 12px; color: var(--muted); margin-right: 8px; }
  .scene-card b { font-size: 15px; }
  .scene-card .stype { float: right; }
  .scene-title { font-size: 22px; margin: 24px 0 16px; }
  .controls { margin: 14px 0; display: flex; gap: 12px; align-items: center; }
  .page-nav { display: flex; justify-content: space-between; gap: 12px; padding: 20px 0 40px; }
  .page-nav .nav-btn { font-size: 14px; padding: 10px 18px; border: 1px solid #d8d3c8;
                       border-radius: 8px; background: var(--panel); }
  .page-nav .nav-btn.disabled { color: var(--muted); opacity: .5; }
  #stage { width: 100%; }
  /* ---- single 模式：左侧导航布局 ---- */
  #app { display: flex; min-height: 100vh; }
  #nav { width: 240px; background: var(--panel); border-right: 1px solid #e5e1d8;
         padding: 16px; overflow-y: auto; max-height: 100vh; position: sticky; top: 0; }
  #nav h1 { font-size: 16px; margin: 0 0 12px; line-height: 1.4; }
  .nav-item { padding: 8px 10px; border-radius: 8px; cursor: pointer; font-size: 13px;
              color: var(--muted); margin-bottom: 4px; }
  .nav-item:hover { background: #f0ede6; }
  .nav-item.active { background: #eef2ec; color: var(--ink); font-weight: 600; }
  #main { flex: 1; display: flex; flex-direction: column; align-items: center; padding: 24px; }
  #main #stage { max-width: 1080px; }
  #hint { font-size: 12px; color: var(--muted); }
  @media (max-width: 800px) { #nav { display: none; } }
"""

# ---------------------------------------------------------------------------
# 共享 JS 运行时：场景渲染（quiz/interactive/pbl）+ 导览执行。
# site 的场景页与 single 播放器注入同一段，保证两种模式行为一致。
# ---------------------------------------------------------------------------
RUNTIME_JS = r"""
"use strict";
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const TYPE_LABEL = { quiz: "测验", interactive: "交互", pbl: "项目" };
const VW = 1280, VH = 720;  /* SPEC 第 3 节：interactive 的逻辑视口 */

/* ---------- quiz：本地批改 ---------- */
function renderQuiz(content, mount) {
  const answers = {};
  (content.questions || []).forEach(q => {
    const card = document.createElement("div");
    card.className = "quiz-card";
    let h = `<div class="quiz-q">${esc(q.question)}
      <span class="tag">${{ single: "单选", multiple: "多选", short_answer: "简答" }[q.type] || q.type}</span>
      <span class="tag">${q.points || 1} 分</span></div>`;
    if (q.type === "short_answer") {
      /* 简答题：展示 commentPrompt 量规 + analysis 参考评语，不做运行时批改 */
      h += `<textarea placeholder="写下你的回答……" data-qid="${esc(q.id)}"></textarea>
        <button class="show-rubric" data-qid="${esc(q.id)}">查看评分量规与参考答案</button>
        <div class="quiz-analysis" id="rubric-${esc(q.id)}"><b>评分量规：</b>${esc(q.commentPrompt || "")}
        <br><b>参考答案：</b>${esc(q.analysis || "")}</div>`;
    } else {
      (q.options || []).forEach(o => {
        h += `<span class="quiz-opt" data-qid="${esc(q.id)}" data-val="${esc(o.value)}">
          <b>${esc(o.value)}.</b> ${esc(o.label)}</span>`;
      });
      h += `<div class="quiz-analysis"><b>解析：</b>${esc(q.analysis || "")}</div>`;
    }
    card.innerHTML = h;
    mount.appendChild(card);
  });
  const submit = document.createElement("button");
  submit.className = "primary"; submit.textContent = "提交批改";
  mount.appendChild(submit);

  mount.addEventListener("click", (e) => {
    const opt = e.target.closest(".quiz-opt");
    if (opt && !opt.closest(".quiz-card").classList.contains("graded")) {
      const qid = opt.dataset.qid;
      const q = (content.questions || []).find(x => x.id === qid);
      if (q && q.type === "single") {
        opt.parentElement.querySelectorAll(".quiz-opt").forEach(o => o.classList.remove("selected"));
        answers[qid] = [opt.dataset.val];
        opt.classList.add("selected");
      } else if (q) {
        opt.classList.toggle("selected");
        answers[qid] = [...opt.parentElement.querySelectorAll(".quiz-opt.selected")]
          .map(o => o.dataset.val);
      }
    }
    const rubricBtn = e.target.closest(".show-rubric");
    if (rubricBtn) $("#rubric-" + CSS.escape(rubricBtn.dataset.qid)).style.display = "block";
  });
  submit.addEventListener("click", () => {
    let got = 0, total = 0;
    (content.questions || []).forEach(q => {
      if (q.type === "short_answer") return;
      total += q.points || 1;
      const card = [...mount.querySelectorAll(".quiz-card")]
        .find(c => c.querySelector(`[data-qid="${q.id}"]`));
      if (!card) return;
      card.classList.add("graded");
      /* 集合相等判分：排序后比较，与作答顺序无关 */
      const mine = (answers[q.id] || []).slice().sort().join(",");
      const right = (q.answer || []).slice().sort().join(",");
      card.querySelectorAll(".quiz-opt").forEach(o => {
        if ((q.answer || []).includes(o.dataset.val)) o.classList.add("correct");
        else if (o.classList.contains("selected")) o.classList.add("wrong");
      });
      if (mine === right) got += q.points || 1;
    });
    submit.outerHTML = `<div class="quiz-score">客观题得分：${got} / ${total}</div>`;
  });
}

/* ---------- interactive：iframe srcdoc + sandbox + 逻辑视口缩放 ---------- */
function renderInteractive(content, mount) {
  const wrap = document.createElement("div");
  wrap.className = "widget-viewport";
  const f = document.createElement("iframe");
  f.className = "widget-frame";
  /* SPEC 第 3 节：没有 allow-same-origin，widget 处于 null origin */
  f.setAttribute("sandbox", "allow-scripts allow-forms allow-popups");
  f.style.width = VW + "px";
  f.style.height = VH + "px";
  f.srcdoc = content.html || "<p>（空场景）</p>";
  wrap.appendChild(f);
  mount.appendChild(wrap);
  const fit = () => {
    const s = wrap.clientWidth / VW;
    f.style.transform = "scale(" + s + ")";
    wrap.style.height = Math.round(VH * s) + "px";
  };
  if (window.ResizeObserver) new ResizeObserver(fit).observe(wrap);
  window.addEventListener("resize", fit);
  fit();
  return f;
}

/* ---------- pbl ---------- */
function renderPbl(content, mount) {
  const div = document.createElement("div");
  div.className = "pbl-doc";
  let h = `<h2>${esc(content.projectTopic)}</h2><p>${esc(content.projectDescription)}</p>
    <p>${(content.targetSkills || []).map(s => `<span class="tag">${esc(s)}</span>`).join("")}</p><hr>`;
  (content.issues || []).forEach((it, i) => {
    h += `<div class="pbl-issue"><b>任务 ${i + 1}：${esc(it.title)}</b>
      <p>${esc(it.description)}</p>
      <div class="deliver">交付物：${esc(it.deliverable)}</div></div>`;
  });
  div.innerHTML = h;
  mount.appendChild(div);
}

/* ---------- 场景渲染分发（返回 interactive 的 iframe，其余为 null） ---------- */
function renderScene(scene, mount) {
  const t = scene.type, c = scene.content || {};
  if (t === "quiz") { renderQuiz(c, mount); return null; }
  if (t === "interactive") return renderInteractive(c, mount);
  if (t === "pbl") { renderPbl(c, mount); return null; }
  mount.innerHTML = "<p>未知场景类型：" + esc(t) + "</p>";
  return null;
}

/* ---------- 导览执行（共享片段：site 场景页与 single 播放器同一份逻辑） ----------
   SPEC 第 6 节：spotlight/annotate 经宿主 → iframe 的 postMessage 桥下发；
   widget 未实现桥时消息无人接收，动作静默跳过，不算错误。 */
function createGuide(scene, getFrame) {
  const acts = (scene && scene.actions) || [];
  let timer = null, playing = false;
  const api = { onfinish: null };
  function stop() { playing = false; if (timer) { clearTimeout(timer); timer = null; } }
  function finish() { stop(); if (api.onfinish) api.onfinish(); }
  function post(msg) {
    const f = getFrame && getFrame();
    if (f && f.contentWindow) {
      try { f.contentWindow.postMessage(msg, "*"); } catch (e) { /* 桥不可用，跳过 */ }
    }
  }
  function step(i) {
    if (!playing || i >= acts.length) { finish(); return; }
    const a = acts[i] || {}, p = a.params || {};
    const fwd = () => step(i + 1);
    switch (a.actionName) {
      case "wait":
        timer = setTimeout(fwd, p.ms || 1000); break;
      case "spotlight":
        if (p.selector) post({ type: "HIGHLIGHT_ELEMENT", target: p.selector });
        timer = setTimeout(fwd, 1200); break;
      case "annotate":
        if (p.selector) post({ type: "ANNOTATE_ELEMENT", target: p.selector, content: p.text || "" });
        timer = setTimeout(fwd, 2000); break;
      case "next":
      default:
        fwd(); break;
    }
  }
  api.start = () => { stop(); playing = true; step(0); };
  api.stop = stop;
  api.isPlaying = () => playing;
  return api;
}
"""

# ---------------------------------------------------------------------------
# single 模式：单文件播放器（全部 JSON 内联 + 左侧导航）
# ---------------------------------------------------------------------------
SINGLE_TEMPLATE = r"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>__TITLE__</title>
<style>__COMMON_CSS__</style>
</head>
<body>
<div id="app">
  <nav id="nav"><h1 id="course-name"></h1><div id="nav-list"></div></nav>
  <div id="main">
    <div id="stage"></div>
    <div class="controls">
      <button id="prev">← 上一节</button>
      <button id="play" class="primary">▶ 播放导览</button>
      <button id="next">下一节 →</button>
      <span id="hint">键盘 ← → 翻页 · 空格播放/停止导览</span>
    </div>
  </div>
</div>
<script id="course-data" type="application/json">__COURSE_JSON__</script>
<script>
__RUNTIME_JS__
const COURSE = JSON.parse(document.getElementById("course-data").textContent);
const SCENES = COURSE.scenes || [];
let current = 0;
let frame = null;
let guide = null;
const stageEl = document.getElementById("stage");
const playBtn = document.getElementById("play");

function stopGuide() { if (guide) guide.stop(); playBtn.textContent = "▶ 播放导览"; }
function show(idx) {
  stopGuide();
  current = Math.max(0, Math.min(idx, SCENES.length - 1));
  const scene = SCENES[current];
  stageEl.innerHTML = "";
  document.querySelectorAll(".nav-item").forEach((n, i) =>
    n.classList.toggle("active", i === current));
  const mount = document.createElement("div");
  stageEl.appendChild(mount);
  frame = renderScene(scene, mount);
  guide = createGuide(scene, () => frame);
  guide.onfinish = () => { playBtn.textContent = "▶ 播放导览"; };
  playBtn.disabled = !((scene.actions || []).length);
}
document.getElementById("prev").onclick = () => show(current - 1);
document.getElementById("next").onclick = () => show(current + 1);
playBtn.onclick = () => {
  if (guide && guide.isPlaying()) { stopGuide(); return; }
  if (guide) { guide.start(); playBtn.textContent = "■ 停止"; }
};
document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowLeft") show(current - 1);
  if (e.key === "ArrowRight") show(current + 1);
  if (e.key === " ") { e.preventDefault(); playBtn.click(); }
});
document.getElementById("course-name").textContent = COURSE.name;
const navList = document.getElementById("nav-list");
SCENES.forEach((s, i) => {
  const n = document.createElement("div");
  n.className = "nav-item";
  n.innerHTML = `<span class="badge">${TYPE_LABEL[s.type] || esc(s.type)}</span>${esc(s.title)}`;
  n.onclick = () => show(i);
  navList.appendChild(n);
});
if (SCENES.length) show(0);
</script>
</body>
</html>
"""

# ---------------------------------------------------------------------------
# site 模式：课程首页 + 每场景一页
# ---------------------------------------------------------------------------
INDEX_TEMPLATE = r"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>__TITLE__</title>
<style>__COMMON_CSS__</style>
</head>
<body>
<header class="site-header hero">
  <div class="wrap">
    <h1>__COURSE_NAME__</h1>
    <p class="desc">__DESC__</p>
    <p class="meta">共 __TOTAL__ 个场景 · MAIC-Lite 离线课程</p>
  </div>
</header>
<main class="wrap">
  <div class="cards">
__CARDS__
  </div>
</main>
</body>
</html>
"""

SCENE_PAGE_TEMPLATE = r"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>__TITLE__</title>
<style>__COMMON_CSS__</style>
</head>
<body>
<header class="site-header">
  <div class="wrap">
    <a class="back" href="../index.html">← 返回目录</a>
    <div class="crumb"><span class="course">__COURSE_NAME__</span> · 场景 __SCENE_NO__/__TOTAL__
      <span class="tag">__TYPE_LABEL__</span></div>
  </div>
</header>
<main class="wrap">
  <h1 class="scene-title">__SCENE_TITLE__</h1>
  <div id="stage"></div>
  <div class="controls">
    <button id="play" class="primary">▶ 播放导览</button>
  </div>
  <nav class="page-nav">
    __PREV_NAV__
    __NEXT_NAV__
  </nav>
</main>
<script id="scene-data" type="application/json">__SCENE_JSON__</script>
<script>
__RUNTIME_JS__
const SCENE = JSON.parse(document.getElementById("scene-data").textContent);
const stageEl = document.getElementById("stage");
const frame = renderScene(SCENE, stageEl);
const guide = createGuide(SCENE, () => frame);
const playBtn = document.getElementById("play");
if (!((SCENE.actions || []).length)) playBtn.disabled = true;
guide.onfinish = () => { playBtn.textContent = "▶ 播放导览"; };
playBtn.onclick = () => {
  if (guide.isPlaying()) { guide.stop(); playBtn.textContent = "▶ 播放导览"; }
  else { guide.start(); playBtn.textContent = "■ 停止"; }
};
</script>
</body>
</html>
"""

TYPE_LABELS = {"quiz": "测验", "interactive": "交互", "pbl": "项目"}


def load_course(course_dir):
    """读取 stage.json 与全部场景文件，返回构建所需的数据结构。"""
    course = Path(course_dir)
    stage = json.loads((course / "stage.json").read_text(encoding="utf-8"))
    scenes = []
    for rel in stage.get("scenes", []):
        p = course / rel
        if not p.exists():
            sys.exit(f"场景文件缺失: {p}")
        scenes.append(json.loads(p.read_text(encoding="utf-8")))
    return {
        "name": stage.get("name", "未命名课程"),
        "description": stage.get("description", ""),
        "languageDirective": stage.get("languageDirective", ""),
        "scenes": scenes,
    }


def embed_json(obj):
    """内嵌进 <script type="application/json"> 时转义 "</"，防止 </script> 提前闭合。"""
    return json.dumps(obj, ensure_ascii=False).replace("</", "<\\/")


def run_validator(course_dir):
    """构建前先跑权威校验器；ERROR > 0 时打印校验输出并拒绝构建。"""
    here = Path(__file__).resolve().parent
    result = subprocess.run(
        [sys.executable, str(here / "course_validate.py"), "--course", str(course_dir)],
        capture_output=True, text=True)
    if result.returncode != 0:
        if result.stdout:
            print(result.stdout, end="")
        if result.stderr:
            print(result.stderr, end="", file=sys.stderr)
        print("校验未通过（存在 ERROR），拒绝构建。请先按 PROTOCOL.md 第 5 节修复。",
              file=sys.stderr)
        sys.exit(1)


def build_single(course_dir, data, out):
    """single 模式：全部场景 JSON 内联的单文件播放器。"""
    html_out = SINGLE_TEMPLATE.replace("__COMMON_CSS__", COMMON_CSS) \
                              .replace("__RUNTIME_JS__", RUNTIME_JS) \
                              .replace("__COURSE_JSON__", embed_json(data)) \
                              .replace("__TITLE__", hesc(data["name"]))
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html_out, encoding="utf-8")
    print(f"已生成单文件播放器: {out}（{len(html_out) // 1024} KB）")


def build_site(course_dir, data, out_dir):
    """site 模式：index.html + scenes/<scene_id>.html + assets/ 复制。"""
    scenes = data["scenes"]
    total = len(scenes)
    scenes_dir = out_dir / "scenes"
    scenes_dir.mkdir(parents=True, exist_ok=True)

    # 场景 id → 页面文件名（校验器保证 id 存在；兜底用序号）
    ids = [s.get("id") or f"scene_{i + 1}" for i, s in enumerate(scenes)]

    # 首页：场景目录卡片
    cards = []
    for i, s in enumerate(scenes):
        label = TYPE_LABELS.get(s.get("type"), s.get("type", ""))
        cards.append(
            f'    <a class="scene-card" href="scenes/{ids[i]}.html">'
            f'<span class="num">{i + 1:02d}</span><b>{hesc(str(s.get("title", "")))}</b>'
            f'<span class="tag stype">{hesc(label)}</span></a>')
    index = INDEX_TEMPLATE.replace("__COMMON_CSS__", COMMON_CSS) \
                          .replace("__TITLE__", hesc(data["name"])) \
                          .replace("__COURSE_NAME__", hesc(data["name"])) \
                          .replace("__DESC__", hesc(data["description"])) \
                          .replace("__TOTAL__", str(total)) \
                          .replace("__CARDS__", "\n".join(cards))
    (out_dir / "index.html").write_text(index, encoding="utf-8")

    # 场景页：顶部课程名 + 进度 n/N，底部上一页/下一页（边界处理）
    for i, s in enumerate(scenes):
        if i > 0:
            prev_nav = (f'<a class="nav-btn" href="{ids[i - 1]}.html">'
                        f'← 上一节</a>')
        else:
            prev_nav = '<a class="nav-btn" href="../index.html">← 返回目录</a>'
        if i < total - 1:
            next_nav = (f'<a class="nav-btn" href="{ids[i + 1]}.html">'
                        f'下一节 →</a>')
        else:
            next_nav = '<span class="nav-btn disabled">已是最后一节</span>'
        label = TYPE_LABELS.get(s.get("type"), s.get("type", ""))
        title = str(s.get("title", ""))
        page = SCENE_PAGE_TEMPLATE.replace("__COMMON_CSS__", COMMON_CSS) \
                                  .replace("__RUNTIME_JS__", RUNTIME_JS) \
                                  .replace("__SCENE_JSON__", embed_json(s)) \
                                  .replace("__TITLE__", hesc(f"{title} · {data['name']}")) \
                                  .replace("__COURSE_NAME__", hesc(data["name"])) \
                                  .replace("__SCENE_NO__", str(i + 1)) \
                                  .replace("__TOTAL__", str(total)) \
                                  .replace("__TYPE_LABEL__", hesc(label)) \
                                  .replace("__SCENE_TITLE__", hesc(title)) \
                                  .replace("__PREV_NAV__", prev_nav) \
                                  .replace("__NEXT_NAV__", next_nav)
        (scenes_dir / f"{ids[i]}.html").write_text(page, encoding="utf-8")

    # assets/ 原样复制（场景里的相对路径引用才能生效）
    assets = Path(course_dir) / "assets"
    if assets.is_dir() and any(assets.iterdir()):
        shutil.copytree(assets, out_dir / "assets", dirs_exist_ok=True)

    print(f"已生成站点: {out_dir}/（index.html + {total} 个场景页）")


def main():
    ap = argparse.ArgumentParser(description="MAIC-Lite course -> 离线站点 / 单文件播放器")
    ap.add_argument("course_dir")
    ap.add_argument("-o", "--output",
                    help="输出路径：site 模式为目录（默认 <course_dir>/site/），"
                         "single 模式为 HTML 文件（默认 <course_dir>/player.html）")
    ap.add_argument("--mode", choices=["site", "single"], default="site",
                    help="site=多页站点（默认）；single=单文件播放器")
    args = ap.parse_args()

    run_validator(args.course_dir)
    data = load_course(args.course_dir)

    if args.mode == "single":
        out = Path(args.output) if args.output else Path(args.course_dir) / "player.html"
        build_single(args.course_dir, data, out)
        print("直接用浏览器打开即可。")
    else:
        out_dir = Path(args.output) if args.output else Path(args.course_dir) / "site"
        build_site(args.course_dir, data, out_dir)
        print(f"入口: {out_dir / 'index.html'}，直接用浏览器打开即可。")


if __name__ == "__main__":
    main()
