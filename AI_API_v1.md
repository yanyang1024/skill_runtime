# AI API 接口路径完全指南：从 /v1/completions 到 /v1/responses

> **原文作者**: 情酱  
> **来源**: [知乎](https://zhuanlan.zhihu.com/p/2050523117496297035)  
> **本文状态**: 基于原文扩展，补充 2026 年最新生态变化与生产实践建议

---

## 目录

- [一、为什么这些路径值得花十分钟搞清楚](#一为什么这些路径值得花十分钟搞清楚)
- [二、核心接口演进史](#二核心接口演进史)
  - [2.1 /v1/completions — 一切的起源](#21-v1completions--一切的起源)
  - [2.2 /v1/chat/completions — 行业事实标准](#22-v1chatcompletions--行业事实标准)
  - [2.3 /v1/messages — Claude 的独立协议](#23-v1messages--claude-的独立协议)
  - [2.4 /v1/responses — OpenAI 的下一代统一接口](#24-v1responses--openai-的下一代统一接口)
  - [2.5 /v1beta/models/{model}:generateContent — Gemini 的资源方法风格](#25-v1betamodelsmodelgeneratecontent--gemini-的资源方法风格)
- [三、辅助接口与生态](#三辅助接口与生态)
  - [3.1 /v1/embeddings — 向量化检索](#31-v1embeddings--向量化检索)
  - [3.2 /v1/models — 模型列表查询](#32-v1models--模型列表查询)
  - [3.3 Batch API — 异步批处理（2026 新增重点）](#33-batch-api--异步批处理2026-新增重点)
- [四、2026 年 API 生态格局与兼容性真相](#四2026-年-api-生态格局与兼容性真相)
  - [4.1 三家巨头的差异化路线](#41-三家巨头的差异化路线)
  - [4.2 "OpenAI 兼容"的真实边界](#42-openai-兼容的真实边界)
  - [4.3 第三方平台的兼容矩阵](#43-第三方平台的兼容矩阵)
- [五、版本号迷思：/v1 到底是什么](#五版本号迷思v1-到底是什么)
- [六、Base URL 配置实战指南](#六base-url-配置实战指南)
- [七、选择决策：你该用哪个接口](#七选择决策你该用哪个接口)
- [八、生产环境避坑清单](#八生产环境避坑清单)
- [参考文献](#参考文献)

---

## 一、为什么这些路径值得花十分钟搞清楚

如果你在用 AI API 做任何事情，每天复制粘贴这些路径一百遍，却很少停下来想它们代表什么——这篇文章就是为你写的。

```
/v1/chat/completions
/v1/responses
/v1/messages
/v1/embeddings
/v1beta/models/{model}:generateContent
```

这些后缀不是随便写的。每一个都代表一套完整的接口协议，规定了：
- 请求体长什么样
- 响应怎么解析
- 错误怎么报
- 流式怎么传
- 工具怎么调
- 多模态怎么传

搞清这些，配置和调试时能少走很多弯路。

---

## 二、核心接口演进史

### 2.1 /v1/completions — 一切的起源

最早的大语言模型接口长这样：

```http
POST /v1/completions
Content-Type: application/json

{
  "model": "davinci",
  "prompt": "Translate this into Chinese: Hello, how are you?"
}
```

**特点**：
- 没有角色概念，没有系统消息，没有对话历史
- 模型眼里只有一串字符，任务就是预测下一个 token
- 想做对话？手动在 prompt 里拼：

```text
System: You are a helpful assistant.
User: Hello.
Assistant: Hi, how can I help?
User: Explain API suffixes.
Assistant:
```

**问题**：
- 模型靠"猜"来区分系统指令、用户输入、历史回复
- 猜错整个对话逻辑就乱了
- 图片、工具调用等无法优雅表达

→ `/v1/completions` 慢慢退居二线，但仍有场景在用（如文本续写、代码补全）。

---

### 2.2 /v1/chat/completions — 行业事实标准

OpenAI 做了一个影响整个行业的事：把对话结构化了。

```http
POST /v1/chat/completions
Content-Type: application/json

{
  "model": "gpt-4o",
  "messages": [
    { "role": "system", "content": "You are a concise technical explainer." },
    { "role": "user", "content": "Explain what /v1/chat/completions means." }
  ]
}
```

**核心变化**：
- 从一整段 `prompt` 变成 `messages` 数组
- 每条消息有明确的 `role`：system / user / assistant / tool
- 多轮对话、角色设定、工具调用都有了落脚点

**行业接受度**：

| 平台 | 端点 | 备注 |
|------|------|------|
| OpenAI | `/v1/chat/completions` | 原生 |
| Mistral | `/v1/chat/completions` | 原生兼容 |
| xAI | `/v1/chat/completions` | 原生兼容 |
| DeepSeek | `/chat/completions` | 格式基本兼容 |
| Groq | `/openai/v1/chat/completions` | 加命名空间 |
| OpenRouter | `/api/v1/chat/completions` | 加命名空间 |
| 阿里云百炼 | `/compatible-mode/v1/chat/completions` | 兼容模式 |

**实际好处**：用 OpenAI SDK 写完代码，切到别的平台往往只需改三个变量：

```python
base_url = "https://api.other-provider.com/v1"
api_key = "YOUR_KEY"
model = "their-model-name"
# 其余 SDK 调用代码一行不用动
```

**⚠️ 但兼容 ≠ 完全兼容**

基础文本聊天几乎都能跑通，stream 流式输出大部分也没问题。但以下能力各家支持参差不齐：

| 能力 | 兼容状况 |
|------|----------|
| `tools` 工具调用 | 大部分支持，但 `parallel_tool_calls` 行为不一致 |
| `response_format` 结构化输出 | 部分平台不支持 JSON Schema 严格模式 |
| `vision` 图片输入 | 格式差异大（URL vs base64 vs data URI） |
| `audio` 音频输入 | 少数平台支持 |
| streaming 下的 tool_call delta | 格式可能与 OpenAI 不同 |

> **建议**：超出基础聊天时，务必查阅对方文档的具体字段支持表，不要假设"兼容"就是"完全兼容"。

---

### 2.3 /v1/messages — Claude 的独立协议

Anthropic 没有跟着 OpenAI 走，Claude 用了一套自己的协议：

```http
POST /v1/messages
Content-Type: application/json
x-api-key: YOUR_KEY

{
  "model": "claude-sonnet-4-6",
  "max_tokens": 1024,
  "system": "You are a careful technical explainer.",
  "messages": [
    { "role": "user", "content": "Explain /v1/messages." }
  ]
}
```

**关键差异**：

| 维度 | OpenAI Chat Completions | Anthropic Messages |
|------|------------------------|-------------------|
| 端点 | `/v1/chat/completions` | `/v1/messages` |
| System Prompt | 放在 `messages` 数组内 | 顶层独立 `system` 字段 |
| 响应解析 | `choices[0].message.content` | `content[0].text` |
| Content 结构 | 字符串 | block 数组（text / image / tool_use / tool_result） |
| 流式事件 | `data: {"choices":[{"delta":{"content":"xx"}}]}` | `event: content_block_delta` |
| 工具调用 | `tool_calls` 数组 | `content` 内嵌 `tool_use` block |

**结论**：接 Claude 官方能力时，别强行用 OpenAI SDK 去套。老老实实用 Anthropic SDK 或按文档来。

> 2026 年更新：Anthropic 提供了 OpenAI SDK 兼容层，但原生功能（如 Extended Thinking、Computer Use）在兼容层下会丢失或行为异常。

---

### 2.4 /v1/responses — OpenAI 的下一代统一接口

2025 年初推出，2026 年已成为 OpenAI 主推方向。

**为什么需要新接口？**

`/v1/chat/completions` 这个名字本身就暗示了设计初衷：聊天补全。但现在的模型早已不只是聊天：
- 读图片、处理音频
- 搜网页、查文件、调函数
- 跑代码解释器、调 MCP 工具
- 维护服务端上下文、输出结构化 JSON
- 返回推理摘要、产生多个中间事件

把这些全塞进 `chat.completion` 对象里，确实拧巴。

**Responses API 的设计思路**：

不再把交互框定为"聊天"，而是抽象为"任务"。

```http
POST /v1/responses
Content-Type: application/json

{
  "model": "gpt-4o",
  "instructions": "You are a helpful assistant specializing in financial analysis.",
  "input": [
    {
      "role": "user",
      "content": [
        { "type": "input_text", "text": "Search the web and summarize the result." }
      ]
    }
  ],
  "tools": [
    { "type": "web_search" }
  ]
}
```

**核心差异对比**：

| 特性 | Chat Completions | Responses API |
|------|-----------------|---------------|
| 设计哲学 | 聊天记录，补全下一条 | 任务 + 上下文 + 工具 → 完整响应 |
| 状态管理 | 无状态，每次发全量历史 | 有状态，`previous_response_id` 链式调用 |
| 输入字段 | `messages` | `input` + `instructions` |
| 输出结构 | `choices[0].message` | `output` 数组，多类型 item |
| 内置工具 | ❌ 需自定义 | ✅ web_search, file_search, computer_use, code_interpreter |
| 流式格式 | SSE `data:` | SSE `data:`，但事件类型更丰富 |
| 成本 | 长对话重复发送历史，token 成本高 | 服务端存状态，只发新消息，缓存命中率高 |

**状态管理示例**：

```python
# 第一回合
resp1 = client.responses.create(
    model="gpt-4o",
    instructions="You are a helpful assistant.",
    input="What are the main risks of rising interest rates?",
    store=True  # 服务端保存状态
)
# resp1.id = "resp_8a3f2c1d9b4e"

# 第二回合 —— 不需要重发历史！
resp2 = client.responses.create(
    model="gpt-4o",
    previous_response_id="resp_8a3f2c1d9b4e",  # 链式引用
    input="How should the company hedge against those risks?"
)
```

**2026 年重要更新**：
- OpenAI 和 Microsoft 明确建议：新项目默认使用 Responses API
- Assistants API 将在 2026 上半年 sunset，功能迁移至 Responses API
- Codex CLI（2026 年 2 月起）完全移除 Chat Completions 支持，仅支持 Responses API
- 使用 reasoning 模型（如 GPT-5 系列）时，Responses API 在 SWE-bench 上表现比 Chat Completions 高约 3%

---

### 2.5 /v1beta/models/{model}:generateContent — Gemini 的资源方法风格

Google 一贯的风格：把模型当成资源，generateContent 是执行的方法。

```http
POST /v1beta/models/gemini-2.5-pro:generateContent
Content-Type: application/json

{
  "contents": [
    {
      "role": "user",
      "parts": [
        { "text": "Explain API suffixes." }
      ]
    }
  ]
}
```

**拆解**：
- `/v1beta` → API 版本，beta 表示预览
- `/models/gemini-2.5-pro` → 模型资源路径
- `:generateContent` → 对资源执行的方法

**概念对应**：

| 平台 | 对话容器 | 角色+内容单元 |
|------|----------|--------------|
| OpenAI | `messages` | `role` + `content` |
| Anthropic | `messages` | `role` + `content` blocks |
| Gemini | `contents` | `role` + `parts` |

**版本选择**：
- `v1`：稳定版，生产环境使用
- `v1beta`：最新预览能力，想试新功能再用

**Gemini 特有能力（2026）**：
- `media_resolution`：图片/视频细节度调节（无其他平台对应物）
- Grounding：原生集成 Google Search、Maps、File Search
- Deep Research / Deep Research Max：通过 MCP 融合公开网络数据与企业私有数据

---

## 三、辅助接口与生态

### 3.1 /v1/embeddings — 向量化检索

```http
POST /v1/embeddings
Content-Type: application/json

{
  "model": "text-embedding-3-large",
  "input": "AI API suffixes explained"
}
```

**作用**：把文本变成一组浮点数向量（embedding）。

**RAG 标准搭档**：
1. `embeddings` 把文档切片 → 向量 → 存入向量数据库
2. 用户提问 → `embeddings` 转成向量 → 检索最相似文档片段
3. 检索结果塞进 `chat/completions` 或 `responses` → 生成答案

**2026 年主流 Embedding 模型**：

| 模型 | 维度 | 价格（$/1M tokens） | 特点 |
|------|------|---------------------|------|
| text-embedding-3-large | 3072 | $0.13 | OpenAI，综合表现好 |
| text-embedding-3-small | 1536 | $0.02 | 性价比高 |
| voyage-3 | 1024 | $0.10 | 长文档检索强 |
| e5-mistral-7b | 4096 | 开源 | 自托管方案 |

---

### 3.2 /v1/models — 模型列表查询

```http
GET /v1/models
Authorization: Bearer YOUR_KEY
```

**用途**：
- 调试时确认模型名是否写错
- 查看当前账号可用的模型列表和权限
- 检查模型版本更新（如 gpt-4o 是否已升级）

---

### 3.3 Batch API — 异步批处理（2026 新增重点）

三家主流平台都提供了 Batch API，**统一 5 折计价**：

| 平台 | 创建速率 | 单批次限制 | 完成 SLA |
|------|----------|----------|----------|
| OpenAI | 2,000 批次/小时 | 50,000 请求 或 200MB | 24 小时 |
| Anthropic | — | 100,000 请求 或 256MB | 24 小时（通常 <1 小时） |
| Gemini (Vertex AI) | GCS 集成 | GCS 文件大小限制 | 24 小时 |

**适用场景**：
- 非实时的大规模推理任务（数据标注、内容审核、批量翻译）
- 月度 AI 支出 > $500 时，Batch API 应该是第一个优化手段
- 注意：Batch 有独立的 rate limit，不消耗实时配额

---

## 四、2026 年 API 生态格局与兼容性真相

### 4.1 三家巨头的差异化路线

| 维度 | OpenAI | Anthropic | Google |
|------|--------|-----------|--------|
| **旗舰模型** | GPT-5.5 / o1 | Claude Opus 4.8 | Gemini 3.1 Pro / Ultra |
| **主推 API** | Responses API | Messages API | generateContent (Vertex AI) |
| **上下文窗口** | 1M tokens | 1M tokens | 1M+ tokens |
| **生态成熟度** | 最广 | 强（企业偏好高） | GCP 集成深 |
| **安全/合规** | 中 | 强（审计轨迹最完善） | 高（Vertex AI SLA 99.99%） |
| **长文档推理** | 良 | 优 | 优 |
| **多模态** | 文本+图像+音频+语音 | 文本+图像 | 文本+图像+视频+音频 |
| **价格区间** | 中-高 | 高 | 中（Flash 极低） |
| **Agentic 成熟度** | 高（内置工具丰富） | 非常高（指令遵循强） | 中-高 |

### 4.2 "OpenAI 兼容"的真实边界

声称"OpenAI-compatible"的平台很多，但兼容深度差异巨大：

**第一层：基础兼容（几乎所有平台）**
- ✅ 文本聊天
- ✅ 基础流式输出
- ✅ 温度、max_tokens 等参数

**第二层：进阶兼容（部分平台）**
- ⚠️ 工具调用（tool_calls 格式可能不同）
- ⚠️ 结构化输出（JSON mode / JSON Schema）
- ⚠️ 多模态输入（图片 URL 格式、尺寸限制）

**第三层：深度兼容（极少平台）**
- ❌ 服务端状态管理（Responses API 特有）
- ❌ 内置工具（web_search、file_search 等）
- ❌ 推理摘要（reasoning summaries）
- ❌ 加密推理（encrypted reasoning）

**真实案例**：某平台声称兼容 OpenAI，结果：
- `parallel_tool_calls` 不支持
- streaming 下的 `tool_call` delta 格式与 OpenAI 不同
- 调试半天才发现是协议层面差异

### 4.3 第三方平台的兼容矩阵

| 平台 | OpenAI 格式 | Anthropic 格式 | Streaming | Tool Calls | 备注 |
|------|------------|---------------|-----------|------------|------|
| DeepSeek | ✅ 原生 | ✅ 原生 | ✅ | ✅ | 唯一双协议原生支持 |
| Moonshot (Kimi) | ✅ | ❌ | ✅ | ✅ | — |
| Z.AI (GLM) | ✅ | ❌ | ✅ | ✅ | Flash 模型免费 |
| MiniMax | ✅ | ❌ | ✅ | ✅ | 性价比突出 |
| 阿里云 (Qwen) | ✅ 兼容模式 | ❌ | ✅ | ✅ | — |
| OpenRouter | ✅ 原生聚合 | ❌ | ✅ | ✅ | 多模型路由 |
| Morph | ✅ | ❌ | ✅ | n/a | 专注代码编辑 |

> **DeepSeek 是目前唯一第一方原生支持 OpenAI + Anthropic 双格式的提供商**，这意味着它可以无缝接入 Claude-Code 风格的 Agent 和 OpenAI 生态的工具。

---

## 五、版本号迷思：/v1 到底是什么

**常见误解**：`/v1` 对应第一代模型，`/v2` 会对应第二代模型。

**真相**：
- `/v1` 是 **API 版本**，约束接口规范（请求字段、响应格式、错误格式、流式事件、鉴权方式）
- `gpt-5.5`、`claude-sonnet-4.6`、`gemini-3.1-pro` 是 **模型版本**，约束模型能力（上下文长度、推理能力、价格、速度、多模态支持）
- `openai Python SDK 1.x / 2.x` 是 **SDK 版本**，三者各管各的

**为什么要有 API 版本号？**

厂商需要在不破坏现有应用的前提下演进接口。假设今天响应里是 `choices[0].message.content`，明天改成 `output[0].content[0].text`，所有依赖旧格式的应用瞬间全挂。

**正经做法**：
- 新开 `/v2` 路径（破坏性变更）
- 或新增接口如 `/v1/responses`（旧接口继续运行）

**Gemini 的特殊情况**：
- `v1`：稳定版，生产项目使用
- `v1beta`：预览版，包含最新实验能力

---

## 六、Base URL 配置实战指南

这是最容易踩坑的地方。

### 场景一：字段名是 Base URL / API Base / OpenAI Base URL

**填到 `/v1` 即可**，不要带后面的 `/chat/completions`。

```
https://api.openai.com/v1
https://openrouter.ai/api/v1
https://api.deepseek.com/v1
```

因为 SDK 会自动在后面拼接 `/chat/completions`。如果你把完整路径填进去：

```
实际请求 → https://api.openai.com/v1/chat/completions/chat/completions
结果 → 404
```

### 场景二：字段名是 Endpoint / Full URL / Request URL

**填完整路径**：

```
https://api.openai.com/v1/chat/completions
https://api.anthropic.com/v1/messages
```

### 场景三：各平台命名空间前缀

| 平台 | 前缀 | 含义 |
|------|------|------|
| Groq | `/openai/v1/...` | "我不是 OpenAI，但我提供兼容入口" |
| OpenRouter | `/api/v1/...` | 聚合平台命名空间 |
| 阿里云百炼 | `/compatible-mode/v1/...` | 兼容模式显式标注 |
| Azure OpenAI | `/openai/v1/...` | Azure 资源路径下的 OpenAI 接口 |

**Claude 的兼容层**：Anthropic 在原生 Messages API 之上提供了 OpenAI SDK 兼容层，但会丢失原生特性。

---

## 七、选择决策：你该用哪个接口

```
┌─────────────────────────────────────────┐
│  你的应用场景是什么？                      │
└─────────────────────────────────────────┘
                   │
       ┌───────────┼───────────┐
       ▼           ▼           ▼
   简单聊天    Agent/多工具    接 Claude
       │           │           │
       ▼           ▼           ▼
/v1/chat      /v1/        /v1/messages
/completions  responses     (Anthropic
               (OpenAI)      SDK)
       │           │
       │           ▼
       │    需要服务端状态？
       │       ┌────┴────┐
       │       ▼         ▼
       │    store=true  自己管理
       │    (Responses)  (Chat Comp)
       │
       └──────→ 做 RAG？
                  │
                  ▼
         /v1/embeddings + 聊天接口
```

**具体建议**：

| 场景 | 推荐接口 | 理由 |
|------|----------|------|
| 普通聊天应用 | `/v1/chat/completions` | 生态最成熟，兼容性最好，几乎所有 SDK 支持 |
| 新项目 + 工具调用/多模态/Agent | `/v1/responses` | OpenAI 主推，内置工具，状态管理，未来-proof |
| 接 Claude | `/v1/messages` | 原生协议，完整功能，别强行套 OpenAI |
| 接 Gemini | `:generateContent` | Google 原生，多模态和 Grounding 能力强 |
| RAG 检索 | `/v1/embeddings` + 聊天接口 | 检索 + 生成标准搭档 |
| 第三方聚合平台 | 先确认兼容协议 | 再选对应 SDK 和路径 |
| 大规模批量处理 | Batch API | 5 折价格，独立配额 |

---

## 八、生产环境避坑清单

### 配置层
- [ ] Base URL 是否填到了 `/v1` 而不是完整端点路径？
- [ ] API Key 的权限是否包含所需模型？
- [ ] 是否确认了平台支持的模型版本号？

### 协议层
- [ ] 是否超出"基础聊天"？如果是，查阅对方文档的字段支持表
- [ ] 工具调用是否测试了 `parallel_tool_calls` 行为？
- [ ] 流式输出是否验证了 delta 格式？
- [ ] 多模态输入是否确认了图片格式（URL/base64/data URI）？

### 架构层
- [ ] 长对话是否评估了 token 重发成本？（考虑 Responses API 或 prompt caching）
- [ ] 是否需要多厂商容灾？（建议 AI Gateway 模式）
- [ ] 非实时任务是否使用了 Batch API？
- [ ] 是否设置了合适的超时和重试策略？

### 成本层
- [ ] 是否启用了输入缓存（prompt caching）？Anthropic 缓存可省 90% 成本
- [ ] 是否评估了不同模型的性价比？（DeepSeek V4 Flash 仅为 GPT-5.5 的 1/48 价格）
- [ ] 长上下文是否使用了合适的模型？（1M 上下文窗口已成 2026 旗舰标配）

---

## 参考文献

1. [OpenAI API Reference](https://platform.openai.com/docs/api-reference) — 官方文档
2. [Anthropic Claude API Reference](https://docs.anthropic.com/en/api/messages) — Messages API 官方文档
3. [Google Gemini API](https://ai.google.dev/docs) — Gemini 开发者文档
4. [OpenAI Migrate to Responses API](https://developers.openai.com/api/docs/guides/migrate-to-responses) — 迁移指南
5. [OpenAI Responses API vs Chat Completions: 2026 Migration Guide](https://www.holysheep.ai/articles/en-openai-responses-api-vs-chat-completions2026-xinji-2026-04-05-0041.html) — 架构对比
6. [From Chat Completions to Responses API](https://demiliani.com/2026/04/16/from-chat-completions-to-responses-api-why-azure-openais-new-paradigm-changes-everything/) — Azure OpenAI 视角
7. [OpenAI Chat Completions vs Responses vs Assistants 2026](https://www.pkgpulse.com/blog/openai-chat-completions-vs-responses-api-vs-assistants-api-2026) — 三 API 对比
8. [LLM API Providers 2026: 12 APIs Compared](https://www.morphllm.com/llm-api) — 价格与兼容性矩阵
9. [OpenAI vs Anthropic vs Google: 2026 Enterprise LLM](https://internative.net/insights/blog/openai-vs-anthropic-vs-google-2026-enterprise-llm) — 企业选型对比
10. [Which AI API Endpoint Should You Use?](https://crazyrouter.com/en/blog/chat-completions-vs-responses-vs-messages-api) — 端点选择指南
11. [From standard to fallback: the completions API in 2026](https://www.akanz.de/posts/llm-api-fragmentation/) — API 碎片化分析
12. [知乎原文：AI API 后缀名解析](https://zhuanlan.zhihu.com/p/2050523117496297035) — 情酱

---

> **最后更新**: 2026-07-07  
> **文档状态**: 基于原文扩展，融合 2026 年最新生态变化  
> **适用读者**: AI 应用开发者、API 集成工程师、架构师
