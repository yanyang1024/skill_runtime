# Skill Growth Studio API 参考

> skill_runtime 控制平面完整 API 文档。面向前端开发者与集成者。

---

## 1. 概述

| 项目 | 值 |
|---|---|
| 协议 | HTTP/1.1 REST + SSE |
| 数据格式 | JSON (`Content-Type: application/json`) |
| 默认端口 | `3000`（通过 `SKILL_GROWTH_PORT` 可改） |
| 认证 | 无（本地运行时，不对外暴露） |

所有返回 4xx/5xx 的响应体为 `{ "error": string }`。

---

## 2. 健康检查与全局事件

### `GET /api/health`

返回应用健康状态。

**响应：** `{ "ok": true, "service": "skill-growth-studio" }`

### `GET /api/events`

SSE 全局事件流，用于前端接收实时状态更新。

**事件类型：**

| event | payload | 说明 |
|---|---|---|
| `status` | `{ message: string }` | 全局状态消息 |
| `artifact_changed` | `{ run_id, stage_id, attempt, name? }` | Stage output 目录文件变化 |

---

## 3. Skills API

前缀：`/api/skills/:skillId`（`:skillId` 格式：`[a-z0-9-]+`）

### `GET /`

列出所有 skill 目录。

**响应：** `["tech-doc-didactic-rewriter", "other-skill"]`

### `GET /:skillId/tree`

返回 skill 目录的递归文件树（跳过点文件和 node_modules）。

**响应：**
```json
{
  "skillId": "tech-doc-didactic-rewriter",
  "root": "skills/tech-doc-didactic-rewriter",
  "tree": {
    "stable": {
      "SKILL.md": "file",
      "references": { "api.md": "file" }
    },
    "previews": {
      "p1": { "SKILL.md": "file" }
    }
  }
}
```

### `GET /:skillId/file/*`

读取 skill 目录下任意文件内容。路径经 `safeResolve()` 校验，拒绝对称链接逃逸（返回 404）。

### `GET /:skillId/runs`

列出与当前 skill 相关的所有 run。

**响应：** `[ { "runId": "run-...", "skillId": "...", "status": "..." }, ... ]`

### `POST /:skillId/promote`

将 preview 提升为新的 stable 版本。

**请求：**
```json
{
  "previewId": "p1",
  "runId": "run-2026-06-24T00-00-00.000Z"
}
```

**前置条件：** 如果提供了 `runId`，要求 `grow-quality-review` stage 必须为 `completed` 状态，否则返回 400。

**行为：**
1. 创建当前 stable 的快照（`.Grow_backups/stable/...tar.gz`）
2. 归档旧 stable 到 `releases/` 与 `.archive/`
3. 将 preview 目录内容复制到 stable
4. 更新 `CHANGELOG.md`（semver patch bump）

**响应：** `{ "ok": true, "release_version": "v0.1.1", "snapshot_id": "..." }`

### `POST /:skillId/rollback`

从指定快照恢复 skill。

**请求：**
```json
{
  "snapshotId": "2026-06-21T17-42-59.452Z"
}
```

**响应：** `{ "ok": true }`

---

## 4. Runs API

前缀：`/api/runs`

### `POST /`

创建新的生长 run。

**请求：**
```json
{
  "skillId": "tech-doc-didactic-rewriter",
  "previewId": "p1"
}
```

**响应：**
```json
{
  "runId": "run-2026-06-24T12-00-00.000Z",
  "skillId": "tech-doc-didactic-rewriter",
  "status": "idle"
}
```

### `GET /`

列出所有 run。

### `GET /:runId`

获取单个 run 的当前状态。

**响应：**
```json
{
  "run_id": "run-2026-06-24T12-00-00.000Z",
  "skill_id": "tech-doc-didactic-rewriter",
  "current_stage": "observe-log-review",
  "status": "running",
  "created_at": "2026-06-24T12:00:00.000Z",
  "updated_at": "2026-06-24T12:00:05.000Z"
}
```

---

## 5. Stages API

前缀：`/api/runs/:runId/stage/:stageId`（`:stageId` 为 8 个枚举值之一）

所有路由经 `validateRunStageParams` 中间件校验参数。

### `GET /status`

查询 stage runtime 健康状态（不要求 runtime 正在运行）。

**响应：**
```json
{
  "registered": true,
  "status": "running",
  "healthy": true,
  "error": null,
  "port": 9500
}
```

### `POST /start`

启动 stage 的 headless `opencode serve` 运行时。

**请求：**
```json
{
  "previous_stage_id": "observe-log-review",
  "session_log_path": "traces/skill/session-log.txt",
  "api_docs_available": false
}
```

**行为：**
1. 如 `requires_snapshot_before_start`，先创建 preview/stable 快照
2. 分配空闲端口（从 9500 起递增检测）
3. 构建 workspace（`opencode.json`、skill 快照、input/、output/、work/）
4. 构建 bwrap 命令（如启用）或直接 `opencode serve` 命令
5. 启动子进程，等 Health Check 通过
6. 启动 ArtifactWatcher 监听 output 变化

**响应：**
```json
{
  "server_id": "srv-abc123",
  "port": 9500,
  "base_url": "http://127.0.0.1:9500",
  "workspace_path": "runs/run-.../observe-log-review/attempts/attempt-001/workspace",
  "status": "running",
  "runtime_mode": "serve"
}
```

### `POST /stop`

停止 stage runtime。行为：
1. Abort 活跃 session 的 SSE 流
2. Abort + Delete 活跃 session
3. 停止 ArtifactWatcher
4. 如果 stage 是 preview-writable，sync `work/` → preview
5. 发送 SIGTERM（5s 后 SIGKILL 兜底）
6. 更新 stage state 为 `completed`

### `POST /retry`

找到下一个未使用的 attempt 编号并重新启动 stage。

### `POST /commit`

将 `workspace/work/` 目录同步到 preview skill。仅 `preview-writable` 的 stage（`grow-build`、`rehearse-iteration`）有效。

**行为：** `syncWorkToPreview()` — 复制 work/ 到 preview，先归档被覆盖文件到 `.archive/`。

### `GET /state?attempt=`

获取 stage 状态。

**响应：**
```json
{
  "stage_id": "observe-log-review",
  "run_id": "run-...",
  "status": "running",
  "attempt": "attempt-001",
  "server_id": "srv-abc123",
  "workspace_path": "runs/run-.../...",
  "outputs": [
    "replay-card.md",
    "growth-opportunities.md",
    "completion-report.md"
  ]
}
```

### `POST /director-review`

保存导演反馈。

**请求：**
```json
{
  "content": "rehearsal 体验良好，建议调整 SKILL.md 中..."
}
```

**行为：** 写入 `output/director-review.md`（如果是 `rehearse-preview`，还复制到下一阶段的 input/）。

### `POST /recommend-prompt`

调用 Prompt Recommender，基于当前 stage 上下文生成推荐输入语句。

**请求：**
```json
{
  "previous_stage_id": "observe-log-review"
}
```

**响应：**
```json
{
  "primary": "请分析以下 session log，生成 replay card...",
  "alternatives": ["请重点分析错误场景...", "请关注 tool call 效率..."],
  "rationale": "当前 observe-log-review 阶段...",
  "risk": "建议导演审核后再确认..."
}
```

### `GET /`

列出所有注册的 runtime。

### `POST /run-api-tests`

执行确定性 API 测试脚本。需要 stage output 中存在 `api-tests/` 目录及 `.py`/`.sh`/`.js` 文件。

**响应：**
```json
{
  "summary": { "total": 5, "passed": 4, "failed": 0, "error": 1, "skipped": 0 },
  "results": [
    { "name": "test_health", "status": "passed", "duration_ms": 120 }
  ]
}
```

---

## 6. Chat API

前缀：`/api/runs/:runId/stage/:stageId/chat`

用于 ChatPage 与 OpenCode 会话交互。所有请求由 Backend 转发并自动注入 `x-opencode-directory` header。

### `POST /session`

创建 OpenCode session。

**请求：** `{ "title": "可选标题" }`

**响应：** `{ "id": "session-uuid" }`

### `GET /session/:sessionId`

获取 session 详情。

### `DELETE /session/:sessionId`

删除 session 并清理关联 SSE emitter。

### `POST /session/:sessionId/abort`

Abort 当前活跃的 session 处理。

### `POST /session/:sessionId/message`

异步发送 prompt。Backend 先启动 SSE consumer 再发送，确保不丢失早期事件。

**请求：**
```json
{
  "parts": [
    { "type": "text", "text": "请分析 session log" }
  ]
}
```

**响应：** `{ "session_id": "session-uuid" }`

### `GET /session/:sessionId/message?limit=`

拉取历史消息列表。返回 OpenCode 原始消息数组（含 `info` 与 `parts`）。

### `POST /session/:sessionId/question/:questionId`

回复 OpenCode 的提问。

**请求：**
```json
{
  "answer": "确认继续",
  "selected": ["option-1"]
}
```

### `POST /session/:sessionId/permission/:permissionId`

允许或拒绝权限请求。

**请求：**
```json
{
  "allow": true
}
```

### `GET /events?session_id=`

SSE 流端点。Backend 将 OpenCode 原始 SSE 归一化为 `ChatSSEEvent` 后推送。每个事件格式：

```
data: {"type":"text_delta","message_id":"...","part_id":"...","content":"你好"}
```

---

## 7. Artifacts API

前缀：`/api/runs/:runId/stage/:stageId`

### `GET /artifacts`

列出 stage output 目录下的所有文件。

**响应：**
```json
[
  { "name": "replay-card.md" }
]
```

### `GET /artifact/:name`

读取指定 artifact 的内容。路径经 `safeResolve()` 校验。

---

## 8. ChatSSEEvent 协议

Backend 将 OpenCode 原始 SSE 转换为统一的 `ChatSSEEvent` 类型后推送到前端 SSE 流。

### 事件类型定义

```typescript
type ChatSSEEvent =
  // 消息生命周期
  | { type: "message_start"; message_id: string; role: "assistant" | "user" | "system" }

  // Part 生命周期
  | { type: "part_start"; message_id: string; part_id: string;
      part_type: "text" | "reasoning" | "tool" | "error" }

  // 流式 delta
  | { type: "text_delta"; message_id: string; part_id: string; content: string }
  | { type: "reasoning_delta"; message_id: string; part_id: string; content: string }

  // Tool call
  | { type: "tool_start"; message_id: string; part_id: string;
      tool_name: string; input?: unknown }
  | { type: "tool_delta"; message_id: string; part_id: string; content: string }
  | { type: "tool_end"; message_id: string; part_id: string;
      output?: unknown; status: "success" | "error" }

  // 交互
  | { type: "permission_request"; message_id: string; request_id: string;
      title: string; detail?: string;
      options: Array<{ id: string; label: string }> }
  | { type: "question"; message_id: string; question_id: string;
      content: string; kind?: "choice" | "multiple" | "text" | "confirm";
      options?: Array<{ id: string; label: string }> }

  // 结束与状态
  | { type: "message_end"; message_id: string }
  | { type: "run_status"; status: "running" | "waiting_input" |
      "completed" | "failed" | "aborted" }
  | { type: "error"; message: string; detail?: unknown };
```

### 事件流转示例

```
data: {"type":"message_start","message_id":"msg_01","role":"assistant"}

data: {"type":"part_start","message_id":"msg_01","part_id":"part_01","part_type":"reasoning"}
data: {"type":"reasoning_delta","message_id":"msg_01","part_id":"part_01","content":"用户要求分析"}

data: {"type":"part_start","message_id":"msg_01","part_id":"part_02","part_type":"text"}
data: {"type":"text_delta","message_id":"msg_01","part_id":"part_02","content":"根据分析"}

data: {"type":"part_start","message_id":"msg_01","part_id":"part_03","part_type":"tool"}
data: {"type":"tool_start","message_id":"msg_01","part_id":"part_03","tool_name":"bash","input":{"command":"ls"}}
data: {"type":"tool_delta","message_id":"msg_01","part_id":"part_03","content":"file1\nfile2"}
data: {"type":"tool_end","message_id":"msg_01","part_id":"part_03","status":"success"}

data: {"type":"message_end","message_id":"msg_01"}
data: {"type":"run_status","status":"completed"}
```

### 前端消费

前端通过 `useSSE` hook 连接 SSE 流，将 delta 事件通过 `requestAnimationFrame` 批量合并后更新 `ChatMessage` 数组：

- `message_start` → 创建新 `ChatMessage`（`status: "streaming"`）
- `part_start` → 追加新 `MessagePart`
- `text_delta` / `reasoning_delta` → 追加到对应 part 的 content
- `tool_start` → 创建 tool part（含 input）
- `tool_delta` → 追加 tool output
- `tool_end` → 标记 tool part 完成
- `permission_request` → 显示 PermissionCard
- `question` → 显示 QuestionCard
- `message_end` → 标记 message 为 `"done"`
- `run_status(completed)` → 停止流式标记
- `error` → 标记 message 为 `"error"`

### 原始事件归档

原始 OpenCode SSE 事件同步写入 `output/session-stream.md`（完整 JSON 行日志），reasoning 与 content 分别写入 `session-stream-reasoning.md` 与 `session-stream-content.md`。

---

## 9. 错误处理

| HTTP 状态码 | 说明 | 常见原因 |
|---|---|---|
| 200 | 成功 | — |
| 400 | 请求参数无效 | 缺少必填字段、格式错误 |
| 403 | 路径穿越被拦截 | artifact/skill file 路径试图逃逸 workspace |
| 404 | 资源不存在 | run/stage/session 未找到、skill 不存在 |
| 409 | 冲突 | stage 已在运行、session 已活跃 |
| 500 | 服务器内部错误 | 进程异常、I/O 错误 |

---

## 10. 旧版 API

v0.1/v0.2 时代保留的旧版端点（通过 `app/workers/` 实现）：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/mock/api/v2/run-history` | 模拟 run history 数据 |
| POST | `/api/observe` | 触发 Observe worker（旧版） |
| POST | `/api/grow/dry-run` | 触发 Grow dry-run（旧版） |
| POST | `/api/grow/live` | 触发 Grow live run（旧版） |

> 旧版 API 仅保留兼容，新开发请使用 v0.3 完整 API。
