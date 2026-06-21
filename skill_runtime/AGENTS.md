# AGENTS.md — Skill Growth Studio / skill_runtime

> 本文件面向 AI 编程 Agent。阅读前默认你不知道该项目背景。所有结论均基于当前目录实际文件内容，不做过度推测。

---

## 1. 项目概述

- **项目名称**：`skill_runtime`（开发代号为 Skill Growth Studio v0.1）。
- **当前阶段**：设计文档已就绪，源码尚未开始编写，仅完成了依赖安装和最小化 Node.js 项目初始化。
- **项目目标**：基于 OpenCode / OpenCode Web 运行时，构建一个完全本地化的 **Skill 生命周期管理应用**。核心围绕四个动词：
  - **Observe（观察）**：从会话日志、工具日志、脚本日志、用户反馈中复盘运行轨迹，生成 Runtime Trace、Runtime Replay Card 与生长机会。
  - **Grow（生长）**：克制地生成 Growth Proposal 与 dry-run 计划，默认只输出方案不改文件；一键确认后执行 live run，应用修改、归档旧文件、自动跑 Quality Gate。
  - **Rehearse（排练）**：在隔离临时目录中启动 preview OpenCode server，让用户作为导演体验 preview skill 并记录反馈。
  - **Stabilize（稳定化）**：快照、归档、打包、生成 changelog，将排练通过的 preview 提升为 stable。
- **技术栈方向**：
  - 运行时/隔离：OpenCode / OpenCode Web + `bwrap` + 临时目录 + 独立 `OPENCODE_CONFIG_DIR`。
  - LLM：本地 SGLang 部署的 Qwen3.6-27B，通过 OpenAI v1 兼容 API 接入。
  - 后端语言：Node.js（TypeScript / CommonJS 混合，视具体模块而定）。
  - 关键依赖：`@opencode-ai/plugin`、`@opencode-ai/sdk`、`@different-ai/opencode-browser`、`effect`、`zod`、`cross-spawn`、`yaml`。
  - 脚本/数据处理：Python 3.12（已创建 `py312_skill` 虚拟环境，目前仅含 `pip`，未安装任何包）。
  - 存储：本地文件系统，使用 JSONL / YAML / Markdown。
- **关键设计约束（第一版）**：
  - 不在分析中间停顿提问，先完成全量分析再输出方案。
  - Growth Proposal 输出后支持“一键确认”模式。
  - Grow 默认 `--dry-run`，确认后才 `--live`。
  - 每次正式维护前必须对整个 `skills/<skill>/` 目录打 `tar.gz` 快照，存放到 `.Grow_backups/<skill>/<UTC_TIMESTAMP>.tar.gz`。
  - **永不删除，只归档**：所有“删除”操作必须转换为移动到 `.archive/<UTC_TIMESTAMP>/`。
  - 批量编辑后自动触发 Quality Gate 交叉一致性检查。
  - 新增 API 端点必须从 API 文档检查 → 基础测试 → `endpoint_manifest.yaml` candidate → tool wrapper → preview skill → stabilize 的完整流程。

---

## 2. 目录结构现状

当前项目根目录如下（已排除 `node_modules` 与 `py312_skill`）：

```
skill_runtime/
├── package.json              # Node 项目入口配置
├── package-lock.json         # npm 依赖锁定
├── py312_skill/              # Python 3.12 虚拟环境（目前只有 pip）
├── ori_need.txt              # 原始需求：开源本地化、四个动词、设计原则
├── plan.txt                  # 详细设计方案：架构、数据结构、命令、UI、实施优先级
├── history.txt               # 与上述设计相关的对话/思考记录
└── AGENTS.md                 # 本文件
```

**注意**：
- `app/`、`skills/`、`traces/`、`growth_runs/`、`experiments/`、`api_docs/`、`.Grow_backups/`、`configs/` 等目录尚未创建，均只在 `plan.txt` 中定义。
- `ori_need.txt`、`plan.txt`、`history.txt` 是中文设计文档，是当前理解项目意图的最权威来源。

设计文档中建议的最终目录结构（节选）：

```
skill-growth-studio/
├── app/
│   ├── server/               # 控制平面后端
│   ├── ui/                   # 极简 Web UI / CLI
│   ├── cli/                  # CLI 入口
│   └── workers/              # Observe / Grow / Rehearse / Stabilize 任务
├── skills/<skill-id>/
│   ├── stable/               # 当前稳定版 SKILL.md、references、tools、agents 等
│   ├── previews/             # 候选 preview 版本
│   ├── releases/             # 历史稳定发布版本
│   └── .archive/             # 归档目录（只移不删）
├── traces/<skill-id>/
│   ├── raw_sessions/         # 原始会话日志
│   ├── raw_tool_logs/        # 工具日志
│   ├── raw_script_logs/      # 脚本日志
│   ├── normalized/           # 标准化 Runtime Trace
│   ├── replay_cards/         # Runtime Replay Card
│   └── director_notes/       # 导演反馈
├── growth_runs/<skill-id>/
│   └── run-XXXX/             # 单次 Observe/Grow 完整产物
├── experiments/<skill-id>/
│   └── rehearse-XXXX/        # 隔离排练目录
├── api_docs/<skill-id>/
│   ├── raw/                  # 原始 API 文档
│   ├── normalized/           # 规范化 API 文档
│   ├── endpoint_tests/       # 端点基础测试
│   └── api_requirements/     # API 缺口需求文档
├── .Grow_backups/<skill-id>/ # tar.gz 快照
└── configs/
    ├── model-providers/
    ├── bwrap-profiles/
    ├── opencode-templates/
    └── quality-gates/
```

---

## 3. 技术栈与依赖

### 3.1 Node.js 依赖（`package.json`）

```json
{
  "name": "skill_runtime",
  "version": "1.0.0",
  "type": "commonjs",
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "dependencies": {
    "@different-ai/opencode-browser": "^4.6.1",
    "@opencode-ai/plugin": "^1.15.1"
  }
}
```

### 3.2 已安装的关键依赖说明

- `@opencode-ai/plugin` (v1.15.1)：OpenCode 插件 SDK，TypeScript ESM 模块，依赖 `effect` 与 `zod`。
- `@opencode-ai/sdk` (v1.15.1)：OpenCode 客户端/服务端 SDK，提供 `client`、`server`、`v2` 等子导出。
- `@different-ai/opencode-browser` (v4.6.1)：OpenCode 浏览器自动化插件，含 CLI `opencode-browser`。
- `effect` (v4.0.0-beta.65)：TypeScript 函数式标准库，用于错误处理、并发、可观测性。
- `zod` (v4.1.8)：Schema 校验与类型推断。
- `cross-spawn` (v7.0.6)：跨平台子进程 spawn。
- `yaml` (v2.9.0)：YAML 解析/序列化。
- `toml` (v4.1.1)：TOML 解析。
- `playwright-core` (v1.61.0)：浏览器自动化核心（由 opencode-browser 间接引入）。
- `uuid`、`msgpackr`、`fast-check` 等：辅助库。

### 3.3 Python 环境

- 虚拟环境路径：`py312_skill/`
- Python 版本：3.12.13
- 当前未安装任何第三方包，仅有 `pip 25.0.1`。
- 计划用途：日志解析、trace 标准化、数据格式转换等数据处理脚本。

---

## 4. 构建与运行命令

> 当前项目没有实际源码，因此以下命令基于 `package.json` 和 `plan.txt` 中的设计意图整理。

### 4.1 Node.js 项目

```bash
# 安装依赖（已执行过）
npm install

# 当前 test 脚本未实现
npm test
# 输出：Error: no test specified
```

### 4.2 设计中计划提供的 CLI（尚未实现）

```bash
# Observe：读取日志生成 Runtime Replay Card
skill-growth observe --skill <skill-id> --session latest

# Grow dry-run：生成 Growth Proposal，不改文件
skill-growth grow --skill <skill-id> --trace latest --dry-run

# Grow live：一键确认后执行，先打快照
skill-growth grow --skill <skill-id> --proposal latest --live

# API 文档扫描
skill-growth api-scan --skill <skill-id> --docs api_docs/<skill-id>/raw/

# API 端点测试
skill-growth api-test --skill <skill-id> --endpoint <endpoint-id>

# Rehearse：启动 preview OpenCode server
skill-growth rehearse --skill <skill-id> --preview latest

# Quality Gate
skill-growth quality --skill <skill-id> --preview latest

# Stabilize
skill-growth stabilize --skill <skill-id> --preview latest --promote

# 回滚
skill-growth restore --snapshot <snapshot-id>
```

### 4.3 Python 虚拟环境激活

```bash
source py312_skill/bin/activate
python --version   # 3.12.13
```

---

## 5. 代码组织建议（基于设计文档）

在后续实现时，建议按以下模块划分：

- `app/server/`：控制平面 API，编排 Observe / Grow / Rehearse / Stabilize 四个阶段。
- `app/cli/`：命令行入口，封装 `skill-growth` 命令。
- `app/workers/`：各阶段具体执行器：
  - `observe/`：Runtime Trace Normalizer、Background Reviewer、Replay Card Builder、Growth Opportunity Miner。
  - `grow/`：Growth Curator、Dry-run Planner、Archive Planner、Snapshot Manager、API Endpoint Curator、Quality Gate Runner。
  - `rehearse/`：Preview Skill Builder、Temp Workspace Manager、OpenCode Server Launcher、Director Feedback Collector。
  - `stabilize/`：Promote Manager、Release Packager、Changelog Generator、Archive Manager、Rollback Manager。
- `configs/`：模型提供商配置、bwrap 隔离配置、OpenCode 模板、Quality Gate 规则。

---

## 6. 代码风格指南

- **语言**：设计文档与需求文档均为中文，因此注释、文档字符串、用户可见文案建议优先使用中文；代码标识符、API 路由、配置键仍使用英文。
- **Node.js 模块**：`package.json` 当前 `"type": "commonjs"`。由于 `@opencode-ai/plugin` 和 `@opencode-ai/sdk` 均为 ESM，CLI/Worker 代码若直接引用它们需使用 `.mjs` 扩展名或动态 `import()`，或在顶层包改为 `"type": "module"` 后统一使用 ESM。
- **Schema 优先**：所有持久化数据结构（Runtime Trace、Dry-run Plan、Archive/Snapshot Manifest、Endpoint Manifest）建议先用 `zod` 定义 schema，再生成 TypeScript 类型。
- **错误处理**：推荐使用 `effect` 编写核心编排逻辑；简单脚本可用常规 `try/catch`。
- **文件命名**：
  - 配置/数据文件使用 kebab-case：`dry-run-plan.yaml`、`endpoint-manifest.yaml`。
  - 源码文件使用 camelCase 或 PascalCase：`runtimeTrace.ts`、`qualityGateRunner.ts`。
- **路径约定**：所有 skill 相关路径使用相对项目根的 POSIX 路径；快照/归档时间戳使用 UTC ISO-8601（文件名中可用 `2026-06-21T08-30-12Z` 格式替换 `:`）。
- **不可变数据**：Runtime Trace、Replay Card、Growth Proposal 等分析产物一旦生成就不要再修改，后续迭代新建 run。

---

## 7. 测试策略

- **当前状态**：`npm test` 尚未配置，无任何测试文件。
- **单元测试**：建议为核心模块（trace normalizer、dry-run planner、quality gate checks、archive planner）添加测试。
- **集成测试**：
  - 使用临时目录 + 独立 `OPENCODE_CONFIG_DIR` 启动 OpenCode 实例，验证 Rehearse 流程。
  - 使用只读 API endpoint 验证 API 文档扫描 → 基础测试 → manifest 更新流程。
- **Quality Gate 作为测试**：批量编辑后必须自动运行的检查项包括：
  - Skill 文件检查：SKILL.md frontmatter、禁止式规则、正向替代路径。
  - 文件一致性：引用文件存在性、agent 配置是否过时、tool registry 与实际工具一致性。
  - API 检查：未 active endpoint 引用、新端点是否有基础测试、manifest 与 API 文档对齐。
  - 归档检查：是否存在 delete 操作、archive manifest 是否生成。
  - 体验检查：是否违背“不在中间停顿提问”、是否支持一键确认。
- **端到端测试**：建议通过 `skill-growth grow --dry-run` 生成完整 plan 并校验输出文件，而不实际改动 stable 目录。

---

## 8. 安全与运维注意事项

- **永不删除，只归档**：任何 Grow / Stabilize 操作不得直接 `rm` 文件，必须移动到 `.archive/<UTC_TIMESTAMP>/` 并生成 archive manifest。
- **快照优先**：`grow --live`、`stabilize --promote`、archive operation、release packaging 等写操作前，必须先将整个 `skills/<skill>/` 目录打包为 `.Grow_backups/<skill>/<UTC_TIMESTAMP>.tar.gz`。
- **生产写操作限制**：第一版对写操作 API 端点只允许 dry-run / sandbox / mock，禁止直接调用生产写接口。
- **隔离**：Rehearse 与 Quality Gate runtime 必须通过 `bwrap` + 临时目录 + 独立 `OPENCODE_CONFIG_DIR` 与 stable runtime 隔离。
- **模型调用**：仅使用本地 SGLang 提供的 OpenAI v1 兼容 API，不调用外部在线服务。
- **敏感信息**：session log 与 API 响应中可能包含业务数据，存储在本地文件系统，不上传云端。
- **回滚**：所有快照都应能通过 `skill-growth restore --snapshot <snapshot-id>` 恢复。

---

## 9. 设计文档索引

- `ori_need.txt`：用户原始需求，包含四个动词定义、工作模式、API 端点流程等。
- `plan.txt`：详细设计方案，包含：
  - 四个动词的生命周期含义
  - 总体架构（控制平面 + 多个 OpenCode runtime）
  - 推荐目录结构
  - Runtime Trace / Replay Card / Dry-run Plan / Growth Proposal 等数据格式
  - API Endpoint Lifecycle 与基础测试类型
  - Quality Gate 检查项
  - Rehearse / Stabilize 流程
  - CLI 命令设计
  - UI 结构
  - 第一版最小实现优先级（Phase 1-6）
- `history.txt`：更早一轮的设计思考，包含对 OpenCode 配置隔离、多 runtime 等内容的讨论。

---

## 10. 给 Agent 的最低行动清单

当你开始为本项目添加代码时，请按以下顺序：

1. 通读 `ori_need.txt` 与 `plan.txt`，确认当前要实现的 Phase（建议从 Phase 1：数据结构定义开始）。
2. 明确本次改动是否涉及写文件：若涉及，先实现快照 + 归档机制；若不涉及，dry-run 优先。
3. 新增持久化数据结构时，先用 `zod` 定义 schema 并同步更新到 `AGENTS.md` 的“数据结构”小节。
4. 批量 edit 后，自动触发 Quality Gate；不要把手动触发留给用户。
5. 不在分析中间停顿提问；先生成全量分析或 Growth Proposal，再请求一键确认。
6. 不要直接删除任何已有文件；所有删除都转为 archive。
7. 修改 `AGENTS.md` 中与本项目架构/约定相关的内容时，确保与 `plan.txt` 保持一致。
