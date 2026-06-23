# OpenCode Server 集成与测试指南

> 基于实际测试整理，包含配置、启动、可用端点、功能验证示例，以及权限、扩展、CORS、Web 模式等高级主题。
>
> 测试环境：`opencode 1.17.9`，后端模型包括 Ollama 本地模型（`qwen3.5:9b`、`glm4:9b`）和 DeepSeek API（`deepseek-v4-pro`）。

---

## 目录

1. [运行模式](#一运行模式)
2. [配置系统](#二配置系统)
3. [Provider 与模型接入](#三provider-与模型接入)
4. [权限控制](#四权限控制)
5. [认证机制](#五认证机制)
6. [API 与通信机制](#六api-与通信机制)
7. [SDK 与程序化调用](#七sdk-与程序化调用)
8. [扩展机制 `.opencode/`](#八扩展机制-opencode)
9. [网络与发现](#九网络与发现)
10. [与外部执行体协作](#十与外部执行体协作)
11. [健康检查与就绪检测](#十一健康检查与就绪检测)
12. [功能测试与端点速查](#十二功能测试与端点速查)
13. [使用约束与最佳实践](#十三使用约束与最佳实践)
14. [参考命令速查](#十四参考命令速查)

---

## 一、运行模式

OpenCode 提供两种互斥的运行入口，后端共享同一套 OpenAPI 3.1 端点：

| 命令 | 模式 | 用途 |
|------|------|------|
| `opencode web` | 带浏览器界面的 HTTP 服务器 | 需要人类观看、操作、介入的场景 |
| `opencode serve` | 无界面的 Headless HTTP 服务器 | 程序化调用、后台执行、自动化流水线 |

两者均支持参数：

- `--port <number>`：监听端口
- `--hostname <string>`：监听地址（默认 `127.0.0.1`）
- `--cors <origin>`：允许的跨域来源，可多次传递
- `--mdns`：启用 mDNS 局域网服务发现
- `--mdns-domain <domain>`：自定义 mDNS 域名（默认 `opencode.local`）

### 1.1 Headless 模式（serve）

```bash
OPENCODE_CONFIG=/home/yy/opencode_server_use/opencode.json \
OPENCODE_SERVER_PASSWORD=testpass123 \
opencode serve --port 4096 --hostname 127.0.0.1
```

预期输出：

```text
opencode server listening on http://127.0.0.1:4096
```

### 1.2 Web 模式（带浏览器界面）

```bash
OPENCODE_CONFIG=/home/yy/opencode_server_use/opencode.json \
OPENCODE_SERVER_PASSWORD=testpass123 \
opencode web --port 4097 --hostname 127.0.0.1
```

实际测试输出：

```text
Web interface: http://127.0.0.1:4097/
```

验证 Web 界面：

```bash
curl -u opencode:testpass123 http://127.0.0.1:4097/ | head
# 返回 HTML 页面，包含 OpenCode Web UI
```

> `web` 与 `serve` 共享 `/global/health`、`/doc`、所有 `/session` 等后端端点，区别仅在于 `web` 额外托管前端静态资源。

---

## 二、配置系统

### 2.1 项目级配置

OpenCode 以**项目根目录**为配置单元，要求：

- `opencode.json` 必须位于项目根目录
- `.opencode/` 目录可选，用于存放扩展能力

标准项目结构：

```
project-root/
├── opencode.json
├── .opencode/
│   ├── skills/<name>/SKILL.md
│   ├── agents/
│   ├── commands/
│   ├── plugins/
│   └── tools/
└── ...
```

实际测试项目位于 `/home/yy/opencode_server_use/`，其中已创建：

```
/home/yy/opencode_server_use/
├── opencode.json
├── .opencode/
│   └── skills/
│       └── python-review/
│           └── SKILL.md
└── ...
```

### 2.2 配置加载优先级（从低到高）

1. 内置默认配置
2. 全局配置：`~/.config/opencode/opencode.json`
3. 项目配置：当前工作目录（cwd）下的 `opencode.json`
4. `OPENCODE_CONFIG`：指向自定义配置文件路径
5. `OPENCODE_CONFIG_DIR`：指向自定义配置目录（如 `project-root/.opencode`）
6. `OPENCODE_CONFIG_CONTENT`：内联 JSON 字符串（最高优先级）

**机制**：配置采用**合并**而非整体替换，高优先级字段覆盖低优先级。

### 2.3 环境变量

| 变量 | 作用 |
|------|------|
| `OPENCODE_CONFIG` | 自定义配置文件路径 |
| `OPENCODE_CONFIG_DIR` | 自定义配置目录路径 |
| `OPENCODE_CONFIG_CONTENT` | 内联配置 JSON（仅用于少量 runtime override） |
| `OPENCODE_SERVER_PASSWORD` | Web/Serve 模式的 Basic Auth 密码 |
| `OPENCODE_SERVER_USERNAME` | Web/Serve 模式的 Basic Auth 用户名（默认 `opencode`） |

### 2.4 当前项目配置

`/home/yy/opencode_server_use/opencode.json`：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "ollama/glm4:9b",
  "small_model": "ollama/glm4:9b",
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
    }
  },
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
          "tools": true,
          "limit": {
            "context": 262144,
            "output": 8192
          }
        },
        "glm4:9b": {
          "name": "GLM-4 9B",
          "tools": true,
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
        "apiKey": "ds-apikey"
      },
      "models": {
        "deepseek-v4-pro": {
          "name": "DeepSeek V4 Pro",
          "tools": true,
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

---

## 三、Provider 与模型接入

### 3.1 Provider 结构

```json
{
  "provider": {
    "<provider-id>": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Display Name",
      "options": {
        "baseURL": "http://host:port/v1",
        "apiKey": "optional-key"
      },
      "models": {
        "<model-id>": {
          "name": "Display Name",
          "tools": true,
          "limit": {
            "context": 131072,
            "output": 8192
          }
        }
      }
    }
  }
}
```

### 3.2 关键约束

- `npm`：使用 OpenAI 兼容接口时固定为 `@ai-sdk/openai-compatible`
- `baseURL`：**必须以 `/v1` 结尾**
- `models`：**必须显式声明**所有可用模型，OpenCode 不会自动从端点拉取模型列表
- `model` 字段（根级）：必须写成 `<provider-id>/<model-id>` 格式
- `small_model`（根级）：可选，用于轻量任务

### 3.3 模型能力标记

- `tools: true`：声明该模型支持工具/函数调用
- `limit.context`：模型上下文长度
- `limit.output`：最大输出 token 数

### 3.4 实测模型表现

| 模型 | Provider | 表现 | 建议 |
|------|----------|------|------|
| `glm4:9b` | Ollama | ✅ 响应稳定，约 5 秒，回复完整 | **推荐作为本地主力模型** |
| `deepseek-v4-pro` | DeepSeek API | ✅ 响应快，约 2~3 秒，质量高 | **推荐作为云端主力模型** |
| `qwen3.5:9b` | Ollama | ⚠️ 可用，但默认 thinking 占 token，短回复易被截断 | 如需使用，建议调大输出限制或关闭 thinking |

---

## 四、权限控制

OpenCode 内置双层权限系统：**全局权限 + Agent 级权限覆盖**。

### 4.1 全局权限

```json
{
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
  }
}
```

权限值：

- `allow`：直接执行
- `ask`：暂停等待人类确认
- `deny`：拒绝执行

### 4.2 Agent 级权限

```json
{
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
    }
  }
}
```

**机制**：Agent 权限与全局权限**合并**，Agent 规则**优先于**全局规则。

### 4.3 实测结果

| 操作 | 全局权限 | Agent 权限 | 实际行为 |
|------|----------|------------|----------|
| `ls /home/yy/opencode_server_use` | `allow` | `allow` | ✅ 成功执行并返回目录列表 |
| `rm /home/yy/opencode_server_use/sample_code.py` | `deny` | `deny` | ✅ 命令仅作为文本输出，文件未被删除 |

测试会话消息记录显示：

```text
User: 请删除 /home/yy/opencode_server_use/sample_code.py 文件
AI: ```bash
   rm /home/yy/opencode_server_use/sample_code.py
   ```
```

文件在测试后仍然存在，说明 `deny` 权限生效。

---

## 五、认证机制

Web 和 Serve 模式默认无认证，生产环境必须通过环境变量启用 **HTTP Basic Auth**：

```bash
export OPENCODE_SERVER_PASSWORD="your-secure-password"
export OPENCODE_SERVER_USERNAME="admin"   # 可选，默认 opencode
```

客户端连接方式：

```bash
# curl
curl -u username:password http://host:port/global/health

# CLI attach
opencode attach http://host:port --username admin --password your-secure-password

# CLI run
opencode run --attach http://host:port --username admin --password your-secure-password "..."
```

---

## 六、API 与通信机制

### 6.1 OpenAPI 3.1 规范

启动后访问 `/doc` 获取交互式 Swagger UI 和 JSON 规范：

```bash
curl -u opencode:testpass123 http://127.0.0.1:4096/doc -H "Accept: application/json"
```

### 6.2 消息体结构（Part 机制）

OpenCode 的消息由 **Part** 数组组成：

```json
{
  "parts": [
    { "type": "text", "text": "..." },
    { "type": "file", "mime": "text/x-python", "url": "file:///path/to/file.py" },
    { "type": "tool", "tool": { "name": "...", "input": {} } },
    { "type": "reasoning", "text": "..." },
    { "type": "snapshot", "snapshot": {} },
    { "type": "patch", "patch": "..." },
    { "type": "agent", "agent": "..." }
  ],
  "agent": "optional-agent-name",
  "model": { "providerID": "...", "modelID": "..." }
}
```

### 6.3 核心端点

| 端点 | 方法 | 用途 |
|------|------|------|
| `/doc` | GET | OpenAPI 规范与 Swagger UI |
| `/global/health` | GET | 健康检查 |
| `/config` | GET | 当前生效配置 |
| `/provider` | GET | v1 Provider 列表（含自定义 provider） |
| `/api/provider` | GET | v2 Provider 列表 |
| `/api/model` | GET | v2 模型列表 |
| `/skill` / `/api/skill` | GET | Skill 列表 |
| `/agent` / `/api/agent` | GET | Agent 列表 |
| `/api/fs/list` | GET | 列出目录文件 |
| `/session` | POST | 创建会话 |
| `/session/:id` | GET/DELETE | 获取/删除会话 |
| `/session/:id/fork` | POST | Fork 会话 |
| `/session/:id/message` | GET | 获取历史消息 |
| `/session/:id/message` | POST | 发送 Prompt，同步返回完整结果 |
| `/session/:id/message/:messageID` | GET/DELETE | 获取/删除单条消息 |
| `/session/:id/prompt_async` | POST | 异步发送 Prompt |
| `/session/:id/abort` | POST | 中止会话处理 |
| `/session/:id/revert` | POST | 回退到指定消息 |
| `/session/:id/unrevert` | POST | 恢复被回退的消息 |
| `/session/:id/share` | POST/DELETE | 创建/取消分享链接 |
| `/event` | GET | SSE 事件流订阅 |

> 注意：文档中提到的 `/session/:id/prompt` 同步流式端点在当前版本（1.17.9）中实际对应 `POST /session/:id/message`。

### 6.4 SSE 流式响应

`/event` 返回 Server-Sent Events。核心事件类型：

| 事件类型 | 说明 |
|----------|------|
| `message.part.updated` | 新消息片段（文本/工具/推理等） |
| `message.part.delta` | 消息片段增量（流式输出） |
| `session.updated` | 会话状态变更（running/idle/error） |
| `session.status` | 会话状态（`busy` / `idle`） |
| `permission.requested` | 需要人类授权（如 shell/文件操作） |
| `question.asked` | 需要人类输入（如确认/选择） |
| `session.idle` | 会话进入空闲状态 |

**重要**：`message.part.delta` 只包含 `partID` 和 `field=text`，不会直接区分 thinking 和 content。必须结合 `message.part.updated` 中的 `part.type` 区分：

- `part.type == "reasoning"` → thinking 内容
- `part.type == "text"` → content 内容

Python 区分示例：

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
                prefix = "[thinking]" if parts[part_id]["type"] == "reasoning" else "[content]"
                print(f"{prefix} {delta}", end="", flush=True)

        elif etype == "session.idle":
            print("\n[done]")
            break
```

#### 实测 SSE 结果对比

| 模型 | 是否产生 reasoning | content 输出 | 说明 |
|------|-------------------|--------------|------|
| `glm4:9b` | ❌ 无 | ✅ 完整 | 只有 text part |
| `deepseek-v4-pro` | ✅ 有 | ✅ 完整 | 先 reasoning，后 text |
| `qwen3.5:9b` | ✅ 有 | ❌ 被截断 | reasoning 占满 token，无 text |

**deepseek-v4-pro 实测 SSE 流**：

```text
[part.updated] type=reasoning partID=...
[part.delta]  delta='The user is asking me to introduce myself...'
[part.updated] type=text partID=...
[part.delta]  delta='你好！我是 OpenCode...'
[part.updated] type=step-finish reason=stop
```

---

## 七、SDK 与程序化调用

### 7.1 官方 JS SDK

```typescript
import { createOpencodeClient } from "@opencode-ai/sdk/v2";

const client = createOpencodeClient({
  baseUrl: "http://127.0.0.1:4096",
  auth: { username: "opencode", password: "testpass123" },
  responseStyle: "fields",  // 返回完整字段（含 metadata、events）
});

const { data: session } = await client.session.create({
  body: { title: "测试会话" }
});

const result = await client.session.prompt({
  path: { id: session.id },
  body: { parts: [{ type: "text", text: "你好" }] }
});

for await (const event of result.events) {
  if (event.type === "message.part.updated") {
    // 处理文本/工具/推理片段
  }
}
```

### 7.2 Attach 模式

已启动的 `opencode serve` 实例可通过 `attach` 复用：

```bash
opencode attach http://127.0.0.1:4096 --username opencode --password testpass123
```

### 7.3 Python 客户端示例

项目已提供 `test_client.py` 和 `test_sse_streaming.py`。

---

## 八、扩展机制 `.opencode/`

OpenCode 通过项目级 `.opencode/` 目录加载扩展能力：

| 子目录 | 用途 |
|--------|------|
| `.opencode/skills/<name>/SKILL.md` | Skill 定义，OpenCode 自动发现 |
| `.opencode/agents/` | 自定义 Agent 配置 |
| `.opencode/commands/` | 自定义命令 |
| `.opencode/plugins/` | 插件 |
| `.opencode/tools/` | 自定义工具 |

### 8.1 Skill 文件格式

`.opencode/skills/<name>/SKILL.md` 必须包含 YAML frontmatter：

```markdown
---
name: python-review
description: 当用户要求 review Python 代码时提供优化建议。
---

# Python 代码审查

你是一个 Python 代码审查专家...
```

### 8.2 实测 Skill 加载

实际创建了 `.opencode/skills/python-review/SKILL.md` 后，访问 `/skill`：

```json
[
  { "name": "customize-opencode", "location": "<built-in>" },
  { "name": "find-skills", "location": "/home/yy/.agents/skills/find-skills/SKILL.md" },
  { "name": "skill-creator", "location": "/home/yy/.agents/skills/skill-creator/SKILL.md" },
  { "name": "python-review", "location": "/home/yy/opencode_server_use/.opencode/skills/python-review/SKILL.md" }
]
```

> 关键发现：没有 YAML frontmatter（`name` 和 `description`）时，`.opencode/` 下的 Skill 不会被加载。

---

## 九、网络与发现

### 9.1 CORS

通过 `--cors` 参数或配置文件 `server.cors` 声明允许的浏览器来源：

```bash
opencode serve --cors http://localhost:3000 --cors https://app.example.com
```

或配置文件中：

```json
{
  "server": {
    "cors": ["http://localhost:5173", "http://localhost:3000"]
  }
}
```

### 9.2 CORS 实测

```bash
# 允许的来源
curl -i -u opencode:testpass123 -H "Origin: http://localhost:3000" \
  -X OPTIONS http://127.0.0.1:4096/session
# HTTP/1.1 204 No Content
# Access-Control-Allow-Origin: http://localhost:3000
# Access-Control-Allow-Methods: GET, HEAD, PUT, PATCH, POST, DELETE

# 不允许的来源
curl -i -u opencode:testpass123 -H "Origin: https://example.com" \
  -X OPTIONS http://127.0.0.1:4096/session
# HTTP/1.1 204 No Content
# 无 Access-Control-Allow-Origin 头
```

### 9.3 绑定地址

- `--hostname 127.0.0.1`：仅本地访问
- `--hostname 0.0.0.0`：允许外部访问（**必须配合密码**）

### 9.4 mDNS

启用局域网服务发现：

```bash
opencode serve --mdns --mdns-domain myproject.local
```

---

## 十、与外部执行体协作

OpenCode 适合承担**理解、生成、解释**类工作，不适合直接执行确定性验证任务。

**OpenCode 负责：**

- 理解文档/代码/日志
- 生成计划、脚本、diff
- 解释测试结果的影响
- 生成 Review 报告

**外部执行体负责：**

- 执行测试脚本
- 收集 stdout/stderr/status code
- 生成机器可读的测试结果文件（如 `machine-test-result.json`）
- 文件系统快照/备份/归档

**协作流程：**

1. OpenCode 生成测试脚本 + 测试计划
2. 外部 runner 执行并生成结果文件
3. OpenCode 读取结果文件，生成人类可读的报告和下一步建议

---

## 十一、健康检查与就绪检测

不建议硬编码单一端点，应采用分层策略：

1. **首选**：调用已验证的 OpenCode health/status 端点或 SDK 状态查询
2. **降级**：TCP 端口连通性检测
3. **兜底**：捕获 stdout/stderr 中的就绪标记（ready pattern）
4. **辅助**：通过 `opencode attach` 或 SDK `list` 调用验证 API 可用性

### 11.1 推荐健康检查

```bash
curl -u username:password http://host:port/global/health
```

预期返回：

```json
{"healthy": true, "version": "1.17.9"}
```

---

## 十二、功能测试与端点速查

### 12.1 完整功能覆盖总结

| 功能 | 端点 | 测试状态 |
|------|------|----------|
| 服务健康检查 | `GET /global/health` | ✅ |
| OpenAPI 规范 | `GET /doc` | ✅ |
| 获取当前配置 | `GET /config` | ✅ |
| Provider 列表（v1） | `GET /provider` | ✅ |
| Provider 列表（v2） | `GET /api/provider` | ✅ |
| 模型列表 | `GET /api/model` | ✅ |
| Skill 列表 | `GET /skill` / `GET /api/skill` | ✅ |
| Agent 列表 | `GET /agent` / `GET /api/agent` | ✅ |
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
| 权限控制（allow/deny） | 通过 Agent 工具调用 | ✅ |
| `.opencode/` Skill 加载 | `GET /skill` | ✅ |
| CORS 配置 | `OPTIONS /session` | ✅ |
| Web 模式 | `opencode web` | ✅ |
| CLI attach | `opencode attach` | ✅ |
| CLI run --attach | `opencode run --attach` | ✅ |

### 12.2 典型调用示例

#### 创建会话

```bash
SESSION_ID=$(curl -s -u opencode:testpass123 -X POST http://127.0.0.1:4096/session \
  -H "Content-Type: application/json" \
  -d '{"title":"我的会话"}' | jq -r '.id')
```

#### 同步发送消息

```bash
curl -s -u opencode:testpass123 -X POST "http://127.0.0.1:4096/session/${SESSION_ID}/message" \
  -H "Content-Type: application/json" \
  -d '{
    "parts": [{"type": "text", "text": "你好，请用一句话介绍自己"}],
    "model": {"providerID": "ollama", "modelID": "glm4:9b"}
  }' | jq .
```

#### 异步发送 + SSE 监听

```bash
curl -s -u opencode:testpass123 -X POST "http://127.0.0.1:4096/session/${SESSION_ID}/prompt_async" \
  -H "Content-Type: application/json" \
  -d '{"parts": [{"type": "text", "text": "你好"}]}'

curl -s -N -u opencode:testpass123 http://127.0.0.1:4096/event
```

#### 文件附件

```bash
curl -s -u opencode:testpass123 -X POST "http://127.0.0.1:4096/session/${SESSION_ID}/message" \
  -H "Content-Type: application/json" \
  -d '{
    "parts": [
      {"type": "text", "text": "请 review 这段代码"},
      {"type": "file", "mime": "text/x-python", "url": "file:///home/yy/opencode_server_use/sample_code.py"}
    ],
    "model": {"providerID": "ollama", "modelID": "glm4:9b"}
  }' | jq .
```

#### 中止处理

```bash
curl -s -u opencode:testpass123 -X POST "http://127.0.0.1:4096/session/${SESSION_ID}/abort" \
  -d '{}'
```

#### 回退到指定消息

```bash
MESSAGE_ID="msg_xxxxxxxxxxxx"
curl -s -u opencode:testpass123 -X POST "http://127.0.0.1:4096/session/${SESSION_ID}/revert" \
  -H "Content-Type: application/json" \
  -d "{\"messageID\":\"${MESSAGE_ID}\"}" | jq .
```

#### 创建分享链接

```bash
curl -s -u opencode:testpass123 -X POST "http://127.0.0.1:4096/session/${SESSION_ID}/share" \
  -d '{}' | jq '.share.url'
```

---

## 十三、使用约束与最佳实践

| 约束 | 说明 |
|------|------|
| **baseURL 必须以 `/v1` 结尾** | 无论后端是 Ollama、LM Studio 还是自研接口 |
| **模型必须显式声明** | `provider.models` 中必须列出所有可用模型 ID |
| **model 字段格式** | 必须写成 `providerID/modelID` |
| **配置合并而非替换** | 项目配置与全局配置合并，字段级覆盖 |
| **权限双层控制** | 建议 OpenCode `permission` + 外部沙箱（如 bwrap）双层约束 |
| **不要只靠 prompt 约束行为** | 敏感操作必须通过 `permission` 机制限制 |
| **iframe 嵌入有风险** | 受 CSP、cookie、路径、前端路由、WebSocket/SSE、反向代理影响，不应作为唯一访问方式 |
| **serve 与 web 语义不同** | `serve` 不提供浏览器界面，`web` 才提供 |
| **cwd 决定项目根** | OpenCode 通过当前工作目录查找 `opencode.json` 和 `.opencode/` |
| **Skill 需要 frontmatter** | `.opencode/skills/<name>/SKILL.md` 必须包含 `name` 和 `description` frontmatter |
| **生产环境必须启用认证** | 通过 `OPENCODE_SERVER_PASSWORD` 设置密码 |
| **apiKey 建议安全注入** | 避免明文写入配置文件，生产环境使用环境变量或 secrets |

---

## 十四、参考命令速查

```bash
# 启动 serve
OPENCODE_CONFIG=/home/yy/opencode_server_use/opencode.json \
OPENCODE_SERVER_PASSWORD=testpass123 \
opencode serve --port 4096 --hostname 127.0.0.1

# 启动 web
OPENCODE_CONFIG=/home/yy/opencode_server_use/opencode.json \
OPENCODE_SERVER_PASSWORD=testpass123 \
opencode web --port 4097 --hostname 127.0.0.1

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

*文档基于实际测试编写。当前 serve 模式仍在运行中：http://127.0.0.1:4096*
