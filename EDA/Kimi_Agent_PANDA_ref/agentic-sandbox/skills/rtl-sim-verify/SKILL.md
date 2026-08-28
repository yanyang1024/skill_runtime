---
name: rtl-sim-verify
description: 仿真 MISMATCH 的归因步骤（设计错 vs TB 错）与覆盖率意识
---

# rtl-sim-verify：仿真验证与 MISMATCH 归因

通过 `python -m sandbox.cli run <contract>` 在沙盒里跑 iverilog+vvp。
testbench 约定：失败打印 `MISMATCH`，成功打印 `TEST PASS`。
gate 配置了哨兵额外标记 `MISMATCH`/`FAIL`——即使 vvp 返回 0，日志含 MISMATCH 也判失败。

## MISMATCH 归因步骤（先定位，再动手）

1. **复现并固定现场**：保留当前 try 目录日志，用 `asbox tail <try_dir> sim` 查看输出尾部与哨兵命中行。
2. **确定第一个失配点**：找到最早一条 MISMATCH 的时间戳/周期，后面的失配通常是雪崩，只看第一个。
3. **判别设计错 vs TB 错**：
   - 对照接口时序：TB 的激励是否在时钟有效沿之后稳定？采样是否打错了沿？
     TB 时序不对 → 改 TB，设计不动。
   - 手工推算期望值：用纸笔/心算推出第一个失配周期的正确输出。
     期望值 == TB 期望 → 设计错；期望值 == DUT 实际 → TB 期望算错。
   - 加 `$display`/`$dumpvars` 缩小观察范围，确认内部信号哪一级开始偏。
4. **只改确认有错的一方**，改完 rerun（新 try 目录），对比前后日志。

## 覆盖率意识

- TEST PASS 不代表验证充分。自问：复位行为测了吗？边界值（全 0/全 1/翻转）测了吗？
  使能关断路径测了吗？
- 每修一个 bug，顺手补一条能抓回该 bug 的断言/检查，防止回归。
- 覆盖明显不足时，在报告里如实写明"现有 TB 未覆盖 XX 场景"，不得用 PASS 掩盖。

## 纪律

- rc==0 不算数；哨兵命中 MISMATCH/FAIL 即失败。
- iverilog/vvp 缺失时如实报 tool_unavailable，绝不编造"仿真通过"。
- 不改设计只调 TB 让 PASS 变绿是作弊行为，除非已按归因步骤证明 TB 有错。
