# Plan — Agentic EDA Sandbox（面向 opencode 的 Linux 沙盒环境）

## 目标
交付一个可直接 clone 使用的沙盒项目：在 Linux 上用 bubblewrap 做命令级隔离，Python 做编排层，
内置任务契约 / 日志哨兵 / 隔离 run 目录 / artifact hydration 机制，预置 RTL→lint→sim→synth
的示例流水线与 skills，opencode 可直接在其中跑 agent。人机交互通过 CLI（human gate / run 查看 / 日志 tail）。

## Stage 1 — 编排设计（Orchestrator）
- 确定项目结构、模块划分、契约 schema、bwrap 降级策略（无 bwrap 时用 rlimits+env 隔离）
- 加载 vibecoding-general-swarm skill 获取通用编码协作规范

## Stage 2 — 实现（coder subagent）
产物目录：/mnt/agents/output/agentic-sandbox/
- `sandbox/` Python 包：runner(bwrap)、contracts、sentinel、runs、cli
- `tools/` 适配器：verilator_lint / iverilog_sim / yosys_synth（各带契约 + fatal markers + 降级 stub）
- `skills/`：task skills（rtl_generation / lint / sim / synth / fix）+ agent skill（调试工作流）
- `.opencode/`：opencode.json、agents、commands 配置
- `examples/counter_closed_loop/`：闭合修复循环示例
- `setup.sh`、`README.md`、`pyproject.toml`
- 本地 smoke 测试（无 EDA 工具时走 stub 路径）

## Stage 3 — 验证（verifier subagent）
- 运行 setup.sh / smoke 测试，检查契约失败策略、哨兵触发、run 目录隔离
- 检查 opencode 配置可被加载

## Stage 4 — 交付
- README 说明 + 打包说明，引用输出路径
