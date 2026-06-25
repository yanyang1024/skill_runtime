# OpenCode Serve 集成指南

> skill_runtime 如何将 `opencode serve` 作为 headless agent runtime 来驱动，以及 `x-opencode-directory` 隔离机制、SSE 归一化、权限模型、配置生成等核心集成细节。

---

## 1. 架构关系

```
┌──────────────────────┐        REST API        ┌──────────────────────┐    v1/chat/completions    ┌──────────────┐
│   skill_runtime       │  ──────────────────►  │   opencode serve     │  ──────────────────────► │  推理服务     │
│   (Express Backend)   │  ◄──────────────────  │   (headless, bwrap)  │  ◄────────────────────── │  (Ollama/vLLM)│
└──────────┬───────────┘   SSE + JSON 响应       └──────────────────────┘   OpenAI 兼容格式          └──────────────┘
           │
           │ ChatSSEEvent (归一化 SSE)
           ▼
┌──────────────────────┐
│   React ChatPage SPA │
│   (Frontend, Vite 6) │
└──────────────────────┘
```

**核心原则：**

- skill_runtime **不调用** OpenCode 的推理接口（v1/chat/completions），而是调用 OpenCode 的 **HTTP API 端点**（session、message、event 等），让 OpenCode 自行调用推理服务。
- 每个 stage 启动一个独立的 `opencode serve` 进程，拥有独立的 workspace、端口和配置。
- Backend 作为 Gateway，在每个请求中注入 `x-opencode-directory` header，实现请求级 workspace 隔离。
- bwrap 提供进程级文件系统隔离（默认启用）。

---

## 2. 启动命令

skill_runtime 通过 `cross-spawn` 启动 `opencode serve`：

```bash
# 直接模式（bwrap 关闭时）
opencode serve --hostname 127.0.0.1 --port <port>

# bwrap 模式（默认启用）
bwrap \
  --unshare-all --die-with-parent \
  --tmpfs /tmp --proc /proc --dev /dev \
  --ro-bind /repo/root /repo/root \
  --ro-bind /repo/node_modules /repo/node_modules \
  --bind /repo/runs/run-.../workspace /repo/runs/run-.../workspace \
  ... \
  opencode serve --hostname 127.0.0.1 --port <port>
```

**关键环境变量：**

| 变量 | 作用 |
|---|---|
| `OPENCODE_CONFIG` | 指向生成的 `opencode.json` |
| `OPENCODE_CONFIG_DIR` | 指向 workspace 下的 `.opencode/` 目录 |
| `OPENCODE_SERVER_PASSWORD` | Basic Auth 密码（默认 `skillgrowth`） |
| `OPENCODE_SERVER_USERNAME` | Basic Auth 用户名（默认 `opencode`） |

**就绪检测：**

启动后轮询以下端点（每 500ms，最多 30s）：

1. `GET /global/health` → 返回 `{"healthy": true}`
2. `GET /provider` → 确认 provider 已连接
3. `GET /config` → 确认配置已加载

全部返回 200 后标记为 `running`。

---

## 3. opencode.json 生成

每个 stage 的 `opencode.json` 由 `app/workspace_builder/opencodeConfig.ts` 动态生成。

### 3.1 生成流程

```
环境变量（SKILL_GROWTH_DEFAULT_MODEL 等）
  ↓
configs/model-providers/local-v1.yaml  →  加载 provider 定义
  ↓ 合并
configs/model-providers/custom.yaml   →  自定义 provider（如有）
  ↓ 生成
runs/<run>/<stage>/workspace/opencode.json
```

### 3.2 典型输出

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "local-v1/glm4:9b",
  "small_model": "local-v1/glm4:9b",
  "server": {
    "port": 9500,
    "hostname": "127.0.0.1",
    "mdns": false
  },
  "provider": {
    "local-v1": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Local v1 (OpenAI-compatible)",
      "options": {
        "baseURL": "http://172.24.16.1:11434/v1",
        "apiKey": "local"
      },
      "models": {
        "glm4:9b": {
          "name": "glm4:9b",
          "tools": false,
          "limit": { "context": 131072, "output": 8192 }
        }
      }
    }
  },
  "permission": {
    "edit": "ask",
    "bash": {
      "*": "ask",
      "ls *": "allow",
      "cat *": "allow",
      "grep *": "allow",
      "python *": "ask",
      "rm *": "deny",
      "git push *": "deny"
    }
  },
  "agent": {
    "build": {
      "permission": {
        "edit": "allow",
        "bash": {
          "ls *": "allow",
          "cat *": "allow",
          "python *": "ask",
          "rm *": "deny"
        }
      }
    },
    "iteration": {
      "permission": {
        "edit": "allow",
        "bash": {
          "ls *": "allow",
          "cat *": "allow",
          "python *": "ask",
          "rm *": "deny"
        }
      }
    }
  }
}
```

**重要：** serve 模式不配置 `server.cors`（不需要浏览器直接访问 OpenCode）。

### 3.3 模型选择逻辑

1. 优先使用环境变量 `SKILL_GROWTH_DEFAULT_MODEL` / `SKILL_GROWTH_SMALL_MODEL`
2. 其次从 `configs/model-providers/custom.yaml` 查找
3. 最后使用 `configs/model-providers/local-v1.yaml` 的默认模型（`glm4:9b`）
4. 如果设置了 `DEEPSEEK_API_KEY`，自动注入 `deepseek` provider

---

## 4. x-opencode-directory 隔离机制

### 4.1 原理

OpenCode 1.17+ 支持 `x-opencode-directory` HTTP header，用于指定 OpenCode 的目标项目根目录。skill_runtime 利用此机制实现**请求级 workspace 隔离**：

- 每个 stage 有独立的 workspace 路径
- 所有发往对应 `opencode serve` 实例的请求都强制注入该 header
- 前端无法绕过（Backend Gateway 层强制注入）

### 4.2 实现

`app/opencode_client/index.ts` 中的 `createOpencodeSessionClient`：

```typescript
const headers = {
  "Authorization": `Basic ${base64(username:password)}`,
  "Content-Type": "application/json",
  "x-opencode-directory": encodeURIComponent(workspacePath)
};
```

所有方法（`createSession`、`getMessages`、`sendPromptAsync`、`abortSession`、`replyQuestion`、`replyPermission`、`deleteSession`、`streamEvents`）均使用统一的 `json()` / `raw()` helper，这些 helper 自动附加 headers。

**测试验证：** `tests/chat-api.test.ts` 包含 6 个测试，验证所有 9 个客户端方法都正确携带 `x-opencode-directory` header。

---

## 5. SSE 归一化

### 5.1 源与目标

| 源（OpenCode raw SSE） | 目标（ChatSSEEvent） |
|---|---|
| `message.created` | `message_start` |
| `message.part.created` | `part_start` |
| `message.part.delta` (text part) | `text_delta` |
| `message.part.delta` (reasoning part) | `reasoning_delta` |
| `tool.start` / `tool.delta` / `tool.end` | `tool_start` / `tool_delta` / `tool_end` |
| `permission.updated` | `permission_request` |
| `question.asked` | `question` |
| `session.idle` | `message_end` + `run_status(completed)` |
| `error` | `error` |

### 5.2 归一化实现

`app/opencode_client/sse.ts` 中的 `normalizeOpenCodeEvent()`：

1. 维护 `NormalizerState`（当前 message ID、part type 映射、pending deltas 缓冲区）
2. Delta 缓冲：如果 delta 先于 `part_start` 到达，暂存入 `pendingDeltas`，`part_start` 到达后一次性 flush
3. Part type 注册：`part_start` 时记录 part type，后续 delta 根据此类型决定是 text_delta 还是 reasoning_delta
4. 鲁棒 ID 提取：尝试 `messageID` → `messageId` → `message_id` → `id` 多种属性名

### 5.3 流式派生

原始 SSE 事件同步写入：
- `output/session-stream.md` — 完整 JSON 行日志
- `output/session-stream-reasoning.md` — reasoning 文本累积
- `output/session-stream-content.md` — content 文本累积

### 5.4 前端接收

ChatPage 通过 `EventSource` 连接 `/api/runs/:run/stage/:stage/chat/events?session_id=` 端点，Backend 将归一化后的 `ChatSSEEvent` 以 SSE 格式推送。

前端 `useSSE` hook：
- delta 事件（text_delta/reasoning_delta/tool_delta）通过 `requestAnimationFrame` 批量合并
- 非 delta 事件立即 apply
- 按 `part_id` 增量追加内容

---

## 6. 消息 Part 结构

OpenCode 使用 Part 结构组织消息。skill_runtime 发送 prompt 时使用：

```json
{
  "parts": [
    { "type": "text", "text": "请分析 session log..." }
  ]
}
```

完整 Part 类型：

```typescript
type Part =
  | { type: "text"; text: string }
  | { type: "file"; mime: string; url: string; filename?: string }
  | { type: "tool"; tool: { name: string; input: any } }
  | { type: "reasoning"; text: string }
  | { type: "snapshot"; snapshot: {...} }
  | { type: "patch"; patch: string }
  | { type: "agent"; agent: string }
```

---

## 7. 权限模型

### 7.1 双层控制

OpenCode 内置双层权限：**全局权限 + Agent 级覆盖**，Agent 规则优先于全局规则。

skill_runtime 据此在每个 stage 的 `opencode.json` 中生成分层权限：

| 层 | 作用域 | edit | bash |
|---|---|---|---|
| 全局（默认） | 所有 agent | `ask` | ls/cat/grep `allow`，rm/git push `deny`，其他 `ask` |
| `build` agent | build 任务 | `allow` | 同上 |
| `iteration` agent | 迭代任务 | `allow` | 同上 |

### 7.2 权限值语义

| 值 | 行为 | ChatPage 表现 |
|---|---|---|
| `allow` | 直接执行 | 无交互 |
| `ask` | 暂停等待确认 | 显示 PermissionCard |
| `deny` | 拒绝执行 | 显示 denied 状态 |

### 7.3 ChatPage 中的 Permission / Question 交互

当 OpenCode 发出 `permission.updated` 事件时，SSE 归一化器生成 `permission_request` ChatSSEEvent，ChatPage 显示 PermissionCard：
- Allow / Deny 按钮
- 权限详情展示（target、action、reason）

当 OpenCode 发出 `question.asked` 事件时，ChatPage 显示 QuestionCard：
- 支持 choice / multiple / text / confirm 四种类型
- 提交对应 `replyQuestion()` API

---

## 8. 异步发送与流式监听

### 8.1 流程

```
ChatPage sendMessage()
  → POST /api/.../chat/session/:sessionId/message
    → Backend: 启动 SSE consumer (GET /event)
    → Backend: POST /session/:id/prompt_async to OpenCode
    ← OpenCode: SSE events → normalize → push to frontend SSE
  → ChatPage: useSSE hook 接收 ChatSSEEvent，更新消息列表
```

### 8.2 关键时序

1. Backend 在 `sendPromptAsync` 调用 OpenCode **之前**先启动 SSE consumer（`ensureEventStream`）
2. 这样确保不会丢失 OpenCode 早期事件（如 `message.created`、`part.created`）
3. SSE consumer 通过 singleton EventEmitter 模式，同一个 run/stage/attempt/sessionId 共享同一个 consumer
4. 前端 SSE 端点使用 `res.write()` 推送，`req.on('close')` 自动清理

### 8.3 Abort 流程

```
ChatPage abort()
  → 关闭前端 EventSource
  → POST /api/.../chat/session/:sessionId/abort
    → Backend: abortEventStream() — 取消 SSE consumer reader
    → Backend: POST /session/:id/abort to OpenCode
    → Backend: DELETE /session/:id
```

---

## 9. Workspace 结构

每个 stage 的 workspace 位于 `runs/<runId>/<stageId>/attempts/<attempt>/`：

```
attempt-NNN/
├── workspace/
│   ├── opencode.json           # 由 opencodeConfig.ts 生成
│   ├── .opencode/
│   │   └── skills/<skill_id>/  # skill 快照（供 OpenCode 自动发现）
│   ├── input/
│   │   ├── skill_snapshot/     # skill 文件副本（stable 或 preview）
│   │   ├── session_log/        # session 日志（如有）
│   │   ├── api_docs/           # API 文档（如有）
│   │   └── director-review.md  # 上一阶段导演反馈（如有）
│   ├── output/                 # stage 产物（OpenCode 写入 +
│   │   │                       # ArtifactWatcher 监听）
│   │   ├── session-stream.md
│   │   ├── session-stream-reasoning.md
│   │   └── session-stream-content.md
│   └── work/                   # 可写工作区（仅 preview-writable stage）
│       └── <skill_copy>/       # skill 可编辑副本
├── server.json                 # 运行时元信息（serve_mode、port、server_id）
└── stage-state.yaml            # stage 状态持久化
```

---

## 10. bwrap 沙箱

### 10.1 启用策略

- **默认启用**：所有 stage 默认通过 bwrap 启动
- **关闭方式**：`STAGE_USE_BWRAP=0`
- **实现位置**：`app/workspace_builder/bwrap.ts` → `buildBwrapCommand()`

### 10.2 隔离参数

从 `configs/bwrap-profiles/stage.profile` 读取：
```
--unshare-all          # 隔离所有命名空间
--die-with-parent      # 父进程退出时自动终止
--tmpfs /tmp           # 独立 tmpfs
--proc /proc           # 独立 proc
--dev /dev             # 独立 dev
```

### 10.3 挂载规则

从 `configs/bwrap-profiles/mounts.yaml` 读取，按域配置：

| 路径 | 模式 | 说明 |
|---|---|---|
| `REPO_ROOT` | `--ro-bind` | 项目根只读 |
| `node_modules` | `--ro-bind` | node_modules 只读 |
| `workspace/` | `--bind` | stage workspace 可读写 |
| `output/` | `--bind` | output 可读写 |
| `work/` | `--bind` | work 可读写 |
| `skills/<skill>/stable/` | `--ro-bind` | stable skill 只读 |
| `skills/<skill>/previews/<p>/` | `--ro-bind` 或 `--bind` | 取决于 stage 的 `skill_mount` 契约 |
| `configs/model-providers/` | `--ro-bind` | 模型配置只读 |
| `prompt_library/` | `--ro-bind` | prompt 库只读 |
| `api_docs/` | `--ro-bind` | API 文档只读 |

### 10.4 Preview 动态挂载

根据 `StageRuntimeContract.skill_mount` 决定 preview 目录的挂载模式：
- `preview-writable` → `--bind`（可读写）
- `preview-readonly` → `--ro-bind`（只读）
- `stable-readonly` → 不挂载 preview，只挂载 stable

---

## 11. 会话交互完整 API 矩阵

| 操作 | OpenCode 端点 | skill_runtime Chat API |
|---|---|---|
| 创建会话 | `POST /session` | `POST /chat/session` |
| 获取会话 | `GET /session/:id` | `GET /chat/session/:id` |
| 删除会话 | `DELETE /session/:id` | `DELETE /chat/session/:id` |
| 发送消息 | `POST /session/:id/prompt_async` | `POST /chat/session/:id/message` |
| 历史消息 | `GET /session/:id/message` | `GET /chat/session/:id/message` |
| Abort | `POST /session/:id/abort` | `POST /chat/session/:id/abort` |
| 回复 question | `POST /session/:id/question/:qid` | `POST /chat/session/:id/question/:qid` |
| 回复 permission | `POST /session/:id/permission/:pid` | `POST /chat/session/:id/permission/:pid` |
| SSE 流 | `GET /event` | `GET /chat/events?session_id=` |

---

## 12. 模型测试结论

基于实际测试（`opencode 1.17.9` + Ollama/DeepSeek）：

| 模型 | Provider | reasoning | content | 建议 |
|---|---|---|---|---|
| `glm4:9b` | Ollama | ❌ 无 | ✅ 完整 | 推荐本地主力 |
| `deepseek-v4-pro` | DeepSeek API | ✅ 有 | ✅ 完整 | 推荐云端主力 |
| `qwen3.5:9b` | Ollama | ✅ 有 | ❌ 易截断 | 需调大输出限制 |

---

## 13. 关键约束与最佳实践

| 约束 | 说明 |
|---|---|
| **baseURL 以 `/v1` 结尾** | 无论 Ollama、vLLM 还是自研接口 |
| **模型必须显式声明** | `provider.<id>.models` 中列出所有可用模型 |
| **model 格式** | 必须为 `providerID/modelID` |
| **serve 不配置 CORS** | skill_runtime 不使用浏览器直接访问 OpenCode |
| **先 SSE 后 send** | Backend 先启动 SSE consumer 再调用 prompt_async |
| **权限双层控制** | 代码中 `opencode.json` 权限 + 操作系统 bwrap 沙箱 |
| **每个 stage 独立配置** | `opencode.json` 独立生成，互不影响 |
| **cwd 决定项目根** | `opencode serve` 以 workspace 为 cwd 启动 |
