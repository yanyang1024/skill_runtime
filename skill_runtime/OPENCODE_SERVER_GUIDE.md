# ~~DEPRECATED — 已合并至 docs/opencode-integration.md~~

> 本文档与 `OPENCODE_SERVER_GUIDE_new.md` 已合并为 `docs/opencode-integration.md`，后者包含 skill_runtime 与 OpenCode 集成的完整说明。

---

# OpenCode Server 集成与测试指南（历史档案）

> 基于实际测试整理，包含配置、启动、可用端点、功能验证示例。
>
> 测试环境：`opencode 1.17.9`，后端模型包括 Ollama 本地模型（`qwen3.5:9b`、`glm4:9b`）和 DeepSeek API（`deepseek-v4-pro`）。

---

## 一、架构关系

```
┌─────────────────┐     HTTP API      ┌─────────────────┐     v1/chat/completions     ┌──────────────┐
│   你的应用       │  ═══════════════► │  opencode serve │  ════════════════════════► │ 你的推理接口  │
│ (Web/桌面/脚本)  │  ◄═══════════════ │   (端口4096)    │  ◄════════════════════════ │ (Ollama/等)  │
└─────────────────┘   SSE/JSON 响应    └─────────────────┘      OpenAI 兼容格式         └──────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  MCP 工具     │
                    │  文件系统     │
                    │  Git 操作     │
                    └──────────────┘
```

**核心要点**：

- 客户端调用的是 OpenCode 自己的 **OpenAPI 3.1 端点**，不是 OpenAI 兼容接口。
- OpenCode 内部通过配置的 Provider 调用你的 `v1/chat/completions` 推理接口。
- 支持 Session 管理、Agent 编排、SSE 流式、文件附件、MCP 工具等能力。

---

## 二、配置文件

项目根目录创建 `opencode.json`：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "ollama/qwen3.5:9b",
  "server": {
    "port": 4096,
    "hostname": "127.0.0.1",
    "mdns": false,
    "mdnsDomain": "opencode.local",
    "cors": ["http://localhost:5173", "http://localhost:3000"]
  },
  "provider": {
    "ollama": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Ollama (local)",
      "options": {
        "baseURL": "http://172.24.16.1:11434/v1"
      },
      "models": {
        "qwen3.5:9b": {
          "name": "Qwen 3.5 9B",
          "capabilities": {
            "tools": true,
            "input": ["text"],
            "output": ["text"]
          },
          "limit": {
            "context": 262144,
            "output": 8192
          }
        },
        "glm4:9b": {
          "name": "GLM-4 9B",
          "capabilities": {
            "tools": true,
            "input": ["text"],
            "output": ["text"]
          },
          "limit": {
            "context": 131072,
            "output": 8192
          }
        }
      }
    },
    "deepseek": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "DeepSeek API",
      "options": {
        "baseURL": "https://api.deepseek.com/v1",
        "apiKey": "secret-api-key"
      },
      "models": {
        "deepseek-v4-pro": {
          "name": "DeepSeek V4 Pro",
          "capabilities": {
            "tools": true,
            "input": ["text"],
            "output": ["text"]
          },
          "limit": {
            "context": 64000,
            "output": 8192
          }
        }
      }
    }
  }
}
```

### 配置说明

| 配置项 | 说明 |
|--------|------|
| `model` | 默认模型，必须写成 `providerID/modelID` 格式 |
| `provider.<id>.npm` | 固定使用 `@ai-sdk/openai-compatible`（你的接口是 OpenAI 兼容格式） |
| `baseURL` | **必须以 `/v1` 结尾**，指向推理服务 |
| `models` | 必须显式声明，key 要与请求时的 `modelID` 完全一致 |
| `server.cors` | 浏览器端应用需要配置，否则跨域会被拦截 |
| `provider.options.apiKey` | DeepSeek 等云端 API 需要在此配置；本地 Ollama 不需要 |

> 生产环境建议将 `apiKey` 改为通过环境变量或 secrets 注入，避免明文写入配置文件。

---

## 三、启动服务器

### 方式 1：显式指定配置（推荐）

```bash
OPENCODE_CONFIG=/home/yy/opencode_server_use/opencode.json \
OPENCODE_SERVER_PASSWORD=testpass123 \
opencode serve --port 4096 --hostname 127.0.0.1
```

### 方式 2：自动读取默认配置

```bash
export OPENCODE_SERVER_PASSWORD="your-secure-password"
export OPENCODE_SERVER_USERNAME="admin"   # 可选，默认 opencode
opencode serve
```

默认会读取 `~/.config/opencode/opencode.jsonc` 或项目根目录 `./opencode.json`。

### 验证启动

```bash
curl -u opencode:testpass123 http://127.0.0.1:4096/global/health
```

预期返回：

```json
{"healthy": true, "version": "1.17.9"}
```

---

## 四、已验证的端点与功能

### 4.1 基础端点

| 端点 | 方法 | 用途 | 测试状态 |
|------|------|------|----------|
| `/global/health` | GET | 健康检查 | ✅ |
| `/doc` | GET | OpenAPI 3.1 规范（JSON 或 Swagger UI） | ✅ |
| `/config` | GET | 当前生效配置 | ✅ |
| `/provider` | GET | v1 Provider 列表（含自定义 provider） | ✅ |
| `/api/provider` | GET | v2 Provider 列表 | ✅ |
| `/api/model` | GET | v2 模型列表 | ✅ |
| `/api/skill` | GET | Skill 列表 | ✅ |
| `/api/fs/list` | GET | 列出目录文件 | ✅ |

### 4.2 会话管理端点

| 端点 | 方法 | 用途 | 测试状态 |
|------|------|------|----------|
| `/session` | POST | 创建会话 | ✅ |
| `/session` | GET | 列会话 | ✅ |
| `/session/{id}` | GET | 获取会话详情 | ✅ |
| `/session/{id}` | DELETE | 删除会话 | ✅ |
| `/session/{id}/fork` | POST | Fork 会话 | ✅ |
| `/session/{id}/message` | GET | 获取历史消息 | ✅ |
| `/session/{id}/message` | POST | 发送消息并同步返回完整结果 | ✅ |
| `/session/{id}/message/{messageID}` | GET | 获取单条消息详情 | ✅ |
| `/session/{id}/message/{messageID}` | DELETE | 删除单条消息 | ✅ |
| `/session/{id}/prompt_async` | POST | 异步发送消息 | ✅ |
| `/session/{id}/abort` | POST | 中止会话处理 | ✅ |
| `/session/{id}/revert` | POST | 回退到指定消息 | ✅ |
| `/session/{id}/unrevert` | POST | 恢复被回退的消息 | ✅ |
| `/session/{id}/share` | POST | 创建分享链接 | ✅ |
| `/session/{id}/share` | DELETE | 取消分享 | ✅ |
| `/event` | GET | SSE 事件流订阅 | ✅ |

### 4.3 TUI / CLI 相关

| 功能 | 命令 | 测试状态 |
|------|------|----------|
| attach 连接 | `opencode attach http://127.0.0.1:4096` | ✅ TUI 成功连接 |
| run --attach | `opencode run --attach http://127.0.0.1:4096 ...` | ✅ 创建会话并执行 |

---

## 五、典型调用示例

### 5.1 创建会话

```bash
SESSION_ID=$(curl -s -u opencode:testpass123 -X POST http://127.0.0.1:4096/session \
  -H "Content-Type: application/json" \
  -d '{"title":"我的会话"}' | jq -r '.id')

echo "Session ID: $SESSION_ID"
```

### 5.2 同步发送消息

```bash
curl -s -u opencode:testpass123 -X POST "http://127.0.0.1:4096/session/${SESSION_ID}/message" \
  -H "Content-Type: application/json" \
  -d '{
    "parts": [{"type": "text", "text": "你好，请用一句话介绍自己"}],
    "model": {"providerID": "ollama", "modelID": "glm4:9b"}
  }' | jq .
```

### 5.3 异步发送 + SSE 流式监听

```bash
# 异步发送
curl -s -u opencode:testpass123 -X POST "http://127.0.0.1:4096/session/${SESSION_ID}/prompt_async" \
  -H "Content-Type: application/json" \
  -d '{"parts": [{"type": "text", "text": "你好"}]}'

# 监听事件流
curl -s -N -u opencode:testpass123 http://127.0.0.1:4096/event
```

SSE 事件类型：

| 事件类型 | 说明 |
|----------|------|
| `server.connected` | 连接成功 |
| `session.updated` | 会话信息更新 |
| `session.status` | 会话状态变更（`busy` / `idle`） |
| `message.updated` | 消息更新 |
| `message.part.updated` | 消息片段创建/更新 |
| `message.part.delta` | 文本增量（流式输出） |
| `session.idle` | 会话进入空闲状态 |

### 5.4 SSE 流式输出与 thinking/content 分离

OpenCode 的 SSE 事件流通过 `GET /event` 获取，关键事件类型：

| 事件类型 | 说明 |
|----------|------|
| `server.connected` | 连接成功 |
| `session.updated` | 会话信息更新 |
| `session.diff` | 会话差异（文件变更等） |
| `session.status` | 会话状态变更（`busy` / `idle`） |
| `message.updated` | 消息更新 |
| `message.part.updated` | 消息片段创建/更新 |
| `message.part.delta` | 消息片段增量（流式输出） |
| `session.idle` | 会话进入空闲状态 |

**重要**：`message.part.delta` 只会告诉你 `partID` 和 `field=text`，不会直接区分这是 `thinking` 还是 `content`。你必须结合 `message.part.updated` 事件中的 `part.type` 来区分：

- `part.type == "reasoning"` → thinking 内容
- `part.type == "text"` → content 内容

#### SSE 监听示例

```bash
# 先异步发送消息
curl -s -u opencode:testpass123 -X POST "http://127.0.0.1:4096/session/${SESSION_ID}/prompt_async" \
  -H "Content-Type: application/json" \
  -d '{"parts":[{"type":"text","text":"你好，请用一句话介绍自己"}]}'

# 再监听事件流
curl -s -N -u opencode:testpass123 http://127.0.0.1:4096/event
```

#### Python 区分 thinking 与 content

```python
import json, requests

parts = {}  # partID -> {"type": "text"/"reasoning", "text": str}

with requests.get("http://127.0.0.1:4096/event", auth=("opencode", "testpass123"), stream=True) as resp:
    resp.encoding = "utf-8"  # 必须显式设置，否则中文可能乱码
    for line in resp.iter_lines(decode_unicode=True):
        if not line or not line.startswith("data: "):
            continue
        event = json.loads(line[6:])
        etype = event.get("type")
        props = event.get("properties", {})

        if etype == "message.part.updated":
            part = props.get("part", {})
            if part.get("type") in ("text", "reasoning"):
                parts[part["id"]] = {"type": part["type"], "text": part.get("text", "")}

        elif etype == "message.part.delta":
            part_id = props.get("partID")
            delta = props.get("delta", "")
            if part_id in parts:
                parts[part_id]["text"] += delta
                # 实时打印
                prefix = "[thinking]" if parts[part_id]["type"] == "reasoning" else "[content]"
                print(f"{prefix} {delta}", end="", flush=True)

        elif etype == "session.idle":
            print("\n[done]")
            break
```

#### 实测结果对比

| 模型 | 是否产生 reasoning | content 输出 | 说明 |
|------|-------------------|--------------|------|
| `glm4:9b` | ❌ 无 | ✅ 完整 | 只有 text part |
| `deepseek-v4-pro` | ✅ 有 | ✅ 完整 | 先 reasoning，后 text |
| `qwen3.5:9b` | ✅ 有 | ❌ 被截断 | reasoning 占满 token，无 text |

**deepseek-v4-pro 实测 SSE 流**：

```
[part.updated] type=reasoning partID=...
[part.delta]  delta='The user is asking me to introduce myself...'
[part.updated] type=text partID=...
[part.delta]  delta='你好！我是 OpenCode...'
[part.updated] type=step-finish reason=stop
```

### 5.5 同会话多轮对话

在同一个 `SESSION_ID` 上多次调用 `POST /session/{id}/message` 即可，OpenCode 会自动维护上下文。

```bash
# 第一轮
curl -s -u opencode:testpass123 -X POST "http://127.0.0.1:4096/session/${SESSION_ID}/message" \
  -d '{"parts":[{"type":"text","text":"你好，我叫 Kimi"}]}'

# 第二轮（基于同一 SESSION_ID）
curl -s -u opencode:testpass123 -X POST "http://127.0.0.1:4096/session/${SESSION_ID}/message" \
  -d '{"parts":[{"type":"text","text":"我刚才说了我叫什么？"}]}'

# 第三轮
curl -s -u opencode:testpass123 -X POST "http://127.0.0.1:4096/session/${SESSION_ID}/message" \
  -d '{"parts":[{"type":"text","text":"能帮我写一段 Python 快速排序吗？"}]}'
```

### 5.6 会话 Fork

```bash
FORK_ID=$(curl -s -u opencode:testpass123 -X POST "http://127.0.0.1:4096/session/${SESSION_ID}/fork" \
  -H "Content-Type: application/json" \
  -d '{}' | jq -r '.id')

echo "Forked session: $FORK_ID"
```

Fork 后的会话会继承原会话全部消息历史，可独立继续对话。

### 5.7 文件附件

```bash
curl -s -u opencode:testpass123 -X POST "http://127.0.0.1:4096/session/${SESSION_ID}/message" \
  -H "Content-Type: application/json" \
  -d '{
    "parts": [
      {"type": "text", "text": "请 review 这段代码，指出问题并优化"},
      {"type": "file", "mime": "text/x-python", "url": "file:///home/yy/opencode_server_use/sample_code.py"}
    ],
    "model": {"providerID": "ollama", "modelID": "glm4:9b"}
  }' | jq .
```

> 注意：文件附件必须提供 `mime` 和 `url`，`url` 使用 `file://` 协议指向本地文件路径。

### 5.8 删除会话

```bash
curl -s -u opencode:testpass123 -X DELETE "http://127.0.0.1:4096/session/${SESSION_ID}"
```

删除后再访问会返回 404。

### 5.9 中止会话处理（Abort）

用于停止当前正在进行的 AI 推理或命令执行。

```bash
# 先发送一个异步长提示
curl -s -u opencode:testpass123 -X POST "http://127.0.0.1:4096/session/${SESSION_ID}/prompt_async" \
  -H "Content-Type: application/json" \
  -d '{"parts":[{"type":"text","text":"请详细解释机器学习的原理，写3000字"}]}'

# 立即中止
curl -s -u opencode:testpass123 -X POST "http://127.0.0.1:4096/session/${SESSION_ID}/abort" \
  -H "Content-Type: application/json" \
  -d '{}'
```

预期返回：`true`

### 5.10 回退到上一轮消息（Revert）

将会话回退到某条消息，该消息之后的所有消息会被撤销，可在此基础上重新对话。

```bash
# 假设 MESSAGE_ID 是要回退到的消息 ID
MESSAGE_ID="msg_xxxxxxxxxxxx"

curl -s -u opencode:testpass123 -X POST "http://127.0.0.1:4096/session/${SESSION_ID}/revert" \
  -H "Content-Type: application/json" \
  -d "{\"messageID\":\"${MESSAGE_ID}\"}" | jq .

# 回退后继续对话
curl -s -u opencode:testpass123 -X POST "http://127.0.0.1:4096/session/${SESSION_ID}/message" \
  -H "Content-Type: application/json" \
  -d '{"parts":[{"type":"text","text":"基于上文重新回答"}]}'
```

实际测试结果：回退到第 2 轮消息后，第 3 轮及其回复被移除，新的提问替代了原第 2 轮的问题，上下文正确保留。

### 5.11 恢复被回退的消息（Unrevert）

```bash
curl -s -u opencode:testpass123 -X POST "http://127.0.0.1:4096/session/${SESSION_ID}/unrevert" \
  -H "Content-Type: application/json" \
  -d '{}'
```

### 5.12 导出/分享会话

#### 方式一：导出完整对话 JSON

```bash
curl -s -u opencode:testpass123 "http://127.0.0.1:4096/session/${SESSION_ID}/message?limit=100" \
  > conversation.json
```

返回数组，每个元素包含 `info`（消息元数据）和 `parts`（消息内容片段）。

#### 方式二：获取单条消息

```bash
MESSAGE_ID="msg_xxxxxxxxxxxx"
curl -s -u opencode:testpass123 "http://127.0.0.1:4096/session/${SESSION_ID}/message/${MESSAGE_ID}" | jq .
```

#### 方式三：创建公开分享链接

```bash
curl -s -u opencode:testpass123 -X POST "http://127.0.0.1:4096/session/${SESSION_ID}/share" \
  -H "Content-Type: application/json" \
  -d '{}' | jq '.share.url'
```

实际测试返回示例：`"https://opncd.ai/share/iGuXvk2u"`

取消分享：

```bash
curl -s -u opencode:testpass123 -X DELETE "http://127.0.0.1:4096/session/${SESSION_ID}/share"
```

---

## 六、模型测试结论

| 模型 | Provider | 表现 | 建议 |
|------|----------|------|------|
| `glm4:9b` | Ollama | ✅ 响应稳定，约 5 秒，回复完整 | **推荐作为本地主力模型** |
| `deepseek-v4-pro` | DeepSeek API | ✅ 响应快，约 2~3 秒，质量高 | **推荐作为云端主力模型** |
| `qwen3.5:9b` | Ollama | ⚠️ 可用，但默认 thinking 占 token，短回复易被截断 | 如需使用，建议调大输出限制或关闭 thinking |

### 实际测试结果片段

**glm4:9b**：

```
AI: 你好！我是 OpenCode 的智能助手，帮助你进行编程和软件开发相关的任务。
finish: stop, tokens: {total: 2281, input: 2262, output: 19}
```

**deepseek-v4-pro**：

```
AI: 你好！我是 opencode，一个专为软件工程任务设计的交互式 CLI 工具，
    能帮你快速完成代码搜索、修改和调试等工作。
finish: stop, tokens: {total: 8021, input: 7975, output: 32, reasoning: 14}
cost: 0.0035 USD
```

**qwen3.5:9b**：

```
finish: length
原因：模型默认输出大量 reasoning，占满生成 token 配额，导致正文被截断。
```

---

## 七、消息 Part 结构

OpenCode 使用 Part 结构组织消息，发送时 `parts` 是数组：

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

发送消息时的 body：

```json
{
  "parts": [
    { "type": "text", "text": "请帮我重构这段代码" },
    { "type": "file", "mime": "text/x-python", "url": "file:///project/src/main.ts" }
  ],
  "agent": "build",
  "model": {
    "providerID": "ollama",
    "modelID": "glm4:9b"
  }
}
```

---

## 八、完整功能覆盖总结

| 功能 | 端点 | 测试状态 |
|------|------|----------|
| 服务健康检查 | `GET /global/health` | ✅ |
| OpenAPI 规范 | `GET /doc` | ✅ |
| 获取当前配置 | `GET /config` | ✅ |
| Provider 列表（v1） | `GET /provider` | ✅ |
| Provider 列表（v2） | `GET /api/provider` | ✅ |
| 模型列表 | `GET /api/model` | ✅ |
| Skill 列表 | `GET /api/skill` | ✅ |
| 文件系统列表 | `GET /api/fs/list` | ✅ |
| 创建会话 | `POST /session` | ✅ |
| 列会话 | `GET /session` / `GET /api/session` | ✅ |
| 获取会话详情 | `GET /session/{id}` | ✅ |
| 删除会话 | `DELETE /session/{id}` | ✅ |
| Fork 会话 | `POST /session/{id}/fork` | ✅ |
| 同步聊天 | `POST /session/{id}/message` | ✅ |
| 异步发送 | `POST /session/{id}/prompt_async` | ✅ |
| 获取历史消息 | `GET /session/{id}/message` | ✅ |
| 获取单条消息 | `GET /session/{id}/message/{messageID}` | ✅ |
| 删除单条消息 | `DELETE /session/{id}/message/{messageID}` | ✅ |
| 中止处理 | `POST /session/{id}/abort` | ✅ |
| 回退到指定消息 | `POST /session/{id}/revert` | ✅ |
| 恢复回退消息 | `POST /session/{id}/unrevert` | ✅ |
| 创建分享链接 | `POST /session/{id}/share` | ✅ |
| 取消分享 | `DELETE /session/{id}/share` | ✅ |
| SSE 事件流 | `GET /event` | ✅ |
| 同会话多轮对话 | `POST /session/{id}/message` 多次 | ✅ |
| 文件附件 | `POST /session/{id}/message` | ✅ |
| CLI attach | `opencode attach` | ✅ |
| CLI run --attach | `opencode run --attach` | ✅ |

---

## 九、部署检查清单

在正式部署前，确认以下事项：

- [ ] `opencode.json` 中 `model` 写成 `providerID/modelID` 格式
- [ ] `provider.<id>.models` 中显式声明了要用的模型
- [ ] `baseURL` 以 `/v1` 结尾且网络可达
- [ ] `server.cors` 包含你的前端应用域名
- [ ] 生产环境设置了 `OPENCODE_SERVER_PASSWORD`
- [ ] 防火墙放行了 4096 端口（或自定义端口）
- [ ] 云端 Provider 的 `apiKey` 通过安全方式配置
- [ ] 客户端每次请求携带 Basic Auth 头

---

## 十、常见问题

**Q: 为什么 `/api/provider` 看不到 DeepSeek？**

A: v2 API 对自定义 provider 有过滤。v1 端点 `/provider` 可以正确显示 DeepSeek 状态为 `connected`，实际聊天走 `POST /session/{id}/message` 完全可用。

**Q: 为什么 `/session/{id}/prompt` 返回 HTML？**

A: 该路径在 1.17.9 版本中不是有效的 API 路由。正确的 v1 聊天端点是 `POST /session/{id}/message`。

**Q: 为什么 qwen3.5:9b 回复被截断？**

A: 该模型默认会输出大量 reasoning/thinking 内容，消耗生成 token 配额。建议优先使用 `glm4:9b` 或 `deepseek-v4-pro`。

**Q: 文件附件为什么报错 `Missing key "mime"`？**

A: 实际 API 要求文件 part 包含 `mime` 和 `url`（`file://...`），而不是简化的 `path`。

---

## 十一、参考命令速查

```bash
# 启动服务
OPENCODE_CONFIG=/home/yy/opencode_server_use/opencode.json \
OPENCODE_SERVER_PASSWORD=testpass123 \
opencode serve --port 4096 --hostname 127.0.0.1

# 健康检查
curl -u opencode:testpass123 http://127.0.0.1:4096/global/health

# 创建会话
SESSION_ID=$(curl -s -u opencode:testpass123 -X POST http://127.0.0.1:4096/session \
  -H "Content-Type: application/json" -d '{"title":"test"}' | jq -r '.id')

# 同步聊天
curl -s -u opencode:testpass123 -X POST "http://127.0.0.1:4096/session/${SESSION_ID}/message" \
  -H "Content-Type: application/json" \
  -d '{"parts":[{"type":"text","text":"你好"}],"model":{"providerID":"ollama","modelID":"glm4:9b"}}'

# 异步 + SSE
curl -s -u opencode:testpass123 -X POST "http://127.0.0.1:4096/session/${SESSION_ID}/prompt_async" \
  -H "Content-Type: application/json" -d '{"parts":[{"type":"text","text":"你好"}]}'
curl -s -N -u opencode:testpass123 http://127.0.0.1:4096/event

# CLI attach
opencode attach http://127.0.0.1:4096 --username opencode --password testpass123

# CLI run
opencode run --attach http://127.0.0.1:4096 --username opencode --password testpass123 \
  --model ollama/glm4:9b --agent build --format json "你好"
```

---

*文档基于实际测试编写，服务端当前仍在运行中。*
