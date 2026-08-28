---
name: rtl-lint-loop
description: RTL lint 错误的分类、优先级修复顺序与沙盒内迭代闭环纪律
---

# rtl-lint-loop：Verilator lint 迭代闭环

通过 `python -m sandbox.cli run <contract>` 在沙盒里跑 `verilator --lint-only -Wall`，
按下面的分类与顺序修，直到 gate 全绿（rc==0 且哨兵 clean）。

## 错误分类与修复顺序（严格遵守，先修靠前的）

1. **语法错误（syntax error）**
   - 现象：`syntax error, unexpected ...`，后续所有告警都可能是连带噪声。
   - 处理：只修第一处语法错误就重跑，不要试图一次修完。
2. **位宽不匹配（WIDTH）**
   - 现象：`Operator ADD expects 8 bits on the LHS, but ... generates 32 bits`。
   - 处理：显式位宽（如 `cnt <= cnt + 8'd1;`），禁止依赖隐式扩展/截断。
3. **隐式 wire（IMPLICIT）**
   - 现象：`Implicit wire created: xxx`，通常是拼写错误。
   - 处理：RTL 顶部加 `` `default_nettype none ``，逐个声明；先怀疑拼写再怀疑结构。
4. **latch 推断（LATCH）**
   - 现象：组合逻辑分支不全导致 `Latch inferred`。
   - 处理：给所有分支赋值默认值，或改用时序逻辑。
5. **其余告警（UNUSED/UNDRIVEN/CASEINCOMPLETE 等）**
   - 一条条看，确认是真问题还是可接受；可接受也必须在报告中说明理由，不能默默忽略。

## 迭代纪律

- **每次修改后必须 rerun，且 rerun 必然产生新的 try 目录**（RunStore.new_attempt），
  绝不覆盖上一次失败的现场——失败日志是归因依据。
- **rc==0 不算数**：gate 还要求 sentinel clean；日志里出现 FAILED/fatal 等标记即判失败。
- **tool_unavailable 绝不伪造成功**：verilator 不存在就如实报告
  "本机无 verilator，lint 阶段无法执行"，不得编造 lint 通过。
- 一次只改一类错误；改完立刻 rerun，形成小步闭环。
- 超过 3 轮仍未收敛时停下来，把 try1..tryN 的日志并排对比，找模式而不是继续盲改。
