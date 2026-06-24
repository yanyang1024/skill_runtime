# AGENTS.md — Skill Growth Studio / skill_runtime

> 本文件面向 AI 编程 Agent。阅读前默认你不知道该项目背景。所有结论均基于当前目录实际文件内容。

---

## 1. 项目概述

- **项目名称**：`skill_runtime`（Skill Growth Studio v0.3）。
- **项目目标**：构建一个完全本地化的 **OpenCode Headless Runtime Director Console**。核心哲学：
  - **OpenCode 不再是 UI，而是 headless agent runtime**：每个 stage 启动 `opencode serve`，不暴露 Web UI。
  - **Backend 是 Gateway + 隔离层**：负责 workspace 构建、`x-opencode-directory` 请求级隔离、bwrap 进程级隔离、SSE 归一化、生命周期控制、快照/归档。
  - **Frontend 是自建 ChatPage**：在同一单页内渲染 OpenCode 消息流、tool call、permission/question 交互、artifact 面板，不嵌入 iframe、不跳转。
  - **人类导演**：观看 stage 运行、切换阶段、编辑推荐语句、发送 prompt、写 director review。
- **四个动词**：
  - **Observe（观察）**：`observe-log-review` / `observe-api-scan` stage，通过 ChatPage 复盘会话日志与分析 API 文档变化。
  - **Grow（生长）**：`grow-plan`（只读规划）与 `grow-build`（修改 preview）stage；批量修改后进入 `grow-quality-review`。
  - **Rehearse（排练）**：`rehearse-preview`（导演体验）与 `rehearse-iteration`（基于 director review 迭代）stage。
  - **Stabilize（稳定化）**：`stabilize-release` stage 做发布前语义检查；确定性脚本执行 promote / rollback。
- **当前完成度**：v0.3 已完成 headless `opencode serve` per-stage runtime、OpenCode Gateway（`x-opencode-directory` 全方法注入）、自建 ChatPage（React + Vite）、SSE 归一化、bwrap 默认启用、四层路径穿越防护、54 个测试用例全部通过。

---

## 2. 技术栈

| 层级 | 选型 | 说明 |
|---|---|---|
| 运行时 | Node.js 20+ | `package.json` 中 `engines` 未指定，但依赖要求 Node 20+ |
| 包管理器 | `pnpm` | 根目录存在 `pnpm-lock.yaml`，请使用 `pnpm install` |
| 模块系统 | ESM | `package.json` 设置 `"type": "module"`；后端 `tsconfig.json` 使用 `NodeNext` |
| 语言 | TypeScript 5.8+ | 后端源码位于 `app/`，构建输出到 `dist/`；前端源码位于 `app/web/src/` |
| Schema / 类型 | Zod | 所有持久化结构先在 `app/shared/schemas/index.ts` 定义 schema |
| Web 后端 | Express | 提供 REST API、SSE、静态 SPA |
| 前端框架 | React 19 + Vite 6 | 自建 ChatPage，无 iframe |
| Markdown 渲染 | `react-markdown` + `remark-gfm` + `rehype-highlight` | 前端渲染 message / reasoning / artifact |
| 子进程 | `cross-spawn` | 启动 `opencode serve` |
| YAML/JSON | `yaml` | 解析/序列化配置文件和产物 |
| 快照打包 | `tar` (npm) | 生成 `.Grow_backups/stable|preview/<skill>/<UTC>.tar.gz` |
| 测试 | Node 内置 `node:test` + `assert/strict` | 不引入额外重型测试框架 |
| LLM / Runtime | 本地 OpenAI-compatible v1 + OpenCode serve | Prompt Recommender 与 OpenCode 均走 `configs/model-providers/local-v1.yaml` |
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
│   │   │   ├── stages.ts    # /api/runs/:run/stage/:stage/*（启动/停止/重跑/提交/推荐/director-review/API 测试）
│   │   │   ├── chat.ts      # /api/runs/:run/stage/:stage/chat/*（session/message/stream/abort/reply）
│   │   │   ├── artifacts.ts # /api/runs/:run/stage/:stage/artifact/*
│   │   │   └── events.ts    # /api/events SSE 状态流
│   │   ├── middleware/
│   │   │   └── validateParams.ts  # run/stage/skill/attempt 参数校验
│   │   ├── opencode_gateway/
│   │   │   ├── OpenCodeClient.ts  # OpenCode HTTP client（x-opencode-directory 全方法注入）
│   │   │   └── sseNormalizer.ts   # SSE 事件归一化
│   │   ├── runtime/
│   │   │   └── StageRuntimeManager.ts  # opencode serve 生命周期管理
│   │   ├── security/
│   │   │   └── WorkspaceResolver.ts    # 路径消毒、穿越防护、symlink 解析
│   │   └── stageRuntimeManager.ts      # 实际实现（由 runtime/ 重新导出）
│   ├── orchestration/       # 阶段状态机 + run 编排
│   │   ├── stageContracts.ts    # StageRuntimeContract 定义（所有 stage 均为 serve 模式）
│   │   ├── stateMachine.ts      # RunState / StageState 持久化
│   │   ├── runLifecycle.ts      # run / attempt 生命周期
│   │   └── stageTransitions.ts  # 推荐流转规则
│   ├── workspace_builder/   # 构造每个 stage 的 OpenCode 项目 workspace
│   │   ├── builder.ts       # workspace 目录结构与文件复制
│   │   ├── opencodeConfig.ts    # opencode.json 生成（serve 模式，无 cors）
│   │   ├── stageInputs.ts   # input/ 目录准备
│   │   └── bwrap.ts         # bwrap 命令构建（默认启用）
│   ├── opencode_client/     # OpenCode Gateway 底层实现
│   │   ├── index.ts         # createOpencodeSessionClient
│   │   └── sse.ts           # SSE 消费与归一化
│   ├── api_test_runner/     # 确定性 API 测试执行体
│   │   └── runner.ts
│   ├── prompt_recommender/  # v1 LLM 推荐输入语句
│   │   ├── client.ts
│   │   ├── recommender.ts
│   │   └── promptLibrary/
│   ├── snapshot_manager/    # 快照、归档、恢复
│   │   ├── snapshot.ts
│   │   ├── archive.ts
│   │   └── rollback.ts
│   ├── web/                 # v0.3 自建 ChatPage SPA（React + Vite）
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── main.tsx
│   │       ├── App.tsx
│   │       ├── styles.css
│   │       ├── pages/ChatPage.tsx
│   │       ├── components/
│   │       │   ├── StageNavigator.tsx
│   │       │   ├── MessageList.tsx
│   │       │   ├── MessageBubble.tsx
│   │       │   ├── TextPart.tsx
│   │       │   ├── ReasoningBlock.tsx
│   │       │   ├── QuestionCard.tsx
│   │       │   ├── PermissionCard.tsx
│   │       │   ├── ChatInput.tsx
│   │       │   ├── PromptAssistant.tsx
│   │       │   └── ArtifactPanel.tsx
│   │       ├── hooks/
│   │       │   ├── useChatSession.ts
│   │       │   └── useSSE.ts
│   │       ├── services/
│   │       │   ├── api.ts
│   │       │   └── chatApi.ts
│   │       └── types/
│   │           └── chat.ts
│   ├── ui/                  # v0.2 旧版原生 ES Modules SPA（保留兼容，不再使用）
│   ├── workers/             # 旧版四个阶段执行器（保留兼容）
│   └── shared/              # 工具与 schema
│       ├── schemas/index.ts # Zod schema + TypeScript 类型
│       └── utils/           # paths、time、security、fs、snapshot、archive
├── skills/<skill-id>/
├── runs/<run_id>/           # 一次完整生长 run
├── prompt_library/
├── traces/<skill-id>/
├── growth_runs/<skill-id>/
├── experiments/<skill-id>/
├── api_docs/<skill-id>/
├── .Grow_backups/
├── configs/
│   ├── bwrap-profiles/{stage.profile,mounts.yaml}
│   ├── model-providers/local-v1.yaml
│   └── quality-gates/default.yaml
├── tests/
│   ├── schemas.test.ts
│   ├── integration.test.ts
│   ├── v02-lifecycle.test.ts
│   ├── port-function.test.ts
│   ├── security.test.ts     # v0.3 路径安全测试
│   ├── chat-api.test.ts     # v0.3 OpenCode client / SSE 解析测试
│   └── bwrap.test.ts        # v0.3 bwrap 命令测试
├── dist/
│   ├── app/                 # 后端构建输出
│   └── web/                 # 前端构建输出
└── package.json / tsconfig.json / pnpm-lock.yaml
```

---

## 4. 构建与运行命令

> 执行任何命令前请先运行 `pnpm install`。

```bash
# 安装依赖
pnpm install

# 开发模式同时启动后端（Express + tsx watch）与前端（Vite dev server）
pnpm dev
# 后端默认 http://localhost:3000
# 前端 dev server 默认 http://localhost:5173，并代理 /api 到 3000

# 构建（后端 tsc + 前端 vite build）
pnpm build

# 生产启动（使用 dist/ 产物，serve dist/web 下的 React SPA）
pnpm start

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

- `index.ts`：Express 应用根，挂载 API 路由、静态 SPA（自动检测 `dist/web` / `app/web` / `app/ui`）、mock 端点、SIGTERM/SIGINT 清理。
- `routes/skills.ts`：Skill 文件树、内容读取、run 列表、promote/rollback。
- `routes/runs.ts`：创建/列出 run。
- `routes/stages.ts`：Stage 启动/停止/重跑/提交到 preview、Prompt 推荐、director-review、API 测试执行。
- `routes/chat.ts`：ChatPage 使用的 REST/SSE 接口：session、message、stream、abort、question/permission reply。
- `routes/artifacts.ts`：Stage 产物列表与内容读取。
- `routes/events.ts`：SSE `/api/events` 全局状态流。
- `middleware/validateParams.ts`：统一校验 `:runId`、`:stageId`、`:attempt`、`:skillId`、`:name`。
- `opencode_gateway/OpenCodeClient.ts`：封装 OpenCode HTTP 方法，每个请求强制注入 `x-opencode-directory`。
- `opencode_client/sse.ts`：消费 OpenCode `/event` SSE，归一化为前端 `ChatSSEEvent`；`opencode_gateway/sseNormalizer.ts` 重新导出该能力。
- `runtime/StageRuntimeManager.ts`：按 `StageRuntimeContract` 分配端口、构造 workspace、spawn `opencode serve`、readiness 检测、bwrap 隔离、停止清理。
- `security/WorkspaceResolver.ts`：标识符消毒、路径穿越防护、symlink 解析。

### 5.2 OpenCode Gateway `app/opencode_client/`

- `index.ts`：`createOpencodeSessionClient`，使用原生 `fetch`，所有方法带 `x-opencode-directory` header 与 Basic Auth。
- `sse.ts`：SSE 解析、part-type 注册表、delta 缓冲、派生 `session-stream*.md`、通过 `EventEmitter` 派发标准化事件。

### 5.3 编排层 `app/orchestration/`

- `stageContracts.ts`：8 个 stage 的 `StageRuntimeContract`；所有 `runtime_mode` 均为 `"serve"`。
- `stateMachine.ts`、`runLifecycle.ts`、`stageTransitions.ts`：同 v0.2。

### 5.4 Workspace Builder `app/workspace_builder/`

- `builder.ts`：构造 `runs/<run_id>/<stage>/workspace/`，包含 `opencode.json`、`.opencode/skills/<skill>/`、input/output/work 目录。
- `opencodeConfig.ts`：生成 serve 模式 `opencode.json`（无 cors，仅保留 provider/model/permission/agent）。
- `bwrap.ts`：默认启用 bwrap；读取 `configs/bwrap-profiles/stage.profile` 与 `mounts.yaml`。

### 5.5 前端 `app/web/`

- React 19 + Vite 6，自建 ChatPage。
- `App.tsx`：导演台外壳（skill/run 选择、stage 导航、启动/停止/重跑、Prompt Assistant、Artifact Panel）。
- `pages/ChatPage.tsx`：消息列表、QuestionCard、PermissionCard、ChatInput。
- `hooks/useChatSession.ts` + `hooks/useSSE.ts`：session 生命周期、SSE 连接、`requestAnimationFrame` delta 批处理。
- `types/chat.ts`：前端自有的 `ChatMessage`、`MessagePart`、`ChatSSEEvent` 模型；OpenCode raw event 不污染前端。

### 5.6 Worker `app/workers/`（旧版兼容）

保留 v0.1 确定性实现，供 `tests/integration.test.ts` 使用。

### 5.7 共享工具 `app/shared/`

- `utils/security.ts`：四层路径防御 + `safeResolve`（处理 symlink）。

---

## 6. 数据结构与持久化格式

所有持久化结构在 `app/shared/schemas/index.ts` 中用 Zod 定义。

v0.3 新增/变更：

- `OpencodeRuntime.runtime_mode` 固定为 `"serve"`。
- `server.json` 增加 `serve_mode: "per-stage"`。
- 前端运行时类型 `ChatMessage`、`MessagePart`、`ChatSSEEvent` 定义在 `app/web/src/types/chat.ts`（不持久化）。
- 阶段产物仍写入 `runs/<run_id>/<stage>/output/`。

---

## 7. 设计原则与代码约定

### 7.1 硬原则（不可违背）

- **OpenCode 是 headless runtime，不是 UI**：所有 stage 都启动 `opencode serve`，不在 iframe/新标签页中暴露 OpenCode Web。
- **Backend 强制注入 `x-opencode-directory`**：`OpenCodeClient` 的每个 HTTP 方法（create_session、get_messages、send_message、abort、reply_question、reply_permission 等）都必须带 `x-opencode-directory` header。
- **前端只认识自有 API**：ChatPage 调用 `/api/runs/:run/stage/:stage/chat/*`，不直接调用 OpenCode。
- **SSE 归一化**：Backend 将 OpenCode 原始 SSE 转换为 `ChatSSEEvent` 后再推给前端；前端按 `part_id` 增量追加。
- **四层隔离**：
  1. 应用层路径防护（`WorkspaceResolver` / `security.ts`）。
  2. `x-opencode-directory` 请求级 workspace 隔离。
  3. bwrap 进程级 / 文件系统级隔离（默认启用）。
  4. 未来可选 systemd + cgroup 资源级隔离。
- **写 preview 前先 snapshot**：`grow-build`、`rehearse-iteration` 启动前自动 `createPreviewSnapshot`；promote 前自动 `createStableSnapshot`。
- **stable 默认只读**：任何普通 stage 不能直接修改 stable；只有 Stabilize 后的确定性 promote 操作才修改 stable。
- **永不删除，只归档**：所有“删除”必须转换为 `archiveFiles` 移动到 `.archive/<UTC>/`。

### 7.2 OpenCode 配置约定

- 每个 stage workspace 是独立 OpenCode 项目根；启动命令 `opencode serve --hostname 127.0.0.1 --port <port>`。
- provider 默认使用 `local-v1`（OpenAI-compatible），baseURL / model / api_key 来自 `configs/model-providers/local-v1.yaml`。
- 可通过 `SKILL_GROWTH_DEFAULT_MODEL` / `SKILL_GROWTH_SMALL_MODEL` 覆盖默认模型。
- 环境变量：`OPENCODE_CONFIG` 指向 `opencode.json`，`OPENCODE_CONFIG_DIR` 指向 `.opencode/`。

### 7.3 代码风格

- 注释、文档字符串、用户可见文案优先使用中文；代码标识符、API 路由、配置键使用英文。
- 后端使用 ESM `.ts`；前端使用 React `.tsx`。
- 路径约定：所有 skill 相关路径使用相对项目根的 POSIX 路径。
- 类型安全：优先使用 Zod 解析外部输入。

---

## 8. 测试策略

| 层级 | 方式 | 覆盖点 |
|---|---|---|
| 单元测试 | Node test runner | schema 校验、安全工具、bwrap argv、SSE 解析 |
| 旧版集成测试 | 临时目录 + reference_skill | `observe → grow --dry-run → grow --live → promote → rollback` |
| v0.2/v0.3 集成测试 | 临时目录 + reference_skill | run / stage 状态机、workspace 构造 |
| 端口/功能测试 | Node test runner + 真实网络/子进程 | 模型端点、OpenCode serve 端点、应用 API、commit、API test runner |
| 安全测试 | Node test runner | 标识符校验、路径穿越、symlink 逃逸 |
| 前端构建 | Vite | `pnpm build:web` 通过 |

### 8.1 当前测试状态

- `pnpm build` 通过 TypeScript 严格检查 + Vite 生产构建。
- `pnpm test` 54 个用例全部通过（旧版 5 + schema 7 + v0.2 2 + port-function 13 + security 14 + chat-api 6 + bwrap 4），1 个 skip（deepseek）。
- 实际启动 `opencode serve` 的端到端 Stage runtime 测试需要本地已安装 `opencode` CLI 并配置好模型服务。

---

## 9. 配置说明

- `configs/model-providers/local-v1.yaml`：本地 OpenAI-compatible endpoint，用于 Prompt Recommender 与 OpenCode stage runtime。
- `configs/bwrap-profiles/stage.profile`：bwrap 基础隔离参数。
- `configs/bwrap-profiles/mounts.yaml`：按域预配置的只读/可写挂载，包含 skill stable / preview / model-providers / prompt_library / api_docs 等。
- `configs/quality-gates/default.yaml`：Quality Gate 检查清单（参考）。

---

## 10. 安全与运维注意事项

- **不要直接 `rm` 任何 skill 文件**：统一使用 `archiveFiles`。
- **写操作前必须快照**。
- **Stage 隔离**：每个 stage 独立 workspace、独立端口、独立 `opencode serve` 进程；bwrap 默认启用。
- **路径防护**：所有路由参数经 `validateParams` 校验（先 assert 后使用）；artifact / skill file 等文件读取路由最终访问前经 `safeResolve` 校验 symlink。
- **敏感信息**：session log 与 API 响应仅存储本地。
- **回滚**：任意 `.Grow_backups/stable|preview/<skill>/<UTC>.tar.gz` 都可通过 `/api/skills/:id/rollback` 恢复。

---

## 11. 已知限制与后续方向

1. **旧 workers 兼容**：`app/workers/` 下为 v0.1 实现，可逐步移除。
2. **systemd/cgroup**：v0.3 未实现，可作为 v0.4 资源管理增强。
3. **CLI 命令不完整**：`cli/index.ts` 仅实现 `server` 与帮助。
4. **文件附件**：ChatInput 当前仅支持文本；后续可加入 workspace-scoped 文件选择。
5. **Python 环境未启用**：`py312_skill` 预留给日志解析脚本。

---

## 12. 关键文件速查

| 文件 | 作用 |
|---|---|
| `README.md` | 用户部署、使用、配置文档 |
| `package.json` | 依赖、脚本、ESM 入口 |
| `tsconfig.json` | 后端 TypeScript 严格配置 |
| `app/web/tsconfig.json` | 前端 TypeScript 配置 |
| `app/web/vite.config.ts` | Vite 构建与开发代理配置 |
| `app/shared/schemas/index.ts` | 所有 Zod schema 与类型 |
| `app/shared/utils/security.ts` | 路径安全工具 |
| `app/server/index.ts` | Express 服务入口 |
| `app/server/routes/chat.ts` | ChatPage REST/SSE 接口 |
| `app/server/routes/events.ts` | 全局 SSE + artifact_changed 推送 |
| `app/server/artifactWatcher.ts` | stage output 目录变化监听 |
| `app/server/stageRuntimeManager.ts` | OpenCode serve 生命周期管理 |
| `app/opencode_client/index.ts` | 强制 `x-opencode-directory` 的 OpenCode client |
| `app/opencode_client/sse.ts` | OpenCode raw SSE → ChatSSEEvent 归一化 |
| `app/web/src/App.tsx` | 导演台 React 应用 |
| `app/web/src/pages/ChatPage.tsx` | 聊天主页面 |
| `app/web/src/hooks/useSSE.ts` | SSE 流式更新与批处理 |
| `app/web/src/components/ArtifactPanel.tsx` | 产物面板（支持实时刷新） |
| `tests/security.test.ts` | 路径安全测试（含路由级 symlink） |
| `tests/chat-api.test.ts` | OpenCode client 与 SSE 归一化测试 |
| `tests/bwrap.test.ts` | bwrap 按域挂载测试 |
| `tests/artifact-watcher.test.ts` | ArtifactWatcher 测试 |
