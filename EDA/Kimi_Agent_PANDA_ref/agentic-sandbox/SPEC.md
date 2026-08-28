# SPEC — agentic-sandbox

面向 opencode 的 agentic EDA 沙盒：Linux + bubblewrap 隔离 + Python 编排 + 任务契约 + 日志哨兵 + 隔离 run 目录。
设计语言：中文注释/文档，代码标识符英文。目标 Python >= 3.9，零第三方依赖（仅标准库）。

## 仓库结构（共享 repo: /mnt/agents/output/agentic-sandbox/）

```
agentic-sandbox/
├── SPEC.md                      # 本文件
├── README.md                    # 中文使用文档
├── pyproject.toml               # name=agentic-sandbox, console_scripts: asbox=sandbox.cli:main
├── setup.sh                     # 依赖体检：python版本/bwrap/verilator/iverilog/yosys 检测并打印能力矩阵
├── sandbox/
│   ├── __init__.py              # 导出 SandboxRunner, Contract, Sentinel, RunStore
│   ├── runner.py                # bubblewrap 沙盒执行器（核心）
│   ├── contracts.py             # 任务契约 schema + 校验 + 失败策略
│   ├── sentinel.py              # 日志哨兵
│   ├── runs.py                  # 隔离 run 目录 + artifact hydration
│   └── cli.py                   # 人机交互 CLI
├── tools/
│   ├── base.py                  # ToolAdapter 基类
│   ├── verilator_lint.py        # verilator --lint-only 适配器
│   ├── iverilog_sim.py          # iverilog+vvp 适配器
│   ├── yosys_synth.py           # yosys 综合适配器
│   └── stubs.py                 # 工具缺失时的 stub（显式 stub，绝不伪造成功）
├── skills/                      # opencode 项目级 skills
│   ├── rtl-lint-loop/SKILL.md
│   ├── rtl-sim-verify/SKILL.md
│   ├── synth-check/SKILL.md
│   └── eda-debug-workflow/SKILL.md   # agent skill：调试工作流纪律
├── .opencode/
│   ├── opencode.json            # 项目级配置（说明性注释写在 README）
│   ├── agents/eda-runner.md     # subagent 定义：沙盒内执行 EDA 任务
│   └── commands/run-flow.md     # 自定义命令：跑一条流水线
├── examples/
│   └── counter/                 # 8-bit 计数器闭合循环示例（含故意带 lint 错误的 rtl_bad.v）
│       ├── rtl.v  rtl_bad.v  tb.v  flow.json
├── contracts/
│   └── flow.rtl-basic.json      # 内置流水线契约：lint -> sim -> synth
└── tests/
    └── smoke.py                 # 无第三方依赖的 smoke 测试，python tests/smoke.py 直接可跑
```

## 核心契约

### 1. runner.py — SandboxRunner
```python
class SandboxRunner:
    def __init__(self, workspace: Path, network: bool = False,
                 extra_ro_binds: list[str] = [], timeout_sec: int = 300): ...
    @staticmethod
    def bwrap_available() -> bool: ...          # shutil.which("bwrap")
    def run(self, argv: list[str], cwd: str = ".",
            env: dict = {}) -> RunResult        # 永不抛异常，失败进 RunResult
@dataclass
class RunResult:
    argv: list[str]; returncode: int          # 124 = timeout
    stdout: str; stderr: str
    sandbox_mode: str                          # "bwrap" | "bare"
    duration_sec: float
```
bwrap 参数（可用时）：`--unshare-all`（无 network 时）/ `--unshare-user --unshare-pid --unshare-ipc`（有 network 时保留 net），
`--ro-bind / /`、`--bind workspace /workspace`、`--chdir /workspace/<cwd>`、`--tmpfs /tmp`、`--proc /proc`、`--dev /dev`，
env 白名单（PATH/HOME/LANG 等）+ 用户 env。降级 bare 模式：subprocess + cwd=workspace + env 白名单 + timeout，
并在 RunResult.sandbox_mode 标明。timeout 用 subprocess timeout，超时 returncode=124。

### 2. sentinel.py — Sentinel
```python
@dataclass
class SentinelReport:
    clean: bool; fatal_hits: list[tuple[int, str]]   # (行号, 命中行)
class Sentinel:
    DEFAULT_MARKERS = ["FAILED", "fatal", "terminate called", "std::out_of_range",
                       "Segmentation fault", "not found"]
    def __init__(self, markers: list[str] | None = None, ignore: list[str] = []): ...
    def scan(self, text: str) -> SentinelReport: ...
```
原则：returncode==0 且 sentinel.clean 才算成功（在 contracts.py 的 gate 中体现）。

### 3. runs.py — RunStore
```python
class RunStore:
    def __init__(self, root: Path): ...                  # root 通常 <workspace>/run
    def new_attempt(self) -> Path: ...                   # 创建 try1/try2/... 单调递增，绝不覆盖
    def hydrate(self, try_dir: Path, names: list[str]) -> dict: ...
        # 按 try_dir -> 历史 try*（新到旧）顺序加载 <name>.json，先找到的生效，返回 {name: payload}
```
纪律：每次 rerun 必须 new_attempt；hydrate 顺序写入日志。

### 4. contracts.py — Contract / StageGate
契约 JSON（flow.rtl-basic.json 即示例）：
```json
{"name": "rtl-basic",
 "stages": [{"id": "lint", "tool": "verilator_lint",
             "inputs": {"rtl": "examples/counter/rtl.v"},
             "gate": {"sentinel": true, "allow_rc": [0]},
             "on_fail": "stop"},
            {"id": "sim",  "tool": "iverilog_sim",
             "inputs": {"rtl": "examples/counter/rtl.v", "tb": "examples/counter/tb.v"},
             "gate": {"sentinel": true, "sentinel_extra_markers": ["MISMATCH", "FAIL"],
                      "allow_rc": [0]}, "on_fail": "stop"},
            {"id": "synth","tool": "yosys_synth",
             "inputs": {"rtl": "examples/counter/rtl.v"},
             "gate": {"sentinel": true, "allow_rc": [0]}, "on_fail": "stop"}]}
```
```python
@dataclass
class StageResult:
    stage_id: str; ok: bool; status: str
    # status ∈ {"ok","tool_failed","sentinel_hit","tool_unavailable","timeout","contract_error"}
    run: RunResult | None; report: SentinelReport | None; artifacts: dict[str, str]
class Contract:
    @staticmethod
    def load(path: Path) -> "Contract": ...
    def validate(self) -> list[str]: ...     # 返回问题列表，空=合法
```
失败策略（写死在 gate 逻辑，工具适配器无权放行）：
- returncode 不在 allow_rc → tool_failed，on_fail=stop 则整条流水线停止
- sentinel 命中 → sentinel_hit（即使 rc==0）
- 工具二进制不存在 → tool_unavailable（显式状态，绝不 mock 成功）
- 超时 → timeout

### 5. tools/base.py
```python
class ToolAdapter(ABC):
    name: str
    fatal_markers: list[str] = []
    @abstractmethod
    def available(self) -> bool: ...
    @abstractmethod
    def run(self, runner: SandboxRunner, inputs: dict[str, str],
            workdir: Path) -> StageResult: ...
    # 适配器只负责组装 argv/收集 artifact；gate 判定统一由 pipeline 做（见 cli.py run_flow）
```
verilator_lint: `verilator --lint-only -Wall <rtl>`；iverilog_sim: `iverilog -g2012 -o <out> <rtl> <tb>` 后 `vvp <out>`（两段都算）；yosys_synth: `yosys -p "read_verilog <rtl>; synth; stat"`，解析 stat 里的 cell 数进 artifacts。
stubs.py：工具缺失时返回 StageResult(status="tool_unavailable", ok=False)。

### 6. cli.py — `asbox`
子命令：
- `asbox doctor` — 能力矩阵（bwrap/verilator/iverilog/yosys 是否可用，打印 sandbox_mode）
- `asbox run <contract.json> [--workspace DIR] [--network]` — 跑流水线：RunStore.new_attempt → 逐 stage 执行 → gate → 写 `<tryN>/<stage>.json` 结果 + `run.log`；人类 gate：每个 stage 结束后若 stdout 传了 `--interactive`，提示 [c]ontinue/[s]top/[v]iew log
- `asbox exec -- <cmd...>` — 在沙盒里裸跑单条命令（调试用）
- `asbox runs [--last N]` — 列出历史 attempt 及各 stage 状态
- `asbox tail <try_dir> <stage>` — 打印该 stage 日志尾部 + sentinel 命中行
退出码：流水线全绿 0，否则 1。

### 7. .opencode/ 配置
- opencode.json：声明 agents/skills 路径
- agents/eda-runner.md：subagent 提示词——只允许通过 `python -m sandbox.cli run/exec` 与沙盒交互；
  遵守 SKILL 纪律：每次 rerun 新 try 目录、rc==0 不算数、tool_unavailable 绝不伪造
- commands/run-flow.md：`/run-flow <contract>` 自定义命令说明

### 8. skills/*/SKILL.md（YAML frontmatter: name/description）
- rtl-lint-loop：lint 错误的分类与修复顺序（语法→位宽→隐式 wire→latch）
- rtl-sim-verify：MISMATCH 归因（设计错 vs TB 错的判别步骤）、coverage 意识
- synth-check：读 yosys stat、latch/组合环告警处理
- eda-debug-workflow：通用纪律（隔离现场、首个失败 checkpoint 即停、日志哨兵、禁止假成功）

### 9. tests/smoke.py
纯标准库，覆盖：
1. runner bare/bwrap 两种模式跑 `echo` 成功，timeout 路径返回 124
2. sentinel 对 "rc=0 但日志含 FAILED" 判 dirty
3. RunStore 单调递增 + hydrate 优先级
4. flow.rtl-basic.json validate() 无问题
5. 工具缺失时 stage 状态为 tool_unavailable 且流水线按 on_fail=stop 停止
6. 端到端：有 iverilog 则 examples/counter 全绿；用 rtl_bad.v 跑 lint 必须被判失败（有 verilator 时）
全部 PASS 打印 "SMOKE OK"，否则非零退出。

## 硬性纪律（所有 subagent 必须遵守）
- 零第三方依赖；不联网；注释和文档中文
- 每个模块顶部 docstring 说明职责
- 不实现任何"伪造成功"路径；stub 必须显式 status
- 代码完成后必须 `python tests/smoke.py` 跑通（缺工具的分支也要走到）
