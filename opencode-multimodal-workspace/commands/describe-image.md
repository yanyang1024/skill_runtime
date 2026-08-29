---
description: 用 Qwen3.6 多模态模型描述 / 分析图片
agent: doc-router
---

分析图片：$ARGUMENTS

派给 vision-analyst 执行，回传文本描述。如果我在请求中指定了关注点
（报错 / 数据 / 结构 / 对比），按该关注点组织输出；否则先整体描述再列细节。
