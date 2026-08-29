---
description: 解析文档为结构化 Markdown（MinerU 管线 + 质检）
agent: doc-router
---

解析文档：$ARGUMENTS

按 doc-routing 规则选择管线，调用对应 subagent 执行。解析完成后必须经
parse-verifier 质检。最后向我汇报：输出目录、页数、块统计、质检结论、
不超过 200 字的内容摘要。不要把解析全文贴进对话。
