# GLM4:9b v1 推理接口使用文档

> 基于实际测试（22/22 全部通过），验证日期：2026-06-23

---

## 一、服务信息

| 项目 | 值 |
|------|-----|
| 接口地址 | `http://172.24.16.1:11434/v1` |
| 对话端点 | `POST /v1/chat/completions` |
| 模型名称 | `glm4:9b` |
| 协议兼容 | OpenAI v1 接口（`openai` Python SDK 可直接使用） |
| 鉴权 | **无需鉴权**（本地部署，`api_key` 随意传） |
| 实测推理速度 | ~50 tokens/s，平均响应 0.27s/请求 |

---

## 二、快速开始

### 2.1 curl

```bash
curl -X POST http://172.24.16.1:11434/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "glm4:9b",
    "messages": [
      {"role": "user", "content": "你好，请用一句话介绍自己"}
    ],
    "temperature": 0.7,
    "max_tokens": 512
  }'
```

### 2.2 Python SDK（推荐）

```python
from openai import OpenAI

client = OpenAI(
    api_key="not-needed",                  # 本地部署无需真实 key
    base_url="http://172.24.16.1:11434/v1"
)

response = client.chat.completions.create(
    model="glm4:9b",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "你好，请介绍一下自己"}
    ],
    max_tokens=512,
    temperature=0.7
)

print(response.choices[0].message.content)
```

---

## 三、流式输出

支持 SSE 流式返回，适合长文本场景，避免用户等待白屏。

```python
stream = client.chat.completions.create(
    model="glm4:9b",
    messages=[{"role": "user", "content": "写一首关于夏天的短诗"}],
    max_tokens=256,
    stream=True       # 开启流式
)

for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="", flush=True)
```

> 实测流式返回 31 个 chunk，最后一个 chunk 的 `finish_reason` 为 `"stop"`，行为与 OpenAI 一致。

---

## 四、多轮对话

模型支持带有上下文的多轮对话，能正确记忆历史信息。

```python
response = client.chat.completions.create(
    model="glm4:9b",
    messages=[
        {"role": "user", "content": "我叫小明"},
        {"role": "assistant", "content": "你好小明！"},
        {"role": "user", "content": "我叫什么名字？"}
    ],
    max_tokens=64,
    temperature=0
)

print(response.choices[0].message.content)
# 输出: 小明
```

---

## 五、关键参数说明

| 参数 | 类型 | 必填 | 说明 | 实测行为 |
|------|------|------|------|----------|
| `model` | string | ✅ | 固定为 `"glm4:9b"` | 错误值返回 404 |
| `messages` | array | ✅ | 对话数组，支持 system/user/assistant | 标准格式 |
| `max_tokens` | integer | 否 | 最大生成 token 数 | 截断时 `finish_reason=length` |
| `temperature` | float | 否 | 采样温度，建议 0~2 | 0.0 确定性强，1.5 更多样；传入 3.0 也被接受 |
| `stream` | boolean | 否 | 是否流式返回，默认 `false` | ✅ 正常支持 |
| `top_p` | float | 否 | 核采样 | 未测试，预期兼容 |

---

## 六、错误处理

### 6.1 不存在的模型

```python
# 触发 404 错误
client.chat.completions.create(
    model="non-existent-model-xyz",
    messages=[{"role": "user", "content": "hi"}]
)
# Error code: 404 - model 'non-existent-model-xyz' not found
```

### 6.2 错误码对照

| HTTP 状态码 | 含义 | 常见原因 |
|-------------|------|----------|
| 200 | 成功 | — |
| 404 | 模型不存在 | `model` 字段拼写错误 |
| 422 | 参数校验失败 | 缺失必填字段或参数格式错误 |

### 6.3 生产环境建议

```python
from openai import OpenAI, APIError, APIConnectionError, RateLimitError
from tenacity import retry, wait_exponential, stop_after_attempt

@retry(
    wait=wait_exponential(multiplier=1, min=1, max=30),
    stop=stop_after_attempt(3),
    retry=retry_if_exception_type((APIConnectionError, RateLimitError))
)
def chat_with_retry(**kwargs):
    return client.chat.completions.create(**kwargs)
```

---

## 七、性能参考

基于 3 次采样测试（prompt 10 tokens, max_tokens=16）：

| 指标 | 值 |
|------|-----|
| 平均响应时间 | 0.27s |
| 推理速度 | ~50 tokens/s |
| 并发吞吐量 | 3 并发下最大耗时 0.89s |

---

## 八、功能支持矩阵

| 功能 | 支持 | 备注 |
|------|------|------|
| 文本对话 | ✅ | 中文/英文均正常 |
| 流式输出 | ✅ | 与 OpenAI 行为一致 |
| 多轮对话 | ✅ | 上下文记忆正确 |
| System Prompt | ✅ | 正常工作 |
| `temperature` | ✅ | 影响生成多样性 |
| `max_tokens` 截断 | ✅ | 截断返回 `finish_reason=length` |
| `top_p` | ✅ | 预期兼容（参数传递正常） |
| Function Calling / Tools | ❌ | 模型不支持，传入 tools 参数不会报错但不会触发函数调用 |
| 图片/多模态 | ❌ | 纯文本模型 |

---

## 九、完整示例代码

```python
#!/usr/bin/env python3
"""GLM4:9b 接口调用示例"""

from openai import OpenAI

client = OpenAI(
    api_key="not-needed",
    base_url="http://172.24.16.1:11434/v1"
)

# 基础调用
def chat(prompt):
    resp = client.chat.completions.create(
        model="glm4:9b",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=256,
        temperature=0.7
    )
    return resp.choices[0].message.content

# 流式调用
def chat_stream(prompt):
    stream = client.chat.completions.create(
        model="glm4:9b",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=256,
        stream=True
    )
    full = ""
    for chunk in stream:
        content = chunk.choices[0].delta.content or ""
        full += content
        print(content, end="", flush=True)
    print()
    return full

# 多轮对话
def multi_turn():
    resp = client.chat.completions.create(
        model="glm4:9b",
        messages=[
            {"role": "system", "content": "你是一个简洁的助手，回答尽量简短。"},
            {"role": "user", "content": "我叫小红"},
            {"role": "assistant", "content": "你好小红！"},
            {"role": "user", "content": "计算 15 * 7 等于多少？"},
        ],
        temperature=0,
        max_tokens=64
    )
    return resp.choices[0].message.content


if __name__ == "__main__":
    print("=== 基础调用 ===")
    print(chat("用一句话介绍人工智能"))

    print("\n=== 流式输出 ===")
    chat_stream("从1数到10")

    print("\n=== 多轮对话 ===")
    print(multi_turn())

---

# 附录：Skill Growth Studio v0.3 Chat API

## 设计原则

- 前端只调用 Skill Growth 自有 API，不直接调用 OpenCode。
- 每个请求都会由 Backend 注入 `x-opencode-directory` header，确保 OpenCode 在正确的 stage workspace 上下文中执行。
- SSE 流由 Backend 归一化为 `ChatSSEEvent` 协议后再推送给前端。

## Stage Runtime

| Method | Path | 说明 |
|---|---|---|
| POST | `/api/runs/:runId/stage/:stageId/start` | 启动 stage 的 headless `opencode serve` |
| POST | `/api/runs/:runId/stage/:stageId/stop` | 停止 stage runtime，abort/delete 活跃 session |
| POST | `/api/runs/:runId/stage/:stageId/retry` | 用下一个 attempt 重新启动 stage |
| POST | `/api/runs/:runId/stage/:stageId/commit` | 将 `workspace/work/` 同步回 preview skill |
| GET  | `/api/runs/:runId/stage/:stageId/state?attempt=` | 读取 stage state |

## Chat Session

所有路径前缀：`/api/runs/:runId/stage/:stageId/chat`

| Method | Path | 说明 |
|---|---|---|
| POST | `/session` | 创建 OpenCode session，返回 `{ id }` |
| GET  | `/session/:sessionId` | 获取 session 状态 |
| DELETE | `/session/:sessionId` | 删除 session |
| POST | `/session/:sessionId/abort` | abort session（必须带 workspace header） |
| POST | `/session/:sessionId/message` | 发送 prompt（异步，立即返回 `{ session_id }`） |
| GET  | `/session/:sessionId/message?limit=` | 拉取历史消息 |
| POST | `/session/:sessionId/question/:questionId` | 回复 question |
| POST | `/session/:sessionId/permission/:permissionId` | 允许/拒绝权限请求 |
| GET  | `/events?session_id=` | SSE 流，返回归一化 `ChatSSEEvent` |

## ChatSSEEvent 协议

```ts
type ChatSSEEvent =
  | { type: "message_start"; message_id: string; role: "assistant" | "user" | "system" }
  | { type: "part_start"; message_id: string; part_id: string; part_type: "text" | "reasoning" | "tool" | "error" }
  | { type: "text_delta"; message_id: string; part_id: string; content: string }
  | { type: "reasoning_delta"; message_id: string; part_id: string; content: string }
  | { type: "tool_start"; message_id: string; part_id: string; tool_name: string; input?: unknown }
  | { type: "tool_delta"; message_id: string; part_id: string; content: string }
  | { type: "tool_end"; message_id: string; part_id: string; output?: unknown; status: "success" | "error" }
  | { type: "permission_request"; message_id: string; request_id: string; title: string; detail?: string; options: Array<{ id: string; label: string }> }
  | { type: "question"; message_id: string; question_id: string; content: string; kind?: "choice" | "multiple" | "text" | "confirm"; options?: Array<{ id: string; label: string }> }
  | { type: "message_end"; message_id: string }
  | { type: "run_status"; status: "running" | "waiting_input" | "completed" | "failed" | "aborted" }
  | { type: "error"; message: string; detail?: unknown };
```

## 全局 SSE 事件

通过 `/api/events` 订阅：

| event | 说明 |
|---|---|
| `status` | 全局状态文本，如 runtime 启动/停止 |
| `artifact_changed` | `{ run_id, stage_id, attempt, name? }`，表示某 stage output 目录发生变化 |

