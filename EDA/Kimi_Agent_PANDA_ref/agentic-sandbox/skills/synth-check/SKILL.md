---
name: synth-check
description: 读 yosys stat 报告、处理 latch 推断与组合环告警的综合检查纪律
---

# synth-check：Yosys 综合结果检查

通过 `python -m sandbox.cli run <contract>` 在沙盒里跑
`yosys -p "read_verilog <rtl>; synth; stat"`。工具适配器会把 stat 中的 cell 数解析进 artifacts。

## 读 stat 报告

1. **看 cell 数是否为 0**：为 0 通常意味着模块被整个优化掉——常见原因是输出未连接、
   输入悬空或顶层选错，先查层次（`hierarchy`）再怀疑代码。
2. **看 cell 构成**：`$_DFF_`/`$dff` 数量是否符合预期的寄存器位数；
   计数器 8 bit 应有约 8 个触发器。数量翻倍或为零都要停下来查。
3. **看 wire/memory**：意外出现 `$mem` 或大位宽 wire 往往是位宽笔误。

## 常见告警处理

- **latch 推断（`$dlatch` / warning: LATCH）**：
  组合 always 块分支赋值不全。修法：块首给所有输出赋默认值，或补全 else/case default。
  latch 极少是有意为之；是有意的也必须在报告里说明。
- **组合环（combinational loop）**：
  yosys 会报 `found logic loop`。定位环路上每个 cell，检查是否把输出直接/间接接回输入
  （常见于多驱动或 assign 笔误）。组合环必须消除，不能放行。
- **多驱动（multiple drivers）**：同一信号在多个 always/assign 被驱动，逐一定位驱动源。

## 纪律

- 综合 rc==0 且 stat 有合理 cell 数，才算这一阶段通过；哨兵命中即失败。
- yosys 缺失时如实报 tool_unavailable，绝不伪造综合成功或编造 cell 数。
- 每次 rerun 新 try 目录；保留失败现场便于对比。
- 综合只证明"可实现"，不证明"功能对"——功能结论只能来自仿真阶段。
