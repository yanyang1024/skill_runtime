# 架构设计

## 一句话

agent_service 是一个 Agent-as-a-Service 的 HTTP 封装层：把每个 app 的 OpenCode
进程隔离在 bwrap 沙箱里、用 systemd user 服务管理生命周期，再通过 SSE 事件翻译
把 Agent 的复杂执行过程伪装成标准 OpenAI LLM API。

## 数据流

```
Client (OpenAI SDK / curl)
  → POST /v1/chat/completions (X-App-Id / X-Session-Id header)
  → FastAPI (app/api/openai.py)
      ├─ 校验 id、取/建 AppSession（sqlite 懒绑定映射）
      ├─ 实例未运行 → AppManager.start()
      │     → systemctl --user start opencode-app@{app_id}
      │     → scripts/start_agent.sh → bwrap 沙箱 → opencode serve --port PORT
      │     → 轮询 GET /global/health 直到 healthy
      └─ OpenCodeClient.stream_chat()
            → GET /event 建立 SSE → POST /session/{id}/prompt_async
            → OpenCode 加载 agent → 调用 LLM（deepseek 等）
            → Agent 执行 tool calls（bash/write/edit/skill...）
            → SSE 事件 → 翻译为 OpenAI chunk → StreamingResponse → Client
```

## 进程模型

- 每个 app 一个独立 OpenCode 进程，systemd user 模板单元 `opencode-app@.service`，
  `%i` 即 app_id；崩溃后 `Restart=on-failure` 自动拉起
- 端口确定性分配：`PORT = 45000 + (md5(app_id) % 20536)`，
  Python 侧（`instance_manager.port_for`）与 bash 侧（`start_agent.sh`）同一公式
- API 服务本身也是 systemd user 服务：`agent-service.service`（uvicorn，8000 端口）
- 空闲回收：API 服务后台任务每 `IDLE_CHECK_INTERVAL`（默认 300s）扫描，
  空闲超 `IDLE_TIMEOUT`（默认 1800s）的实例自动 `systemctl stop`

## 沙箱模型（scripts/start_agent.sh）

| 层 | 内容 |
|---|---|
| 文件系统 | `--ro-bind / /` 全盘只读；`/etc/shadow`、`/etc/gshadow` 绑定到 /dev/null；`/etc/ssh` 挂 tmpfs |
| home 隔离 | `--tmpfs /home` 遮住宿主机 home，再把 `data/apps/{app_id}/home` 绑定为沙箱内 `/home/yy`（可写） |
| 运行时恢复 | ro-bind `~/.npm-global`（opencode 二进制，因 /home 被 tmpfs 遮盖需显式恢复） |
| 配置注入 | `config/opencode/` 模板在每次启动时 `cp -a` 成 per-app 可写副本 `data/apps/{app_id}/opencode-config/`，绑定为 `~/.config/opencode`；`config/auth.json` 只读单文件注入 |
| 可写目录 | `data/apps/{app_id}/tmp` → `/tmp`；`data/apps/{app_id}/`（含 workspace） |
| 命名空间 | `--unshare-pid --unshare-ipc --die-with-parent --new-session` |

注意：opencode 启动时会往自己的配置目录写 `.gitignore` 等运行时文件，所以配置
目录不能以 ro-bind 挂载（会 EROFS），这是采用「模板 → per-app 可写副本」方案的原因。

## 事件翻译层（app/services/opencode_client.py）

先建立 `GET /event` SSE 连接、再发 `prompt_async`（保证不漏事件，且发送失败能
直接传播错误）。用 part_registry 跟踪 part_id → part type，按类型翻译 delta：

| OpenCode 事件 | OpenAI chunk |
|---|---|
| `message.part.delta`（text） | `delta.content` |
| `message.part.delta`（reasoning） | `delta.reasoning_content` |
| `session.idle` | `finish_reason: "stop"` + `data: [DONE]` |
| `session.error` | error 内容 chunk + `finish_reason: "error"` |
| `question.asked` | 自动 `POST /question/{id}/reply`（`[["yes"]]`） |
| `permission.asked` | 自动 `POST /permission/{id}/reply`（`"always"`） |

tool/step/todo 等过程事件不透出，保持 OpenAI 协议干净。

## 会话模型

- 调用方以 `X-Session-Id` 标识会话；不传则服务端生成 uuid，通过响应头
  `X-Session-Id` 和非流式响应体的 `x_session_id` 返回
- sqlite 表 `app_sessions` 记录 `session_id → (app_id, opencode_session_id,
  workspace_path)` 的映射；**懒绑定**：首条消息才创建 OpenCode session
- 已绑定的 opencode session 失效时（实例数据被清等）自动重建，无需调用方干预
- 每个会话独立工作目录 `data/apps/{app_id}/workspace/{session_id}/`，经
  `x-opencode-directory` header 注入，Agent 文件操作被限制在该目录

## 代码结构

```
app/
├── config.py                  # 路径/端口/超时/凭据（环境变量可覆盖）
├── db.py                      # sqlite3：app_sessions 懒绑定映射
├── schemas.py                 # OpenAI 请求模型、chunk 构造、id 白名单校验
├── main.py                    # FastAPI 入口、空闲回收任务、全局异常兜底
├── api/
│   ├── openai.py              # /v1/chat/completions、/v1/models
│   └── apps.py                # 实例生命周期、会话列表/历史/中止/删除
└── services/
    ├── instance_manager.py    # AppManager：systemd 启停、健康检查、空闲回收
    ├── opencode_client.py     # OpenCode HTTP/SSE 客户端 + 事件翻译 + Registry
    └── workspace.py           # 会话工作目录创建/清理
scripts/
├── start_agent.sh             # bwrap 沙箱启动（systemd 单元 ExecStart）
└── install.sh                 # 安装 systemd 单元并启动 API 服务
systemd/
├── opencode-app@.service      # OpenCode 实例模板单元
└── agent-service.service      # API 服务单元
config/
├── opencode/                  # opencode 配置模板（独立于宿主机）
└── auth.json                  # LLM 凭据（gitignore，600）
data/                          # 全部运行时状态（gitignore）
```
