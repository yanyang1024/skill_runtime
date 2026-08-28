# agentic-sandbox

面向 opencode 的 agentic EDA 沙盒，借鉴 PANDA 的工程纪律：
**任务契约 + 日志哨兵 + 隔离 run 目录 + 禁止假成功**。

所有 EDA 工具（verilator / iverilog / yosys）都通过 bubblewrap 隔离的沙盒执行；
gate 判定写死在编排层，工具适配器无权放行——
`rc==0` 且哨兵 clean 才算通过，工具缺失显式报 `tool_unavailable`，绝不伪造成功。

零第三方依赖（仅 Python 标准库），要求 Python >= 3.9。

## 快速开始

```bash
./setup.sh          # 依赖体检：python 版本 / bwrap / verilator / iverilog / yosys
asbox doctor        # 打印能力矩阵与实际 sandbox_mode（bwrap 或 bare）
asbox run contracts/flow.rtl-basic.json   # 跑内置流水线：lint -> sim -> synth
```

`setup.sh` 会逐项检测本机环境并打印能力矩阵；缺的工具不会阻塞安装，
但对应 stage 会如实落到 `tool_unavailable`。

## asbox CLI

| 子命令 | 用途 |
| --- | --- |
| `asbox doctor` | 能力矩阵：bwrap/verilator/iverilog/yosys 是否可用，打印 sandbox_mode |
| `asbox run <contract.json> [--workspace DIR] [--network]` | 跑流水线：每次执行新建 `run/tryN` 目录（单调递增、绝不覆盖），逐 stage 执行并 gate，结果写入 `<tryN>/<stage>.json` 和 `run.log` |
| `asbox exec -- <cmd...>` | 在沙盒里裸跑单条命令，用于最小复现与调试 |
| `asbox runs [--last N]` | 列出历史 attempt 及各 stage 状态 |
| `asbox tail <try_dir> <stage>` | 打印该 stage 日志尾部 + 哨兵命中行 |

退出码：流水线全绿为 0，否则为 1。

gate 判定规则（编排层写死）：

- returncode 不在 `allow_rc` 内 → `tool_failed`，`on_fail=stop` 则整条流水线停止
- 哨兵命中日志标记（FAILED/fatal/MISMATCH 等）→ `sentinel_hit`，**即使 rc==0**
- 工具二进制不存在 → `tool_unavailable`（显式状态，绝不 mock 成功）
- 超时 → `timeout`（returncode=124）

## 目录结构

```
agentic-sandbox/
├── sandbox/            # 编排核心：runner / contracts / sentinel / runs / cli
├── tools/              # EDA 工具适配器（缺失时显式 stub，绝不伪造成功）
├── skills/             # opencode 项目级 skills（调试纪律）
├── .opencode/          # opencode 项目级配置：agents / commands
├── examples/counter/   # 8-bit 计数器闭合循环示例（rtl.v 正确版，rtl_bad.v 故意带 lint 错误）
├── contracts/          # 内置流水线契约 flow.rtl-basic.json
└── tests/smoke.py      # 无第三方依赖 smoke 测试：python tests/smoke.py
```

## 与 opencode 集成

把 `skills/` 和 `.opencode/` 放到项目根即可被 opencode 识别（项目级配置）：

- `.opencode/opencode.json` 声明 agents/skills/commands 路径（说明性注释以本 README 为准）。
- `.opencode/agents/eda-runner.md` 定义执行 subagent：只允许通过
  `python -m sandbox.cli run/exec` 与沙盒交互，遵守"每次 rerun 新 try 目录、
  rc==0 不算数、tool_unavailable 绝不伪造成功"的铁律。
- `.opencode/commands/run-flow.md` 提供 `/run-flow <contract>` 自定义命令。
- `skills/*/SKILL.md` 提供四个调试纪律技能：
  - `rtl-lint-loop`：lint 错误分类与修复顺序（语法→位宽→隐式 wire→latch）
  - `rtl-sim-verify`：MISMATCH 归因（设计错 vs TB 错）与覆盖率意识
  - `synth-check`：读 yosys stat、latch/组合环告警处理
  - `eda-debug-workflow`：通用纪律（隔离现场、首个失败即停、日志哨兵、禁止假成功）

## 无 EDA 工具时的降级行为

- **无 bwrap**：自动降级为 bare 模式（普通 subprocess + cwd 限制 + env 白名单 + 超时），
  `RunResult.sandbox_mode` 会标明 `"bare"`，`asbox doctor` 可见。
- **缺 verilator/iverilog/yosys**：对应 stage 状态为 `tool_unavailable`，
  `on_fail=stop` 的流水线在该 stage 停止。这是显式失败而非成功——
  沙盒不存在任何"伪造成功"路径，stub 也只返回显式状态。
- 因此在没有安装任何 EDA 工具的机器上，所有命令、目录结构、历史记录仍然可用，
  只是 stage 结果如实显示不可用。
