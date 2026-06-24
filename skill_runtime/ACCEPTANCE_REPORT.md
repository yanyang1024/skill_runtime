# Skill Growth Studio v0.3 验收报告

> 构建完成时间：2026-06-23
> 测试 Skill：`reference_skill/tech-doc-didactic-rewriter`
> 版本主题：Headless OpenCode Runtime + 自建 ChatPage Director Console

---

## 1. 项目结构

```
skill_runtime/
├── app/
│   ├── cli/                 # skill-growth CLI 入口
│   ├── server/              # Express 控制平面（REST + SSE + Chat Gateway）
│   │   ├── index.ts         # 服务入口、静态 SPA 自动检测
│   │   ├── routes/
│   │   │   ├── skills.ts
│   │   │   ├── runs.ts
│   │   │   ├── stages.ts
│   │   │   ├── chat.ts      # v0.3 ChatPage REST/SSE 接口
│   │   │   ├── artifacts.ts
│   │   │   └── events.ts
│   │   ├── middleware/validateParams.ts
│   │   ├── opencode_gateway/
│   │   │   ├── OpenCodeClient.ts
│   │   │   └── sseNormalizer.ts
│   │   ├── runtime/
│   │   │   └── StageRuntimeManager.ts
│   │   └── security/
│   │       └── WorkspaceResolver.ts
│   ├── opencode_client/     # OpenCode HTTP client + SSE 归一化实现
│   │   ├── index.ts
│   │   └── sse.ts
│   ├── orchestration/       # 阶段状态机 + run 编排
│   ├── workspace_builder/   # stage workspace 构造 + bwrap
│   ├── api_test_runner/
│   ├── prompt_recommender/
│   ├── web/                 # v0.3 React ChatPage SPA
│   ├── ui/                  # v0.2 旧版原生 SPA（保留兼容）
│   ├── workers/             # 旧版四个阶段执行器（保留兼容）
│   └── shared/              # Zod schemas、路径、安全工具
├── skills/tech-doc-didactic-rewriter/stable/
├── runs/<run_id>/
├── prompt_library/
├── traces/、growth_runs/、experiments/、api_docs/
├── .Grow_backups/
├── configs/
├── tests/
│   ├── schemas.test.ts
│   ├── integration.test.ts
│   ├── v02-lifecycle.test.ts
│   ├── port-function.test.ts
│   ├── security.test.ts     # v0.3
│   ├── chat-api.test.ts     # v0.3
│   └── bwrap.test.ts        # v0.3
├── dist/
│   ├── app/                 # 后端构建输出
│   └── web/                 # 前端构建输出
└── package.json / tsconfig.json / app/web/tsconfig.json / pnpm-lock.yaml
```

---

## 2. 已完成功能对照表

| 目标 | 状态 | 关键文件 |
|---|---|---|
| 项目脚手架、TypeScript、依赖 | ✅ | `package.json`, `tsconfig.json`, `app/web/tsconfig.json`, `app/web/vite.config.ts` |
| 核心数据结构（Zod schemas） | ✅ | `app/shared/schemas/index.ts` |
| 所有 stage 改为 headless `opencode serve` | ✅ | `app/orchestration/stageContracts.ts`, `app/server/stageRuntimeManager.ts` |
| OpenCode Gateway：所有 HTTP 方法强制 `x-opencode-directory` | ✅ | `app/opencode_client/index.ts`, `app/server/opencode_gateway/OpenCodeClient.ts` |
| SSE 归一化：OpenCode raw → ChatSSEEvent | ✅ | `app/opencode_client/sse.ts`, `app/server/opencode_gateway/sseNormalizer.ts` |
| 自建 ChatPage（React + Vite） | ✅ | `app/web/src/` |
| Stage 导航 / Prompt Assistant / Artifact Panel | ✅ | `app/web/src/App.tsx`, `app/web/src/components/` |
| 实时 message / reasoning / tool / permission / question 渲染 | ✅ | `app/web/src/pages/ChatPage.tsx`, `app/web/src/hooks/useSSE.ts` |
| `requestAnimationFrame` SSE delta 批处理 | ✅ | `app/web/src/hooks/useSSE.ts` |
| abort session（关闭 SSE + abort + 拒绝 pending questions + 删除 session） | ✅ | `app/web/src/hooks/useChatSession.ts`, `app/server/stageRuntimeManager.ts` |
| 四层路径穿越防护 + symlink 解析 | ✅ | `app/shared/utils/security.ts`, `app/server/security/WorkspaceResolver.ts`, `app/server/middleware/validateParams.ts` |
| bwrap 默认启用 + 按域预配置只读挂载 | ✅ | `app/workspace_builder/bwrap.ts`, `configs/bwrap-profiles/` |
| Stage 参数校验中间件 | ✅ | `app/server/middleware/validateParams.ts` |
| 旧版 Observe / Grow / Stabilize 兼容 | ✅ | `app/workers/` |
| promote / rollback 安全归档 | ✅ | `app/server/routes/skills.ts`, `app/snapshot_manager/` |
| 安全 / 聊天 / bwrap 测试 | ✅ | `tests/security.test.ts`, `tests/chat-api.test.ts`, `tests/bwrap.test.ts` |

---

## 3. 运行方式

### 安装依赖

```bash
pnpm install
```

### 开发模式

```bash
pnpm dev
# 同时启动后端 http://localhost:3000 与前端 dev server http://localhost:5173
```

### 生产模式

```bash
pnpm build
pnpm start
# 访问 http://localhost:3000，serve dist/web 下的 React ChatPage
```

### CLI

```bash
pnpm cli server
pnpm cli
```

### 运行测试与构建

```bash
pnpm test
pnpm build
```

---

## 4. 测试结果

```
▶ bwrap: default enable
  ✔ returns true by default
  ✔ can be disabled via env
▶ bwrap: command generation
  ✔ includes bwrap and workspace bind
  ✔ rejects workspace outside repo
▶ opencode client: x-opencode-directory header
  ✔ sends x-opencode-directory on createSession
  ✔ sends x-opencode-directory on abortSession
  ✔ sends x-opencode-directory on replyQuestion
  ✔ sends x-opencode-directory on replyPermission
▶ chatApi: SSE event parsing
  ✔ parses text_delta
  ✔ returns null for invalid json
▶ integration: skill lifecycle
  ✔ runs observe and creates a trace
  ✔ runs grow dry-run and creates a plan
  ✔ runs grow live and produces a passing preview
  ✔ promotes preview to stable and creates a release
  ✔ rolls back to a previous snapshot
▶ model endpoints
  ✔ glm4:9b responds
  ✔ qwen3.5:9b responds
  - deepseek-v4-pro responds (SKIP)
▶ opencode server
  ✔ /global/health is healthy
  ✔ can create a session
  ✔ can get session details
  ✔ can send an async prompt
▶ skill-growth app api
  ✔ /api/health returns ok
  ✔ can create a run
  ✔ can get run state
  ✔ recommend-prompt returns structured suggestion
  ✔ can commit work/ to preview
  ✔ can run api-tests and produce machine-test-result.json
▶ schemas
  ✔ validates a minimal RuntimeTrace
  ✔ rejects a RuntimeTrace missing required fields
  ✔ validates a dry-run plan
  ✔ validates snapshot and archive manifests
  ✔ validates endpoint manifest
  ✔ validates quality report
▶ validates new v0.2 schemas
  ✔ creates a run and persists run-state.yaml
  ✔ creates stage state on start endpoint request (without opencode)
▶ security: identifier validation
  ✔ accepts valid skill id
  ✔ rejects skill id with uppercase
  ✔ rejects skill id with dots
  ✔ rejects empty identifier
  ✔ rejects invalid stage id
▶ security: path component sanitization
  ✔ replaces path separators
  ✔ removes double dots
  ✔ removes illegal chars
  ✔ truncates long components
  ✔ falls back to unknown for empty input
▶ security: resolveContainedPath
  ✔ resolves simple relative path
  ✔ rejects empty path
  ✔ rejects absolute path
  ✔ rejects dot-dot escape
  ✔ rejects dot-dot inside path that escapes
  ✔ allows harmless dot segments
▶ security: safeResolve with symlinks
  ✔ rejects symlink escape
  ✔ resolves normal file
▶ v0.2 run / stage lifecycle
  ✔ creates a run and persists run-state.yaml
  ✔ creates stage state on start endpoint request (without opencode)

ℹ tests 55
ℹ suites 14
ℹ pass 54
ℹ fail 0
ℹ cancelled 0
ℹ skipped 1
```

`pnpm build` 通过 TypeScript 严格检查 + Vite 生产构建。

---

## 5. 手动验证记录

- 浏览器访问 `http://localhost:3000` 加载 React ChatPage：顶部 Skill / Run 选择、左侧 Stage Navigator、中间 ChatPage、右侧 Prompt Assistant、底部 Artifacts。
- 启动任意 stage 后，后端启动 `opencode serve`（headless）并校验 `/global/health`、`/provider`、`/config`。
- ChatPage 调用 `/api/runs/:run/stage/:stage/chat/session` 创建 session，随后通过 `/chat/session/:id/message` 发送 prompt。
- SSE 连接 `/chat/events?session_id=...` 接收归一化事件：`text_delta` / `reasoning_delta` / `tool_start` / `permission_request` / `question` / `session.idle`。
- 停止 Stage 时，后端先 abort 并删除活跃 session、取消 SSE reader、停止 `opencode serve` 进程。
- `grow-build` / `rehearse-iteration` 停止或提交时，`workspace/work/` 产物同步回 preview skill，被删除文件归档到 `.archive/`。
- `/api/skills/tech-doc-didactic-rewriter/promote` 先做 stable 快照，再把旧 stable 归档到 releases 与 `.archive/`，最后把 preview 提升为 stable。
- `/api/skills/tech-doc-didactic-rewriter/rollback` 可从快照恢复，并先归档当前 skill 目录。

---

## 6. 已知限制与后续建议

1. **systemd/cgroup**：v0.3 未实现，可作为后续资源管理增强。
2. **ArtifactWatcher**：ArtifactPanel 当前为手动刷新；后续可加入 `fs.watch` 实时推送 `artifact_changed` SSE。
3. **文件附件**：ChatInput 当前仅支持文本；后续可加入 workspace-scoped 文件选择。
4. **旧 workers 兼容**：`app/workers/` 下为 v0.1 实现，可逐步移除。
5. **CLI 命令**：`cli/index.ts` 当前主要封装 `server` 子命令，后续可补齐 `run`、`stage`、`promote`、`rollback` 等 CLI 入口。
6. **前端测试**：当前仅验证构建；后续可加入组件级测试。

---

## 7. 核心设计原则落实情况

- ✅ OpenCode 不再是 UI，而是 headless agent runtime；所有 stage 均启动 `opencode serve`。
- ✅ Backend 是 Gateway，所有 OpenCode 请求强制带 `x-opencode-directory`。
- ✅ Frontend 是自建 ChatPage，自己渲染消息流、tool、permission、question、artifact。
- ✅ SSE 归一化：Backend 将 OpenCode raw event 转换为自有协议。
- ✅ 请求级 + 进程级 + 应用级多层隔离。
- ✅ bwrap 默认启用，stage runtime 只能读写允许路径。
- ✅ Stage 写操作前先对 preview / stable 打快照。
- ✅ 永不删除，只归档：删除操作统一转换为 `archiveFiles` 移动到 `.archive/<UTC>/`。
