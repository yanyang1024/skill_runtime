# API 使用说明（服务用户方）

Base URL：`http://127.0.0.1:8000`（默认；以部署方实际地址为准）

这是一个 **OpenAI 兼容**的 Agent API。与普通 LLM API 的区别：模型背后是一个有
文件系统和 shell 能力的 Agent，它会在你的专属沙箱工作目录里读写文件、执行命令，
然后把最终答复按 OpenAI 协议返回。

## 快速开始

```bash
curl -N -X POST http://127.0.0.1:8000/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "build",
    "stream": true,
    "messages": [{"role": "user", "content": "在当前目录创建 hello.txt，内容为 hello"}]
  }'
```

Python（openai SDK）：

```python
from openai import OpenAI

client = OpenAI(base_url="http://127.0.0.1:8000/v1", api_key="not-used")

resp = client.chat.completions.create(
    model="build",
    messages=[{"role": "user", "content": "写一个 Python 快排并保存为 sort.py"}],
)
print(resp.choices[0].message.content)
session_id = resp.x_session_id          # 或响应头 X-Session-Id
```

## 会话与上下文

服务端保存完整对话历史（在 Agent 实例里），调用方只需记住 `X-Session-Id`：

| 请求头 | 说明 |
|---|---|
| `X-App-Id` | 应用标识，决定使用哪个 Agent 实例（隔离边界）。缺省 `default` |
| `X-Session-Id` | 会话标识。不传则新建；后续请求带上它即可续聊 |

- 新建会话后，从**响应头 `X-Session-Id`**（流式/非流式都有）或非流式响应体的
  `x_session_id` 字段取到 id
- id 只允许字母、数字、`_`、`-`，最长 64
- 每个会话有独立工作目录，Agent 创建的文件都在其中（部署方可提供文件出口；
  目录本身对调用方不可见）

续聊示例：

```python
resp2 = client.chat.completions.create(
    model="build",
    messages=[{"role": "user", "content": "把 sort.py 改成降序"}],
    extra_headers={"X-Session-Id": session_id, "X-App-Id": "default"},
)
```

> 注意：每次请求只需要发**当前这条** user 消息，历史由服务端会话维护。
> 不要把完整 messages 历史重复发给同一个 `X-Session-Id`，否则内容会重复进上下文。

## model 字段

映射为 Agent 类型而非具体 LLM 模型（LLM 模型由部署方统一配置）：

| model | 说明 |
|---|---|
| `build`（默认） | 完整能力 Agent：读写文件、执行命令 |
| `plan` | 只读分析 Agent：不能修改文件 |

## 流式响应

`"stream": true` 时返回标准 OpenAI SSE：

```
data: {"choices":[{"delta":{"role":"assistant"},"finish_reason":null}], ...}
data: {"choices":[{"delta":{"reasoning_content":"..."},"finish_reason":null}], ...}
data: {"choices":[{"delta":{"content":"..."},"finish_reason":null}], ...}
data: {"choices":[{"delta":{},"finish_reason":"stop"}], ...}
data: [DONE]
```

- `reasoning_content`：模型的思考过程（模型支持时才有）
- `finish_reason`：`stop` 正常结束（含被中止）；`error` 出错（此前会有
  `[error] ...` 内容的 chunk）
- Agent 执行过程可能调用多个工具、耗时数分钟，流式可以实时看到中间输出

## 运维端点

```
GET  /apps/{app_id}/status                       实例状态（running/starting/stopped/port）
POST /apps/{app_id}/start                        手动启动实例（一般不需要，请求会自动拉起）
POST /apps/{app_id}/stop                         停止实例
GET  /apps/{app_id}/sessions                     会话列表
GET  /apps/{app_id}/sessions/{sid}/messages      会话历史（OpenAI messages 形式）
POST /apps/{app_id}/sessions/{sid}/abort         中止正在执行的任务
DELETE /apps/{app_id}/sessions/{sid}             删除会话（含工作目录与历史）
GET  /v1/models                                  可用 Agent 列表
GET  /health                                     服务健康检查
```

中止示例（适合配合流式请求实现「停止生成」按钮）：

```bash
curl -X POST http://127.0.0.1:8000/apps/default/sessions/<sid>/abort
```

## 错误处理

| 状态码 | 含义 |
|---|---|
| 400 | 参数问题：缺 user 消息、非法 id、session 不属于该 app |
| 404 | session 不存在（运维端点） |
| 503 | Agent 实例不可用（启动失败/健康检查超时），可稍后重试 |
| 500 | 服务内部错误，响应体 `detail` 含原因 |

建议客户端给请求设较长超时：Agent 任务（尤其涉及多步工具调用）可能持续数分钟，
首 token 前也可能有 1~2 分钟的模型思考时间。

## 当前限制

- 无 API Key 认证——请勿把服务直接暴露给不可信网络
- 响应不含 token usage 统计
- 同一会话不要并发发多条消息（事件流会交错）；等上一条结束再发下一条
- 非流式响应会等 Agent 全部执行完才返回，长任务建议用流式
