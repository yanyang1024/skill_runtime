# Skill Growth Studio 系统架构文档

> v0.3 完整技术架构文档。面向需要理解、扩展或部署此系统的开发者。

---

## 目录

1. [系统概述](#1-系统概述)
2. [架构总览](#2-架构总览)
3. [数据流](#3-数据流)
4. [核心组件深潜](#4-核心组件深潜)
5. [前端架构](#5-前端架构)
6. [安全模型](#6-安全模型)
7. [配置系统](#7-配置系统)
8. [开发指南](#8-开发指南)
9. [部署指南](#9-部署指南)
10. [测试策略](#10-测试策略)

---

## 1. 系统概述

### 1.1 设计哲学

Skill Growth Studio (skill_runtime) 是一个**完全本地化的 OpenCode Headless Runtime Director Console**。

核心哲学：
- **OpenCode 是 headless agent runtime，不是 UI** — 所有 stage 启动 `opencode serve`，不暴露 Web UI
- **Backend 是 Gateway + 隔离层** — 负责 workspace 构建、`x-opencode-directory` 请求级隔离、bwrap 进程级隔离、SSE 归一化、生命周期控制、快照/归档
- **Frontend 是自建 ChatPage** — 在同一单页内渲染 OpenCode 消息流、tool call、permission/question 交互、artifact 面板
- **人类导演** — 观看 stage 运行、切换阶段、编辑推荐语句、发送 prompt、写 director review

### 1.2 四个动词

```
Observe ──► Grow ──► Rehearse ──► Stabilize
  │           │          │             │
  ├─ log-review  ├─ plan   ├─ preview    └─ release
  └─ api-scan    ├─ build  └─ iteration
                 └─ quality-review
```

| 动词 | 阶段 | 核心行为 |
|---|---|---|
| **Observe** | `observe-log-review` | 复盘会话日志，生成 replay-card 与增长机会 |
| | `observe-api-scan` | 扫描 API 文档变化，生成 diff 与测试计划 |
| **Grow** | `grow-plan` | 生成只读增长计划 |
| | `grow-build` | 在隔离 preview workspace 中修改 Skill |
| | `grow-quality-review` | Quality Gate 审查 |
| **Rehearse** | `rehearse-preview` | 导演体验 preview Skill |
| | `rehearse-iteration` | 基于 director-review 迭代 |
| **Stabilize** | `stabilize-release` | 发布前语义检查 + promote |

### 1.3 技术栈

| 层级 | 选型 | 版本 |
|---|---|---|
| 运行时 | Node.js | 20+ |
| 包管理器 | pnpm | — |
| 模块系统 | ESM | `"type": "module"` |
| 语言 | TypeScript | 5.8+ |
| Web 后端 | Express | 4.21 |
| 前端框架 | React + Vite | 19 + 6 |
| Schema 校验 | Zod | 4.1 |
| 配置解析 | yaml | 2.9 |
| 子进程管理 | cross-spawn | 7 |
| 快照打包 | tar | 7.4 |
| 沙箱 | bubblewrap (bwrap) | — |
| 测试 | Node test runner + assert/strict | — |
| Markdown 渲染 | react-markdown + remark-gfm + rehype-highlight | — |

---

## 2. 架构总览

### 2.1 组件图

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Browser (React SPA)                           │
│                                                                         │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  ┌──────────────┐  │
│  │ StageNavigator│  │  ChatPage   │  │PromptAssistant│ │ArtifactPanel │  │
│  │ (8 stages)  │  │  (messages,  │  │ (LLM推荐输入) │ │ (实时产物)   │  │
│  │             │  │   questions, │  │              │  │              │  │
│  │             │  │   permissions)│  │              │  │              │  │
│  └─────────────┘  └──────┬───────┘  └──────┬──────┘  └──────┬───────┘  │
│                          │                 │                │           │
│                    useChatSession    SSE (EventSource)  apiGet/apiPost   │
└──────────────────────────┼─────────────────┼────────────────┼───────────┘
                           │ REST + SSE      │                │
┌──────────────────────────┼─────────────────┼────────────────┼───────────┐
│               Express Control Plane (Node.js)                           │
│                                                                         │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌──────────┐ │
│  │ /api/runs │ │/api/stages│ │ /api/chat │ │/api/events│ │/api/skills│ │
│  │  router   │ │  router   │ │  router   │ │  router   │ │  router   │ │
│  └─────┬─────┘ └─────┬─────┘ └─────┬─────┘ └─────┬─────┘ └─────┬────┘ │
│        │             │             │             │             │       │
│  ┌─────┴─────────────┴─────────────┴─────────────┴─────────────┴────┐  │
│  │                      Core Services                                │  │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐  │  │
│  │  │StageRuntimeManager│  │  OpenCode Gateway│  │ArtifactWatcher │  │  │
│  │  │ (生命周期管理)     │  │  (HTTP client +  │  │ (output 监听)  │  │  │
│  │  │                  │  │   SSE normalizer) │  │                │  │  │
│  │  └──────────────────┘  └──────────────────┘  └────────────────┘  │  │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐  │  │
│  │  │ Prompt Recommender│  │  Snapshot Manager│  │ Workspace Resolver│ │  │
│  │  │ (LLM 推荐输入)    │  │  (快照/归档/回滚) │  │ (路径安全)      │  │  │
│  │  └──────────────────┘  └──────────────────┘  └────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │ HTTP (Basic Auth + x-opencode-directory)
                                   ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                    opencode serve (per-stage process)                     │
│                                                                          │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────────────┐  │
│  │  Workspace       │  │  bwrap Sandbox   │  │  Model Providers       │  │
│  │  opencode.json   │  │  --unshare-all   │  │  local-v1 (Ollama)     │  │
│  │  .opencode/...   │  │  --ro-bind ...   │  │  deepseek (optional)   │  │
│  │  input/ output/  │  │  --bind ...      │  └────────────────────────┘  │
│  └──────────────────┘  └──────────────────┘                              │
└──────────────────────────────────────────────────────────────────────────┘
```

### 2.2 进程模型

每个 stage 启动一个独立的 `opencode serve` 子进程：

- **端口分配**：从 9500 起递增，通过 TCP socket 检测空闲
- **进程隔离**：独立的 cwd、env、stdout/stderr
- **bwrap 隔离**：默认通过 bwrap 启动，提供文件系统级隔离
- **生命周期**：Express 服务通过 `cross-spawn` 管理子进程，SIGTERM/SIGINT 时清理所有 runtime

```typescript
// RunningStage — 进程追踪结构
interface RunningStage {
  server_id: string;
  port: number;
  workspace_path: string;
  process: ChildProcess;
  status: "starting" | "running" | "stopped" | "error";
  active_session_id?: string;
  abort_event_stream?: () => Promise<void>;
  unwatch_output?: () => void;
}
```

### 2.3 端口布局

| 端口范围 | 用途 |
|---|---|
| 3000 | Express 控制平面（可配置） |
| 5173 | Vite dev server（开发模式） |
| 9500+ | opencode serve stage runtime（动态分配） |

---

## 3. 数据流

### 3.1 Chat 会话完整数据流

```
用户输入 "请分析 session log"
  │
  ▼
ChatInput.sendMessage()
  │ createSession (if not exists)
  │ sendMessage API call
  ▼
POST /api/runs/:run/stage/:stage/chat/session/:id/message
  │
  ├─► 1. ensureEventStream()  ← 先启动 SSE consumer
  │     │  GET /event to OpenCode
  │     │  读取 ReadableStream
  │     │  逐行解析 SSE (data: {...})
  │     │  写入 session-stream*.md
  │     │  normalizeOpenCodeEvent()
  │     │  EventEmitter.emit("event", chatEvent)
  │     │
  ├─► 2. POST /session/:id/prompt_async  ← 然后发送 prompt
  │     Header: x-opencode-directory
  │     Body: { parts: [{ type: "text", text: "..." }] }
  │
  └─► 3. GET /events?session_id= SSE endpoint
        监听 EventEmitter
        res.write(`data: ${JSON.stringify(chatEvent)}\n\n`)
        推送给前端

前端 useSSE hook
  │ EventSource 接收
  │
  ├─ delta event (text_delta, reasoning_delta, tool_delta)
  │    → pendingDeltasRef 累积
  │    → requestAnimationFrame 批量 flush
  │    → 追加到对应 MessagePart.content
  │
  └─ non-delta event (message_start, part_start, tool_start, ...)
       → applyEvent() 立即更新 ChatMessage 数组
       → React re-render
```

### 3.2 Stage 生命周期数据流

```
POST /start
  │
  ├─► check: requires_snapshot_before_start?
  │     → createPreviewSnapshot() 或 createStableSnapshot()
  │
  ├─► initStage() → stage-state.yaml (status: pending)
  │
  ├─► allocatePort()
  │
  ├─► buildStageWorkspace()
  │     ├─ buildOpencodeConfig() → opencode.json
  │     ├─ mkdir workspace/, input/, output/, work/
  │     ├─ copy skill snapshot → .opencode/skills/<skill>/
  │     ├─ prepareStageInputs() → input/session_log/, input/api_docs/
  │     └─ write server.json
  │
  ├─► buildBwrapCommand() (if STAGE_USE_BWRAP != 0)
  │
  ├─► spawn(openCode serve, { cwd, env })
  │
  ├─► waitForHealth()
  │     ├─ GET /global/health (poll 500ms, timeout 30s)
  │     ├─ GET /provider
  │     └─ GET /config
  │
  ├─► start ArtifactWatcher → emit artifact_changed events
  │
  └─► updateStageState(status: "running")

POST /stop
  │
  ├─► abortEventStream() → 取消活跃 SSE 消费
  ├─► abortSession() + deleteSession()
  ├─► unwatchStageOutput()
  ├─► syncWorkToPreview() (if preview-writable)
  ├─► SIGTERM (5s 后 SIGKILL 兜底)
  └─► updateStageState(status: "completed")
```

### 3.3 快照与归档流程

```
Pre-write Snapshot:
  stage.start()
    → createPreviewSnapshot(skillId, previewId, trigger, sourceRun)
      → tar.create({ gzip: true }, "skills/<skill>/previews/<p>/")
      → write .Grow_backups/preview/<skill>/<p>/<UTC>.tar.gz
      → write .Grow_backups/preview/<skill>/<p>/<UTC>.manifest.yaml

Promote:
  POST /api/skills/:id/promote
    → createStableSnapshot(skillId, trigger, sourceRun)
    → archiveFiles(old stable → .archive/<UTC>/)
    → copy preview → stable
    → bumpVersion() → CHANGELOG.md

Rollback:
  POST /api/skills/:id/rollback
    → findSnapshotManifest(skillId, snapshotId)
    → archiveFiles(current stable → .archive/<UTC>/)
    → restoreSnapshot(manifest)
```

---

## 4. 核心组件深潜

### 4.1 Express 路由层 (`app/server/routes/`)

#### 4.1.1 skills.ts

- **`validateSkillParams`** 中间件：校验 `:skillId` 格式 `[a-z0-9-]+`
- `GET /:skillId/tree`：递归构建文件树（跳过 `.` 开头的文件/目录）
- `GET /:skillId/file/*`：`safeResolve()` 校验后读取文件内容
- `GET /:skillId/runs`：扫描 `runs/` 目录，过滤 `skill_id` 匹配的 run
- `POST /:skillId/promote`：preview → stable（快照 → 归档 → 复制 → CHANGELOG）
- `POST /:skillId/rollback`：从 snapshot manifest 恢复

#### 4.1.2 runs.ts

- `POST /`：创建 run（生成 `run-<ISO>` ID，创建 `run-state.yaml`）
- `GET /:runId`：读取 run 状态
- `GET /`：扫描 `runs/` 列出所有 run

#### 4.1.3 stages.ts

- **`validateRunStageParams`** 中间件：校验 `:runId`、`:stageId`
- `POST /start`：启动 stage（快照检查 → workspace 构建 → bwrap → spawn → health check → artifact watch）
- `POST /stop`：停止 stage（abort SSE → abort/delete session → unwatch → sync work → SIGTERM）
- `POST /retry`：找到下一 attempt 编号并重启
- `POST /commit`：`syncWorkToPreview()` — work/ 同步到 preview
- `GET /state`：读取 stage state（支持 `?attempt=` 查询）
- `POST /director-review`：写入 `output/director-review.md`
- `POST /recommend-prompt`：调用 prompt recommender
- `POST /run-api-tests`：执行 API 测试脚本

#### 4.1.4 chat.ts

- **`mergeParams: true`** — 支持嵌套路由参数
- `POST /session` → `createOpencodeSessionClient().createSession()`
- `GET /session/:id` → `client.getSession()`
- `DELETE /session/:id` → `client.deleteSession()` + 清理 SSE emitter
- `POST /session/:id/message` → 先 `ensureEventStream()` 再 `client.sendPromptAsync()`
- `GET /session/:id/message` → `client.getMessages()`
- `POST /session/:id/abort` → `abortEventStream()` + `client.abortSession()`
- `POST /session/:id/question/:qid` → `client.replyQuestion()`
- `POST /session/:id/permission/:pid` → `client.replyPermission()`
- `GET /events` → SSE 端点，监听 `EventEmitter` 推送归一化事件

#### 4.1.5 artifacts.ts

- `GET /artifacts`：读取 `output/` 目录文件列表（含 size、mtime）
- `GET /artifact/:name`：`safeResolve()` 校验后读取文件内容

#### 4.1.6 events.ts

- 全局 SSE `/api/events` 端点
- 事件类型：`status`（全局状态消息）、`artifact_changed`（output 变化通知）
- 通过 `EventEmitter.setMaxListeners(0)` 支持无限监听器

### 4.2 编排层 (`app/orchestration/`)

```
stageContracts.ts          stateMachine.ts
      │                          │
      │ StageRuntimeContract     │ load/save/create RunState
      │ (8 stages defined)       │ load/save/create StageState
      │                          │ appendStageTransitionForRun
      │                          │
      ▼                          ▼
runLifecycle.ts           stageTransitions.ts
      │                          │
      │ generateRunId()          │ RECOMMENDED_TRANSITIONS
      │ createRun()              │ (15 predefined paths)
      │ findNextAttempt()        │ getRecommendedNextStages()
      │ initStage()              │ getDefaultPreviousStage()
      │ markStageStatus()
      │ syncWorkToPreview()
      │
      ▼
  YAML files in runs/<runId>/
    ├── run-state.yaml
    ├── transitions.yaml
    └── <stageId>/attempts/<attempt>/stage-state.yaml
```

**关键设计：**

- `RunState`：`run_id`、`skill_id`、`preview_id`、`current_stage`、`status`（idle/running/waiting_director/completed/failed）、时间戳
- `StageState`：`stage_id`、`run_id`、`status`（pending/running/waiting_input/completed/failed）、`attempt`、`server_id`、`workspace_path`、`outputs`、`digest_path`
- `StageRuntimeContract`：每个阶段定义 `runtime_mode`（固定 `"serve"`）、`agent_role`、`skill_mount_type`、`work_writable`、`requires_snapshot`、`requires_quality`、`expected_outputs`、`human_role`

### 4.3 Workspace Builder (`app/workspace_builder/`)

#### builder.ts — `buildStageWorkspace(opts)`

```
1. mkdir: workspace/ input/ output/ work/
2. buildOpencodeConfig() → write opencode.json
3. mkdir .opencode/skills/<skill_id>/
4. determine skill version (stable or preview)
5. copy skill → .opencode/skills/<skill_id>/
6. copy skill snapshot → input/skill_snapshot/
7. copy previous stage outputs → input/ (if specified)
8. copy skill → work/ (if work_writable)
9. write server.json (serve_mode: "per-stage")
10. write stage-digest.md
```

#### opencodeConfig.ts — provider 配置生成

- 加载 `configs/model-providers/local-v1.yaml`
- 可选合并 `configs/model-providers/custom.yaml`（通过 `SKILL_GROWTH_PROVIDERS_CONFIG` 环境变量）
- 模型选择优先级：`SKILL_GROWTH_DEFAULT_MODEL` env → custom.yaml → local-v1.yaml 默认
- 如果 `DEEPSEEK_API_KEY` 设置，注入 `deepseek` provider
- Server 配置：port + `127.0.0.1` hostname（不设 CORS）
- 权限：编辑默认 `ask`，bash 白名单 `ls`/`cat`/`grep` `allow`，`rm`/`git push` `deny`
- Agent 覆盖：`build`/`iteration` agent 权限 `edit: allow`

#### bwrap.ts — 沙箱命令构建

- `shouldUseBwrap()`：`STAGE_USE_BWRAP != "0"`（默认启用）
- `buildBwrapCommand()`：
  1. 验证 workspace 在 `REPO_ROOT` 内
  2. 读取 `configs/bwrap-profiles/stage.profile` 与 `mounts.yaml`
  3. 展开模板变量（`{{REPO_ROOT}}`、`{{WORKSPACE_DIR}}` 等）
  4. 添加只读挂载（REPO_ROOT、node_modules、skill stable、model-providers、prompt_library、api_docs）
  5. 添加可写挂载（workspace、output、work）
  6. Preview 动态挂载（`--bind` 或 `--ro-bind` 取决于 `skill_mount` 合同）

### 4.4 OpenCode Gateway (`app/opencode_client/`)

#### index.ts — HTTP 客户端

```typescript
function createOpencodeSessionClient({ workspacePath, baseUrl, auth }) {
  const headers = {
    "Authorization": `Basic ${base64(user:pass)}`,
    "Content-Type": "application/json",
    "x-opencode-directory": encodeURIComponent(workspacePath)
  };

  return {
    createSession, getSession, deleteSession,
    getMessages, sendPromptAsync, abortSession,
    replyQuestion, replyPermission, streamEvents
  };
}
```

**关键设计决策：使用原生 `fetch` 而非 `@opencode-ai/sdk`**
- SDK 会将 `x-opencode-directory` header 改写为 query 参数，破坏了隔离性
- 原生 fetch 完全控制 header 注入

#### sse.ts — SSE 归一化

核心函数 `normalizeOpenCodeEvent(eventType, props, state)`：

```typescript
// 事件映射
switch (eventType) {
  case "message.created":
    return { type: "message_start", message_id, role: "assistant" };
  case "message.part.created":
    return { type: "part_start", message_id, part_id, part_type };
  case "message.part.delta":
    // 根据 state.partTypes[part_id] 决定 type:
    //   "reasoning" → type: "reasoning_delta"
    //   "text"      → type: "text_delta"
    //   其他        → 暂存 pendingDeltas，等 part_start 后 flush
  case "tool.start":  return { type: "tool_start", ... };
  case "tool.delta":  return { type: "tool_delta", ... };
  case "tool.end":    return { type: "tool_end", ... };
  case "permission.updated": return { type: "permission_request", ... };
  case "question.asked":     return { type: "question", ... };
  case "session.idle":       // 同时发送 message_end + run_status(completed)
  case "error":       return { type: "error", message, detail };
}
```

**Delta 缓冲机制：**
- 如果 delta 先于 `part_start` 到达（异步时序问题），暂存入 `pendingDeltas` Map
- 当对应的 `part_start` 到达时，一次性 flush 所有缓冲 delta
- 如果 `part_start` 之后 delta 才到，直接从 `partTypes` 查询 part type

**流式派生文件：**
- `output/session-stream.md`：完整原始 JSON 行日志
- `output/session-stream-reasoning.md`：reasoning 文本累积
- `output/session-stream-content.md`：content 文本累积

### 4.5 Stage Runtime Manager (`app/server/stageRuntimeManager.ts`)

核心职责：`startStageRuntime()` 和 `stopStageRuntime()`。

**startStageRuntime() 完整流程：**

```typescript
async function startStageRuntime(opts) {
  // 1. 检查已存在的 runtime（幂等性）
  const existing = runtimeFor(opts.runId, opts.stageId);
  if (existing) return existing;

  // 2. 获取 stage contract
  const contract = getStageContract(opts.stageId);

  // 3. 创建 preview 快照（如果需要）
  if (contract.requires_snapshot_before_start) {
    await createPreviewSnapshot(opts.skillId, opts.previewId, ...);
  }

  // 4. 初始化 state
  const attempt = await findNextAttempt(opts.runId, opts.stageId);
  await initStage({ ...opts, attempt });

  // 5. 分配端口
  const port = await allocatePort(beginPort);

  // 6. 构建 workspace
  const wsPath = await buildStageWorkspace({
    runId, stageId, skillId, previewId, attempt,
    previousStageId, sessionLogPath, apiDocsAvailable
  });

  // 7. 准备 stage input
  await prepareStageInputs({ ... });

  // 8. 构建启动命令
  const openCodeCmd = ["opencode", "serve", "--hostname=127.0.0.1", `--port=${port}`];
  const cmd = shouldUseBwrap()
    ? await buildBwrapCommand(ctx, openCodeCmd)
    : openCodeCmd;

  // 9. 启动子进程
  const proc = spawn(cmd[0], cmd.slice(1), {
    cwd: wsPath,
    env: {
      OPENCODE_CONFIG: path.join(wsPath, "opencode.json"),
      OPENCODE_CONFIG_DIR: path.join(wsPath, ".opencode"),
      OPENCODE_SERVER_PASSWORD: "...",
      ...
    }
  });

  // 10. 等待就绪
  await waitForHealth(port, proc);

  // 11. 注册 runtime + 启动 artifact watcher
  runtimes.set(serverId, { ...runtimeData, process: proc });
  startArtifactWatcher(runId, stageId, attempt, onChange);

  // 12. 后台监控进程退出
  proc.on("exit", (code, signal) => {
    handleProcessExit(serverId, code, signal);
  });

  return serverId;
}
```

**stopStageRuntime() 优雅停止：**

1. `abortEventStream()` → 停止 SSE 消费
2. `abortSession()` + `deleteSession()` → 清理活跃会话
3. `unwatchStageOutput()` → 停止文件监听
4. `syncWorkToPreview()` → 仅 preview-writable stage
5. `SIGTERM` → 等待 5s → `SIGKILL` 兜底
6. 更新 stage state → `completed`

### 4.6 Prompt Recommender (`app/prompt_recommender/`)

**工作流程：**

```
POST /recommend-prompt
  │
  ▼
recommendPrompt({ stageId, previousStageId, runId, skillId })
  │
  ├─► 读取 prompt_library/<stageId>.md  (prompt 模板)
  ├─► 读取 run state (run-state.yaml)
  ├─► 读取 stage digests (stage-digest.md)
  ├─► 读取 director reviews (output/director-review.md)
  │
  ├─► 构造系统 prompt（含上下文 + 约束）
  │
  ├─► 调用 LocalV1Client.chat.completions.create()
  │     endpoint: SKILL_GROWTH_RECOMMENDER_URL
  │     model: SKILL_GROWTH_RECOMMENDER_MODEL
  │
  └─► 解析 JSON 响应 → PromptRecommendResponse
       { primary, alternatives[], rationale, risk }
```

**Prompt Library 文件（位于 `prompt_library/`）：**

- `observe-log-review.md` — 日志复盘分析的推荐 prompt
- `observe-api-scan.md` — API 文档扫描的推荐 prompt
- `grow-plan.md` — 增长计划的推荐 prompt
- `grow-build.md` — 构建修改的推荐 prompt
- `quality-review.md` — 质量审查的推荐 prompt
- `rehearse-preview.md` — 排练体验的推荐 prompt
- `rehearse-iteration.md` — 迭代修改的推荐 prompt
- `stabilize-release.md` — 发布检查的推荐 prompt

### 4.7 快照与归档 (`app/snapshot_manager/`)

**设计原则：永不删除，只归档。**

| 组件 | 作用 |
|---|---|
| `snapshot.ts` | `createStableSnapshot()` / `createPreviewSnapshot()` / `restoreSnapshot()` |
| `archive.ts` | `archiveFiles()` — 移动文件到 `.archive/<UTC>/` 并生成 manifest |
| `rollback.ts` | `findSnapshotManifest()` / `rollbackSkill()` |

**快照触发时机：**

| 场景 | 快照类型 |
|---|---|
| `grow-build` / `rehearse-iteration` 启动前 | `createPreviewSnapshot()` |
| `POST /skills/:id/promote` 执行中 | `createStableSnapshot()` |
| 手动 rollback 的恢复阶段 | `archiveFiles()` → `restoreSnapshot()` |

### 4.8 路径安全 (`app/shared/utils/security.ts`)

**四层路径防御：**

| 层 | 机制 | 位置 |
|---|---|---|
| 1 | `assertSafeIdentifier()` — 标识符白名单校验 | `validateParams.ts` / `security.ts` |
| 2 | `resolveContainedPath()` — 路径穿越检测 | `security.ts` |
| 3 | `assertContainedPath()` — 绝对路径范围检查 | `security.ts`、bwrap |
| 4 | `safeResolve()` — `fs.realpath` symlink 解析 + 穿越检测 | 所有文件读取路由 |

```typescript
// 示例：safeResolve — 最严格的路径校验
function safeResolve(workspace: string, relativePath: string): string {
  // 1. 拒绝绝对路径
  if (path.isAbsolute(relativePath)) throw new PathSecurityError(...);

  // 2. 解析为候选绝对路径
  const candidate = path.resolve(workspace, relativePath);

  // 3. fs.realpath 解析所有 symlink
  const resolved = fs.realpathSync(candidate);

  // 4. 验证 resolved 在 workspace 内
  if (!resolved.startsWith(workspaceRoot)) throw new PathSecurityError(...);

  return resolved;
}
```

---

## 5. 前端架构

### 5.1 组件树

```
App.tsx (Director Console)
├── Top Bar
│   ├── Skill Selector
│   ├── Create Run / Run Info
│   └── Status Badge
├── Main Content (3-column)
│   ├── StageNavigator (8 stages, highlights current/running)
│   ├── Center Column
│   │   ├── Runtime Controls (start/stop/retry/commit)
│   │   └── ChatPage
│   │       ├── PermissionCard (when permission pending)
│   │       ├── QuestionCard (when question pending)
│   │       ├── MessageList
│   │       │   └── MessageBubble[]
│   │       │       └── PartRenderer
│   │       │           ├── TextPart (react-markdown + GFM + highlight)
│   │       │           ├── ReasoningBlock (collapsible)
│   │       │           ├── ToolDisplay (name + input/output JSON)
│   │       │           ├── FileDisplay (mime + link)
│   │       │           └── ErrorDisplay
│   │       └── ChatInput (textarea + Send/Abort)
│   └── PromptAssistant (LLM recommendations)
└── ArtifactPanel (bottom)
    ├── File List (auto-refresh via SSE)
    └── Content Viewer
```

### 5.2 核心 Hook：useChatSession

管理聊天会话的完整状态：

```typescript
function useChatSession({ runId, stageId, attempt, serverId }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingPermission, setPendingPermission] = useState<PendingPermission | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState<PendingQuestion | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // 关键方法
  const createSession = async () => { ... };
  const sendMessage = async (text: string) => { ... };
  const abort = async () => { ... };
  const replyQuestion = async (answer: string) => { ... };
  const replyPermission = async (allow: boolean) => { ... };

  // 副作用
  useEffect(() => {
    // stage 切换时清理旧 session
    if (sessionId) deleteSession(sessionId);
    setMessages([]); setSessionId(null); setError(null);
  }, [stageId, attempt]);
}
```

### 5.3 核心 Hook：useSSE

连接 Backend SSE 流并更新消息状态：

```typescript
function useSSE({ runId, stageId, attempt, sessionId, setMessages, ... }) {
  useEffect(() => {
    if (!sessionId) return;
    const es = new EventSource(
      `/api/runs/${runId}/stage/${stageId}/chat/events?session_id=${sessionId}`
    );

    es.onmessage = (event) => {
      const parsed = parseChatSSEEvent(event.data);
      if (!parsed) return;

      if (isDeltaEvent(parsed)) {
        // delta 事件 → 累积到 pendingDeltasRef → RAF 批量 flush
        pendingDeltasRef.current.push(parsed);
        if (!rafRef.current) {
          rafRef.current = requestAnimationFrame(flushDeltas);
        }
      } else {
        // 非 delta 事件 → 立即 apply
        applyEvent(parsed, setMessages, ...);
      }
    };

    return () => { es.close(); cancelAnimationFrame(rafRef.current); };
  }, [sessionId]);
}
```

**Delta 批处理性能优化：**
- 高频 delta 事件（可达 50+ tokens/s）通过 `requestAnimationFrame` 批量合并
- 单帧内合并所有 delta 到各自 part，减少 React re-render 次数
- 非 delta 事件立即处理，确保交互（permission/question）不延迟

### 5.4 状态管理方式

不使用 Redux/Zustand 等第三方状态库，采用 React 原生 `useState` + props 传递：

| 状态 | 位置 | 传递给 |
|---|---|---|
| `currentSkill` / `currentRunId` / `currentStageId` | App.tsx | 所有子组件 |
| `runningStages` | App.tsx | StageNavigator, ChatPage |
| `messages` / `streaming` / `sessionId` | useChatSession hook | ChatPage, MessageList |
| `pendingPermission` / `pendingQuestion` | useChatSession hook | PermissionCard, QuestionCard |

### 5.5 类型系统

前端自有类型（`app/web/src/types/chat.ts`），不依赖后端 Zod schema：

```typescript
// ChatMessage
interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  parts: MessagePart[];
  status: "streaming" | "done" | "error";
  createdAt: string;
}

// MessagePart (discriminated union)
type MessagePart =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "tool"; toolName: string; input?: unknown; output?: unknown; status?: string }
  | { type: "file"; mime?: string; url?: string }
  | { type: "error"; message: string };
```

---

## 6. 安全模型

### 6.1 四层隔离架构

```
Layer 1: 应用层路径防护
  ├── validateParams middleware: assertSafeIdentifier()
  ├── resolveContainedPath(): 拒绝 ../ 穿越
  └── 所有路由参数先 assert 后使用

Layer 2: 请求级 workspace 隔离
  ├── x-opencode-directory header
  ├── OpenCodeClient 每个方法强制注入
  └── OpenCode serve 以此 header 确定项目根

Layer 3: 进程级文件系统隔离
  ├── bwrap --unshare-all
  ├── 只读挂载: REPO_ROOT, node_modules, skill stable
  ├── 可写挂载: workspace/, output/, work/
  └── 无法访问 workspace 外的文件系统

Layer 4: Symlink 感知的安全解析
  ├── safeResolve(): fs.realpath 解析所有 symlink
  ├── 验证解析后路径仍在 workspace 内
  └── artifact/skill file 读取路由最终调用
```

### 6.2 标识符校验规则

```typescript
// skill id: 小写字母、数字、连字符
const SKILL_ID_PATTERN = /^[a-z0-9-]+$/;

// run id: 字母、数字、点、下划线、连字符
const RUN_ID_PATTERN = /^[a-zA-Z0-9._-]+$/;

// stage id: 8 个枚举值
const VALID_STAGES = [
  "observe-log-review", "observe-api-scan",
  "grow-plan", "grow-build", "grow-quality-review",
  "rehearse-preview", "rehearse-iteration",
  "stabilize-release"
];
```

### 6.3 永不删除、只归档策略

```typescript
// ❌ 禁止
fs.unlinkSync(filePath);
fs.rmSync(dirPath, { recursive: true });

// ✅ 正确
archiveFiles(skillId, [{ type: "remove", path: filePath }], trigger, sourceRun);
// 文件被移动到 .archive/<UTC>/ + 生成 ArchiveManifest
```

### 6.4 写前快照策略

| 操作 | 先行快照 |
|---|---|
| `grow-build` / `rehearse-iteration` 启动 | `createPreviewSnapshot()` |
| `POST /skills/:id/promote` | `createStableSnapshot()` |
| `POST /skills/:id/rollback` | `archiveFiles()` → `restoreSnapshot()` |

---

## 7. 配置系统

### 7.1 配置层级

```
环境变量 (SKILL_GROWTH_*)
  ├── 最高优先级
  └── 覆盖配置文件和代码默认值
        ↓
配置文件 (configs/model-providers/*.yaml)
  ├── provider 定义
  ├── 模型列表
  └── bwrap profiles + mounts
        ↓
代码内置 (app/workspace_builder/opencodeConfig.ts)
  ├── 权限默认值
  ├── 模型回退逻辑
  └── agent 角色覆盖
```

### 7.2 关键环境变量

| 变量 | 说明 | 默认值 |
|---|---|---|
| `SKILL_GROWTH_PORT` | Express 端口 | `3000` |
| `SKILL_GROWTH_DEFAULT_MODEL` | 默认模型 | `local-v1/glm4:9b` |
| `SKILL_GROWTH_SMALL_MODEL` | 轻量模型 | `local-v1/glm4:9b` |
| `SKILL_GROWTH_PROVIDERS_CONFIG` | 自定义 provider 路径 | `configs/model-providers/custom.yaml` |
| `DEEPSEEK_API_KEY` | DeepSeek API Key | - |
| `OPENCODE_SERVER_USERNAME` | OpenCode Basic Auth 用户名 | `opencode` |
| `OPENCODE_SERVER_PASSWORD` | OpenCode Basic Auth 密码 | `skillgrowth` |
| `STAGE_USE_BWRAP` | 0 禁用 bwrap | 默认启用 |
| `SKILL_GROWTH_RECOMMENDER_URL` | Recommender 端点 | `http://172.24.16.1:11434/v1` |
| `SKILL_GROWTH_RECOMMENDER_API_KEY` | Recommender API Key | `local` |
| `SKILL_GROWTH_RECOMMENDER_MODEL` | Recommender 模型 | `glm4:9b` |

### 7.3 配置文件一览

```
configs/
├── model-providers/
│   ├── local-v1.yaml     # 本地 OpenAI-compatible 端点配置
│   ├── custom.yaml       # 用户自定义 provider（环境变量或手动编辑）
│   └── sglang.yaml       # SGLang 示例配置
├── bwrap-profiles/
│   ├── stage.profile     # bwrap 基础隔离参数
│   ├── rehearse.profile  # 排练模式专用隔离参数
│   └── mounts.yaml       # 按域挂载配置（模板变量展开）
├── opencode-templates/
│   ├── skill-opencode.json   # skill 级 opencode.json 模板
│   └── stage-opencode.json   # stage 级 opencode.json 模板
└── quality-gates/
    └── default.yaml      # Quality Gate 检查清单
```

---

## 8. 开发指南

### 8.1 环境搭建

```bash
# 前置要求
# - Node.js 20+
# - pnpm
# - opencode CLI (可选，stage runtime 需要)
# - bwrap (可选，沙箱隔离需要)

cd skill_runtime
pnpm install
pnpm build
```

### 8.2 开发工作流

```bash
# 启动开发模式（后端自动重载 + 前端 HMR）
pnpm dev

# 仅启动后端
pnpm cli server

# 仅构建前端
pnpm build:web

# 运行测试
pnpm test

# 运行特定测试文件
pnpm test -- --test-name-pattern="security"
```

### 8.3 项目结构速查

```
app/
├── server/              ← Express 控制平面 (入口: index.ts)
│   ├── routes/          ← API 路由 (按域分组)
│   ├── middleware/      ← 参数校验
│   ├── opencode_gateway/← OpenCode 客户端封装
│   ├── runtime/         ← 运行时管理
│   └── security/        ← 路径安全
├── orchestration/       ← 状态机 + 生命周期
├── workspace_builder/   ← workspace 构造
├── opencode_client/     ← OpenCode HTTP + SSE
├── web/                 ← React 前端 SPA
└── shared/              ← 共享 schema + 工具
```

### 8.4 添加新 API 路由

1. 在 `app/server/routes/` 创建新路由文件
2. 在 `app/server/index.ts` 中挂载：`app.use("/api/xxx", xxxRouter)`
3. （可选）添加 `validateParams` 中间件校验路径参数
4. 使用 `safeResolve()` 进行所有文件访问
5. 添加测试到 `tests/` 目录

### 8.5 添加新 Stage

1. 在 `app/orchestration/stageContracts.ts` 中 `STAGE_CONTRACTS` 添加新条目
2. 在 `app/shared/schemas/index.ts` 中更新 `StageId` 枚举
3. 在 `app/orchestration/stageTransitions.ts` 中定义推荐流转路径
4. 在 `prompt_library/` 添加对应的 prompt 模板
5. 在 `app/web/src/components/StageNavigator.tsx` 中添加 UI 入口

### 8.6 修改权限模型

编辑 `app/workspace_builder/opencodeConfig.ts` 中的 `buildOpencodeConfig()` 函数中的 permission 生成逻辑（第 120-155 行）：

```typescript
// 全局权限
permission: {
  edit: "ask",
  bash: {
    "*": "ask",
    "ls *": "allow",
    "cat *": "allow",
    "grep *": "allow",
    "python *": "ask",
    "rm *": "deny",
    "git push *": "deny",
  },
},
// agent 级覆盖
agent: {
  build: { permission: { edit: "allow", bash: { ... } } },
  iteration: { permission: { edit: "allow", bash: { ... } } },
}
```

---

## 9. 部署指南

### 9.1 生产构建

```bash
pnpm build
# 输出：
#   dist/app/    ← 后端 TypeScript 编译产物
#   dist/web/    ← 前端 Vite 构建产物
```

### 9.2 生产启动

```bash
# 设置环境变量
export OPENCODE_SERVER_PASSWORD="secure-password"
export SKILL_GROWTH_PORT=3000

# 启动
pnpm start
# 等价于：node dist/app/server/index.js
```

### 9.3 反向代理 (Nginx)

```nginx
server {
    listen 80;
    server_name skill-growth.local;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_buffering off;  # SSE 需要关闭缓冲
    }
}
```

### 9.4 系统依赖

| 依赖 | 安装命令 (Ubuntu/Debian) | 必需? |
|---|---|---|
| Node.js 20+ | `curl -fsSL https://deb.nodesource.com/setup_20.x \| sudo -E bash - && sudo apt-get install -y nodejs` | ✅ |
| pnpm | `npm install -g pnpm` | ✅ |
| opencode CLI | `npm install -g @opencode-ai/opencode-ai` | 可选 |
| bwrap | `sudo apt-get install bubblewrap` | 可选 |

---

## 10. 测试策略

### 10.1 测试架构

| 文件 | 类型 | 覆盖点 | 用例数 |
|---|---|---|---|
| `tests/schemas.test.ts` | 单元测试 | Zod schema 校验、类型断言 | 8 |
| `tests/integration.test.ts` | 集成测试 | v0.1 全生命周期（observe→grow→promote→rollback） | 5 |
| `tests/v02-lifecycle.test.ts` | 集成测试 | v0.2 run/stage 状态机 | 2 |
| `tests/port-function.test.ts` | 功能测试 | 模型端点、OpenCode serve、应用 API | 12 |
| `tests/security.test.ts` | 安全测试 | 标识符校验、路径穿越、symlink 逃逸、路由级拦截 | 19 |
| `tests/chat-api.test.ts` | 单元+功能 | x-opencode-directory 注入、SSE 解析与归一化 | 21 |
| `tests/bwrap.test.ts` | 单元测试 | bwrap 命令生成、按域挂载 | 10 |
| `tests/artifact-watcher.test.ts` | 单元测试 | output 目录文件变化监听 | 2 |

**总计：54 个用例，1 个 skip（deepseek 网络不可达）。**

### 10.2 运行测试

```bash
# 全部测试
pnpm test

# 按文件运行
tsx --test tests/security.test.ts

# 按模式运行
tsx --test --test-name-pattern="safeResolve" tests/**/*.test.ts

# 带 DeepSeek 测试
DEEPSEEK_API_KEY=sk-xxxxxx pnpm test
```

### 10.3 测试编写规范

```typescript
import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Feature Group", () => {
  it("should do something specific", () => {
    const result = functionUnderTest(input);
    assert.equal(result, expected);
  });

  it("should reject invalid input", () => {
    assert.throws(() => functionUnderTest(invalid), {
      name: "PathSecurityError",
      message: /expected error message/,
    });
  });
});
```

### 10.4 CI 集成

```bash
# 标准 CI 流水线
pnpm install --frozen-lockfile
pnpm build          # TypeScript 检查 + Vite 构建
pnpm test           # 54 个测试用例
```

### 10.5 已知限制

1. **旧 workers 兼容**：`app/workers/` 下为 v0.1 实现，仅在 `tests/integration.test.ts` 中使用
2. **systemd/cgroup**：v0.3 未实现资源级隔离
3. **CLI 命令不完整**：仅 `server` 子命令完整实现
4. **文件附件**：ChatInput 当前仅支持文本，无文件选择器
5. **py312_skill**：Python 环境目录为空，预留给日志解析脚本
