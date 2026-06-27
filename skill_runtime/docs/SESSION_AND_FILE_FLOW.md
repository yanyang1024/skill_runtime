# 会话与文件流转 — 深度技术文档

> 面向开发者：理解 skill_runtime 中会话生命周期、SSE 流式通信、以及文件的完整流转链路。

---

## 目录

1. [会话模型](#1-会话模型)
2. [会话关联](#2-会话关联)
3. [文件流转](#3-文件流转)

---

## 1. 会话模型

### 1.1 会话的延迟创建

会话**不在 mount 时自动创建**，而是在用户首次发送消息时懒加载创建。

```
用户键入文字 → 点击发送
  │
  ├─ sendMessage(text)
  │   ├─ [无 sessionId] → getRuntimeStatus() 门控检查
  │   │   ├─ FAIL → setError("runtime 未就绪") → return
  │   │   └─ PASS → createSession()
  │   │             └─ POST /api/.../chat/session
  │   │                → opencode_client.createSession()
  │   │                   → POST opencode /session (x-opencode-directory header)
  │   └─ [有 sessionId] → 跳过
  │
  └─ sendMessage → POST /api/.../chat/session/:id/message
```

**源码位置：** `app/web/src/hooks/useChatSession.ts:59-79`，`app/server/routes/chat.ts:47-51`

### 1.2 四层调用链

```
Frontend (ChatInput)                  "用户输入"
    │
    ▼
useChatSession / chatApi              "前端状态管理 + fetch"
    │ POST /api/runs/.../chat/session
    ▼
Express routes/chat.ts                "gateRuntime() 门控 + 转发"
    │ createOpencodeSessionClient()
    ▼
opencode_client/index.ts              "强制注入 x-opencode-directory + Basic Auth"
    │ POST /session or /session/:id/prompt_async
    ▼
opencode serve (headless)             "LLM 推理 + 文件操作"
```

**源码位置：** `app/web/src/services/chatApi.ts:24-31`，`app/server/routes/chat.ts:37-51`，`app/opencode_client/index.ts:63-72`

### 1.3 x-opencode-directory 强制注入

每个发往 OpenCode 的 HTTP 请求都自动注入此 header。前端无法绕过——注入在 Gateway 层完成。

```typescript
// opencode_client/index.ts:68-73
function headers(workspacePath, authHeader, extra) {
  return {
    authorization: authHeader,
    "x-opencode-directory": encodeURIComponent(workspacePath),  // 强制注入
    ...extra,
  };
}
```

### 1.4 SSE 双层架构

系统有**两层独立的 SSE 连接**：

```
┌─────────────────────────────────────────────────────────────────┐
│ Layer 1: Backend 消费 OpenCode 的原始 /event SSE                 │
│                                                                 │
│ opencode serve ──GET /event──► OpencodeClient.streamEvents()    │
│                                  │                              │
│                                  ▼                              │
│                           processEventStream()                  │
│                           │                                     │
│                           ├─ 逐行解析 data: {json}              │
│                           ├─ 按 sessionId 过滤                  │
│                           ├─ normalizeOpenCodeEvent()            │
│                           │   (raw → ChatSSEEvent 映射)         │
│                           ├─ 写入审计日志 (session-stream.md)    │
│                           └─ emitter.emit("event", chatEvent)    │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ Layer 2: Frontend 消费 Backend 的归一化 SSE                      │
│                                                                 │
│ useSSE.ts ──EventSource──► GET /api/.../chat/events?session_id= │
│   │                                                             │
│   ├─ es.onmessage → parseSSEEvent → applyEvent()                │
│   │                                                             │
│   ├─ delta 事件: 推入 pendingDeltasRef → requestAnimationFrame   │
│   │              批量 flush → 追加到 MessagePart.content         │
│   │                                                             │
│   └─ 非 delta: 立即应用到 ChatMessage[]                          │
│                                                                 │
│   onerror: 指数退避重连 (1s→2s→4s→8s→10s, 最多 5 次)            │
└─────────────────────────────────────────────────────────────────┘
```

**源码位置：** `app/opencode_client/sse.ts:97-129,403-544`，`app/server/routes/chat.ts:212-256`，`app/web/src/hooks/useSSE.ts:55-131`

### 1.5 SSE 归一化事件映射

| OpenCode 原始事件 | ChatSSEEvent（归一化后） | 前端处理 |
|---|---|---|
| `message.created` | `message_start` | 创建空 ChatMessage |
| `message.part.created` | `part_start` | 追加 MessagePart |
| `message.part.delta` (text part) | `text_delta` | 追加 content |
| `message.part.delta` (reasoning part) | `reasoning_delta` | 追加 content |
| `tool.start` / `tool.delta` / `tool.end` | `tool_start` / `tool_delta` / `tool_end` | 工具调用面板 |
| `permission.updated` | `permission_request` | PermissionCard |
| `question.asked` | `question` | QuestionCard |
| `session.idle` | `message_end` + `run_status:completed` | 标记完成 |

**源码位置：** `app/opencode_client/sse.ts:186-400`

### 1.6 前端 Delta 批处理

前端使用 `requestAnimationFrame` 将高频 delta 事件（可达 50+ tokens/s）批量合并，每帧只触发一次 React 更新。

```
text_delta("你") ─┐
text_delta("好") ─┤ → pendingDeltasRef → requestAnimationFrame
text_delta("！") ─┘                            │
                                               ▼
                                     flushPendingDeltas()
                                     setMessages([...prev])
                                     React render
```

**源码位置：** `app/web/src/hooks/useSSE.ts:29-52`

### 1.7 会话生命周期状态机

```
                    ┌──────────────┐
                    │ NOT CREATED  │  sessionId = null
                    │ messages = []│
                    └──────┬───────┘
                           │ sendMessage(text)
                           │ runtime healthy? → createSession()
                           ▼
                    ┌──────────────┐
                    │   CREATED    │  sessionId = "<id>"
                    │              │
                    └──────┬───────┘
                           │ sendPromptAsync → POST prompt_async
                           │ ensureEventStream → SSE consumer 启动
                           ▼
                    ┌──────────────┐
                    │  STREAMING   │  streaming = true
                    │              │  EventSource 接收 ChatSSEEvent
                    └──────┬───────┘
                           │
                           ├─ session.idle → message_end + run_status
                           │                 streaming = false
                           │                 (可继续发送 → 返回 STREAMING)
                           │
                    ┌──────▼───────┐
                    │   DELETION   │  任一触发:
                    │              │  • 点击 Abort → abortSession + deleteSession
                    └──────────────┘  • 停止 Stage → stopStageRuntime 清理链
                                      • 切换 Stage → React remount 遗弃
                                      • 刷新页面 → 前端 sessionId 丢失
                                      • 进程崩溃 → 所有会话随进程消亡
```

### 1.8 Abort 完整流程

```
用户点击 "中止"
  │
  ├─ closeSSE()           ← 关闭浏览器 EventSource + 刷新缓冲区
  ├─ abortSession()       ← POST /session/:id/abort → OpenCode 停止推理
  ├─ 拒绝所有 pendingQuestions ← replyQuestion({ rejected: true })
  ├─ wait 500ms           ← 等待 abort 传播
  └─ deleteSession()      ← DELETE /session/:id → 清理 OpenCode 服务端会话
     └─ removeSSEEmitter() ← 清理 Backend EventEmitter
```

**源码位置：** `app/web/src/hooks/useChatSession.ts:115-147`，`app/server/stageRuntimeManager.ts:445-521`

---

## 2. 会话关联

### 2.1 层级关系

```
Skill (skills/<id>/)
  └── Run (runs/<run-id>/)
        └── Stage (runs/<run-id>/<stage-id>/)
              └── Attempt (attempts/attempt-NNN/)
                    ├── workspace/        ← opencode serve 的 cwd
                    ├── input/
                    └── output/
                          │
                          └── 0..N Sessions (opencode 内部的 session)
                              每个 session 有独立的对话历史和 SSE 流
```

### 2.2 Session ID 的作用域

Session 绑定到**特定的 stage attempt**，通过 `serverId` 关联：

```typescript
// app/server/routes/chat.ts:28
const serverId = `${runId}-${stageId}-${attempt}`;
const runtime = getRuntime(serverId);
```

每个 stage attempt 有**独立**的 opencode serve 进程和独立的端口。Session 是 opencode 进程内部的逻辑单元——一个进程可以有多个 session。

### 2.3 Stage 切换时 Session 的命运

```
用户切换 Stage
  │
  ├─ App.tsx: setCurrentStageId(newStage)
  ├─ ChatPage 的 key 属性变化 → React 卸载旧组件、挂载新组件
  │
  ├─ 旧 useChatSession 销毁:
  │   ├─ mountedRef = false
  │   ├─ EventSource.close()
  │   ├─ cancelAnimationFrame
  │   ├─ clearTimeout (reconnect timer)
  │   └─ flushPendingDeltas()
  │
  └─ 旧 Session 在 opencode 服务端:
      └─ 遗弃 — 不调用 abort/delete
         保留直到: stage 停止 或 进程退出
```

**注意：** 旧 session 不会自动清理。用户切换 stage 后如果立即切换回来，前端 sessionId 为 null，需要发送新消息才会创建新 session。

### 2.4 Stage 停止时的 Session 清理链

```
stopStageRuntime()
  │
  ├─ 1. runtime.abort_event_stream()        ← 中止 Backend SSE consumer
  │
  ├─ 2. client.abortSession(active_session) ← POST /session/:id/abort
  │    client.deleteSession(active_session)  ← DELETE /session/:id
  │    abortEventStream()                   ← 中止 AbortController
  │    removeSSEEmitter()                   ← 删除 EventEmitter
  │    runtime.active_session_id = undefined
  │
  ├─ 3. unwatchStageOutput()               ← 停止产物监听
  │
  └─ 4. SIGTERM (5s → SIGKILL)             ← 杀死 opencode serve 进程
       → 进程内所有 session 一起消亡
```

**源码位置：** `app/server/stageRuntimeManager.ts:445-521`

### 2.5 页面刷新后的 Session 状态

**Session 不可恢复。** 原因：

- `useChatSession` 初始化为 `sessionId = null`, `messages = []`
- 前端提供了 `chatApi.getSession()` 和 `chatApi.getMessages()` 但**没有任何组件调用它们**
- 刷新后用户必须发送新消息 → 触发延迟创建新 session → **brand new** 会话

### 2.6 Prompt Assistant 的消息桥接

```
PromptAssistant                    App.tsx                      ChatPage
    │                                │                            │
    │ onSend(text)                   │                            │
    ├───────────────────────────────►│                            │
    │                                │ setPendingSendText(text)   │
    │                                │                            │
    │                                │           useEffect        │
    │                                ├───────────────────────────►│
    │                                │     sendMessage(text)      │
    │                                │     onPendingSendConsumed()
    │                                │◄───────────────────────────┤
```

**源码位置：** `App.tsx:18,138-139`，`ChatPage.tsx:34-39`，`PromptAssistant.tsx:68`

---

## 3. 文件流转

### 3.1 Stage 启动时的目录创建

`buildStageWorkspace()` 在 `runs/<run-id>/<stage-id>/attempts/attempt-NNN/` 下创建：

```
attempt-NNN/
├── workspace/                    ← opencode.json + .opencode/
│   ├── opencode.json             ← 生成的 OpenCode 配置
│   ├── .opencode/skills/<id>/    ← 供 OpenCode 自动发现的 skill 副本
│   └── work/                     ← 仅 work_writable=true 时创建
├── input/
│   ├── skill_snapshot/           ← skill stable/preview 副本（只读）
│   ├── previous_stage_output/    ← carry_outputs 来的文件
│   ├── session_log/              ← 仅当 sessionLogPath 提供
│   ├── api_docs/                 ← 仅当 apiDocsAvailable=true
│   └── director-review.md        ← 来自 rehearse-preview 的特殊 copy
├── output/                       ← 初始为空，OpenCode 运行时写入
├── server.json                   ← 运行时元信息
└── stage-digest.md               ← 阶段摘要模板
```

**源码位置：** `app/workspace_builder/builder.ts:58-147`

### 3.2 carry_outputs 机制

`carry_outputs` 定义了从 A stage 到 B stage 时，哪些产物文件应被**精确复制**到 B 的 `input/previous_stage_output/`。

**定义位置：** `app/orchestration/stageTransitions.ts:14-121`

| 从 | 到 | 携带文件 |
|---|---|---|
| `observe-log-review` | `grow-plan` | `replay-card.md`, `growth-opportunities.md` |
| `observe-api-scan` | `grow-plan` | `api-skill-growth-plan.md` |
| `grow-plan` | `grow-build` | `growth-plan.md`, `planned-file-changes.md`, `archive-plan.md` |
| `grow-build` | `grow-quality-review` | `patch-notes.md`, `changed-files.md` |
| `grow-quality-review` | `grow-build` (fix) | `quality-review.md`, `followup-fix-plan.md` |
| `rehearse-preview` | `rehearse-iteration` | `director-review.md`, `preview-session-log` |
| `rehearse-preview` | `stabilize-release` | `director-review.md` |
| `rehearse-iteration` | `stabilize-release` | `iteration-review.md` |

**执行流程（`builder.ts:105-127`）：**

1. 从 `getRecommendedNextStages(previousStageId)` 获取所有预定义流转
2. 找到匹配 `from → to` 的那一条
3. 如果 `carry_outputs` 非空 → **逐文件复制**，单个文件缺失不影响其他
4. 如果 `carry_outputs` 为空（找到了流转但无文件） → 跳过
5. 如果**没有预定义流转** → 回退到整体目录复制（兼容旧行为）

### 3.3 director-review.md 的双路径传递

`director-review.md` 有**专用**的传递逻辑（除了 carry_outputs 之外）：

```
rehearse-preview 完成
  │
  ├─ 路径 A: carry_outputs
  │   → rehearse-iteration input/previous_stage_output/director-review.md
  │
  └─ 路径 B: copyDirectorReview() 特殊 case
      → rehearse-iteration input/director-review.md  (直接置于 input 根)
```

**源码位置：** `app/workspace_builder/stageInputs.ts:54-68,75-79`

### 3.4 文件上传完整链路

```
1. 用户点击 📎 → 选择本地文件
     ChatInput.tsx:34-51
     │
2. FormData POST → /api/runs/:run/stage/:stage/upload
     artifacts.ts:78-107
     multer 解析 → memoryStorage (10MB limit)
     │
3. 保存到 runs/<run>/<stage>/attempts/NNN/input/<filename>
     │
4. ChatInput 显示 📎 + 文件名 + 删除按钮
     │
5. 用户点击 Send
     useChatSession.ts:81-86
     消息文本自动追加: "[附件: foo.pdf 已上传到 /path/foo.pdf]"
     │
6. POST /api/.../chat/session/:id/message
     routes/chat.ts:115
     │
7. OpenCode 接收 prompt → 通过工具读取 input/ 下的文件
     文件在 workspace 内可见 (x-opencode-directory 作用域)
     │
8. AI 处理 → 产物写入 output/
     artifactWatcher 检测 → 全局 SSE → ArtifactPanel 刷新
```

### 3.5 产物从生成到展示的 9 步链路

```
① OpenCode AI 写入文件到 output/
    │
② fs.watch(outputDir) 检测变化 (artifactWatcher.ts)
    │ 200ms debounce
    │ scanMtimes() 比对 mtime
    ▼
③ emitArtifactChanged({ run_id, stage_id, attempt, name })
    │
④ events.ts: EventEmitter.emit("artifact_changed", data)
    │
⑤ 所有 /api/events SSE 客户端收到:
    event: artifact_changed
    data: {"type":"artifact_changed","run_id":"...","name":"replay-card.md"}
    │
⑥ ArtifactPanel: SSE 事件 → 过滤 run_id/stage_id/attempt
    │
⑦ refresh() → GET /api/.../artifacts → readdir(output/) → 返回文件列表
    │
⑧ 用户点击文件名 → handleSelect() → GET /api/.../artifact/:name
    → readFile → 内容展示在 <pre> 中
    │
⑨ 用户点击 ⬇ → handleDownload() → GET ...?download=1
    → Content-Disposition: attachment → 浏览器下载
```

### 3.6 跨阶段共享 vs 每阶段独立的文件矩阵

| 文件/目录 | 作用域 | 持久化位置 |
|---|---|---|
| Skill stable 版本 | 跨所有 run 共享 | `skills/<id>/stable/` |
| Skill preview 版本 | 跨所有 run 共享 | `skills/<id>/previews/<pid>/` |
| Run 状态 | Run 内跨 stage 共享 | `runs/<id>/run-state.yaml` |
| 流转历史 | Run 内跨 stage 共享 | `runs/<id>/transitions.yaml` |
| Stage 状态 | 每 stage 独立 | `runs/<id>/<stage>/.../stage-state.yaml` |
| opencode.json | 每 stage 独立 | `workspace/opencode.json` |
| .opencode/skills/ | 每 stage 独立（**副本**） | `workspace/.opencode/` |
| input/ | 每 stage 独立 | `runs/<id>/<stage>/attempts/NNN/input/` |
| output/ | 每 stage 独立 | `runs/<id>/<stage>/attempts/NNN/output/` |
| work/ | 每 stage 独立（仅 writable） | `runs/<id>/<stage>/attempts/NNN/workspace/work/` |
| 快照 | 跨 run 共享 | `.Grow_backups/` |
| 归档 | Skill 级共享 | `skills/<id>/.archive/` |
| Prompt 库 | 全局共享 | `prompt_library/` |
| API 文档 | Skill 级共享 | `api_docs/<id>/` |

### 3.7 文件大小限制

| 限制 | 值 | 源码位置 | 适用范围 |
|---|---|---|---|
| 上传文件 | 10 MB | `artifacts.ts:14` | `multer` 限制 |
| 产物读取 | 10 MB | `artifacts.ts:14` | 超限返回 413 |
| multer 内存缓冲 | 10 MB (隐含) | 同上 | 内存存储模式 |

### 3.8 bwrap 文件可见性

bwrap 使用 `--unshare-pid --unshare-ipc --unshare-uts` 隔离模式（**不**隔离 mount namespace）。在 `mounts.yaml` 中显式挂载的目录：

| 挂载 | 模式 | 说明 |
|---|---|---|
| `REPO_ROOT` | `--ro-bind` | 项目根只读 |
| `workspace/` | `--bind` | 当前 stage workspace 可读写 |
| `output/` | `--bind` | 产物目录可读写 |
| `skills/<id>/stable/` | `--ro-bind` | stable skill 只读 |
| `skills/<id>/previews/<pid>/` | `--ro-bind` 或 `--bind` | 取决于 `skill_mount` |
| `/usr` | `--ro-bind` | 系统路径可读 |
| `/usr/lib → /lib` | `--ro-bind` | 共享库可读 |
| `/usr/lib64 → /lib64` | `--ro-bind` | 动态链接器可读 |
| opencode 二进制目录 | `--ro-bind` | **动态检测**，根据 `which opencode` 结果自动挂载 |

### 3.9 work/ 同步到 Preview

仅 `work_writable` 的 stage（`grow-build`、`rehearse-iteration`）在停止时触发：

```
停止 Stage
  │
  ├─ contract.skill_mount === "preview-writable"?
  │   │
  │   └─ YES → syncWorkToPreview()
  │            │
  │            ├─ 对比 work/ 与 preview/ 文件列表
  │            ├─ preview 中已删除的文件 → archiveFiles() 归档（不删除）
  │            └─ 复制 work/ → skills/<id>/previews/<pid>/
  │
  └─ 失败时: console.error + 继续（不阻止 state 更新）
```

**源码位置：** `app/workspace_builder/builder.ts:149-181`，`app/server/routes/stages.ts:110-115`
