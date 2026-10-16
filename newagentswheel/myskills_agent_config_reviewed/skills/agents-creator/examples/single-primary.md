# 单主体使用多个 Skill

假设已安装 beol-review（分析方法）与 report-format（报告规范），两者在同一业务对象、同一上下文下连续使用，无独立验收要求。

```yaml
---
description: 分析工艺记录并按指定规范形成报告
mode: primary
permission:
  '*': deny
  read: allow
  edit: allow
  task: deny
  skill:
    '*': deny
    beol-review: allow
    report-format: allow
---
```

正文示例：

“你负责工艺记录分析及报告交付。需要判断时加载 beol-review；判断与证据齐备后按需加载 report-format。保留用户目标、分析口径和证据，不重新分析。报告格式仅作用于最终交付。缺输入时列出缺口，分析脚本不可用时不宣称已执行。”

合成输入：“比较批次 L1 与基准；输出一页摘要。”先核对方法所需数据，数据不足则阻塞相关判断。两个 Skill 只代表两种方法，不需要两个 Agent。
