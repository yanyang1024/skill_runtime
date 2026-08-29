---
name: doc-routing
description: 多模态输入的分流规则知识。当需要判断一个文件或图片应该走哪条处理管线（MinerU 解析 / 视觉理解 / 直接读取）时加载。
license: MIT
compatibility: opencode
metadata:
  audience: doc-router
  workflow: routing
---

# 多模态分流规则

## 按格式

| 输入 | 管线 | 理由 |
|---|---|---|
| PDF（数字版） | doc-parser / pipeline 后端 | 文本层完整，无需视觉 |
| PDF（扫描件） | doc-parser / vlm 后端 | 无文本层，必须视觉识别 |
| DOCX / PPTX / XLSX | doc-parser | MinerU 统一转换 |
| PNG / JPG 截图 | vision-analyst | 单图理解 |
| 图表 / 机理图 / 流程图 | vision-analyst | 结构 + 语义提取 |
| TXT / MD / 代码文件 | 直接 read | 无需管线 |

## 按任务

- 「提取全文 / 转 Markdown」→ doc-parser
- 「这张图说了什么 / 报错是什么」→ vision-analyst
- 「对比这几张图」→ vision-analyst（单次调用传多图）
- 「总结这份 PDF」→ doc-parser 解析后，router 按需 read content.md 摘要
- 「文档里第 X 页的图是什么意思」→ doc-parser 解析 → vision-analyst 分析 images/ 中的对应图

## 歧义处理

- 不确定 PDF 是否扫描件：`pdftotext` 抽前 3 页，文本量 < 50 字/页视为扫描件，走 vlm 后端
- 图片疑似文档整页截图：优先 vision-analyst 快速判断；若需完整结构化提取再转 doc-parser
- 混合作战（图文混合的长文档）：doc-parser 先行，vision-analyst 补图注
