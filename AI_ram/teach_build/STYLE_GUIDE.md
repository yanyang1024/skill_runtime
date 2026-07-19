# 教学版 HTML 片段改写规范（所有改写者必须严格遵守）

## 任务
把指定章节的技术 Markdown 改写成「深入浅出」的教学用 HTML 片段。目标读者：聪明但非专家的工程师/学生。原文是专家级调研报告，你要做的是**科普化重写**，不是压缩搬运。

## 输出
- 只输出一个 HTML 片段文件到指定路径。片段最外层是且仅是一个 `<section id="指定id" class="chapter">...</section>`。
- 不要写 `<html>/<head>/<body>`，不要写 `<style>`，不要写 `<script>`。
- 全文使用简体中文。专业术语首次出现时给「中文（English, 缩写）」。

## 深入浅出写作要求
1. **每章开头**放一个 `<div class="callout analogy">`，用一个生活化类比概括本章主旨（例：KV cache 像图书馆的常用书架、HBM 像桌面、SSD 像地下仓库）。
2. **每个小节**：先用 2-4 句大白话讲清「这是什么、为什么重要」，再展开技术内容。多用类比、举例、反问。
3. **保留关键数字与结论**（如 TTFT 降 56–84%、tR 40–100µs），但删掉次要文献枚举；引用只保留「谁/哪个系统做了什么」级别。
4. 原表格改写为简化表格（`<table>`），列数 ≤5，单元格文字要短。
5. 有争议/判定的地方用对应 callout（见下）。
6. 每章结尾放 `<div class="callout takeaway">` 写 3-5 条「要点速记」。
7. 过深的细节（公式推导、大量文献对比）放进 `<details class="deep"><summary>深入细节：…</summary>…</details>` 折叠块，保持主线轻快。每章至少 1 个、至多 3 个 deep 块。
8. 篇幅：每章 HTML 正文 2500–4500 字（不含标签），宁精勿滥。

## 允许的标记（仅这些）
- 结构：`<h2>`（章标题，含章号）、`<h3>`（节标题）、`<h4>`（小节）、`<p>`、`<ul>/<ol>/<li>`、`<table><thead><tbody><tr><th><td>`、`<details class="deep"><summary>`、`<figure><figcaption>`、`<code>`、`<strong>/<em>`、`<hr>`
- 提示框（class 精确使用）：
  - `<div class="callout analogy">` 💡 类比
  - `<div class="callout keypoint">` 📌 关键结论
  - `<div class="callout warn">` ⚠️ 争议 / 注意
  - `<div class="callout verdict">` 🧭 专家判定
  - `<div class="callout takeaway">` ✅ 要点速记（内放一个 `<ul>`）
  每个 callout 内第一个元素必须是 `<span class="callout-title">标题</span>`，随后是内容。
- 图片：如需引用图，写 `<!--IMG:sec06_fig1-->` 占位注释加 `<figure><figcaption>图说</figcaption></figure>` 说明，由组装脚本注入真实图片。

## 禁止
- 禁止内联 style、禁止 script、禁止外链资源、禁止 markdown 语法残留（如 `**`、`|---|`）。
- 禁止逐段直译原文腔调（"综上所述""值得注意的是"这类套话少用）。
