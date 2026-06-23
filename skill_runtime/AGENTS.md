# AGENTS.md — Skill Growth Studio / skill_runtime

> 本文件面向 AI 编程 Agent。阅读前默认你不知道该项目背景。所有结论均基于当前目录实际文件内容。

---

## 1. 项目概述

- **项目名称**：`skill_runtime`（Skill Growth Studio v0.2）。
- **项目目标**：构建一个完全本地化的 **基于多 OpenCode Web Runtime 的 Skill 生命周期导演台**。核心哲学：
  - **确定性层**（应用代码）：搭舞台。负责 workspace 构建、opencode.json/.opencode/ 生成、端口分配、server 生命周期、bwrap 隔离、快照/归档、日志收集、UI 展示。
  - **灵活层**（OpenCode Web Runtime）：在舞台里工作。负责分析、判断、规划、修改、复查、API 理解、skill 迭代。
  - **人类层**（导演）：观看、暂停、编辑推荐语句、在 OpenCode Web 中体验、写一段直观 director review。
  - **Prompt Recommender**（本地 v1 LLM）：根据阶段上下文推荐下一句输入语句，不替代 OpenCode 工作。
- **四个动词**：
  - **Observe（观察）**：启动 Observe-Log Review / Observe-API Scan 两个 OpenCode Web Runtime，分别复盘会话日志与分析 API 文档变化。
  - **Grow（生长）**：启动 Grow-Plan（只读规划）和 Grow-Build（动手修改 preview）两个 OpenCode Web Runtime；批量修改后启动 Quality Review。
  - **Rehearse（排练）**：启动 Rehearse-Preview（导演体验）和 Rehearse-Iteration（基于 director review 迭代）两个 OpenCode Web Runtime，循环直到满意。
  - **Stabilize（稳定化）**：启动 Stabilize-Release Review OpenCode Web Runtime 做发布前语义检查；确定性脚本执行 promote / rollback。
- **当前完成度**：v0.2 已完成 Stage Runtime 基础设施、Prompt Recommender、多屏导演台 UI、八类 stage 的 workspace 与 contract、promote/rollback 路由；保留旧 workers 作为兼容性实现；测试 14 个用例全部通过。

---

## 2. 技术栈

| 层级 | 选型 | 说明 |
|---|---|---|
| 运行时 | Node.js 20+ | `package.json` 中 `engines` 未指定，但依赖要求 Node 20+ |
| 包管理器 | `pnpm` | 根目录存在 `pnpm-lock.yaml`，请使用 `pnpm install` |
| 模块系统 | ESM | `package.json` 设置 `"type": "module"`；`tsconfig.json` 使用 `NodeNext` |
| 语言 | TypeScript 5.8+ | 源码位于 `app/`，构建输出到 `dist/` |
| Schema / 类型 | Zod | 所有持久化结构先在 `app/shared/schemas/index.ts` 定义 schema |
| Web 后端 | Express | 提供 REST API、SSE、静态 SPA、OpenCode Web UI 反向代理 |
| Markdown 渲染 | `marked` | 前端渲染 `SKILL.md`、replay card、proposal 等 |
| 子进程 | `cross-spawn` | 启动 `opencode web` / `opencode serve` |
| YAML/JSON | `yaml` | 解析/序列化配置文件和产物 |
| 快照打包 | `tar` (npm) | 生成 `.Grow_backups/stable|preview/<skill>/<UTC>.tar.gz` |
| 反向代理 | `http-proxy-middleware` / `fetch` | 用于阶段 Web UI 代理到同源路径 |
| 测试 | Node 内置 `node:test` + `assert/strict` | 不引入额外重型测试框架 |
| LLM / Runtime | 本地 OpenAI-compatible v1 + OpenCode Web | Prompt Recommender 与 OpenCode 均走 `http://172.24.16.1:11434/v1`，模型 `glm4:9b` |
| Python 环境 | `py312_skill/` | 已创建 Python 3.12 虚拟环境，预留给日志解析/trace 规范化脚本 |

---

## 3. 目录结构

```
skill_runtime/
├── app/
│   ├── cli/                 # skill-growth CLI 入口
│   │   └── index.ts         # 当前仅实现 server/help
│   ├── server/              # Express 控制平面
│   │   ├── index.ts         # 服务入口，挂载路由、静态资源、mock API
│   │   ├── routes/
│   │   │   ├── skills.ts    # /api/skills/*（tree、file、runs、promote、rollback）
│   │   │   ├── runs.ts      # /api/runs/*（创建/列出 run）
│   │   │   ├── stages.ts    # /api/runs/:run/stage/:stage/*（启动/停止/消息/推荐/产物/OpenCode UI）
│   │   │   ├── artifacts.ts # /api/runs/:run/stage/:stage/artifact/*
│   │   │   └── events.ts    # /api/events SSE 状态流
│   │   └── stageRuntimeManager.ts # 多 stage opencode web runtime 管理
│   ├── orchestration/       # 阶段状态机 + run 编排
│   │   ├── stageContracts.ts    # StageRuntimeContract 定义
│   │   ├── stateMachine.ts      # RunState / StageState 持久化
│   │   ├── runLifecycle.ts      # run / attempt 生命周期
│   │   └── stageTransitions.ts  # 推荐流转规则
│   ├── workspace_builder/   # 构造每个 stage 的 OpenCode 项目 workspace
│   │   ├── builder.ts       # workspace 目录结构与文件复制
│   │   ├── opencodeConfig.ts    # opencode.json 生成
│   │   ├── stageInputs.ts   # input/ 目录准备
│   │   └── bwrap.ts         # bwrap 命令构建（可选启用）
│   ├── api_test_runner/     # 确定性 API 测试执行体
│   │   └── runner.ts        # 执行 OpenCode 生成的测试脚本，生成 machine-test-result.json
│   ├── prompt_recommender/  # v1 LLM 推荐输入语句
│   │   ├── client.ts        # 本地 v1 chat/completions 客户端
│   │   ├── recommender.ts   # 基于 stage digest + prompt library 生成推荐
│   │   └── promptLibrary/   # 各阶段常用语句库（与 prompt_library/ 同步）
│   ├── snapshot_manager/    # 快照、归档、恢复
│   │   ├── snapshot.ts      # stable / preview 快照
│   │   ├── archive.ts       # 归档文件
│   │   └── rollback.ts      # 从快照恢复
│   ├── log_collector/       # 收集 session/tool/script log
│   │   └── collector.ts
│   ├── ui/                  # 多屏导演台 SPA
│   │   ├── index.html
│   │   ├── app.js
│   │   ├── styles.css
│   │   └── services/api.js  # 前端 API 封装
│   ├── workers/             # 旧版四个阶段执行器（保留兼容）
│   │   ├── observe/index.ts
│   │   ├── grow/{dryRun.ts,live.ts}
│   │   ├── quality/index.ts
│   │   ├── api/{scan.ts,test.ts}
│   │   └── stabilize/{promote.ts,rollback.ts}
│   └── shared/              # 工具与 schema
│       ├── schemas/index.ts # Zod schema + TypeScript 类型
│       └── utils/           # paths、time、fs、snapshot(legacy)、archive(legacy)、growthRun
├── skills/<skill-id>/
│   ├── stable/              # 只读稳定版
│   ├── previews/<preview_id>/# 可写 preview
│   ├── releases/            # Stabilize promote 后的旧 stable 归档
│   └── .archive/            # 废弃文件归档目录（只移不删）
├── runs/<run_id>/           # 一次完整生长 run
│   ├── run-state.yaml
│   ├── stage-digest.md
│   ├── observe-log-review/
│   ├── observe-api-scan/
│   ├── grow-plan/
│   ├── grow-build/attempts/
│   ├── grow-quality-review/attempts/
│   ├── rehearse-preview/
│   ├── rehearse-iteration/attempts/
│   └── stabilize-release/
├── prompt_library/          # 8 个阶段常用语句库
├── traces/<skill-id>/       # raw_sessions、replay cards、normalized trace
├── growth_runs/<skill-id>/  # 旧版 Observe/Grow 产物（兼容）
├── experiments/<skill-id>/  # Rehearse 临时工作目录（兼容）
├── api_docs/<skill-id>/     # raw API 文档、normalized、endpoint_tests
├── .Grow_backups/
│   ├── stable/<skill_id>/<UTC>.tar.gz
│   └── preview/<skill_id>/<preview_id>/<UTC>.tar.gz
├── configs/
│   ├── bwrap-profiles/stage.profile
│   ├── model-providers/{sglang.yaml,local-v1.yaml}
│   ├── opencode-templates/stage-opencode.json
│   └── quality-gates/default.yaml
├── tests/
│   ├── schemas.test.ts      # Zod schema 校验（含 v0.2 新 schema）
│   ├── integration.test.ts  # 旧版 observe → dry-run → live → promote → rollback
│   └── v02-lifecycle.test.ts# v0.2 run / stage 状态机集成测试
├── scripts/                 # 开发辅助脚本
├── dist/                    # TypeScript 构建输出
└── package.json / tsconfig.json / pnpm-lock.yaml
```

---

## 4. 构建与运行命令

> 执行任何命令前请先运行 `pnpm install`。

```bash
# 安装依赖
pnpm install

# 开发模式启动 Web UI（Express + tsx watch）
pnpm dev
# 等价于：tsx watch app/server/index.ts
# 默认监听 http://localhost:3000

# 构建 TypeScript 到 dist/
pnpm build
# 等价于：tsc

# 生产启动（使用 dist/ 产物）
pnpm start
# 等价于：node dist/app/server/index.js

# CLI（当前仅 server 子命令完整实现）
pnpm cli server          # 启动 Web UI
pnpm cli                 # 查看帮助

# 测试
pnpm test
# 等价于：tsx --test tests/**/*.test.ts
```

---

## 5. 代码组织与主要模块

### 5.1 控制平面 `app/server/`

- `index.ts`：Express 应用根，挂载 API 路由、静态 SPA、mock 端点、SIGTERM/SIGINT 清理。
- `routes/skills.ts`：Skill 文件树、内容读取、run 列表、promote/rollback。
- `routes/runs.ts`：创建/列出 run。
- `routes/stages.ts`：Stage 启动/停止/重跑/提交到 preview、消息发送、Prompt 推荐、director-review、API 测试执行、OpenCode Web UI 代理/打开。
- `routes/artifacts.ts`：Stage 产物列表与内容读取。
- `routes/events.ts`：SSE `/api/events` 全局状态流。
- `stageRuntimeManager.ts`：按 `StageRuntimeContract` 分配端口、构造 workspace、spawn `opencode web`、分层 readiness 检测、bwrap 隔离、停止清理。

### 5.2 编排层 `app/orchestration/`

- `stageContracts.ts`：集中定义 8 个 stage 的 `StageRuntimeContract`（runtime_mode、skill_mount、work_writable、snapshot 要求、human_role 等）。
- `stateMachine.ts`：`RunState` / `StageState` / `StageTransition` 的持久化与读取。
- `runLifecycle.ts`：创建 run、计算 attempt、初始化 stage state、刷新产物列表。
- `stageTransitions.ts`：推荐 stage 流转与 carry_outputs 规则。

### 5.3 Workspace Builder `app/workspace_builder/`

- `builder.ts`：构造 `runs/<run_id>/<stage>/workspace/`，包含 `opencode.json`、`.opencode/skills/<skill>/`、input/output/work 目录；提供 `syncWorkToPreview` 将 `work/` 产物写回 preview skill。
- `opencodeConfig.ts`：生成 stage 级 `opencode.json`（local-v1/deepseek provider、permission、agent 权限覆盖）。
- `stageInputs.ts`：复制 session_log、api_docs、previous_stage_output、director-review 到 input/。
- `bwrap.ts`：构建可选的 bwrap 隔离命令。

### 5.4 API Test Runner `app/api_test_runner/`

- `runner.ts`：扫描 `output/api-tests/` 下的 `.py/.sh/.js` 脚本，在 stage workspace 中执行，收集 stdout/stderr/exit code，生成 `machine-test-result.json`。

### 5.5 Prompt Recommender `app/prompt_recommender/`

- `client.ts`：本地 v1 `chat/completions` 客户端。
- `recommender.ts`：读取 `prompt_library/<stage>.md`、stage-digest.md、director-review.md，生成主推荐/备选/理由/风险。

### 5.6 Snapshot Manager `app/snapshot_manager/`

- `snapshot.ts`：`createStableSnapshot` / `createPreviewSnapshot`。
- `archive.ts`：`archiveFiles`（只移不删）。
- `rollback.ts`：根据 snapshot_id 查找 manifest 并恢复。

### 5.7 前端 `app/ui/`

- 无框架原生 ES Modules + 手写 CSS。
- `app.js`：多屏导演台主逻辑：skill/run 选择、stage 导航、启动 stage、打开 OpenCode Web、提交到 Preview、Prompt Assistant、Artifacts 面板、SSE 监听。
- `services/api.js`：前端 API 调用封装。

### 5.8 Worker `app/workers/`（旧版兼容）

| Worker | 文件 | 职责 |
|---|---|---|
| Observe | `observe/index.ts` | 从 `stable/evals/evals.json` 提取 Runtime Trace |
| Grow dry-run | `grow/dryRun.ts` | 基于 Trace 生成 Dry-run Plan 与 Growth Proposal |
| Grow live | `grow/live.ts` | 快照 → 复制 stable 到 preview → 应用 planned_operations → Quality Gate |
| Quality Gate | `quality/index.ts` | frontmatter、references、正向引导、归档安全等基础检查 |
| API scan | `api/scan.ts` | 解析 `api_docs/<skill>/raw/*.md` |
| API test | `api/test.ts` | existence/schema 测试 |
| Stabilize promote | `stabilize/promote.ts` | preview 提升为 stable |
| Stabilize rollback | `stabilize/rollback.ts` | 从快照恢复 |

### 5.9 共享工具 `app/shared/`

- `schemas/index.ts`：Zod schema 与导出类型（RunState、StageState、OpencodeRuntime、StageRuntimeContract、PromptRecommendResponse、DirectorReview、StageTransition、RuntimeTrace、SnapshotManifest、ArchiveManifest、EndpointManifest 等）。
- `utils/paths.ts`：所有 skill / run / stage 相关目录的绝对路径计算。
- `utils/time.ts`：UTC 时间戳与文件名安全时间戳。
- `utils/growthRun.ts`：创建 `growth_runs` 目录并写入 JSON/YAML/Markdown。
- `utils/fs.ts`：目录复制/删除/读取辅助。

---

## 6. 数据结构与持久化格式

所有持久化结构在 `app/shared/schemas/index.ts` 中用 Zod 定义，并导出 TypeScript 类型。

v0.2 新增核心结构：

- `RunState`：`runs/<run_id>/run-state.yaml`
- `StageState`：`runs/<run_id>/<stage>/stage-state.yaml`
- `StageRuntimeContract`：`app/orchestration/stageContracts.ts`
- `StageTransition`：`runs/<run_id>/transitions.yaml`
- `OpencodeRuntime`：`runs/<run_id>/<stage>/server.json`
- `DirectorReview`：`runs/<run_id>/<stage>/output/director-review.md`
- `PromptRecommendResponse`：运行时内存结构
- `SnapshotManifest`：`.Grow_backups/stable|preview/<skill>/<UTC>.manifest.yaml`
- `ArchiveManifest`：`skills/<skill>/.archive/<UTC>/archive-manifest.yaml`

阶段产物（Markdown，灵活非结构化）：

- `output/replay-card.md`
- `output/growth-opportunities.md`
- `output/growth-plan.md`
- `output/patch-notes.md`
- `output/quality-review.md`
- `output/director-review.md`
- `output/iteration-plan.md`
- `output/release-review.md`
- `output/changelog-draft.md`
- `output/machine-test-result.json`（observe-api-scan 的确定性测试报告）

新增持久化结构时，必须先在 `app/shared/schemas/index.ts` 中定义 schema 并更新本文件。

---

## 7. 设计原则与代码约定

### 7.1 硬原则（不可违背）

- **确定性层搭舞台，OpenCode 灵活工作**：应用代码只负责环境、文件、隔离、快照、日志、端口、server 生命周期；分析/判断/规划/修改/复查交给 OpenCode runtime。
- **Prompt Recommender 只推荐不修改**：它只生成下一句输入语句，真正修改 skill 的是 OpenCode runtime 里的 agent。
- **Stage Runtime Contract 集中描述**：每个 stage 的规则（runtime_mode、skill_mount、work_writable、是否需要 snapshot、human_role）写在 `stageContracts.ts`，不散落在代码中。
- **写 preview 前先 snapshot**：`grow-build`、`rehearse-iteration` 启动前自动 `createPreviewSnapshot`；promote 前自动 `createStableSnapshot`。
- **stable 默认只读**：任何普通 stage 不能直接修改 stable；只有 Stabilize 后的确定性 promote 操作才修改 stable。
- **rehearse-preview 不改 preview skill**：preview skill 只读挂载，work/ 仅用于临时体验文件。
- **永不删除，只归档**：所有“删除”必须转换为 `archiveFiles` 移动到 `.archive/<UTC>/`。
- **新 API 端点先测试再入 skill**：endpoint 状态 `candidate → verified → active`；未 active 不得被 SKILL.md 引用。
- **写操作 API 端点仅允许 dry-run / sandbox / mock**：第一版不直接调用生产写接口。

### 7.2 OpenCode 配置约定

- 每个 stage workspace 是独立 OpenCode 项目根：根目录有 `opencode.json`，`.opencode/` 下存放 `skills/<skill>/`、`agents/`、`commands/`、`plugins/`、`tools/`。
- 启动命令使用 `opencode web`（v0.2-MVP 统一用 web 模式），cwd 指向 workspace。
- provider 默认使用 `local-v1`（OpenAI-compatible），baseURL `http://172.24.16.1:11434/v1`，包含 `glm4:9b` / `qwen3.5:9b`；若设置 `DEEPSEEK_API_KEY`，则同时注入 `deepseek` provider（`deepseek-v4-pro`）。
- 可通过 `SKILL_GROWTH_DEFAULT_MODEL` / `SKILL_GROWTH_SMALL_MODEL` 覆盖默认模型，例如 `deepseek/deepseek-v4-pro`。
- 自定义 provider 可放在 `configs/model-providers/custom.yaml`（或通过 `SKILL_GROWTH_PROVIDERS_CONFIG` 指向其他文件），启动时会合并到 opencode.json；详见 `README.md` 与 `.env.example`。
- 全局 `permission.edit` 默认 `ask`；`build` / `iteration` agent 覆盖为 `allow`；`rm` / `git push` 默认 `deny`。
- 环境变量：`OPENCODE_CONFIG` 指向 `opencode.json`，`OPENCODE_CONFIG_DIR` 指向 `.opencode/`，`OPENCODE_CONFIG_CONTENT` 仅用于少量 runtime override。

### 7.3 代码风格

- **语言**：注释、文档字符串、用户可见文案优先使用中文；代码标识符、API 路由、配置键使用英文。
- **模块**：使用 ESM；源码文件使用 `.ts`，前端使用 `.js`。
- **文件命名**：
  - 配置/数据文件：kebab-case（`dry-run-plan.yaml`、`stage-digest.md`）。
  - 源码文件：camelCase 或 PascalCase（`stageRuntimeManager.ts`、`opencodeConfig.ts`）。
- **路径约定**：所有 skill 相关路径使用相对项目根的 POSIX 路径；时间戳使用 UTC ISO-8601，文件名中 `:` 替换为 `-`。
- **类型安全**：优先使用 Zod 解析外部输入，再生成 TypeScript 类型。
- **错误处理**：Worker 中对外部文件/网络操作使用 `try/catch`；核心编排可逐步引入 `effect`。

---

## 8. 测试策略

| 层级 | 方式 | 覆盖点 |
|---|---|---|
| 单元测试 | Node test runner | schema 校验（`tests/schemas.test.ts`） |
| 旧版集成测试 | 临时目录 + reference_skill | `observe → grow --dry-run → grow --live → quality → promote → rollback` 全流程（`tests/integration.test.ts`） |
| v0.2 集成测试 | 临时目录 + reference_skill | run / stage 状态机、workspace 构造（`tests/v02-lifecycle.test.ts`） |
| 隔离测试 | 独立 workspace + `opencode web` | Stage runtime 启动/停止/OpenCode UI 打开（需本地 `opencode` CLI 与 glm4:9b 服务） |
| 回归测试 | snapshot restore | rollback 后目录与快照一致 |
| UI 测试 | 手动 + 内置接口 | Stage Navigator、Prompt Assistant、Artifacts 面板 |
| 端口/功能测试 | Node test runner + 真实网络/子进程 | 模型端点、OpenCode server 端点、应用 API、commit、API test runner（`tests/port-function.test.ts`） |

### 8.1 当前测试状态

- `pnpm build` 通过 TypeScript 严格检查。
- `pnpm test` 27 个用例全部通过（旧版 5 + schema 7 + v0.2 2 + port-function 13）。
- `tests/port-function.test.ts` 已验证 glm4:9b、qwen3.5:9b、deepseek-v4-pro（若可达）、OpenCode serve 健康/会话/异步 prompt、以及应用 API 的 run/recommend/commit/run-api-tests。
- 实际启动 `opencode web` 的端到端 Stage runtime 测试需要本地已安装 `opencode` CLI 并配置好模型服务，暂未纳入自动化。

---

## 9. 配置说明

- `configs/model-providers/local-v1.yaml`：本地 OpenAI-compatible v1 endpoint 配置，用于 Prompt Recommender 与 OpenCode stage runtime。
- `configs/model-providers/sglang.yaml`：保留的旧版 SGLang 配置模板。
- `configs/opencode-templates/stage-opencode.json`：生成 stage workspace `opencode.json` 的模板（含 permission / agent 权限）。
- `configs/quality-gates/default.yaml`：Quality Gate 检查清单（参考）。
- `configs/bwrap-profiles/stage.profile`：通用 bwrap 隔离配置，默认不启用，通过 `STAGE_USE_BWRAP=1` 开启。

---

## 10. 安全与运维注意事项

- **不要直接 `rm` 任何 skill 文件**：统一使用 `archiveFiles`。
- **写操作前必须快照**：preview 写前 `createPreviewSnapshot`；stable 写前 `createStableSnapshot`。
- **Stage 隔离**：每个 stage 有独立 workspace、独立端口、独立 `.opencode/`；可选 bwrap 双层隔离；停止后清理子进程。
- **权限双层控制**：OpenCode `permission` 机制 + bwrap 只读绑定；不要只靠 prompt 约束行为。
- **敏感信息**：session log 与 API 响应仅存储本地，不上传云端。
- **回滚**：任意 `.Grow_backups/stable|preview/<skill>/<UTC>.tar.gz` 都可通过 `/api/skills/:id/rollback` 恢复。

---

## 11. 已知限制与后续方向

1. **旧 workers 兼容**：`app/workers/` 下为 v0.1 实现，后续将逐步迁移到 OpenCode runtime 模式，或移除。
2. **bwrap 隔离**：配置文件已存在但默认不启用；后续可通过 `STAGE_USE_BWRAP=1` 强制启用并验证。
3. **CLI 命令不完整**：`cli/index.ts` 仅实现 `server` 与帮助，其他命令提示开发中。
4. **真实 session log 解析**：`traces/raw_sessions/` 的解析当前用 eval prompt 模拟，未接入真实 OpenCode session log。
5. **API scan/test**：OpenCode + deterministic test runner 骨架已实现，可通过 `/api/runs/:run/stage/:stage/run-api-tests` 触发；复杂场景仍需更多测试脚本模板。
6. **前端无框架**：当前为原生 JS，适合 v0.2；后续可按需迁移到 React/Vue。
7. **Python 环境未启用**：`py312_skill` 未安装任何包，预留给日志解析脚本。
8. **OpenCode serve 降级**：v0.2-MVP 统一用 `opencode web`；后续可把 quality-review / stabilize-release 等无需人观看的阶段降级为 `opencode serve`。

---

## 12. 关键文件速查

| 文件 | 作用 |
|---|---|
| `README.md` | 用户部署、使用、配置文档 |
| `.env.example` | 环境变量示例 |
| `package.json` | 依赖、脚本、ESM 入口 |
| `tsconfig.json` | TypeScript 严格配置，输出到 `dist/` |
| `app/shared/schemas/index.ts` | 所有 Zod schema 与类型 |
| `app/server/index.ts` | Express 服务入口 |
| `app/server/stageRuntimeManager.ts` | OpenCode stage runtime 生命周期管理 |
| `app/orchestration/stageContracts.ts` | 八阶段 StageRuntimeContract |
| `app/workspace_builder/builder.ts` | stage workspace 构造 |
| `app/api_test_runner/runner.ts` | 确定性 API 测试执行 |
| `app/prompt_recommender/recommender.ts` | Prompt Recommender |
| `app/snapshot_manager/snapshot.ts` | stable / preview 快照 |
| `prompt_library/*.md` | 各阶段常用语句库 |
| `tests/schemas.test.ts` | schema 校验 |
| `tests/v02-lifecycle.test.ts` | v0.2 run/stage 集成测试 |
| `tests/port-function.test.ts` | 模型/OpenCode/应用端口与功能测试 |
| `reference_skill/tech-doc-didactic-rewriter/` | 测试用 skill 基线 |
