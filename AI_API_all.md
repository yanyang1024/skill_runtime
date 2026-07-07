# AI API 接口全景图谱：从文本生成到向量检索与多模态

> **本文状态**: 2026-07 更新，覆盖 OpenAI / Anthropic / Google / 第三方生态  
> **适用读者**: AI 应用开发者、架构师、API 集成工程师  
> **核心目标**: 建立对 AI API 生态的完整认知框架，不再只盯着 chat/completions

---

## 目录

- [一、核心文本生成接口（简要回顾）](#一核心文本生成接口简要回顾)
- [二、文件与知识库接口](#二文件与知识库接口)
  - [2.1 OpenAI Files API](#21-openai-files-api)
  - [2.2 OpenAI Vector Stores API](#22-openai-vector-stores-api)
  - [2.3 Assistants API 的 sunset 与迁移](#23-assistants-api-的-sunset-与迁移)
- [三、嵌入与语义检索接口](#三嵌入与语义检索接口)
  - [3.1 /v1/embeddings — 文本向量化](#31-v1embeddings--文本向量化)
  - [3.2 向量数据库检索接口](#32-向量数据库检索接口)
- [四、搜索与 Grounding 接口](#四搜索与-grounding-接口)
  - [4.1 OpenAI 内置搜索](#41-openai-内置搜索)
  - [4.2 Google Gemini Grounding](#42-google-gemini-grounding)
  - [4.3 Perplexity Sonar API](#43-perplexity-sonar-api)
  - [4.4 第三方搜索 API 生态](#44-第三方搜索-api-生态)
- [五、多模态生成接口](#五多模态生成接口)
  - [5.1 Images API (DALL-E)](#51-images-api-dall-e)
  - [5.2 TTS / STT 语音接口](#52-tts--stt-语音接口)
  - [5.3 Realtime API](#53-realtime-api)
- [六、Agent 与工具执行接口](#六agent-与工具执行接口)
  - [6.1 Code Interpreter / Computer Use](#61-code-interpreter--computer-use)
  - [6.2 MCP (Model Context Protocol)](#62-mcp-model-context-protocol)
- [七、安全与治理接口](#七安全与治理接口)
  - [7.1 Moderation API](#71-moderation-api)
  - [7.2 Safety Settings (Gemini)](#72-safety-settings-gemini)
- [八、模型管理与评估接口](#八模型管理与评估接口)
  - [8.1 /v1/models](#81-v1models)
  - [8.2 Fine-tuning API](#82-fine-tuning-api)
  - [8.3 Evals API](#83-evals-api)
- [九、接口选择决策矩阵](#九接口选择决策矩阵)
- [十、生产环境集成建议](#十生产环境集成建议)
- [参考文献](#参考文献)

---

## 一、核心文本生成接口（简要回顾）

这是 AI API 的"主战场"，如果你还不熟悉，建议先阅读《AI API 接口路径完全指南》。核心端点如下：

| 平台 | 端点 | 设计哲学 |
|------|------|----------|
| OpenAI | `/v1/chat/completions` | 聊天补全，生态最成熟 |
| OpenAI | `/v1/responses` | 任务响应，2026 主推方向 |
| Anthropic | `/v1/messages` | 结构化消息，Claude 原生 |
| Google | `/v1beta/models/{model}:generateContent` | 资源+方法，Gemini 风格 |

本文重点覆盖**文本生成之外**的完整 AI API 生态。

---

## 二、文件与知识库接口

### 2.1 OpenAI Files API

文件是 AI 工作流的"原材料"——文档、图片、音频、代码文件都需要先上传才能被模型处理。

```http
# 上传文件
POST /v1/files
Content-Type: multipart/form-data

purpose=assistants&file=@document.pdf
```

**关键参数 `purpose`**：
- `assistants` — 用于 Assistants / Vector Stores / File Search
- `vision` — 用于 vision 模型的图片输入
- `batch` — 用于 Batch API 的批量任务文件
- `fine-tune` — 用于微调训练数据

**核心端点**：

| 操作 | 端点 | 说明 |
|------|------|------|
| 上传 | `POST /v1/files` | 返回 `file_id`，所有后续操作的基础 |
| 列表 | `GET /v1/files` | 分页列出所有文件 |
| 查询 | `GET /v1/files/{file_id}` | 获取文件元数据（大小、用途、状态） |
| 下载 | `GET /v1/files/{file_id}/content` | 获取文件二进制内容 |
| 删除 | `DELETE /v1/files/{file_id}` | 清理不再使用的文件 |

**⚠️ 重要**：文件上传后不是立即可用的。OpenAI 会对文件进行解析、分块、向量化等处理，状态从 `uploaded` → `processed` 后才可被检索工具使用。

---

### 2.2 OpenAI Vector Stores API

Vector Store 是 OpenAI 托管的向量数据库，用于 `file_search` 工具。它自动完成：文件分块 → Embedding → 索引 → 检索。

```http
# 创建向量存储
POST /v1/vector_stores
Content-Type: application/json

{
  "name": "product-docs",
  "expires_after": { "anchor": "last_active_at", "days": 7 }
}
```

**核心端点**：

| 操作 | 端点 |
|------|------|
| 创建 | `POST /v1/vector_stores` |
| 列表 | `GET /v1/vector_stores` |
| 查询 | `GET /v1/vector_stores/{vector_store_id}` |
| 删除 | `DELETE /v1/vector_stores/{vector_store_id}` |
| 添加文件 | `POST /v1/vector_stores/{id}/files` |
| 列出文件 | `GET /v1/vector_stores/{id}/files` |
| 直接搜索 | `POST /v1/vector_stores/{id}/search` |

**直接搜索示例**：

```http
POST /v1/vector_stores/vs_xxx/search
Content-Type: application/json

{
  "query": "退款政策是什么？",
  "filters": { "author": "Jane Doe" },
  "max_num_results": 5
}
```

**计费方式**：
- 存储：前 1GB 免费，超出 $0.10/GB/天
- 检索：$2.50/1,000 次查询
- 注意：这是**托管服务**，你无法控制 embedding 模型、分块策略、检索算法

---

### 2.3 Assistants API 的 sunset 与迁移

**关键时间节点**：OpenAI 已宣布 Assistants API 将于 **2026 年 8 月 26 日**正式关闭（410 Gone）。

**Assistants API 的原有对象模型**：
- `Assistant` — 模型 + 指令 + 工具配置
- `Thread` — 对话状态容器
- `Message` — 线程内的消息
- `Run` — 执行一次对话轮次

**官方迁移路径**：

| 原功能 | 迁移目标 | 说明 |
|--------|----------|------|
| `Assistant` 配置 | Prompts（Dashboard） | 在 Web UI 中配置 |
| `Thread` 持久化 | Conversations API | 服务端持久化对话 |
| 生成 + 工具调用 | Responses API | 新一代统一接口 |
| `file_search` | Responses API + Vector Stores | 继续可用 |
| `code_interpreter` | Responses API `code_interpreter` | 内置工具 |

**⚠️ 注意**：Vector Store 本身**不**随 Assistants API 关闭，它继续作为 Responses API 的 `file_search` 工具依赖存在。但 `vector_store_ids` 的迁移需要手动处理，不能 1:1 自动映射。

---

## 三、嵌入与语义检索接口

### 3.1 /v1/embeddings — 文本向量化

```http
POST /v1/embeddings
Content-Type: application/json

{
  "model": "text-embedding-3-large",
  "input": ["AI API suffixes explained", "向量数据库选型"],
  "dimensions": 256
}
```

**核心参数**：
- `model`：embedding 模型，决定向量维度和质量
- `input`：字符串或字符串数组，支持批量
- `dimensions`（可选）：降维，节省存储和计算成本

**2026 年主流 Embedding 模型对比**：

| 模型 | 维度 | 价格 ($/1M tokens) | 特点 |
|------|------|---------------------|------|
| text-embedding-3-large | 3072 | $0.13 | OpenAI，综合表现好，支持降维 |
| text-embedding-3-small | 1536 | $0.02 | 性价比首选 |
| voyage-3 | 1024 | $0.10 | 长文档检索强 |
| e5-mistral-7b | 4096 | 开源/自托管 | 可本地部署 |
| bge-m3 | 1024 | 开源 | 中文场景表现优异 |

**RAG 标准搭档**：
1. `embeddings` 把文档切片 → 向量 → 存入向量数据库
2. 用户提问 → `embeddings` 转成向量 → 检索最相似片段
3. 检索结果塞进 `chat/completions` 或 `responses` → 生成答案

---

### 3.2 向量数据库检索接口

当 OpenAI 的托管 Vector Store 不够用（需要自定义 embedding 模型、分块策略、混合检索）时，你需要独立的向量数据库。

**2026 年主流向量数据库对比**：

| 特性 | Pinecone | Weaviate | Qdrant | pgvector |
|------|----------|----------|--------|----------|
| **部署模式** | 全托管（无自托管） | Cloud / 自托管 | Cloud / 边缘 / 本地 | PostgreSQL 插件 |
| **索引算法** | 专有（不可调） | HNSW（可调参数） | HNSW / DiskANN | HNSW / ivfflat |
| **混合检索** | 需手动拼接稀疏+密集索引 | 原生 BM25 + Vector | Reciprocal Rank Fusion | 需 pg_trgm 配合 |
| **查询语言** | REST / gRPC | GraphQL / REST / gRPC | REST / gRPC | SQL |
| **多租户** | Namespace（粗粒度） | 原生 tenant 隔离 | 分布式分片 | Schema 隔离 |
| **定价** | RU/WU 计费（突发易超支） | 节点计费 / 自托管固定成本 | 节点计费 | 基础设施成本 |
| **1B 向量延迟** | 40-120ms | 15-40ms | 12-35ms | 取决于硬件 |
| **多模态** | 文本向量 | 原生文本/图像/音频 | 文本向量 | 文本向量 |

**选型建议**：
- **零运维 + 弹性扩缩容** → Pinecone Serverless
- **混合检索 + 知识图谱 + 数据主权** → Weaviate
- **低延迟 + 边缘部署 + 本地合规** → Qdrant
- **已有 PostgreSQL 基础设施** → pgvector

**典型向量搜索请求（Qdrant 风格）**：

```http
POST /collections/{collection_name}/points/search
Content-Type: application/json

{
  "vector": [0.1, 0.2, ...],
  "limit": 10,
  "filter": {
    "must": [
      { "key": "category", "match": { "value": "tech" } }
    ]
  }
}
```

---

## 四、搜索与 Grounding 接口

### 4.1 OpenAI 内置搜索

OpenAI 在 Responses API 中提供了内置搜索工具：

```http
POST /v1/responses
Content-Type: application/json

{
  "model": "gpt-4o",
  "input": "What are the latest OWASP LLM Top 10 vulnerabilities?",
  "tools": [
    { "type": "web_search_preview" }
  ]
}
```

**计费**：搜索工具调用通常按次计费，约 $10/1,000 次（具体取决于模型和工具版本）。

**注意**：`web_search_preview` 在第三方兼容端点中默认被剥离，需要显式声明 `supportsWebSearchPreview` 才会透传。

---

### 4.2 Google Gemini Grounding

Gemini 的 Grounding 是其核心差异化能力——模型自动决定何时搜索，并返回带引用的答案。

```http
POST /v1beta/models/gemini-2.5-pro:generateContent
Content-Type: application/json

{
  "contents": [{
    "parts": [{ "text": "What are the latest AI regulations in EU 2026?" }]
  }],
  "tools": [{ "googleSearch": {} }]
}
```

**响应包含**：
- 带引用的 grounded 答案
- 实际使用的搜索查询 (`webSearchQueries`)
- 来源 URL (`groundingChunks` / `groundingSupports`)

**2026 年计费规则**（Gemini 3 系列）：
- 免费额度：5,000 prompts/月（Gemini 3 模型间共享）
- 超出后：$14/1,000 次搜索查询
- Gemini 2.5 及更早版本按 prompt 计费，无免费额度共享

**Gemini 独有优势**：
- Google Search + Google Maps 联合 Grounding（物流、本地服务场景）
- 多查询执行：单次 prompt 触发多个搜索验证复杂问题
- 上下文循环：多轮对话中保持 grounding 数据不丢失

---

### 4.3 Perplexity Sonar API

Perplexity 是"搜索优先"的 LLM，每次请求都附带实时网络搜索和引用。

```http
POST https://api.perplexity.ai/chat/completions
Authorization: Bearer $PERPLEXITY_API_KEY
Content-Type: application/json

{
  "model": "sonar-pro",
  "messages": [
    {"role": "user", "content": "Summarize today's AI agent news with sources."}
  ]
}
```

**核心特点**：
- **OpenAI 兼容**：只需改 `base_url` 和 `api_key`
- **自动引用**：响应包含 `citations` 数组，每条陈述都有来源 URL
- **无需自建 RAG**：Perplexity 内部处理搜索 + 检索 + 生成

**模型选择**：

| 模型 | 价格 ($/1M tokens) | 适用场景 |
|------|---------------------|----------|
| Sonar | $1 | 快速搜索和摘要 |
| Sonar Pro | $3 | 增强推理和深度分析 |
| Sonar Reasoning | $5-15 | 多步推理复杂查询 |

**附加费用**：搜索上下文 $5-14/1,000 次请求（与 token 计费分开）。

**2026 新特性**：支持单次调用最多 5 个查询并行搜索，支持按国家和语言过滤。

---

### 4.4 第三方搜索 API 生态

如果你需要**独立的搜索能力**（不绑定特定 LLM），以下 API 是构建 RAG 的首选：

**2026 年 Agentic Search 基准测试排名**（质量 × 相关性）：

| API | Agent Score | 延迟 | 特点 |
|-----|-------------|------|------|
| **Brave Search** | 14.89 | 669ms | 质量最高，延迟最低，免费额度 $5/月 |
| **Firecrawl** | 14.58 | 1,231ms | 结构化网页提取 |
| **Exa** | 14.39 | 981ms | 语义搜索，适合研究 |
| **Tavily** | 13.67 | 998ms | 专为 AI Agent 设计，免费 1,000 credits/月 |
| **SerpAPI** | 12.28 | 2,435ms | 传统搜索引擎代理 |

**Brave Search API 示例**：

```http
GET https://api.search.brave.com/res/v1/web/search?q=AI+API+trends+2026&count=5
X-Subscription-Token: YOUR_TOKEN
```

**Tavily API 示例**：

```http
POST https://api.tavily.com/search
Content-Type: application/json

{
  "query": "AI API trends 2026",
  "max_results": 5,
  "include_answer": true,
  "search_depth": "advanced"
}
```

**选型建议**：
- **生产级 AI Agent** → Brave Search（质量+延迟双优）
- **原型开发/成本敏感** → Tavily（免费额度充足）
- **深度研究/学术** → Exa（语义搜索强）
- **需要网页内容提取** → Firecrawl（结构化数据）

---

## 五、多模态生成接口

### 5.1 Images API (DALL-E)

```http
POST /v1/images/generations
Content-Type: application/json

{
  "model": "dall-e-3",
  "prompt": "A futuristic AI data center with glowing neural networks",
  "size": "1024x1024",
  "quality": "hd",
  "n": 1
}
```

**核心参数**：
- `model`：`dall-e-3`（质量高）或 `dall-e-2`（速度快、成本低）
- `prompt`：图像描述，DALL-E 3 对提示词理解很强
- `size`：`1024x1024`、`1792x1024`（横屏）、`1024x1792`（竖屏）
- `quality`：`standard` 或 `hd`
- `style`：`vivid`（鲜艳）或 `natural`（自然）

**其他端点**：

| 操作 | 端点 | 说明 |
|------|------|------|
| 编辑 | `POST /v1/images/edits` | 基于 mask 局部编辑图像 |
| 变体 | `POST /v1/images/variations` | 基于已有图像生成变体 |

**竞品对比**：

| 服务 | 价格 | 特点 |
|------|------|------|
| DALL-E 3 | $0.04-0.08/张 | 提示词遵循度最高 |
| Midjourney | $10-30/月订阅 | 艺术风格最强 |
| Stable Diffusion 3 | 开源/自托管 | 可控性最高 |
| Ideogram | 免费额度 | 文字渲染最准确 |

---

### 5.2 TTS / STT 语音接口

**TTS（文本转语音）**：

```http
POST /v1/audio/speech
Content-Type: application/json

{
  "model": "tts-1",
  "input": "Hello, this is an AI speaking.",
  "voice": "alloy",
  "response_format": "mp3",
  "speed": 1.0
}
```

**TTS 模型**：
- `tts-1` — 标准质量，速度快
- `tts-1-hd` — 高清质量，更自然

**TTS 语音选项**：`alloy`、`echo`、`fable`、`onyx`、`nova`、`shimmer`

**STT（语音转文本）— Whisper**：

```http
POST /v1/audio/transcriptions
Content-Type: multipart/form-data

model=whisper-1&file=@audio.mp3&language=zh&response_format=json
```

**Whisper 参数**：
- `model`：`whisper-1`
- `language`：ISO 639-1 语言代码（如 `zh`、`en`、`ja`）
- `response_format`：`json`、`text`、`srt`、`verbose_json`
- `timestamp_granularities`：`word` 或 `segment`（逐词时间戳）

**翻译端点**：

```http
POST /v1/audio/translations
# 自动翻译为英文，不支持指定目标语言
```

**2026 年语音生态**：

| 服务 | 场景 | 特点 |
|------|------|------|
| OpenAI Whisper | 通用转录 | 多语言，价格低 |
| OpenAI TTS | 通用语音合成 | 6 种预设声音 |
| ElevenLabs | 高质量语音克隆 | 情感丰富，支持声音克隆 |
| Azure Speech | 企业级 | 实时转写，自定义语音 |
| Gemini | 原生音频理解 | 音频直接输入，无需先转文本 |

---

### 5.3 Realtime API

Realtime API 提供**低延迟的双工语音交互**，适用于实时对话应用（如 AI 客服、语音助手）。

**连接方式**：WebSocket（非 HTTP REST）

```
wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01
```

**核心能力**：
- 流式语音输入 → 流式语音输出
- 支持打断（barge-in）
- 内置 VAD（语音活动检测）
- 支持 function calling（语音控制工具）

**使用场景**：
- 实时语音客服
- 口语练习应用
- 语音控制的智能家居
- 实时翻译对话

**⚠️ 注意**：Realtime API 按分钟计费，成本显著高于文本 API。2026 年 Gemini 也推出了类似的实时音频/视频流式接口。

---

## 六、Agent 与工具执行接口

### 6.1 Code Interpreter / Computer Use

**OpenAI Code Interpreter（内置工具）**：

```http
POST /v1/responses
Content-Type: application/json

{
  "model": "gpt-4o",
  "input": "Analyze this CSV and plot a trend chart.",
  "tools": [
    { "type": "code_interpreter" }
  ]
}
```

**特点**：
- 模型生成 Python 代码 → 在沙箱中执行 → 返回结果
- 支持文件读写、数据分析、图表生成
- 按容器会话计费：$0.03/GB/20分钟起

**Anthropic Computer Use（桌面自动化）**：

Anthropic 提供的是**底层 API + Docker 参考实现**，不是现成产品：

```python
import anthropic

client = anthropic.Anthropic()

response = client.messages.create(
    model="claude-opus-4-6",
    max_tokens=4096,
    tools=[
        {"type": "computer_20241022", "name": "computer",
         "display_width_px": 1920, "display_height_px": 1080},
        {"type": "bash_20241022", "name": "bash"}
    ],
    messages=[{"role": "user", "content": "Open Chrome, go to github.com, find trending Python repos."}]
)
```

**Computer Use 工具集**：
- `screenshot()` — 截取屏幕
- `click(x, y)` — 鼠标点击
- `type("text")` — 键盘输入
- `key("ctrl+c")` — 快捷键
- `scroll(direction)` — 滚动

**2026 年状态**：
- 仍为 Beta（`computer-use-2025-11-24` 头部标记）
- 支持 Claude Opus 4.5-4.7、Sonnet 4.6
- 每张截图消耗约 1,000-3,000 tokens（图像 token）
- 推荐在隔离容器/VM 中运行，**不要**直接操作主桌面

**OpenAI Codex（2026 新方向）**：
- `/v1/codex/cloud/tasks` — 云端沙箱任务委托
- `/v1/codex/reviews` — 自动 PR 代码审查
- 背景 Computer Use：在 macOS 上并行运行桌面会话

---

### 6.2 MCP (Model Context Protocol)

MCP 不是某个厂商的 API，而是 **Anthropic 发起的开放协议**，用于标准化 LLM 与外部工具的连接方式。

**核心思想**：
- 传统方式：每个工具都要写适配代码
- MCP 方式：工具提供方实现 MCP Server，LLM 应用通过 MCP Client 连接

**MCP 架构**：

```
┌─────────────┐      MCP 协议      ┌─────────────┐
│  LLM 应用   │ ◄────────────────► │  MCP Server  │
│ (Client)    │   (stdio/sse)      │ (工具提供方)  │
└─────────────┘                    └─────────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    ▼                   ▼                   ▼
               ┌─────────┐      ┌──────────┐      ┌──────────┐
               │ File    │      │ Database │      │  Search  │
               │ System  │      │  (MySQL) │      │  (Brave) │
               └─────────┘      └──────────┘      └──────────┘
```

**MCP 核心能力**：
- **Resources**：暴露只读数据（文件、数据库记录）
- **Tools**：暴露可执行操作（搜索、发送邮件、创建日历事件）
- **Prompts**：暴露可复用提示模板

**为什么重要**：
- 2026 年已有 **70+ MCP 扩展**（Goose、Claude Desktop 等支持）
- 工具生态从"每个 LLM 平台各自为政"走向标准化
- 开发者写一次 MCP Server，所有支持 MCP 的客户端都能使用

**与 API 的关系**：MCP 是**协议层**，不是替代 REST API，而是让 LLM 应用更容易发现和调用各种 API。

---

## 七、安全与治理接口

### 7.1 Moderation API

OpenAI 的 Moderation 端点用于检测有害内容，**2026 年对 API 用户完全免费**。

```http
POST /v1/moderations
Content-Type: application/json

{
  "model": "omni-moderation-latest",
  "input": "This text will be checked for harmful content."
}
```

**检测类别**：
- `hate` / `hate/threatening`
- `harassment` / `harassment/threatening`
- `self-harm` / `self-harm/intent`
- `sexual` / `sexual/minors`
- `violence` / `violence/graphic`

**响应示例**：

```json
{
  "results": [{
    "flagged": false,
    "categories": { "hate": false, "violence": false },
    "category_scores": { "hate": 0.0001, "violence": 0.0002 }
  }]
}
```

**2026 年 Moderation 生态对比**：

| 服务 | 覆盖类型 | 价格 | 特点 |
|------|----------|------|------|
| OpenAI Moderation | 文本 + 基础图像 | 免费 | 简单，英语最佳 |
| Google Cloud Vision SafeSearch | 图像 | $1.50/1,000 张 | 多年积累，多语言 |
| Hive Moderation | 文本+图像+视频+音频 | 按量 | 唯一全模态覆盖，视频 $0.13/分钟 |
| Azure AI Content Safety | 文本+图像 | 按量 | 企业级，EU 数据中心可用 |
| Sightengine | 图像+视频 | 按量 | AI 生成内容检测专长 |

**建议**：
- 快速起步 → OpenAI（免费）
- 视频内容 → Hive Moderation
- 欧盟合规 → Azure AI Content Safety（法国/西欧/瑞士节点）
- 生产级多模态 → 混合策略：OpenAI 初筛 + Hive 复核

---

### 7.2 Safety Settings (Gemini)

Gemini 的安全过滤器可能过度拦截合法内容（安全研究、医学、创意写作），需要显式配置：

```http
POST /v1beta/models/gemini-2.5-pro:generateContent
Content-Type: application/json

{
  "contents": [...],
  "safetySettings": [
    { "category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_ONLY_HIGH" },
    { "category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_MEDIUM_AND_ABOVE" },
    { "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_MEDIUM_AND_ABOVE" },
    { "category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_MEDIUM_AND_ABOVE" }
  ]
}
```

**阈值级别**：`BLOCK_NONE` → `BLOCK_ONLY_HIGH` → `BLOCK_MEDIUM_AND_ABOVE` → `BLOCK_LOW_AND_ABOVE`

---

## 八、模型管理与评估接口

### 8.1 /v1/models

```http
GET /v1/models
Authorization: Bearer YOUR_KEY
```

**用途**：
- 确认模型名是否拼写正确
- 查看账号可用的模型列表和权限
- 检查模型版本更新
- 调试时快速验证 API Key 有效性

---

### 8.2 Fine-tuning API

微调让基础模型在特定任务上表现更好。

**OpenAI 微调流程**：

```http
# 1. 上传训练数据
POST /v1/files
# purpose=fine-tune

# 2. 创建微调任务
POST /v1/fine_tuning/jobs
Content-Type: application/json

{
  "model": "gpt-4o-2024-08-06",
  "training_file": "file-xxx",
  "hyperparameters": { "n_epochs": 3 }
}

# 3. 查询任务状态
GET /v1/fine_tuning/jobs/{job_id}

# 4. 使用微调后的模型
POST /v1/chat/completions
# model = "ft:gpt-4o-xxx"
```

**2026 年微调价格对比**：

| 提供商 | 模型 | 训练成本 | 推理成本 |
|--------|------|----------|----------|
| OpenAI | GPT-4o-mini | $3.00/1M tokens | $0.60/1M tokens |
| OpenAI | GPT-4o | $25.00/1M tokens | $3.75/1M tokens |
| 自托管 | Llama 4 Scout 8B | GPU 成本 (~$1-2/hr) | GPU 成本 |
| 自托管 | Qwen 3 72B | GPU 成本 (~$3-8/hr) | GPU 成本 |

**最佳实践**：
- 训练前**去重**，重复示例会导致过拟合
- 包含**负例**（模型不应该做什么）
- 预留 10-20% 数据做验证
- 先用强提示词（prompting）尝试，如果提示词能赢过微调模型，说明数据集需要改进

---

### 8.3 Evals API

OpenAI Evals 框架用于系统评估模型和提示词的表现。

```python
import os
from openai import OpenAI

client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

# 创建评估定义
eval = client.evals.create(
    name="customer-support-qa",
    data_source_config={"type": "completions", "item_schema": {...}},
    testing_criteria=[...]
)

# 运行评估
run = client.evals.runs.create(
    eval_id=eval.id,
    name="run-2026-07",
    data_source={"type": "file_content", "source": [...]}
)
```

**核心端点**：

| 操作 | 端点 |
|------|------|
| 创建评估 | `POST /v1/evals` |
| 列表 | `GET /v1/evals` |
| 创建运行 | `POST /v1/evals/{eval_id}/runs` |
| 查询运行 | `GET /v1/evals/{eval_id}/runs/{run_id}` |
| 结果详情 | `GET /v1/evals/{eval_id}/runs/{run_id}/output_items` |

**Grader 类型**：
- `label_model`：用另一个模型做评判
- `score_model`：用模型打分
- `python`：自定义 Python 评判函数

---

## 九、接口选择决策矩阵

### 按应用场景选择

| 应用场景 | 推荐接口/服务 | 备选方案 |
|----------|--------------|----------|
| 普通聊天机器人 | `/v1/chat/completions` | `/v1/responses` |
| Agent + 工具调用 | `/v1/responses` | Claude + MCP |
| 长对话 + 状态管理 | `/v1/responses` + `previous_response_id` | Conversations API |
| 知识库问答 | `/v1/responses` + `file_search` | 自建 RAG (Vector DB + Embeddings) |
| 实时网络搜索 | Perplexity Sonar API | Brave Search + LLM |
| 带引用的 factual 查询 | Gemini + `googleSearch` | Perplexity |
| 语音交互 | Realtime API | Whisper + TTS |
| 图像生成 | DALL-E 3 | Midjourney / Stable Diffusion |
| 代码执行 | `code_interpreter` (Responses) | 自托管沙箱 |
| 桌面自动化 | Anthropic Computer Use | OpenAI Codex Background |
| 内容审核 | OpenAI Moderation (免费) | Hive Moderation |
| 批量处理 | Batch API | 自托管 + 队列 |
| 自定义模型 | Fine-tuning API | LoRA 自托管 |
| 模型评估 | Evals API | Ragas / DeepEval |

### 按数据敏感度选择

| 数据敏感度 | 推荐方案 |
|------------|----------|
| 公开数据 | 任何云端 API |
| 内部业务数据 | Vector DB 自托管 + API 网关 |
| 个人隐私数据 | 本地模型 + 本地向量库 |
| 金融/医疗合规 | Azure OpenAI / GCP Vertex AI（区域合规） |

---

## 十、生产环境集成建议

### 1. API 网关模式

不要直接让应用代码调用厂商 API，而是通过**AI Gateway**（如 LiteLLM、Crazyrouter）：

```
应用代码 → AI Gateway → 多厂商路由 → OpenAI / Anthropic / Gemini / 本地模型
              ↓
         统一计费 / 日志 / 缓存 / 限流
```

**好处**：
- 单点切换模型（改配置即可）
- 统一监控和成本追踪
- 自动降级（OpenAI 挂了切 Anthropic）
- 请求缓存（重复问题直接返回缓存）

### 2. 成本优化策略

| 策略 | 节省幅度 | 实施难度 |
|------|----------|----------|
| Batch API | 50% | 低 |
| Prompt Caching (Anthropic) | 90% 缓存命中 | 低 |
| 降维 Embedding | 50-75% 存储 | 低 |
| 模型路由（简单任务用便宜模型）| 30-80% | 中 |
| 自托管小模型 | 80-95% | 高 |

### 3. 安全 checklist

- [ ] API Key 存储在环境变量/密钥管理服务，不要硬编码
- [ ] 使用最小权限原则（只给需要的模型权限）
- [ ] 敏感数据先过 Moderation API
- [ ] 长对话评估 token 重发成本（考虑 Responses API 状态管理）
- [ ] 文件上传限制大小和类型，防止恶意文件
- [ ] 向量数据库设置访问控制和租户隔离
- [ ] 搜索 API 设置查询限流，防止滥用

### 4. 监控指标

| 指标 | 告警阈值建议 |
|------|-------------|
| 请求延迟 P99 | > 5s |
| 错误率 | > 1% |
| 每分钟 token 消耗 | 突增 300% |
| 成本/天 | 超预算 120% |
| 缓存命中率 | < 50%（考虑优化） |

---

## 参考文献

1. [OpenAI API Reference](https://platform.openai.com/docs/api-reference) — 官方文档
2. [OpenAI Vector Stores API Guide](https://www.eesel.ai/blog/openai-vector-stores-api-reference) — 向量存储实践
3. [OpenAI Assistants API Deprecation Guide](https://ragwalla.com/docs/guides/openai-assistants-api-deprecation-2026-migration-guide-wire-compatible-alternatives) — 迁移指南
4. [Anthropic Computer Use API Guide](https://uravation.com/media/anthropic-computer-use-api-complete-guide-2026/) — 2026 年 5 月最新
5. [Google Gemini Grounding Docs](https://ai.google.dev/gemini-api/docs/google-search) — 搜索 Grounding 官方文档
6. [Perplexity AI API Guide](https://neuraplus-ai.github.io/blog/perplexity-ai-api-access-guide.html) — 开发者接入指南
7. [Perplexity vs Search APIs Benchmark](https://aimultiple.com/agentic-search) — 8 大搜索 API 基准测试
8. [Pinecone vs Weaviate 2026](https://www.kunalganglani.com/blog/pinecone-vs-weaviate-2026) — 向量数据库选型
9. [Vector DB Selection Matrix 2026](https://techbytes.app/posts/vector-db-selection-matrix-2026-cheat-sheet/) — Weaviate / Pinecone / Qdrant 对比
10. [Content Moderation APIs 2026](https://www.edenai.co/post/content-moderation-apis-text-image-and-video-compared) — 多模态内容审核对比
11. [AI Fine-Tuning API Guide 2026](https://crazyrouter.com/en/blog/ai-fine-tuning-api-complete-guide-2026) — 微调完整指南
12. [OpenAI Evals API Reference](https://qaskills.sh/blog/openai-evals-api-reference-2026) — 评估框架文档
13. [Codex API Endpoints 2026](https://apidog.com/blog/what-api-endpoints-available-codex-2025/) — Codex 端点说明
14. [MCP Protocol](https://modelcontextprotocol.io) — Model Context Protocol 官方

---

> **最后更新**: 2026-07-07  
> **文档状态**: 覆盖文本生成之外的完整 AI API 生态，包含 Files、Vector Stores、Embeddings、Search、Multimodal、Agent、Moderation、Fine-tuning、Evals 等接口  
> **反馈建议**: 如有遗漏接口或需要深入某个具体领域，欢迎提出
