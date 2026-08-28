---
name: eda-debug-workflow
description: EDA 调试通用纪律：隔离现场、首个失败即停、日志哨兵、禁止假成功
---

# eda-debug-workflow：通用调试纪律

适用于所有沙盒内 EDA 任务（lint / sim / synth）的工作流纪律。
所有执行只允许通过 `python -m sandbox.cli run/exec` 进入沙盒。

## 四条铁律

1. **隔离现场**：每次 rerun 必然落到新的 try 目录（try1/try2/...，单调递增，绝不覆盖）。
   上一轮的日志、结果 JSON 是归因证据，禁止删除或改写。
2. **首个失败 checkpoint 即停**：流水线某 stage gate 失败（on_fail=stop）时立即停下分析，
   不要带病往下跑，也不要跳过失败 stage 先跑后面的。
3. **日志哨兵优先于退出码**：rc==0 不算成功；必须同时满足 sentinel clean。
   日志里出现 FAILED/fatal/MISMATCH 等标记，一律按失败处理。
4. **禁止假成功**：工具缺失 → 显式 tool_unavailable；超时 → 显式 timeout。
   绝不编造"通过"结论、绝不手写一个假的结果 JSON、绝不用 stub 冒充真实执行。

## 调试节奏

- 小步快跑：一次只改一处假设，改完立刻 rerun，形成 修改→执行→读哨兵→归因 的闭环。
- 归因顺序：先看 `asbox tail <try_dir> <stage>` 的哨兵命中行 → 找第一个异常点 →
  对比上一个 try 目录的日志 → 再决定改 RTL/TB/契约中的哪一个。
- 用 `asbox runs` 回顾历史 attempt 的 stage 状态，确认修复是否真正收敛而非抖动。
- 用 `asbox exec -- <cmd>` 在沙盒里裸跑单条命令做最小复现，排除流水线编排干扰。
- 三轮不收敛就停下来写假设清单，把已知事实（来自哪个 try 的哪条日志）和猜测分开列。

## 汇报纪律

- 报告必须引用证据：try 目录、stage、哨兵命中行号、工具版本。
- 不确定就说不确定；"应该没问题"不是结论。
