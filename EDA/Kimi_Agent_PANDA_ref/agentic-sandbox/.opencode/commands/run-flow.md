---
description: 跑一条流水线契约（lint -> sim -> synth）
agent: eda-runner
---

# /run-flow <contract>

在沙盒里执行指定契约的流水线。用法：

```
/run-flow contracts/flow.rtl-basic.json
```

执行步骤：

1. 用 `python -m sandbox.cli doctor` 确认能力矩阵（bwrap/verilator/iverilog/yosys 是否可用）。
2. 用 `python -m sandbox.cli run $ARGUMENTS` 执行流水线；每次执行自动生成新的 try 目录。
3. 逐 stage 读 gate 结果：rc 必须在 allow_rc 内且 sentinel clean 才算通过；
   出现 sentinel_hit / tool_failed / tool_unavailable / timeout 立即停下归因。
4. 失败时用 `python -m sandbox.cli tail <try_dir> <stage>` 取日志尾部与哨兵命中行，
   按 skills/ 中的纪律（rtl-lint-loop / rtl-sim-verify / synth-check / eda-debug-workflow）修复后重跑。
5. 工具缺失就如实报 tool_unavailable，绝不伪造成功。
