# 腾讯混元 Hy-Memory：原始方案、使用契约与核心源码

> **上游项目**：Tencent-Hunyuan/Hy-Memory  
> **固定 commit**：`d8138b501a755f662a024f7e8eb879613eabf1d3`  
> **该 commit 的包版本**：`hy-memory==2.0.17`（见 `pyproject.toml`）  
> **许可证**：Apache-2.0，完整原文见本文附录  
> **整理日期**：2026-11-26  
> **固定版本入口**：https://github.com/Tencent-Hunyuan/Hy-Memory/tree/d8138b501a755f662a024f7e8eb879613eabf1d3

## 整理说明与阅读边界

本文用于保存后续技术方案所依据的上游原始材料，内容分为四部分：

1. **原始 README.zh.md**：完整收录，不更新其中的新闻、版本和链接；
2. **核心源码**：按符号从固定 commit 原样抽取，标注原始文件、行号和永久链接；
3. **原始使用文档**：完整收录 `docs/usage.md` 与 `docs/scene_coding_usage.md`；
4. **原始 LICENSE**：完整收录 Apache-2.0 及项目声明。

除各源码小节明确标注的“阅读提示”和本说明外，方案描述、注释与代码均保持上游原文。**源码摘录不是独立可运行程序**；其 imports、类上下文、配置和依赖仍需回到固定版本的完整仓库。文档中的相对图片和链接均相对于上游仓库原文件位置。

特别区分：`Proposal–Approval–Commit`、平台 Canonical Store、用户审批卡、Transaction Outbox 等是此前平台方案的扩展，不是本文件所收录 Hy-Memory 原生 API 的名称。

## 第一部分：上游 README.zh.md 原文

<p align="center">
  <img src="docs/images/hunyuanlogo.png" alt="Tencent Hunyuan" width="260">
</p>

<h1 align="center">Hy Memory</h1>

<p align="center">工业级双系统认知记忆框架，为 LLM Agent 提供类人长期记忆能力。</p>

<p align="center">
  <a href="#最新动态"><img src="https://img.shields.io/badge/news-latest-e65100?style=flat-square" alt="最新动态"></a>
  <a href="#论文"><img src="https://img.shields.io/badge/papers-research-68448b?style=flat-square" alt="论文"></a>
  <a href="#快速开始"><img src="https://img.shields.io/badge/get_started-quickstart-149954?style=flat-square" alt="快速开始"></a>
  <a href="#架构设计"><img src="https://img.shields.io/badge/architecture-overview-007ec6?style=flat-square" alt="架构设计"></a>
  <a href="#支持"><img src="https://img.shields.io/badge/support-docs-00897b?style=flat-square" alt="支持"></a>
  <a href="https://huggingface.co/tencent/Hy-Memory-30B-A3B"><img src="https://img.shields.io/badge/model-Hugging%20Face-ffd21e?style=flat-square" alt="Hugging Face 模型"></a>
  <a href="memhub/README.md"><img src="https://img.shields.io/badge/MemHub-README-f28c45?style=flat-square" alt="MemHub"></a>
  <a href="https://memory.hunyuan.tencent.com/"><img src="https://img.shields.io/badge/website-Hy%20Memory-0052d9?style=flat-square" alt="官网"></a>
  <a href="https://discord.gg/x56wEb2PX"><img src="https://img.shields.io/badge/Discord-memory%20channel-5865f2?style=flat-square&logo=discord&logoColor=white" alt="Discord"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-4c6ef5?style=flat-square" alt="Apache-2.0 许可证"></a>
</p>

[English](README.md) | 中文

**[Hy Memory](https://memory.hunyuan.tencent.com/)**（官网：[memory.hunyuan.tencent.com](https://memory.hunyuan.tencent.com/)）是面向自演化 LLM Agent 的工业级双系统认知记忆引擎与 Python SDK（`hy-memory`），针对三类任务场景提供专用记忆链路：面向日常对话的 **Chat** 多层认知记忆、面向生产力任务的 **Working**“会话事实 + 可复用经验”双层记忆，以及面向软件工程的 **Coding** 双层记忆与代码版本演进链（diff 链）。基于 Hy Memory 构建的 **[MemHub](memhub/README.md)** 是本地优先的桌面端与 CLI 产品，可将用户授权的多个 AI 应用（如 Claude Code、Cursor、Codex、OpenCode、Qwen Code 等）的历史对话与操作轨迹汇入统一的本地受管 Runtime 与数据目录，并向授权宿主提供受治理的跨应用记忆召回。

<div align="center">
  <video src="https://github.com/user-attachments/assets/94405890-8429-47c2-9084-38f7ed9f126f" controls width="640"></video>
  <p><b>MemHub 演示视频</b></p>
</div>

---

## 最新动态

* *<mark>[new]</mark>* 🔥🔥🔥 **[2026-10]**: 🚀 **模型开源** 在 Hugging Face 发布 **Hy-Memory-30B-A3B** 的 **FP8**（**[Hy-Memory-30B-A3B-FP8](https://huggingface.co/tencent/Hy-Memory-30B-A3B-FP8)**）与 **GGUF**（**[Hy-Memory-30B-A3B-GGUF](https://huggingface.co/tencent/Hy-Memory-30B-A3B-GGUF)**）量化版本模型！
* *<mark>[new]</mark>* 🔥🔥🔥 **[2026-11]**: 📦 **正式发布 [MemHub v1.0.7](https://github.com/Tencent-Hunyuan/Hy-Memory/releases/tag/v1.0.7)**：修复 Ultra 模式知识图谱损坏导致的卡死，可通过 CLI 配置图与向量后端（Neo4j / Memgraph / Qdrant），备份包含全部记忆，模型可单独设置输出 token 参数，支持 OpenCode V2；底层使用 **`hy-memory==2.0.16`**。详见发布说明。
* *<mark>[new]</mark>* 🔥🔥🔥 **[2026-11]**: 📦 **正式发布 [MemHub v1.0.6](https://github.com/Tencent-Hunyuan/Hy-Memory/releases/tag/v1.0.6)**：界面支持 11 种语言，新增记忆模式（lite / pro / ultra，ultra 每晚自动整理），可安全切换嵌入模型，CLI 和 API 支持多用户，记忆写入自动重试、模型服务异常时暂停排队，升级更可靠；底层使用 **`hy-memory==2.0.14`**。详见发布说明。
* *<mark>[new]</mark>* 🔥🔥🔥 **[2026-10]**: 📦 **正式发布 [MemHub v1.0.5](https://github.com/Tencent-Hunyuan/Hy-Memory/releases/tag/v1.0.5)**：支持中文、英文和西班牙语界面，可通过一次性配对码连接更多自定义 Harness，并优化了记忆浏览、搜索、启动和异常恢复；底层使用 **`hy-memory==2.0.8`**。详见发布说明。
* *<mark>[new]</mark>* 🔥🔥🔥 **[2026-10]**: 📦 **正式发布 [MemHub v1.0.4](https://github.com/Tencent-Hunyuan/Hy-Memory/releases/tag/v1.0.4)** 与 **[memhub-cli 1.0.5](https://www.npmjs.com/package/memhub-cli/v/1.0.5)**，提供已签名的 macOS 桌面应用及经过验证的 macOS/Linux Runtime！
* *<mark>[new]</mark>* 🔥🔥🔥 **[2026-10]**: 🚀 **正式发布** **Hy Memory 2.0 (`hy-memory==2.0.4`)**（已上线 [PyPI](https://pypi.org/project/hy-memory/2.0.4/)），并开源 **Hy-Memory** monorepo 与 **[MemHub](memhub/README.md)**！
* *<mark>[new]</mark>* 🔥🔥🔥 **[2026-10]**: 🚀 **模型开源** 在 Hugging Face 发布 **[Hy-Memory-30B-A3B](https://huggingface.co/tencent/Hy-Memory-30B-A3B)** 长期记忆写入模型及[技术报告](https://arxiv.org/abs/2610.22196)！
* *<mark>[new]</mark>* 🔥🔥 **[2026-09]**: 📊 **基准与方法发布** 推出长周期与交错式编程记忆评测基准 **[CMB: A Coding Memory Benchmark for Long-Horizon and Interleaved Coding Agents](docs/papers/CMB_A_Coding_Memory_Benchmark_for_Long_Horizon_and_Interleaved_Coding_Agents.pdf)**（已投稿 **ICLR 2027**）。
* *<mark>[new]</mark>* 🔥🔥 **[2026-08]**: 🎉 **论文录用** 双系统认知记忆架构论文 **[Memory Beyond Recall: A Dual-Process Cognitive Memory System for Self-Evolving LLM Agents](https://arxiv.org/abs/2606.09483)** 被 **EMNLP 2026** 接收！
* 🔥 **[2026-05]**: 🌟 **初代发布** 正式发布第一代认知记忆框架 **[Hy Memory 1.0](https://mp.weixin.qq.com/s/dH5PGpxqArFZkSq3-QxWYA)**，推出面向自演化 LLM Agent 的双系统长期记忆架构。

---

## 论文

欢迎了解 **Hy Memory 记忆研究体系**，涵盖对话认知记忆、长周期编程记忆以及强化学习记忆写入模型：

> [**Memory Beyond Recall: A Dual-Process Cognitive Memory System for Self-Evolving LLM Agents**](https://arxiv.org/abs/2606.09483) *（**EMNLP 2026** 已接收）*  
> **TL;DR:** 提出面向 **Chat** 的双系统（System 1 + System 2）认知记忆架构，将个人长期记忆组织为 8 层认知结构（原始对话、原子事实、会话摘要、心智图式与前瞻意图等），支持冲突消解与跨域图式归纳。  
> 📄 Paper: https://arxiv.org/abs/2606.09483

> [**CMB: A Coding Memory Benchmark for Long-Horizon and Interleaved Coding Agents**](docs/papers/CMB_A_Coding_Memory_Benchmark_for_Long_Horizon_and_Interleaved_Coding_Agents.pdf) *（**ICLR 2027** 已投稿）*  
> **TL;DR:** 提出面向长周期与交错式 **Coding** Agent 的记忆评测基准与“双层记忆 + 代码版本演进链（diff 链）”方法，在保留可复用工程经验的同时完整追踪代码历次修改轨迹。  
> 📄 Paper: [docs/papers/CMB_A_Coding_Memory_Benchmark_for_Long_Horizon_and_Interleaved_Coding_Agents.pdf](docs/papers/CMB_A_Coding_Memory_Benchmark_for_Long_Horizon_and_Interleaved_Coding_Agents.pdf)

> [**Hy-Memory-30B-A3B: Attributed Reinforcement Learning for Long-Term Memory Writing**](https://arxiv.org/abs/2610.22196) *（开源模型技术报告）*  
> **TL;DR:** 提出面向长期记忆写入的归因强化学习（Attributed RL）训练框架，开源专门针对高精度记忆抽取与冲突消解优化的 30B-A3B MoE 模型。  
> 📄 Paper: https://arxiv.org/abs/2610.22196 · Model: https://huggingface.co/tencent/Hy-Memory-30B-A3B

---

## 快速开始

### 1. 安装

```bash
pip install hy-memory==2.0.4              # 核心（含 ChromaDB 与 Kuzu）
pip install "hy-memory[qdrant]==2.0.4"    # + Qdrant
pip install "hy-memory[faiss]==2.0.4"     # + FAISS
pip install "hy-memory[graph]==2.0.4"     # + Neo4j
pip install "hy-memory[mysql]==2.0.4"     # + MySQL 缓存
pip install "hy-memory[rerank]==2.0.4"    # + 本地多语言 cross-encoder rerank
pip install "hy-memory[all]==2.0.4"       # 全部
```

### 2. 配置

只需 LLM 和 Embedding 两组配置，支持任何兼容 OpenAI API 格式的服务：

```bash
export MEMORY_LLM_API_KEY="sk-your-key"
export MEMORY_LLM_BASE_URL="https://api.deepseek.com"
export MEMORY_LLM_MODEL="deepseek-chat"

export MEMORY_EMBEDDER_API_KEY="sk-your-key"
export MEMORY_EMBEDDER_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
export MEMORY_EMBEDDER_MODEL="text-embedding-v3"
export MEMORY_EMBEDDING_DIMS=1024
```

或使用 OpenAI 默认配置（单个 key）：

```bash
export OPENAI_API_KEY="sk-your-key"
```

完整配置见 [环境变量参考](docs/env_reference.md)。

提示词提供 11 种语言（`en`、`zh-Hans`、`zh-Hant`、`ja`、`es`、`de`、`pt`、`fr`、
`ko`、`ru`、`id`）。默认按输入自动在中文与英文之间选择；设置 `MEMORY_LANGUAGE`（或在
`add()` 上传 `language=`）可显式指定，记忆随之用该语言书写。详见
[提示词语言](docs/usage.md#提示词语言language)。

### 3. Chat 记忆

```python
from hy_memory import HyMemoryClient

client = HyMemoryClient(mode="pro")

# 写入：纯文本或 OpenAI messages 格式
client.add("用户喜欢科幻电影，特别是《星际穿越》", user_id="user_1")
client.add([
    {"role": "user", "content": "推荐一部电影"},
    {"role": "assistant", "content": "推荐《星际穿越》，诺兰的经典科幻之作"},
], user_id="user_1")

# 检索：返回 profile / normal / proactive 三路
results = client.search("用户喜欢什么类型的电影？", user_ids=["user_1"], limit=10)
for mem in results["memories"]["normal"]:
    print(f"  [{mem['score']:.2f}] {mem['content']}")

client.close()
```

### 4. Working / Coding 记忆

写入需要包含工具调用轨迹（`tool_calls` 或 `role="tool"` 消息），且仅在 `pro` / `ultra` 模式下生效（`lite` 会忽略 `scene`，一律按原始记忆存取）：

```python
messages = [
    {"role": "user", "content": "Fix the timeout in the search client."},
    {"role": "assistant", "content": "", "tool_calls": [{
        "id": "call_1", "type": "function",
        "function": {"name": "apply_patch", "arguments": '{"path":"src/search.py"}'},
    }]},
    {"role": "tool", "tool_call_id": "call_1", "name": "apply_patch",
     "content": "Patch applied successfully"},
]

client.add(
    messages,
    scene="coding",                              # 或 "working"
    user_id="user_123",
    workspace_id="github.com/example/service",   # 可选：按仓库 / 项目隔离
    branch="fix/search-timeout",                 # 可选：需同时传 workspace_id
)

result = client.search(
    "Which timeout implementation was finally kept?",
    scene="coding",
    user_ids=["user_123"],
    workspace_id="github.com/example/service",
    branch="fix/search-timeout",
    limit=5,
)

result["facts"]          # 事实层
result["experiences"]    # 经验层
result["chain_block"]    # 仅 coding：版本演进上下文（默认空；需 MEMORY_CODING_CHAIN_BLOCK_ENABLED）
```

### 5. 自动路由、来源过滤与进阶 API

- **自动场景路由**：不传 `scene` 时，不含工具调用的写入直接走 `chat`（零 LLM 开销），含工具调用的写入用一次 LLM 在 `chat` / `working` / `coding` 间分类；检索在 `search_mode="default"` 下固定走 `chat`（零 LLM），`search_mode="agentic"` 下自动完成场景分类、query 改写和时间范围解析。详见 [Working/Coding Scene](docs/scene_coding_usage.md)。
- **按来源区分记忆**：写入时传入 `source="openclaw" | "cursor" | "codex"`，检索时通过 `include_sources` / `exclude_sources` 过滤，实现与 `agent_id` 正交的宿主应用隔离。
- **常用管理与演进 API**：`client.get(id)`、`client.update(id, text)`、`client.delete(id)`、`client.list_memories(user_id=...)`，以及在 `ultra` 模式下显式触发 System 2 认知加工的 `client.evolve(user_id=...)`。
- **Per-call Embedding 端点覆盖**：支持在 `add()` / `search()` 中传 `embed_override={"base_url": ..., "api_key": ...}`，或使用并发安全的 `with embed_endpoint_override(...):` 上下文管理器。

服务商配置、存储后端、场景与完整 API 见 [使用指南](docs/usage.md)。

---

## 架构设计

<div align="center">
  <img src="docs/images/architecture.svg" alt="Hy Memory 架构" width="95%">
</div>

Hy Memory 按任务类型提供三种记忆场景（`scene`）。`add()` / `search()` 先经过 scene 路由，再进入 Chat 或 Working / Coding 链路（图中橙色部分为 Coding 独有，去掉后即为 Working）：

| `scene` | 面向的任务 | 记忆形态 |
|---|---|---|
| `chat` | 闲聊、个人信息、偏好、一般问答 | 记忆分层（L0–L7） |
| `working` | 文档、表格、研究、财经分析、内容创作、电脑操作等生产力任务 | 双层记忆：会话事实 + 可复用经验 |
| `coding` | 编码、调试、测试、构建、API/SDK、脚本、SQL 等软件工程任务 | 与 working 相同的双层记忆，外加代码版本演进链（diff 链） |

### 1. Chat：记忆分层

面向个人长期记忆。原始对话逐层抽象成事实、摘要、画像和更高层的认知结构：

| 层 | 名称 | 内容 |
|---|---|---|
| L0 | `BASIC_INFO` | 基础信息 |
| L1 | `RAW` | 原始对话（append-only） |
| L2 | `FACT` | 原子事实（版本化，不可变记录） |
| L3 | `SUMMARY` | 会话摘要 |
| L4 | `IDENTITY` | 保留 |
| L5 | `KNOWLEDGE` | 保留 |
| L6 | `SCHEMA` | 心智模型（抽象叙事模板，图层） |
| L7 | `INTENTION` | 前瞻意图（带有效期，过期后转为普通事实） |

**处理模式**

| 模式 | 功能 | 图数据库 | 适用场景 |
|------|------|---------|---------|
| `lite` | 只对原始记忆做 embedding 写入与检索，不调 LLM；忽略 `scene` 和 `layers` | 否 | 纯向量 RAG，快速写入，零 LLM 开销 |
| `pro` | + LLM 提取 + reconcile 冲突处理 | 可选（`MEMORY_ENABLE_GRAPH`，默认关） | 标准场景 |
| `ultra` | + System 2 图式归纳 + 跨域 sweeper（通过 `evolve()` 触发） | 是（自动开启） | 完整认知架构 |

### 2. Working：双层生产力记忆

面向"做事"的场景。一次带工具调用的会话（trace）会同时产出两层记忆：

| 层 | 记录什么 | 每次会话产出 | 结构 |
|---|---|---|---|
| **事实层**（`WorkingFact`） | 这次会话做了什么：任务、做法、结果 | 恰好 1 条，不设门槛 | `statement`、`subject`、`files`、`details`（原文留存） |
| **经验层**（`Experience`） | 下次遇到类似任务可以直接复用的做法 | 0–N 条，需通过价值门槛 | `task`、`search_keys`、`solution`、`boundary_envs`、`confidence` |

事实层保证"做过的事一定记得"，经验层负责"学到的东西能复用"。两层互相链接（`fact.derived_experience_ids` ↔ `experience.source_fact_ids`），旧事实被覆盖时以 superseded 状态保留并通过任务进展链（`fact_chain_summary`）回溯演化过程。

### 3. Coding：双层记忆 + 版本演进链

Coding 与 Working **复用同一套双层 pipeline 和数据 schema**，区别有三点：

| | Working | Coding |
|---|---|---|
| **抽取规范** | 生产力任务规范 | 软件工程规范：主语必须是代码或决策，记录精确坐标（文件 / 函数 / 分支）而不是粘贴代码 |
| **存储** | `coding_memory.db` + `*_coding_keys` / `*_working_facts` 向量集合 | `coding_memory_cv.db` + `*_cv` 向量集合，与 working 完全隔离 |
| **版本演进链** | 无 | **有**：记录同一处代码被改了几次、每次改了什么 |

**为什么需要版本演进链**：事实层的抽取刻意不粘贴代码（预算留给更有信息量的坐标），所以被撤掉的那一版代码不会出现在事实里。
而那一版往往不在工作区、也不在 HEAD，事后读不回来。版本演进链零 LLM 地把每一版的真实 diff 存下来，补上摘要必然丢掉的这类信息。

**设计要点**（`hy_memory/coding/chain_store.py`）：

- **装饰器而非检索器**：向量层决定返回哪几条事实；演进链只负责在每条事实下面挂上它所涉及代码的全部改动版本（每版的用户原话 + 真实 diff）。
- **修改来源**：本地 Git diff（设置 `MEMORY_CODING_CHAIN_REPO_ROOT`），或工具轨迹中带 `path` / `old` / `new` 的确定性替换动作。
- **分链粒度与隔离**：一条 thread 对应“某分支、某文件、某函数的某一块”，由 `user_id` 与 `workspace_id` 共同隔离。

---

## 支持

### 存储后端

- 向量库：ChromaDB（默认）、Qdrant、FAISS
- 图库（ultra 模式）：Kuzu（默认）、Neo4j
- Working / Coding 业务存储：SQLite（默认）、PostgreSQL（可选）；[配置说明](docs/business_storage.md)

### 文档

- [使用指南](docs/usage.md) — 完整配置参考、API 详情、部署模式
- [环境变量参考](docs/env_reference.md) — 配置说明与默认值
- [Search 与 Reader 指南](docs/hy_memory_search_skill.md) — Reader 选择、Schema 配额、Rerank 与返回通道
- [Working/Coding Scene](docs/scene_coding_usage.md) — 生产力记忆路由、返回结构与 Coding 链行为
- [Graph 记忆设计](docs/pro_graph_design.md) — 图投影、重排、关系路径与部署限制
- [环境变量模板](.env.example) — 可直接复制的配置模板
- [MemHub 说明文档](memhub/README.md) — 本地优先桌面端与 CLI 产品总览、Runtime 命令与隐私边界
- [Hermes 原生记忆 Provider](plugins/hermes/README.md) — 显式用户与 Agent 隔离，独立 HTTP 服务，自动记录与召回默认关闭。
- [OpenClaw 插件](plugins/openclaw/README.md) — Agent 集成见 `plugins/`（总览：[plugins/README.md](plugins/README.md)）

### License

Hy-Memory 使用 Apache-2.0，详见 [LICENSE](LICENSE)。第三方组件仍受各自许可证与声明约束。


## 第二部分：核心数据模型与代码实现原文

### 源码文件校验值

| 文件 | SHA-256 |
|---|---|
| `hy_memory/models/memory.py` | `6b66e0255fa32da3e14e88b4a67ddf46dbcfcac5dcebae5ac43bd50cfb667a65` |
| `hy_memory/client.py` | `b4a64837d95f253f5e3840736ea97cdafa3b5df510e2f7237928bffc500beb01` |
| `hy_memory/pipelines/writer.py` | `fe9eabbe67e9e50364f86ca8a5777923efc215ef9b09b10e979176904e41d0e6` |
| `hy_memory/pipelines/system2_writer.py` | `2cb4b12a535dc12613a6663ded0a1765ce5a6ef47cec1c1d9e89754310ad0ddd` |
| `hy_memory/agent/reconciler.py` | `85db2ab706735607e1b2985ce218bbc6db6818b9791617949961866cf0ac1db1` |
| `hy_memory/coding/types.py` | `6f3469cf037d4190edc1192116f0c6a07c7e9c8138d15009381cd0b0307bc24a` |
| `hy_memory/coding/writer.py` | `017d99796417c200117764b503c36aaa57d71e3c10bac36c39a40604105aa532` |
| `hy_memory/coding/chain_store.py` | `0468515ff471f002754402f903de3ee2f62906de2f70adcdf4ffd4617ec6988d` |
| `hy_memory/data/cache_base.py` | `6883593880bca42b7cfa37309e68b545a4be6c2219070270b0c242990233ee62` |
| `hy_memory/data/cache_sqlite.py` | `4ebbf90e6b48295252a7f5c25fac63914f20d1f8a644a26231d03a2ebdb4cb3c` |

### `hy_memory/models/memory.py`：层、状态、来源、更新与节点契约

```python
"""
Agent Memory V2 - 核心数据模型

包含：
- 枚举类型: MemoryLayer, MemoryStatus, SourceType, UpdateType,
            SchemaStatus, TriggerType, IntentionPriority, MetaCognitionTag, GapType
- 核心模型: MemoryNode (统一基类)
- 子类模型: VersionedFact, SchemaNode, IntentionNode
- 辅助模型: KnowledgeGap, TemporalEvent, UserTimeline, LifeStage
- 输出协议: MemoryContextPackage 及其子结构
- 兼容别名: MemoryEntry, MemoryMetadata, MemoryScore (保留旧接口)
"""

from enum import Enum
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, field
from datetime import datetime
import uuid


# ============================================================
```

### `MemoryLayer`

- **原始文件**：`hy_memory/models/memory.py`
- **原始行号**：L25–L105
- **固定版本链接**：https://github.com/Tencent-Hunyuan/Hy-Memory/blob/d8138b501a755f662a024f7e8eb879613eabf1d3/hy_memory/models/memory.py#L25-L105

以下代码未改写；省略号若存在也是源码自身内容，并非整理时省略。

```python
class MemoryLayer(str, Enum):
    """
    七层记忆模型 (V2 Memory Hierarchy)

    L1 RAW       — 原始对话层 (Append-Only, 向量数据库)
    L2 FACT      — 原子事实层 (版本化不可变记录)
    L3 SUMMARY   — 会话摘要层
    L4 IDENTITY  — 身份画像层 (核心画像)
    L5 KNOWLEDGE — 知识图谱层 (实体/关系/主题, Graph 层, 暂未实现)
    L6 SCHEMA    — 心智模型层 (抽象叙事模板, Graph 层)
    L7 INTENTION — 前瞻意图层 (未来待触发的意图, Graph 层)

    存储分界: L0-L4 在 VDB, L5-L7 在 Graph (ultra 模式)
    """
    L0_BASIC_INFO = "l0_basic_info"
    L1_RAW = "l1_raw"
    L2_FACT = "l2_fact"
    L3_SUMMARY = "l3_summary"
    L4_IDENTITY = "l4_identity"
    L5_KNOWLEDGE = "l5_knowledge"
    L6_SCHEMA = "l6_schema"
    L7_INTENTION = "l7_intention"

    # --- 旧编号兼容别名（已存储数据中的值） ---
    # v2 → v3 重编号兼容
    L6_IDENTITY = "l4_identity"     # 旧 l6_identity → 新 l4_identity
    L4_KNOWLEDGE = "l5_knowledge"   # 旧 l4_knowledge → 新 l5_knowledge
    L5_SCHEMA = "l6_schema"         # 旧 l5_schema → 新 l6_schema
    # v1 → v2 旧兼容（仍需保留）
    L4_5_SCHEMA = "l6_schema"       # 旧 l4_5_schema → 新 l6_schema
    L5_IDENTITY = "l4_identity"     # 旧 l5_identity → 新 l4_identity
    L6_INTENTION = "l7_intention"   # 旧 l6_intention → 新 l7_intention

    # --- V1 兼容别名 ---
    PROFILE = "l4_identity"
    DIALOGUE = "l2_fact"
    SUMMARY = "l3_summary"
    KNOWLEDGE = "l5_knowledge"
    RAW = "l1_raw"

    @classmethod
    def from_string(cls, value: str) -> "MemoryLayer":
        """从字符串创建 MemoryLayer，支持 V1/V2/V3 命名和旧编号"""
        value = value.lower().strip()
        # 旧编号 → 新编号映射（兼容已存储数据的 payload）
        legacy_mapping = {
            # v2 → v3
            "l6_identity": cls.L4_IDENTITY,
            "l4_knowledge": cls.L5_KNOWLEDGE,
            "l5_schema": cls.L6_SCHEMA,
            # v1 → v2 → v3
            "l4_5_schema": cls.L6_SCHEMA,
            "l5_identity": cls.L4_IDENTITY,
            "l6_intention": cls.L7_INTENTION,
        }
        if value in legacy_mapping:
            return legacy_mapping[value]
        # V1 兼容映射
        v1_mapping = {
            "profile": cls.L4_IDENTITY,
            "dialogue": cls.L2_FACT,
            "summary": cls.L3_SUMMARY,
            "knowledge": cls.L5_KNOWLEDGE,
            "raw": cls.L1_RAW,
        }
        if value in v1_mapping:
            return v1_mapping[value]
        for layer in cls:
            if layer.value == value:
                return layer
        raise ValueError(f"Invalid memory layer: {value}")

    @classmethod
    def all_layers(cls) -> List["MemoryLayer"]:
        """返回所有记忆层 (不含别名)"""
        return [
            cls.L0_BASIC_INFO,
            cls.L1_RAW, cls.L2_FACT, cls.L3_SUMMARY,
            cls.L4_IDENTITY, cls.L5_KNOWLEDGE,
            cls.L6_SCHEMA, cls.L7_INTENTION,
        ]
```

### `MemoryStatus`

- **原始文件**：`hy_memory/models/memory.py`
- **原始行号**：L121–L129
- **固定版本链接**：https://github.com/Tencent-Hunyuan/Hy-Memory/blob/d8138b501a755f662a024f7e8eb879613eabf1d3/hy_memory/models/memory.py#L121-L129

以下代码未改写；省略号若存在也是源码自身内容，并非整理时省略。

```python
class MemoryStatus(str, Enum):
    """记忆状态"""
    ACTIVE = "active"               # 当前有效
    SUPERSEDED = "superseded"       # 已被新版本取代（EVOLVE 演化链上的旧节点）
    NEGATED = "negated"             # 已被否定
    CONFLICTED = "conflicted"       # 存在冲突
    SHADOW = "shadow"               # 影子状态：低置信度推断 或 reconcile DELETE 逻辑删除
                                    # 两种场景都不参与召回（is_latest 通常为 False）
    ARCHIVED = "archived"           # 已归档
```

### `SourceType`

- **原始文件**：`hy_memory/models/memory.py`
- **原始行号**：L132–L136
- **固定版本链接**：https://github.com/Tencent-Hunyuan/Hy-Memory/blob/d8138b501a755f662a024f7e8eb879613eabf1d3/hy_memory/models/memory.py#L132-L136

以下代码未改写；省略号若存在也是源码自身内容，并非整理时省略。

```python
class SourceType(str, Enum):
    """信息来源类型"""
    EXPLICIT = "explicit"           # 用户明确陈述
    INFERRED = "inferred"           # 系统推断
    COMPOSITE = "composite"         # 多证据综合
```

### `UpdateType`

- **原始文件**：`hy_memory/models/memory.py`
- **原始行号**：L139–L145
- **固定版本链接**：https://github.com/Tencent-Hunyuan/Hy-Memory/blob/d8138b501a755f662a024f7e8eb879613eabf1d3/hy_memory/models/memory.py#L139-L145

以下代码未改写；省略号若存在也是源码自身内容，并非整理时省略。

```python
class UpdateType(str, Enum):
    """版本化事实的更新类型"""
    OVERRIDE = "override"           # 新值替代旧值
    SUPPLEMENT = "supplement"       # 补充信息
    TEMPORAL = "temporal"           # 时间窗口变化
    NEGATE = "negate"               # 否定旧信息
    CONFLICT = "conflict"           # 新旧冲突
```

### `SchemaStatus`

- **原始文件**：`hy_memory/models/memory.py`
- **原始行号**：L148–L153
- **固定版本链接**：https://github.com/Tencent-Hunyuan/Hy-Memory/blob/d8138b501a755f662a024f7e8eb879613eabf1d3/hy_memory/models/memory.py#L148-L153

以下代码未改写；省略号若存在也是源码自身内容，并非整理时省略。

```python
class SchemaStatus(str, Enum):
    """Schema 状态"""
    FORMING = "forming"             # 形成中 (证据不足)
    STABLE = "stable"               # 稳定 (多证据支撑)
    EVOLVING = "evolving"           # 演化中 (有新证据修改)
    DEPRECATED = "deprecated"       # 已过时
```

### `TriggerType`

- **原始文件**：`hy_memory/models/memory.py`
- **原始行号**：L156–L159
- **固定版本链接**：https://github.com/Tencent-Hunyuan/Hy-Memory/blob/d8138b501a755f662a024f7e8eb879613eabf1d3/hy_memory/models/memory.py#L156-L159

以下代码未改写；省略号若存在也是源码自身内容，并非整理时省略。

```python
class TriggerType(str, Enum):
    """意图触发类型"""
    TIME_BASED = "time_based"       # 时间触发
    EVENT_BASED = "event_based"     # 事件触发
```

### `IntentionPriority`

- **原始文件**：`hy_memory/models/memory.py`
- **原始行号**：L162–L166
- **固定版本链接**：https://github.com/Tencent-Hunyuan/Hy-Memory/blob/d8138b501a755f662a024f7e8eb879613eabf1d3/hy_memory/models/memory.py#L162-L166

以下代码未改写；省略号若存在也是源码自身内容，并非整理时省略。

```python
class IntentionPriority(str, Enum):
    """意图优先级"""
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
```

### `MetaCognitionTag`

- **原始文件**：`hy_memory/models/memory.py`
- **原始行号**：L169–L207
- **固定版本链接**：https://github.com/Tencent-Hunyuan/Hy-Memory/blob/d8138b501a755f662a024f7e8eb879613eabf1d3/hy_memory/models/memory.py#L169-L207

以下代码未改写；省略号若存在也是源码自身内容，并非整理时省略。

```python
class MetaCognitionTag(str, Enum):
    """
    元认知信号标记

    附加在记忆条目上，让调用方 LLM 感知记忆的可靠程度和特殊性质。
    """
    # 置信度相关
    HIGH_CONFIDENCE = "high_confidence"
    LOW_CONFIDENCE = "low_confidence"
    INFERRED_NOT_STATED = "inferred_not_stated"
    STALE = "stale"

    # 冲突与不确定
    NEEDS_CLARIFICATION = "needs_clarification"
    CONFLICTED = "conflicted"
    CONTEXT_DEPENDENT = "context_dependent"

    # 情绪与敏感
    EMOTIONALLY_SENSITIVE = "emotionally_sensitive"
    POSITIVE_MEMORY = "positive_memory"
    NEGATIVE_MEMORY = "negative_memory"
    GOTCHA = "gotcha"

    # 时间特殊性
    RECENTLY_CHANGED = "recently_changed"
    HISTORICAL = "historical"
    TEMPORAL_CONTEXT = "temporal_context"

    # 知识缺口
    KNOWLEDGE_GAP = "knowledge_gap"
    INCOMPLETE = "incomplete"

    # 价值标记
    LONG_TAIL = "long_tail"
    SCHEMA_ACTIVATED = "schema_activated"

    # 前瞻标记
    PROACTIVE_CARE = "proactive_care"
    FOLLOW_UP = "follow_up"
```

### `GapType`

- **原始文件**：`hy_memory/models/memory.py`
- **原始行号**：L210–L215
- **固定版本链接**：https://github.com/Tencent-Hunyuan/Hy-Memory/blob/d8138b501a755f662a024f7e8eb879613eabf1d3/hy_memory/models/memory.py#L210-L215

以下代码未改写；省略号若存在也是源码自身内容，并非整理时省略。

```python
class GapType(str, Enum):
    """知识缺口的四种类型"""
    PROFILE_INCOMPLETE = "profile_incomplete"
    UNRESOLVED_CONFLICT = "unresolved_conflict"
    INFERRED_UNVERIFIED = "inferred_unverified"
    STALE_UNVERIFIED = "stale_unverified"
```

### `MemoryNode`

- **原始文件**：`hy_memory/models/memory.py`
- **原始行号**：L222–L564
- **固定版本链接**：https://github.com/Tencent-Hunyuan/Hy-Memory/blob/d8138b501a755f662a024f7e8eb879613eabf1d3/hy_memory/models/memory.py#L222-L564

以下代码未改写；省略号若存在也是源码自身内容，并非整理时省略。

```python
@dataclass
class MemoryNode:
    """
    所有层级记忆的统一基类 (V2)

    字段分组：
    - 基础标识 (node_id, user_id, layer, content)
    - 业务隔离 (agent_id, session_id)
    - 时空维度 (memory_at, temporal_anchor, valid_from/until, gmt_created/modified)
    - 演化图谱 (supersedes, superseded_by, is_latest) — EVOLVE 语义
    - 推断注解 (speculate) — 不参与 embed
    - Summary 锚点 (source_raw_memory_id) — L3_SUMMARY/L4_IDENTITY 专用
    - 状态 (status)
    - 置信与校准 (confidence, evidence_count, source_type)
    - 情绪标记 (emotional_valence, emotional_arousal)
    - 检索元数据 (access_count, last_accessed_at, embedding)
    - 长尾标记 (specificity_score, rarity_score, longtail_flag)
    - 元认知标记 (meta_tags, meta_hints)
    - 出处追溯 (source_session_id, source_turn_index, evidence_chain)
    - 扩展 (custom, tags)
    """

    # === 基础标识 ===
    node_id: str = ""
    user_id: str = ""
    layer: MemoryLayer = MemoryLayer.L1_RAW
    content: str = ""                        # 核心语义内容，embed 只用此字段

    # === 业务隔离 ===
    agent_id: str = ""
    session_id: str = ""
    # 产生该记忆的调用来源（openclaw / cursor / codex 等）。不要与
    # source_type（显式/推断/复合）或检索通道混用。
    source: str = "default"

    # === 归属（owner）===
    # 该记忆属于谁：'user'（关于用户/用户陈述）| 'agent'（assistant 提供/用户要 agent 做的事）。
    # 仅 L2_FACT / L7_INTENTION 写入；其他层（L0/L1/L3/L5/L6）留空（None）。
    owner: Optional[str] = None

    # === 时空维度 ===
    memory_at: Optional[datetime] = None     # 记忆发生时间（用户指定，可为空）
    temporal_anchor: Optional[str] = None    # 保留字段兼容历史数据；v0.3.45_v0 post8 起不再写入
    valid_from: Optional[datetime] = None
    valid_until: Optional[datetime] = None

    # === 数据管理时间 ===
    gmt_created: Optional[datetime] = None   # 数据写入时间（系统自动）
    gmt_modified: Optional[datetime] = None  # 数据最后修改时间（系统自动）

    # === 演化图谱（EVOLVE 语义）===
    supersedes: Optional[List[str]] = None       # 本节点取代的旧节点 ID 列表，全新信息为 None
    superseded_by: Optional[List[str]] = None    # 被哪些新节点取代（系统写入，不透出给调用方）
    is_latest: bool = True                       # 是否链条末端；被取代时系统自动置 False

    # === 推断注解（不参与 embed）===
    speculate: Optional[str] = None              # LLM 对复杂/模糊信号的推断注解

    # === Summary 锚点（L3_SUMMARY / L4_IDENTITY）===
    source_raw_memory_id: Optional[str] = None   # 对应的 L1_RAW 节点 ID

    # === 状态 ===
    status: MemoryStatus = MemoryStatus.ACTIVE

    # === 置信与校准 ===
    confidence: float = 1.0
    evidence_count: int = 1
    source_type: SourceType = SourceType.EXPLICIT

    # === 情绪标记 ===
    emotional_valence: float = 0.0      # [-1, 1] 情感效价
    emotional_arousal: float = 0.0      # [0, 1] 情感唤醒度

    # === 检索元数据 ===
    access_count: int = 0
    last_accessed_at: Optional[datetime] = None
    embedding: Optional[List[float]] = None

    # === 长尾标记 ===
    specificity_score: float = 0.0      # [0, 1] 具体度
    rarity_score: float = 0.0           # [0, 1] 稀有度
    longtail_flag: bool = False

    # === 元认知标记 ===
    meta_tags: List[MetaCognitionTag] = field(default_factory=list)
    meta_hints: Dict[str, str] = field(default_factory=dict)

    # === Episode（内部会话）===
    # 一件事往往跨越好几次 write（十几二十轮），从中抽出的 memory 属于同一次讨论。
    # 打同一个 episode_id，读侧就能用它**框出一片候选**做加权 —— 比建 O(n²) 时间边
    # 便宜得多，也比"同一天"语义准确。
    #
    # 注意与 session_id 的区别：session_id 是**调用方给的业务隔离键**（进 isolation_key），
    # 可能很长（整段会话）或干脆是 default；episode_id 是 SDK **内部按时间间隔切**的
    # "一次讨论"，粒度更细，且不参与隔离。
    episode_id: str = ""

    # === 出处追溯 ===
    source_session_id: str = ""
    source_turn_index: Optional[int] = None
    evidence_chain: List[str] = field(default_factory=list)

    # === 扩展字段 ===
    custom: Dict[str, Any] = field(default_factory=dict)
    tags: List[str] = field(default_factory=list)
    # 与 tags 等长的 NER label（GPE/PERSON/...）；主题词为空串。写入时标注，读侧 boost 用。
    tag_ners: List[str] = field(default_factory=list)

    def __post_init__(self):
        from ..utils.source_filter import normalize_source
        self.source = normalize_source(self.source)
        if not self.node_id:
            self.node_id = str(uuid.uuid4())
        now = datetime.now()
        # gmt_created/gmt_modified 是系统时间，自动填写
        if self.gmt_created is None:
            self.gmt_created = now
        if self.gmt_modified is None:
            self.gmt_modified = now
        # memory_at 是记忆发生时间，由调用方指定，不自动填写
        # valid_from 用 gmt_created 作为默认（数据有效从写入时开始）
        if self.valid_from is None:
            self.valid_from = now

    @property
    def memory_id(self) -> str:
        """V1 兼容: memory_id == node_id"""
        return self.node_id

    @property
    def uid(self) -> str:
        """V1 兼容: uid == user_id"""
        return self.user_id

    def get_isolation_key(self) -> str:
        """隔离键: {user_id}::{agent_id}::{session_id}

        session_id 为空时使用 'default_session'，与 build_isolation_key 对齐。
        """
        sid = self.session_id or "default_session"
        return f"{self.user_id}::{self.agent_id}::{sid}"

    def get_topic_scope_key(self) -> str:
        """Topic 的隔离键: {user_id}::{agent_id} —— **不含 session_id**。

        为什么 Topic 要比记忆本身更宽：主题是**跨会话累积**的概念。"关于你的健康我知道
        这些"不该按会话切开。而 `get_isolation_key()` 带 session，用它当 Topic 的
        隔离键会让同名 tag 在每个 session 里各建一个互不相识的 Topic 节点。

        如果按 session 隔离，同名 Topic 会分裂成多个节点，导致时序脊建不出边、
        topic summary 反复总结同名碎片、跨会话 tag 召回不连通。
        """
        return f"{self.user_id}::{self.agent_id}"

    @staticmethod
    def build_topic_scope_key(uid: str, agent_id: str) -> str:
        """构建 Topic 隔离键: {uid}::{agent_id}（不含 session，见 get_topic_scope_key）"""
        return f"{uid}::{agent_id}"

    @staticmethod
    def topic_scope_of(isolation_key: str) -> str:
        """把带 session 的 isolation_key 削成 Topic 作用域（取前两段）。

        供只拿到 isolation_key 的读侧使用 —— 建 Topic 与查 Topic 必须用同一个键，
        否则查不到（两个后端都是 `isolation_key` 精确匹配）。
        """
        if not isolation_key:
            return isolation_key
        parts = isolation_key.split("::")
        return "::".join(parts[:2]) if len(parts) >= 2 else isolation_key

    @staticmethod
    def build_isolation_key(uid: str, agent_id: str, session_id: str = "default_session") -> str:
        """构建隔离键: {uid}::{agent_id}::{session_id}"""
        sid = session_id or "default_session"
        return f"{uid}::{agent_id}::{sid}"

    @staticmethod
    def parse_isolation_key(key: str) -> tuple:
        """
        解析隔离键，返回 (user_id, agent_id, session_id)。

        兼容多种格式:
        - 4 段: (旧格式带 appid) 跳过首段 → uid::agent_id::session_id
        - 3 段: uid::agent_id::session_id (标准格式)
        - 2 段: uid::agent_id (session_id 默认 "default_session")
        """
        parts = key.split("::")
        if len(parts) >= 4:
            # 兼容旧格式: 跳过 appid
            return parts[1], parts[2], parts[3]
        elif len(parts) == 3:
            return parts[0], parts[1], parts[2]
        elif len(parts) == 2:
            return parts[0], parts[1], "default_session"
        return "", "", ""

    def to_dict(self) -> Dict[str, Any]:
        """序列化为字典"""
        return {
            "node_id": self.node_id,
            "user_id": self.user_id,
            "agent_id": self.agent_id,
            "session_id": self.session_id,
            "source": self.source,
            "episode_id": self.episode_id,
            "owner": self.owner,
            "layer": self.layer.value,
            "content": self.content,
            "memory_at": int(self.memory_at.timestamp()) if self.memory_at else None,
            "temporal_anchor": self.temporal_anchor,
            "gmt_created": int(self.gmt_created.timestamp()) if self.gmt_created else None,
            "gmt_modified": int(self.gmt_modified.timestamp()) if self.gmt_modified else None,
            "valid_from": int(self.valid_from.timestamp()) if self.valid_from else None,
            "valid_until": int(self.valid_until.timestamp()) if self.valid_until else None,
            # 演化图谱
            "supersedes": self.supersedes,
            "superseded_by": self.superseded_by,
            "is_latest": self.is_latest,
            # 推断注解
            "speculate": self.speculate,
            # Summary 锚点
            "source_raw_memory_id": self.source_raw_memory_id,
            # 状态
            "status": self.status.value,
            # 置信与校准
            "confidence": self.confidence,
            "evidence_count": self.evidence_count,
            "source_type": self.source_type.value,
            # 情绪
            "emotional_valence": self.emotional_valence,
            "emotional_arousal": self.emotional_arousal,
            # 检索元数据
            "access_count": self.access_count,
            "last_accessed_at": int(self.last_accessed_at.timestamp()) if self.last_accessed_at else None,
            # 长尾标记
            "specificity_score": self.specificity_score,
            "rarity_score": self.rarity_score,
            "longtail_flag": self.longtail_flag,
            # 元认知
            "meta_tags": [t.value for t in self.meta_tags],
            "meta_hints": self.meta_hints,
            # 出处追溯
            "source_session_id": self.source_session_id,
            "source_turn_index": self.source_turn_index,
            "evidence_chain": self.evidence_chain,
            # 扩展
            "custom": self.custom,
            "tags": self.tags,
            "tag_ners": list(getattr(self, "tag_ners", None) or []),
            # 向量（可选，clone / 序列化场景需要携带）
            "embedding": self.embedding,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "MemoryNode":
        """从字典反序列化（兼容旧 payload 中的废弃字段，忽略即可）"""
        def parse_dt(v):
            if v is None:
                return None
            if isinstance(v, datetime):
                return v
            if isinstance(v, (int, float)):
                return datetime.fromtimestamp(v)
            if isinstance(v, str):
                return datetime.fromisoformat(v)
            return None

        def parse_enum(enum_cls, v, default):
            if v is None:
                return default
            if isinstance(v, enum_cls):
                return v
            try:
                return enum_cls(v)
            except (ValueError, KeyError):
                return default

        meta_tags_raw = data.get("meta_tags", [])
        meta_tags = []
        for t in meta_tags_raw:
            if isinstance(t, MetaCognitionTag):
                meta_tags.append(t)
            else:
                try:
                    meta_tags.append(MetaCognitionTag(t))
                except (ValueError, KeyError):
                    pass

        return cls(
            node_id=data.get("node_id", data.get("memory_id", "")),
            user_id=data.get("user_id", data.get("uid", "")),
            agent_id=data.get("agent_id", ""),
            session_id=data.get("session_id", ""),
            source=data.get("source", "default") or "default",
            episode_id=data.get("episode_id", "") or "",
            owner=data.get("owner") or None,
            layer=parse_enum(MemoryLayer, data.get("layer"), MemoryLayer.L1_RAW),
            content=data.get("content", ""),
            # memory_at: 优先读 memory_at，兼容旧 key created_at
            memory_at=parse_dt(data.get("memory_at") or data.get("created_at")),
            temporal_anchor=data.get("temporal_anchor"),
            gmt_created=parse_dt(data.get("gmt_created")),
            gmt_modified=parse_dt(data.get("gmt_modified")),
            valid_from=parse_dt(data.get("valid_from")),
            valid_until=parse_dt(data.get("valid_until")),
            # 演化图谱
            supersedes=data.get("supersedes"),
            superseded_by=data.get("superseded_by"),
            is_latest=data.get("is_latest", True),
            # 推断注解
            speculate=data.get("speculate"),
            # Summary 锚点
            source_raw_memory_id=data.get("source_raw_memory_id"),
            # 状态
            status=parse_enum(MemoryStatus, data.get("status"), MemoryStatus.ACTIVE),
            # 置信
            confidence=data.get("confidence", 1.0),
            evidence_count=data.get("evidence_count", 1),
            source_type=parse_enum(SourceType, data.get("source_type"), SourceType.EXPLICIT),
            # 情绪
            emotional_valence=data.get("emotional_valence", 0.0),
            emotional_arousal=data.get("emotional_arousal", 0.0),
            # 检索元数据
            access_count=data.get("access_count", 0),
            last_accessed_at=parse_dt(data.get("last_accessed_at")),
            embedding=data.get("embedding"),
            # 长尾
            specificity_score=data.get("specificity_score", 0.0),
            rarity_score=data.get("rarity_score", 0.0),
            longtail_flag=data.get("longtail_flag", False),
            # 元认知
            meta_tags=meta_tags,
            meta_hints=data.get("meta_hints", {}),
            # 出处
            source_session_id=data.get("source_session_id", ""),
            source_turn_index=data.get("source_turn_index"),
            evidence_chain=data.get("evidence_chain", []),
            # 扩展
            custom=data.get("custom", {}),
            tags=data.get("tags", []) or [],
            tag_ners=list(data.get("tag_ners") or []),
        )
```

### `VersionedFact`

- **原始文件**：`hy_memory/models/memory.py`
- **原始行号**：L571–L599
- **固定版本链接**：https://github.com/Tencent-Hunyuan/Hy-Memory/blob/d8138b501a755f662a024f7e8eb879613eabf1d3/hy_memory/models/memory.py#L571-L599

以下代码未改写；省略号若存在也是源码自身内容，并非整理时省略。

```python
@dataclass
class VersionedFact(MemoryNode):
    """
    L2 层的原子事实 — 版本化不可变记录

    V2 §3.2: 不直接修改事实内容，而是通过 status 变迁 + SUPERSEDED_BY 边来追踪变更。
    """
    update_type: Optional[UpdateType] = None

    def __post_init__(self):
        super().__post_init__()
        if self.layer == MemoryLayer.L1_RAW:
            self.layer = MemoryLayer.L2_FACT

    def to_dict(self) -> Dict[str, Any]:
        d = super().to_dict()
        d["update_type"] = self.update_type.value if self.update_type else None
        return d

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "VersionedFact":
        base = MemoryNode.from_dict(data)
        update_type = None
        if data.get("update_type"):
            try:
                update_type = UpdateType(data["update_type"])
            except (ValueError, KeyError):
                pass
        return cls(**{**base.__dict__, "update_type": update_type})
```

### `SchemaNode`

- **原始文件**：`hy_memory/models/memory.py`
- **原始行号**：L602–L662
- **固定版本链接**：https://github.com/Tencent-Hunyuan/Hy-Memory/blob/d8138b501a755f662a024f7e8eb879613eabf1d3/hy_memory/models/memory.py#L602-L662

以下代码未改写；省略号若存在也是源码自身内容，并非整理时省略。

```python
@dataclass
class SchemaNode(MemoryNode):
    """
    L6 层: 心智模型 — 从多个关联事实中自动归纳的抽象叙事模板 (Graph 层)

    V3 §2.2
    """
    central_proposition: str = ""
    supporting_evidence: List[str] = field(default_factory=list)
    expected_inferences: List[str] = field(default_factory=list)
    activation_threshold: float = 0.7
    activation_count: int = 0
    last_activated_at: Optional[datetime] = None
    schema_status: SchemaStatus = SchemaStatus.FORMING

    def __post_init__(self):
        super().__post_init__()
        self.layer = MemoryLayer.L6_SCHEMA

    def to_dict(self) -> Dict[str, Any]:
        d = super().to_dict()
        d.update({
            "central_proposition": self.central_proposition,
            "supporting_evidence": self.supporting_evidence,
            "expected_inferences": self.expected_inferences,
            "activation_threshold": self.activation_threshold,
            "activation_count": self.activation_count,
            "last_activated_at": int(self.last_activated_at.timestamp()) if self.last_activated_at else None,
            "schema_status": self.schema_status.value,
        })
        return d

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "SchemaNode":
        base = MemoryNode.from_dict(data)
        def parse_dt(v):
            if v is None:
                return None
            if isinstance(v, datetime):
                return v
            if isinstance(v, (int, float)):
                return datetime.fromtimestamp(v)
            if isinstance(v, str):
                return datetime.fromisoformat(v)
            return None
        schema_status = SchemaStatus.FORMING
        if data.get("schema_status"):
            try:
                schema_status = SchemaStatus(data["schema_status"])
            except (ValueError, KeyError):
                pass
        return cls(
            **{**base.__dict__,
               "central_proposition": data.get("central_proposition", ""),
               "supporting_evidence": data.get("supporting_evidence", []),
               "expected_inferences": data.get("expected_inferences", []),
               "activation_threshold": data.get("activation_threshold", 0.7),
               "activation_count": data.get("activation_count", 0),
               "last_activated_at": parse_dt(data.get("last_activated_at")),
               "schema_status": schema_status,
               })
```

### `IntentionNode`

- **原始文件**：`hy_memory/models/memory.py`
- **原始行号**：L665–L746
- **固定版本链接**：https://github.com/Tencent-Hunyuan/Hy-Memory/blob/d8138b501a755f662a024f7e8eb879613eabf1d3/hy_memory/models/memory.py#L665-L746

以下代码未改写；省略号若存在也是源码自身内容，并非整理时省略。

```python
@dataclass
class IntentionNode(MemoryNode):
    """
    L7 层: 前瞻性记忆 — 记住"将来要做什么" (Graph 层)

    V3 §2.2
    """
    trigger_type: TriggerType = TriggerType.EVENT_BASED
    trigger_condition: str = ""

    # 时间触发
    trigger_time: Optional[datetime] = None

    # 事件触发
    trigger_event_pattern: Optional[str] = None
    trigger_event_embedding: Optional[List[float]] = None

    # 意图内容
    intention_content: str = ""
    priority: IntentionPriority = IntentionPriority.MEDIUM
    expiry: Optional[datetime] = None
    triggered: bool = False
    triggered_at: Optional[datetime] = None

    def __post_init__(self):
        super().__post_init__()
        self.layer = MemoryLayer.L7_INTENTION

    def to_dict(self) -> Dict[str, Any]:
        d = super().to_dict()
        d.update({
            "trigger_type": self.trigger_type.value,
            "trigger_condition": self.trigger_condition,
            "trigger_time": int(self.trigger_time.timestamp()) if self.trigger_time else None,
            "trigger_event_pattern": self.trigger_event_pattern,
            "trigger_event_embedding": self.trigger_event_embedding,
            "intention_content": self.intention_content,
            "priority": self.priority.value,
            "expiry": int(self.expiry.timestamp()) if self.expiry else None,
            "triggered": self.triggered,
            "triggered_at": int(self.triggered_at.timestamp()) if self.triggered_at else None,
        })
        return d

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "IntentionNode":
        base = MemoryNode.from_dict(data)
        def parse_dt(v):
            if v is None:
                return None
            if isinstance(v, datetime):
                return v
            if isinstance(v, (int, float)):
                return datetime.fromtimestamp(v)
            if isinstance(v, str):
                return datetime.fromisoformat(v)
            return None
        trigger_type = TriggerType.EVENT_BASED
        if data.get("trigger_type"):
            try:
                trigger_type = TriggerType(data["trigger_type"])
            except (ValueError, KeyError):
                pass
        priority = IntentionPriority.MEDIUM
        if data.get("priority"):
            try:
                priority = IntentionPriority(data["priority"])
            except (ValueError, KeyError):
                pass
        return cls(
            **{**base.__dict__,
               "trigger_type": trigger_type,
               "trigger_condition": data.get("trigger_condition", ""),
               "trigger_time": parse_dt(data.get("trigger_time")),
               "trigger_event_pattern": data.get("trigger_event_pattern"),
               "trigger_event_embedding": data.get("trigger_event_embedding"),
               "intention_content": data.get("intention_content", ""),
               "priority": priority,
               "expiry": parse_dt(data.get("expiry")),
               "triggered": data.get("triggered", False),
               "triggered_at": parse_dt(data.get("triggered_at")),
               })
```

### `hy_memory/client.py`：公开写入、检索、演化与持久化幂等

以下顺序先保留公开 API，再保留写入 outcome 的内部实现。特别注意：`request_id` 绑定 `user_id + agent_id + session_id + operation`；已有终态结果会带 `replayed=True` 返回，非终态或未知结果不能被当作成功。

### `HyMemoryClient.add`

- **原始文件**：`hy_memory/client.py`
- **原始行号**：L1729–L1821
- **固定版本链接**：https://github.com/Tencent-Hunyuan/Hy-Memory/blob/d8138b501a755f662a024f7e8eb879613eabf1d3/hy_memory/client.py#L1729-L1821

以下代码未改写；省略号若存在也是源码自身内容，并非整理时省略。

```python
    def add(
        self,
        data: AddInput,
        *,
        user_id: str = "",
        agent_id: str = "default_agent",
        session_id: str = "default_session",
        source: str = "default",
        metadata: Optional[Dict[str, Any]] = None,
        memory_at: Optional[datetime] = None,
        scene: Optional[str] = None,
        workspace_id: Optional[str] = None,
        branch: Optional[str] = None,
        request_id: Optional[str] = None,
        meta: Optional[Dict[str, Any]] = None,
        embed_override: Optional[Dict[str, Any]] = None,
        language: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        写入记忆。

        处理深度由 Client 初始化时的 mode 决定：
        - lite:  纯 embedding 写入
        - pro:   embedding + LLM agent 提取（事实/实体/reconcile）
        - ultra: pro + 可通过 evolve() 显式触发的 System 2 认知加工

        Args:
            data: 文本字符串，或 messages 列表
                  - "用户喜欢科幻电影"
                  - [{"role": "user", "content": "..."}, ...]
            user_id:      用户 ID（一级隔离 key）
            agent_id:     Agent ID（二级隔离 key）
            session_id:   Session ID（三级隔离 key）
            source:       调用来源，例如 openclaw / cursor / codex；与 agent_id 正交。
                          写入前执行 strip().lower()，默认 "default"。
            metadata:     旧版 SDK 处理选项，会并入内部 WriteRequest.extra。
                          不保证持久化或随查询返回；调用方需要保存并读回的业务字段
                          请使用 meta。
            memory_at:    记忆时间戳（不传则用当前时间），用于导入历史记忆
            scene:        显式指定写入路由，跳过 LLM 自动判定。
                          - None（默认）：含 tool 时 LLM 判 chat/working/coding；
                            无 tool 时直接走 chat
                          - "chat"：强制走 chat 链路（tool 消息会被 strip）
                          - "working"：强制走 coding 链路（通用生产力场景）
                          - "coding"：强制走 coding 链路（软件工程场景）
                          注意：强制 working / coding 时输入必须含 tool 消息，
                          否则回退 chat 链路。

                          "working" 与 "coding" 复用同一种生产力 pipeline 和表结构，
                          但使用独立 SQLite 文件与向量集合。行为差异为：
                            1. 抽取规范不同。coding 用 EXTRACT_PROMPT_CODING：要求
                               分支名逐字保留、说明哪一版赢了哪一版被弃、给精确的
                               仓相对路径 + 符号名、区分"已验证"与"只是写了"。
                            2. coding 额外维护版本演进链层（零 LLM 的 sqlite），存下
                               每处代码每一版的真实 patch。补的是抽取规范本身砍掉的
                               那类信息 —— 它明文要求"给坐标不要贴代码"，而被撤掉那
                               版的代码不在工作区也不在 HEAD，读不回来。
                          搜索侧要拿到链块必须也传 scene="coding"，见 search()。
            workspace_id: Coding memory 路径专用。repo 标识（建议 git remote URL 规范化）。
                          随经验与事实一起落库，供 search / list 按作用域筛选。chat 路径忽略。
            branch:       Coding memory 路径专用。分支名。同 workspace_id。chat 路径忽略。
            meta:         调用方自定义业务 meta，随本次产出的记忆存储、查询时原样返回。
                          不 embed、不参与召回、不作过滤条件。
                          与 metadata 不同：metadata 是旧版内部处理选项，
                          meta 独立持久化，只做业务透传。
                          语义为「该次 write 时刻的上下文」，故存为 list——同一节点被
                          多次写入合并时会追加而非覆盖，详见 get() 返回的 meta 字段。
            language:     本次请求的 LLM prompt 语言码（en / zh-Hans / zh-Hant / ja / es /
                          de / pt / fr / ko / ru / id；别名 zh、zh-CN → zh-Hans，zh-TW、
                          zh-HK → zh-Hant，pt-BR → pt）。优先于 MemoryConfig.language
                          （env MEMORY_LANGUAGE）；两者都未设时沿用 zh/en 自动检测。
                          显式指定时 extract / reconcile / coding 链路 / 基础画像等本次
                          请求的全部 LLM 调用都用该语言的 prompt，记忆正文也用该语言书写。
                          未知码抛 ValueError（列出支持的码）。

        Returns:
            chat 链路：{"success": True, "memory_id": "...", "request_id": "...", "elapsed_ms": ...}
            coding 链路：{"success": True, "scene": "productivity", "ops": [...],
                        "experience_ids": [...], "fact_ops": [...], "fact_ids": [...], ...}
        """
        return self._loop_thread.run(
            self.async_add(
                data, user_id=user_id, agent_id=agent_id, session_id=session_id,
                source=source,
                metadata=metadata, memory_at=memory_at,
                scene=scene,
                workspace_id=workspace_id, branch=branch,
                request_id=request_id, meta=meta,
                embed_override=embed_override,
                language=language,
            ),
            include_runtime_diag=True,
        )
```

### `HyMemoryClient.search`

- **原始文件**：`hy_memory/client.py`
- **原始行号**：L1847–L2014
- **固定版本链接**：https://github.com/Tencent-Hunyuan/Hy-Memory/blob/d8138b501a755f662a024f7e8eb879613eabf1d3/hy_memory/client.py#L1847-L2014

以下代码未改写；省略号若存在也是源码自身内容，并非整理时省略。

```python
    def search(
        self,
        query: Optional[str] = None,
        *,
        queries: Optional[List[str]] = None,
        scene: Optional[str] = None,
        search_mode: str = "default",
        user_ids: Optional[List[str]] = None,
        agent_ids: Optional[List[str]] = None,
        session_ids: Optional[List[str]] = None,
        include_sources: Optional[List[str]] = None,
        exclude_sources: Optional[List[str]] = None,
        limit: int = 10,
        min_score: float = 0.4,
        working_fact_min_score: Optional[float] = None,
        working_experience_min_score: Optional[float] = None,
        schema_min_score: float = 0.4,
        schema_limit: int = 10,
        intention_limit: int = 0,
        created_after: Optional[float] = None,
        reader: str = "",
        workspace_id: Optional[str] = None,
        branch: Optional[str] = None,
        request_id: Optional[str] = None,
        layers: Optional[List[Any]] = None,
        statuses: Optional[List[Any]] = None,
        embed_override: Optional[Dict[str, Any]] = None,
        query_embedding: Optional[List[float]] = None,
        rerank: bool = True,
    ) -> Dict[str, Any]:
        """
        搜索记忆。

        三路召回（chat 路径）：
        - **Schema 路**: L6_SCHEMA（高层行为/状态 schema）
        - **Proactive 路**: L7_INTENTION（主动意图，默认关闭）
        - **Normal 路**: L2_FACT + L3_SUMMARY + L4_IDENTITY + L5_KNOWLEDGE 等

        用户画像 L0 不再混入 Search；请调用 get_user_profile() 单独获取。

        Coding 路径（自动判定）：
        - 当 queries 上下文判定为 coding 时，走 CodingMemoryStore 的双层召回：
          事实层为主索引，命中的事实顺 derived_experience_ids 带出经验，再用同一
          向量直查经验层兜底。返回结构含 "scene": "productivity" 和 "facts" /
          "experiences" 两个列表。
        - 否则走 chat 路径，返回与历史完全一致。

        Args:
            query:              搜索查询（兼容旧调用；与 queries 二选一）
            queries:            多条 queries（最后一条为 target；前置项用于上下文消解）。
                                default 模式下，Coding 开启时分类并 rewrite；Coding 关闭但
                                Query Rewrite 开启时只 rewrite/time；两者关闭时零 LLM。
            scene:              显式指定检索路由，跳过 LLM 自动判定。与 add() 取值一致：
                                - None（默认）：由 search_mode 决定是否自动判定
                                - "chat"：强制走 chat 召回
                                - "working"：强制走 coding（生产力）召回
                                - "coding"：同上，额外返回版本演进链块
                                  （"chain_block" / "chain_used" 两个字段，见下方 Returns）
                                - "all"：chat / working / coding 三路并发召回后用 RRF
                                  融合成一个列表（见下方 Returns）。chat 路用
                                  limit/min_score 等 chat 参数；working/coding 路用各自的
                                  working_fact_min_score / working_experience_min_score。
                                  融合只看每路**自己的名次**：score = 1/(60 + rank)，
                                  rank 从 1 起、k=60 为常数（RRF 惯用值），所以不同量纲
                                  的分数不会互相压制；同分时按 chat → working → coding
                                  排。融合后截断到 limit。某一路失败或未启用（coding 关、
                                  lite 模式）只是不贡献结果，记进 "errors"，不会让整次
                                  search 失败；没写过的生产力场景直接跳过（不建空库）。
                                  include_sources / exclude_sources 对三路都生效；
                                  created_after / layers 只作用于 chat 路。
                                （旧别名 "normal"/"productivity" 仍兼容）
            search_mode:        搜索执行模式：
                                - "default"（默认）：query="..." 是 light search，直接
                                  chat/normal、零 LLM；显式传 queries=[...] 时由 Coding 与
                                  Query Rewrite 开关共同决定是否分类/改写。
                                - "agentic"：scene=None 时，单 query / 多 queries 都用
                                  一次 LLM 完成三分类、query rewrite 和时间范围解析。
                                显式 scene 始终直接路由，不调用 LLM。
            user_ids:           用户 ID 列表（一级隔离 key，支持跨用户搜索）
            agent_ids:          Agent ID 列表（空列表 = 搜索所有 agent）
            session_ids:        Session ID 列表（空列表 = 搜索所有 session）
            include_sources:    调用来源白名单；空列表 = 不限。
            exclude_sources:    调用来源黑名单；与白名单冲突时黑名单优先。
            limit:              Normal 路的 topk 数量，默认 10。这也是 MMR 判定用的
                                top-k：limit < 20（MMR_MAX_TOP_K，定义在
                                pipelines/_retrieval/diversity.py）时 chat 路自动做 MMR
                                多样性选择（权重仍取 MEMORY_HYBRID_V2_MMR_LAMBDA）；
                                limit >= 20 时跳过 MMR（O(k²·pool) 的 Jaccard 贪心，
                                大 k 下代价高、收益小）。重排池是 limit 的若干倍，但判定
                                只看调用方给的 limit。
            min_score:          **chat 路专用**的最低分数阈值，默认 0.4。working 路不看
                                这个值，两层各有自己的阈值（见下两项）。
            working_fact_min_score:
                                working 路事实层（主索引）的阈值，默认 0.30。刻意低于
                                chat：事实是一句话结论，同样相关度下分数系统性偏低，沿用
                                0.4 会挡掉明确相关的事实，还会连带把顺链带经验那一路掐断。
            working_experience_min_score:
                                working 路经验层的阈值，顺链和直查共用。经验层 embed
                                的是 task + search_keys 这类短片段，相似度基线高于事实
                                层的整句 statement，跟事实共用一个阈值会让经验明显偏松，
                                所以不传则取 working_fact_min_score + 0.10。
            schema_min_score:   Schema 路的最低分数阈值，默认 0.4
            schema_limit:       L6 Schema 路的最大返回数，默认 10
            intention_limit:    Proactive 路的 topk 数量，默认 0（关闭）
            created_after:      Unix timestamp (float)，只返回 gmt_created >= 此值的记忆
            reader:             Reader 类型，动态切换。仅支持 legacy / hybrid。
                                空字符串 = 使用环境变量 HY_MEMORY_READER 或默认 legacy。
            workspace_id:       Coding 路径专用（chat 路径忽略）。作用域筛选条件：不传则
                                不筛（全量语义召回），传了则事实层与经验层都只在该
                                workspace 内召回。过滤在 SQLite 侧做，向量取数按作用域
                                选择率放大，不会因为过滤掉召回。
            branch:             同 workspace_id，但只在 workspace_id 非空时才叠加（与
                                list_memories 一致），单独传不生效。容 NULL：没记录分支
                                的经验/事实照样召回，否则老数据会被整片筛掉。
            request_id:         可选。App 层预生成以对齐 SEARCH_API_ACCEPTED；不传则 SDK 自生成
            layers:             可选。pro/ultra 下只召回指定层级（字符串或
                                MemoryLayer），在召回阶段生效。lite 下忽略该参数并
                                强制只召回 L1_RAW。
            statuses:           仅用于 L1_RAW 定向搜索，可显式包含 active / shadow。
                                非 raw 搜索或 scene="all" 传入时拒绝，避免静默忽略。
            rerank:             默认 True（原行为）。False 时本次调用跳过全部重排阶段：
                                chat 路的本地 cross-encoder 重排（recall.local_rerank_enabled）
                                与记忆关系图重排（graph_rerank / episode 扩展），working/
                                coding 路事实层的 BM25 词面融合重排；结果按召回分排序。
                                按次生效（随请求对象下传），并发 search 互不影响。

        Returns:
            chat 路径：{"request_id": "...", "memories": [...], "elapsed_ms": ...}
            coding 路径：{"request_id": "...", "scene": "productivity",
                         "facts": [...], "experiences": [...], "elapsed_ms": ...}
            scene="coding" 额外带两个字段：
                "chain_block" —— 版本演进链块（多行文本，挂不上时为 ""）。
                                 该放在 facts 之前给模型读。
                "chain_used"  —— 已挂进 chain_block 的 facts 下标列表。
                                 facts **没有**被去重过（不悄悄少给）；需要
                                 "块 + 剩余 fact" 的拼法就按这个列表自行过滤。
            scene="all"：{"request_id", "scene": "all",
                          "memories": [统一条目...],
                          "lanes": {"chat": n, "working": n, "coding": n},  # 各路参与融合的候选数
                          "errors": {lane: "原因"},                          # 失败/未启用的路，全成功时为 {}
                          "elapsed_ms"}
                统一条目在各路原字段之上加/覆盖：
                  "scene"      "chat" | "working" | "coding"
                  "kind"       "chat" | "experience" | "fact"
                  "memory_id"  chat 的 memory_id / experience_id / fact_id
                  "content"    chat 正文；经验为 "task\nsolution"；事实为 statement
                  "score"      RRF 融合分；"lane_score" 为该路原始分；"lane_rank" 为该路名次
                  "source", "created_at", "updated_at"（秒级 epoch，取不到为 None）
                  "memory_at"  对话时间（秒级 epoch），各路原有字段，三路同名同格式
                chat 路内部名次：normal → schema → proactive 依次排；working/coding 路
                内部名次：事实与经验各按原顺序交替（事实在前），两层谁也不压谁。
        """
        return self._search_loop_thread.run(self.async_search(
            query, queries=queries, scene=scene, search_mode=search_mode,
            user_ids=user_ids, agent_ids=agent_ids, session_ids=session_ids,
            include_sources=include_sources, exclude_sources=exclude_sources,
            limit=limit, min_score=min_score,
            working_fact_min_score=working_fact_min_score,
            working_experience_min_score=working_experience_min_score,
            schema_min_score=schema_min_score, schema_limit=schema_limit,
            intention_limit=intention_limit, created_after=created_after,
            reader=reader,
            workspace_id=workspace_id, branch=branch,
            request_id=request_id, layers=layers, statuses=statuses,
            embed_override=embed_override,
            query_embedding=query_embedding,
            rerank=rerank,
        ))
```

### `HyMemoryClient.evolve`

- **原始文件**：`hy_memory/client.py`
- **原始行号**：L2389–L2434
- **固定版本链接**：https://github.com/Tencent-Hunyuan/Hy-Memory/blob/d8138b501a755f662a024f7e8eb879613eabf1d3/hy_memory/client.py#L2389-L2434

以下代码未改写；省略号若存在也是源码自身内容，并非整理时省略。

```python
    def evolve(
        self,
        user_id: str,
        agent_id: str = "default_agent",
        max_batches: Optional[int] = None,
        language: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        手动触发 System 2 认知加工（ultra 模式专用，同步阻塞直到完成）。

        evolve 一次 = 对该 user 的 VDB 全量跑一次 System 2（Schema 归纳 → L6_SCHEMA
        + cross-domain sweeper）。System 2 的输入是 VDB 全量扫描，与「期间 add 了几次」
        无关，因此 evolve 不消费写入队列、跑一次完整认知周期。

        非幂等：每次 evolve 看到的是当前最新 VDB 全量，连续多次 evolve 有意义
        （add 一批 → evolve → 再 add 一批 → 再 evolve）。

        注意：意图（L7_INTENTION）由 System 1 在 add/write 时即时抽取落库（pro/ultra
        模式都有），不在 evolve 里处理。evolve 只负责 System 2 的 Schema 层。

        触发时机由调用方控制：System 2 不在 add/write 里自动触发，也无进程内队列。
        典型用法：批量 add()（只跑 S1）→ 调一次 evolve() 做全量 Schema 归纳。

        仅 ultra 模式可调用。lite/pro 模式调用会抛出 RuntimeError。

        Args:
            user_id:  用户 ID
            agent_id: Agent ID
            language: System 2 / sweeper prompt 语言码，语义同 add()（per-call >
                      MemoryConfig.language > 按 materials 做 zh/en 检测）。

        Returns:
            {"success": True, "request_id": "...", "tasks_processed": 1, "results": {...},
             "cross_domain_sweeper": {...}, "elapsed_ms": ...}
        """
        if self._mode != "ultra":
            raise RuntimeError(
                f"evolve() requires mode='ultra', but this client is mode='{self._mode}'. "
                f"Create a new client with HyMemoryClient(mode='ultra') to use System 2."
            )
        return self._loop_thread.run(
            self.async_evolve(
                user_id=user_id, agent_id=agent_id, max_batches=max_batches,
                language=language,
            )
        )
```

### `HyMemoryClient.async_evolve`

- **原始文件**：`hy_memory/client.py`
- **原始行号**：L2436–L2471
- **固定版本链接**：https://github.com/Tencent-Hunyuan/Hy-Memory/blob/d8138b501a755f662a024f7e8eb879613eabf1d3/hy_memory/client.py#L2436-L2471

以下代码未改写；省略号若存在也是源码自身内容，并非整理时省略。

```python
    @_ensure_internal_loop
    async def async_evolve(
        self,
        user_id: str,
        agent_id: str = "default_agent",
        max_batches: Optional[int] = None,
        language: Optional[str] = None,
    ) -> Dict[str, Any]:
        """手动触发 System 2 认知加工（异步）"""
        language = self._resolve_language(language)
        t0 = __import__("time").perf_counter()

        # 获取 System2Writer
        try:
            writer = await self._registry.get_system2_writer()
        except (ValueError, KeyError):
            return {
                "success": False,
                "error": "System2Writer not available.",
                "tasks_processed": 0,
            }

        # 检查是否支持 evolve
        if not hasattr(writer, "evolve"):
            return {
                "success": False,
                "error": f"Writer '{writer.VERSION}' does not support evolve()",
                "tasks_processed": 0,
            }

        result = await writer.evolve(
            user_id=user_id, agent_id=agent_id, max_batches=max_batches,
            language=language,
        )
        result["elapsed_ms"] = round((__import__("time").perf_counter() - t0) * 1000, 2)
        return result
```

### `HyMemoryClient.get_write_outcome`

- **原始文件**：`hy_memory/client.py`
- **原始行号**：L2629–L2631
- **固定版本链接**：https://github.com/Tencent-Hunyuan/Hy-Memory/blob/d8138b501a755f662a024f7e8eb879613eabf1d3/hy_memory/client.py#L2629-L2631

以下代码未改写；省略号若存在也是源码自身内容，并非整理时省略。

```python
    def get_write_outcome(self, request_id: str) -> Optional[Dict[str, Any]]:
        """Return the exact durable outcome for one idempotent write request."""
        return self._loop_thread.run(self.async_get_write_outcome(request_id))
```

### `HyMemoryClient._claim_write_outcome`

- **原始文件**：`hy_memory/client.py`
- **原始行号**：L2816–L2851
- **固定版本链接**：https://github.com/Tencent-Hunyuan/Hy-Memory/blob/d8138b501a755f662a024f7e8eb879613eabf1d3/hy_memory/client.py#L2816-L2851
- **阅读提示（整理者）**：这是 `request_id` 幂等和 Scope 绑定的关键实现。

以下代码未改写；省略号若存在也是源码自身内容，并非整理时省略。

```python
    async def _claim_write_outcome(
        self,
        *,
        request_id: str,
        user_id: str,
        agent_id: str,
        session_id: str,
        operation: str,
    ) -> Optional[Dict[str, Any]]:
        existing = await self._cache.claim_write_outcome(
            request_id,
            user_id,
            agent_id,
            session_id,
            operation,
        )
        if existing is None:
            return None
        expected = (user_id, agent_id, session_id, operation)
        actual = tuple(
            str(existing.get(key) or "")
            for key in ("user_id", "agent_id", "session_id", "operation")
        )
        if actual != expected:
            raise ValueError("request_id is already bound to another write scope")
        result = existing.get("result")
        if isinstance(result, dict) and existing.get("status") in {"succeeded", "failed"}:
            return {**result, "replayed": True}
        return {
            "success": False,
            "request_id": request_id,
            "outcome_status": str(existing.get("status") or "unknown"),
            "error_code": "write_outcome_not_terminal",
            "error_message": "write outcome is not terminal; query get_write_outcome",
            "replayed": True,
        }
```

### `HyMemoryClient._finish_write_outcome`

- **原始文件**：`hy_memory/client.py`
- **原始行号**：L2853–L2860
- **固定版本链接**：https://github.com/Tencent-Hunyuan/Hy-Memory/blob/d8138b501a755f662a024f7e8eb879613eabf1d3/hy_memory/client.py#L2853-L2860

以下代码未改写；省略号若存在也是源码自身内容，并非整理时省略。

```python
    async def _finish_write_outcome(
        self,
        request_id: str,
        status: str,
        result: Dict[str, Any],
    ) -> None:
        if not await self._cache.finish_write_outcome(request_id, status, result):
            raise RuntimeError("write outcome disappeared before completion")
```

### `HyMemoryClient._mark_write_outcome_unknown`

- **原始文件**：`hy_memory/client.py`
- **原始行号**：L2862–L2872
- **固定版本链接**：https://github.com/Tencent-Hunyuan/Hy-Memory/blob/d8138b501a755f662a024f7e8eb879613eabf1d3/hy_memory/client.py#L2862-L2872

以下代码未改写；省略号若存在也是源码自身内容，并非整理时省略。

```python
    async def _mark_write_outcome_unknown(self, request_id: str) -> None:
        await self._finish_write_outcome(
            request_id,
            "unknown",
            {
                "success": False,
                "request_id": request_id,
                "outcome_status": "unknown",
                "error_code": "write_outcome_unknown",
            },
        )
```

### `HyMemoryClient.async_add`

- **原始文件**：`hy_memory/client.py`
- **原始行号**：L2874–L2943
- **固定版本链接**：https://github.com/Tencent-Hunyuan/Hy-Memory/blob/d8138b501a755f662a024f7e8eb879613eabf1d3/hy_memory/client.py#L2874-L2943
- **阅读提示（整理者）**：终态失败也会持久化；业务层重试策略需区分失败与未知。

以下代码未改写；省略号若存在也是源码自身内容，并非整理时省略。

```python
    @_ensure_internal_loop
    async def async_add(
        self,
        data: AddInput,
        *,
        user_id: str = "",
        agent_id: str = "default_agent",
        session_id: str = "default_session",
        source: str = "default",
        metadata: Optional[Dict[str, Any]] = None,
        memory_at: Optional[datetime] = None,
        scene: Optional[str] = None,
        workspace_id: Optional[str] = None,
        branch: Optional[str] = None,
        request_id: Optional[str] = None,
        meta: Optional[Dict[str, Any]] = None,
        embed_override: Optional[Dict[str, Any]] = None,
        language: Optional[str] = None,
    ) -> Dict[str, Any]:
        """写入记忆（异步）

        embed_override: 本次写入的 embedding 端点覆盖（不改 model/dims，只换接入点）。
            dict，可含 base_url / api_key / extra_headers / timeout；None = 用 client 配置。
            可用于按请求切换任意 OpenAI-compatible embedding endpoint。
        language: 本次请求的 prompt 语言码，详见 add()。
        """
        # 先校验语言码：非法值直接 ValueError，不占用 request_id 的幂等槽位
        language = self._resolve_language(language)
        request_id = request_id or str(uuid.uuid4())
        replay = await self._claim_write_outcome(
            request_id=request_id,
            user_id=user_id,
            agent_id=agent_id,
            session_id=session_id,
            operation="add",
        )
        if replay is not None:
            return replay
        try:
            if embed_override:
                with embed_endpoint_override(
                    base_url=embed_override.get("base_url"),
                    api_key=embed_override.get("api_key"),
                    extra_headers=embed_override.get("extra_headers"),
                    timeout=embed_override.get("timeout"),
                ):
                    result = await self._async_add_impl(
                        data, user_id=user_id, agent_id=agent_id, session_id=session_id,
                        source=source,
                        metadata=metadata, memory_at=memory_at,
                        scene=scene, workspace_id=workspace_id, branch=branch,
                        request_id=request_id, meta=meta, language=language,
                    )
            else:
                result = await self._async_add_impl(
                    data, user_id=user_id, agent_id=agent_id, session_id=session_id,
                    source=source,
                    metadata=metadata, memory_at=memory_at,
                    scene=scene, workspace_id=workspace_id, branch=branch,
                    request_id=request_id, meta=meta, language=language,
                )
        except BaseException:
            await self._mark_write_outcome_unknown(request_id)
            raise
        await self._finish_write_outcome(
            request_id,
            "succeeded" if result.get("success") is True else "failed",
            result,
        )
        return result
```

### `HyMemoryClient.add_extracted`

- **原始文件**：`hy_memory/client.py`
- **原始行号**：L3280–L3321
- **固定版本链接**：https://github.com/Tencent-Hunyuan/Hy-Memory/blob/d8138b501a755f662a024f7e8eb879613eabf1d3/hy_memory/client.py#L3280-L3321
- **阅读提示（整理者）**：公开签名没有 `meta`；`metadata` 的语义见原始 usage 文档。

以下代码未改写；省略号若存在也是源码自身内容，并非整理时省略。

```python
    def add_extracted(
        self,
        contents: Union[str, List[str]],
        *,
        user_id: str = "",
        agent_id: str = "default_agent",
        session_id: str = "default_session",
        source: str = "default",
        metadata: Optional[Dict[str, Any]] = None,
        memory_at: Optional[datetime] = None,
        request_id: Optional[str] = None,
        language: Optional[str] = None,
    ) -> Dict[str, Any]:
        """写入「调用方已抽取好的」记忆：跳过 extract，直接进 reconcile。

        适用场景：调用方（如 openclaw memory_add tool、上游 agent）已经把对话
        抽象成结论性的 memory content，不需要 SDK 再跑一遍 LLM extract。SDK 仍会
        执行完整 reconcile（与已有记忆判重 / 合并 / 矛盾演化），并落 L2_FACT。

        与 add() 的区别：
        - 不调 LLM extractor（省一次 LLM 调用、更快、更省 token）。
        - 不写 L1_RAW 原始节点（content 本身即事实）。
        - contents 每条视为一条独立事实，多条会一起进 reconcile 互相判重。

        Args:
            contents: 单条事实字符串，或多条事实字符串列表。
            language: reconcile prompt 的语言码，语义同 add()。
            其余参数语义同 add()。

        Returns:
            {"success", "memory_id", "memory_ids", "request_id", "elapsed_ms",
             "ops_summary", ...}
        """
        return self._loop_thread.run(
            self.async_add_extracted(
                contents, user_id=user_id, agent_id=agent_id,
                session_id=session_id, source=source, metadata=metadata,
                memory_at=memory_at, request_id=request_id,
                language=language,
            ),
            include_runtime_diag=True,
        )
```

### `HyMemoryClient.async_add_extracted`

- **原始文件**：`hy_memory/client.py`
- **原始行号**：L3323–L3369
- **固定版本链接**：https://github.com/Tencent-Hunyuan/Hy-Memory/blob/d8138b501a755f662a024f7e8eb879613eabf1d3/hy_memory/client.py#L3323-L3369

以下代码未改写；省略号若存在也是源码自身内容，并非整理时省略。

```python
    @_ensure_internal_loop
    async def async_add_extracted(
        self,
        contents: Union[str, List[str]],
        *,
        user_id: str = "",
        agent_id: str = "default_agent",
        session_id: str = "default_session",
        source: str = "default",
        metadata: Optional[Dict[str, Any]] = None,
        memory_at: Optional[datetime] = None,
        request_id: Optional[str] = None,
        language: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Idempotent async wrapper for extracted-memory writes."""
        language = self._resolve_language(language)
        request_id = request_id or str(uuid.uuid4())
        replay = await self._claim_write_outcome(
            request_id=request_id,
            user_id=user_id,
            agent_id=agent_id,
            session_id=session_id,
            operation="add_extracted",
        )
        if replay is not None:
            return replay
        try:
            result = await self._async_add_extracted_impl(
                contents,
                user_id=user_id,
                agent_id=agent_id,
                session_id=session_id,
                source=source,
                metadata=metadata,
                memory_at=memory_at,
                request_id=request_id,
                language=language,
            )
        except BaseException:
            await self._mark_write_outcome_unknown(request_id)
            raise
        await self._finish_write_outcome(
            request_id,
            "succeeded" if result.get("success") is True else "failed",
            result,
        )
        return result
```

### `HyMemoryClient._async_add_extracted_impl`

- **原始文件**：`hy_memory/client.py`
- **原始行号**：L3371–L3460
- **固定版本链接**：https://github.com/Tencent-Hunyuan/Hy-Memory/blob/d8138b501a755f662a024f7e8eb879613eabf1d3/hy_memory/client.py#L3371-L3460
- **阅读提示（整理者）**：展示跳过 Extractor、调用 `write_extracted` 和返回字段的原始实现。

以下代码未改写；省略号若存在也是源码自身内容，并非整理时省略。

```python
    async def _async_add_extracted_impl(
        self,
        contents: Union[str, List[str]],
        *,
        user_id: str = "",
        agent_id: str = "default_agent",
        session_id: str = "default_session",
        source: str = "default",
        metadata: Optional[Dict[str, Any]] = None,
        memory_at: Optional[datetime] = None,
        request_id: Optional[str] = None,
        language: Optional[str] = None,
    ) -> Dict[str, Any]:
        """写入已抽取好的记忆（异步）；跳过 extract，直接 reconcile。详见 add_extracted()。"""
        request_id = request_id or str(uuid.uuid4())
        set_request_id(request_id)
        t0 = time.perf_counter()
        from .utils.source_filter import normalize_source
        source = normalize_source(source)

        if isinstance(contents, str):
            content_list = [contents]
        else:
            content_list = list(contents or [])
        content_list = [c.strip() for c in content_list if isinstance(c, str) and c.strip()]

        if not content_list:
            return {
                "success": False,
                "request_id": request_id,
                "error_code": 400,
                "error_message": "contents is required (str or non-empty List[str])",
            }

        from .utils.token_count import count_input_tokens
        input_tokens = sum(count_input_tokens(c, None) for c in content_list)

        extra = dict(metadata) if metadata else {}
        extra["extracted_contents"] = content_list
        extra["agent_mode"] = "extracted"
        extra["mode"] = self._mode

        write_req = WriteRequest(
            content=content_list[0],
            user_id=user_id,
            agent_id=agent_id,
            source=source,
            session_id=session_id,
            content_type="text",
            extra=extra,
            memory_at=memory_at,
            request_id=request_id,
            language=language,
        )

        # lite/pro → MemoryWriter；ultra → System2Writer（内部复用 MemoryWriter）
        if self._mode == "ultra":
            writer = await self._registry.get_system2_writer()
        else:
            writer = await self._registry.get_writer()
        result: WriteResponse = await writer.write_extracted(write_req)

        resp = {
            "success": result.success,
            "scene": "chat",
            "memory_id": result.memory_id,
            "request_id": request_id,
            "elapsed_ms": round((time.perf_counter() - t0) * 1000, 2),
            "error_code": result.error_code if result.error_code else None,
            "error_message": result.error_message or None,
        }
        if result.extra.get("reconcile_ops"):
            resp["ops_summary"] = result.extra["reconcile_ops"]
        if result.extra.get("agent_stored_ids"):
            resp["memory_ids"] = result.extra["agent_stored_ids"]
        _attach_write_diagnostics(resp, result.extra)
        resp["input_tokens"] = input_tokens
        resp["reconcile_tokens"] = result.extra.get(
            "reconcile_tokens", {"prompt": 0, "completion": 0, "total": 0}
        )

        if result.success:
            logger.info(
                f"[add_extracted] done: {len(result.extra.get('agent_stored_ids', []))} "
                f"nodes from {len(content_list)} contents, elapsed={resp['elapsed_ms']:.0f}ms"
            )
        else:
            logger.warning(f"[add_extracted] failed: {result.error_message}")

        return resp
```

### `hy_memory/pipelines/writer.py`：System 1 写入路径

### `MemoryWriter.write`

- **原始文件**：`hy_memory/pipelines/writer.py`
- **原始行号**：L2570–L2975
- **固定版本链接**：https://github.com/Tencent-Hunyuan/Hy-Memory/blob/d8138b501a755f662a024f7e8eb879613eabf1d3/hy_memory/pipelines/writer.py#L2570-L2975

以下代码未改写；省略号若存在也是源码自身内容，并非整理时省略。

```python
    async def write(
        self,
        request: WriteRequest,
        ctx: Optional[PipelineContext] = None,
        tracer: Optional[PipelineTracer] = None,
    ) -> WriteResponse:
        """执行 Lite 写入流程。"""
        start_time = datetime.now()
        response = WriteResponse()

        # request_id 归一化：优先用 client 显式透传的 request.request_id（contextvar-immune），
        # 兜底用 contextvar（保护直接调用 write() 的测试 / 其它 caller）。
        # 此后整条链路落库统一读 request.request_id，不再依赖 contextvar。
        if not request.request_id:
            request.request_id = get_request_id()

        if tracer is None:
            tracer = create_tracer(
                operation="write",
                pipeline_version="system1",
                uid=request.user_id,
                agent_id=request.agent_id,
                request_id=request.request_id,
                content_preview=request.content,
            )

        try:
            # 参数校验
            content = request.content
            # raw 在写入时就按统一规则裁好（见 utils/raw_trim.py）：工具输出、长
            # assistant 回复不再原样长期存储；历史拼接直接用存下来的文本，不再二次裁剪。
            # request.messages 保持原样——本次 extractor 输入仍是完整 messages。
            _raw_trimmed = False
            if not content and request.has_messages():
                content = self._flat_trimmed_raw(request)
                request.content = content
                _raw_trimmed = True

            if not content:
                response.error_code = 400
                response.error_message = "content or messages is required"
                return response
            if not request.user_id:
                response.error_code = 400
                response.error_message = "user_id is required"
                return response

            # ── 确保 memory_at 有值：未传则用接收到请求的时间 ──
            if request.memory_at is None:
                request.memory_at = start_time

            total_tokens = 0

            # 1. Layer 分配
            with tracer.span("layer_assign") as s:
                layer_str = request.extra.get("layer", "")
                if layer_str:
                    suggested_layer = layer_str
                    s.set_output({"layer": suggested_layer, "source": "explicit"})
                else:
                    suggested_layer = MemoryLayer.L1_RAW.value
                    s.set_output({"layer": suggested_layer, "source": "default_raw"})

            response.layer = suggested_layer

            # ── Timing: sys1_waiting_ms ──
            # start_time 是进入 write() 的时间，现在开始实际 I/O
            _t_process_start = datetime.now()
            _sys1_waiting_ms = (_t_process_start - start_time).total_seconds() * 1000
            _req_id_perf = request.request_id or get_request_id()
            logger.info(f"TRACE_PERF [{_req_id_perf}] S1_START waiting={_sys1_waiting_ms:.0f}ms user={request.user_id}")

            # Metrics: S1 开始
            from ..metrics import MetricsCollector
            MetricsCollector.get().sys1_start()

            # 2. 向量化 + 持久化（L1_RAW）
            _t_embed = datetime.now()
            with tracer.span("embed") as s:
                embedding, embed_meta = await self.embed_service.embed_queued_with_meta(
                    request.content
                )
                s.set_output({"dims": len(embedding), "content_len": len(request.content)})
            _embed_ms = (datetime.now() - _t_embed).total_seconds() * 1000
            response.extra["embedding"] = embedding
            await self._emit_pipeline_step(
                request,
                step="S1_EMBED",
                parsed={
                    "dims": len(embedding),
                    "content_len": len(request.content),
                    "provider_meta": embed_meta,
                },
                elapsed_ms=_embed_ms,
            )

            # 3. 持久化到向量库（L1_RAW）
            _t_l1 = datetime.now()
            memory_id = ""
            _l1_error: Optional[str] = None
            vector_store = None
            mem_node = None
            with tracer.span("qdrant_upsert") as s:
                try:
                    vector_store = await self._get_vector_store()
                    layer_enum = MemoryLayer.from_string(suggested_layer)
                    _raw_custom: Dict[str, Any] = {}
                    if _raw_trimmed:
                        from ..utils.raw_trim import RAW_TRIMMED_KEY
                        _raw_custom[RAW_TRIMMED_KEY] = True
                    self._attach_client_meta(_raw_custom, request)
                    mem_node = MemoryNode(
                        user_id=request.user_id,
                        agent_id=request.agent_id or "default_agent",
                        session_id=request.session_id or "default_session",
                        source=request.source,
                        layer=layer_enum,
                        content=request.content,
                        source_type=SourceType.EXPLICIT,
                        status=MemoryStatus.ACTIVE,
                        is_latest=True,
                        embedding=embedding,
                        memory_at=request.memory_at,
                        custom=_raw_custom,
                    )
                    memory_id = await vector_store.upsert(mem_node)
                    response.memory_id = memory_id
                    s.set_output({"memory_id": memory_id, "layer": suggested_layer})
                    logger.debug(f"[write] persisted: id={memory_id} layer={suggested_layer}")
                except Exception as persist_err:
                    _l1_error = str(persist_err)
                    s.set_error(_l1_error)
                    logger.error(f"V1 Write: Persist failed (non-fatal): {persist_err}", exc_info=True)
            _l1_ms = (datetime.now() - _t_l1).total_seconds() * 1000
            # 后端是否启用了 sparse 全文索引。
            _sparse_enabled = bool(getattr(vector_store, "supports_fulltext", False))
            await self._emit_pipeline_step(
                request,
                step="S1_L1_UPSERT",
                parsed={
                    "memory_id": memory_id or None,
                    "layer": suggested_layer,
                    "content": (mem_node.content if mem_node else request.content),
                    "tags": list(mem_node.tags) if (mem_node and mem_node.tags) else [],
                    "sparse_enabled": _sparse_enabled,
                    "error": _l1_error,
                },
                elapsed_ms=_l1_ms,
                memory_ids=[memory_id] if memory_id else None,
            )

            # ── Timing: sys1_l1_process_ms ──
            _sys1_l1_process_ms = (datetime.now() - _t_process_start).total_seconds() * 1000
            logger.info(f"TRACE_PERF [{_req_id_perf}] S1_L1_DONE l1_ms={_sys1_l1_process_ms:.0f}ms")

            # 4. MemAgent 处理（可选）
            agent_mode = request.extra.get("agent_mode", "disabled")
            response.extra["agent_mode"] = agent_mode

            _t_workflow = datetime.now()
            if (agent_mode == "full" and vector_store is not None
                    and mem_node is not None and memory_id):
                # ── 获取历史上下文（最近 k 轮对话，供 extractor 使用；k 由 config 配置）──
                _history_context = ""
                _recent_history_ms = 0.0
                _recent_history_count = 0
                try:
                    _hist_turns = getattr(self.config.extractor, "history_turns", 5) or 5
                    _t_recent_history = datetime.now()
                    _history_context = await self._get_recent_history(
                        vector_store, request.user_id, request.agent_id,
                        exclude_memory_id=memory_id,
                        max_turns=_hist_turns * 2,  # k 轮对话 = k*2 条 message
                        language=request.language,
                    )
                    _recent_history_ms = (_t_recent_history and (datetime.now() - _t_recent_history).total_seconds() * 1000) or 0.0
                    _recent_history_count = len([line for line in (_history_context or "").splitlines() if line.strip()])
                except Exception as _hist_err:
                    logger.warning(f"[write] get_recent_history failed: {_hist_err}")

                with tracer.span("mem_agent") as s:
                    await self._run_agent(
                        request=request,
                        response=response,
                        vector_store=vector_store,
                        mem_node=mem_node,
                        memory_id=memory_id,
                        tracer_span=s,
                        history_context=_history_context,
                        recent_history_ms=_recent_history_ms,
                        recent_history_count=_recent_history_count,
                    )
                    total_tokens += response.extra.get("_agent_tokens", 0)
                if response.extra.get("agent_status") == "failed":
                    await self._emit_pipeline_step(
                        request,
                        step="S1_AGENT_FAILED",
                        parsed={
                            "error_code": response.extra.get("agent_error_code", ""),
                            "error": response.extra.get("agent_error", ""),
                        },
                    )
                    await self._rollback_failed_l1(
                        request=request,
                        response=response,
                        vector_store=vector_store,
                        memory_id=memory_id,
                    )
                    response.tokens_used = total_tokens
                    _failed_workflow_ms = (
                        datetime.now() - _t_workflow
                    ).total_seconds() * 1000
                    response.extra["timing"] = {
                        "sys1_waiting_ms": round(_sys1_waiting_ms, 1),
                        "sys1_l1_process_ms": round(_sys1_l1_process_ms, 1),
                        "sys1_workflow_ms": round(_failed_workflow_ms, 1),
                        "sys1_ops_avg_ms": 0.0,
                    }
                    try:
                        MetricsCollector.get().sys1_end(
                            response.extra["timing"], success=False
                        )
                    except Exception:
                        pass
                    return response
                elif (
                    request.extra.get("finalize_session")
                    and (
                        getattr(self.config.recall, "session_episode_enabled", False)
                        or getattr(self.config.recall, "dynamic_episode_enabled", False)
                        or getattr(self.config.recall, "series_episode_enabled", False)
                    )
                ):
                    try:
                        from ..agent.episode_summary import (
                            finalize_dynamic_episode_capsules,
                            finalize_series_episode_containers,
                            finalize_session_episode,
                        )
                        finalize = (
                            finalize_dynamic_episode_capsules
                            if (
                                getattr(self.config.recall, "dynamic_episode_enabled", False)
                                or getattr(self.config.recall, "series_episode_enabled", False)
                            )
                            else finalize_session_episode
                        )
                        finalize_kwargs = dict(
                            vector_store=vector_store,
                            embed_service=self.embed_service,
                            llm_provider=self.llm_provider,
                            user_id=request.user_id,
                            agent_id=request.agent_id,
                            session_id=request.session_id or "default_session",
                            language=request.language,
                        )
                        if finalize is finalize_dynamic_episode_capsules:
                            finalize_kwargs["summary_concurrency"] = getattr(
                                self.config.recall,
                                "dynamic_episode_summary_concurrency", 3,
                            )
                        async with episode_slot(), workload_scope("derived"):
                            response.extra["session_episode"] = await finalize(
                                **finalize_kwargs
                            )
                        if getattr(self.config.recall, "series_episode_enabled", False):
                            try:
                                await self._await_graph_projection(request)
                                response.extra["series_episode"] = (
                                    await finalize_series_episode_containers(
                                        vector_store=vector_store,
                                        graph_store=self._graph_store,
                                        user_id=request.user_id,
                                        agent_id=request.agent_id,
                                    )
                                )
                            except Exception as series_error:
                                logger.warning(
                                    "[series-episode] finalize failed: %s", series_error,
                                )
                                response.extra["series_episode"] = {
                                    "status": "failed", "error": str(series_error),
                                }
                    except Exception as episode_error:
                        logger.warning("[session-episode] finalize failed: %s", episode_error)
                        response.extra["session_episode"] = {
                            "status": "failed", "error": str(episode_error),
                        }
                        if (
                            getattr(self.config.recall, "dynamic_episode_enabled", False)
                            or getattr(self.config.recall, "series_episode_enabled", False)
                        ):
                            # L1/L2 already completed. Replaying the whole final
                            # chunk to repair a derived L3 can repeat reconcile
                            # mutations, so expose a non-retryable partial success.
                            response.success = False
                            response.error_code = 409
                            response.error_message = (
                                "[DYNAMIC_EPISODE_FINALIZE_FAILED] base memories "
                                "were persisted; automatic chunk retry is unsafe: "
                                f"{episode_error}"
                            )
                            response.extra["partial_agent_persist"] = True
                            await self._await_graph_projection(request)
                            return response
            elif agent_mode == "full":
                self._mark_agent_failure(
                    response,
                    error_code="L1_UPSERT_FAILED",
                    error_message=_l1_error or "L1 raw memory was not persisted",
                )
                await self._emit_pipeline_step(
                    request,
                    step="S1_AGENT_SKIPPED",
                    parsed={
                        "reason": "l1_upsert_failed_or_no_vector_store",
                        "error": _l1_error or "",
                    },
                )
                response.tokens_used = total_tokens
                return response

            # Graph starts after L2 persist and overlaps Dynamic Episode, but a
            # synchronous write does not return before its own projection ends.
            await self._await_graph_projection(request)

            # ── Timing: sys1_workflow_ms ──
            _sys1_workflow_ms = (datetime.now() - _t_workflow).total_seconds() * 1000
            logger.info(f"TRACE_PERF [{_req_id_perf}] S1_WORKFLOW_DONE workflow_ms={_sys1_workflow_ms:.0f}ms")

            # 5. 合并检测（可选）
            enable_merge_check = request.extra.get("enable_merge_check", False)
            should_merge = response.extra.get("should_merge", False)

            if enable_merge_check and not should_merge and request.existing_memories:
                with tracer.span("merge_check") as s:
                    existing_for_merge = [
                        {"memory_id": mem.get("memory_id", ""), "content": mem.get("content", "")}
                        for mem in request.existing_memories
                    ]
                    merge_result = self.merger.check_merge(
                        new_content=request.content,
                        existing_memories=existing_for_merge,
                    )
                    response.extra["should_merge"] = merge_result.should_merge
                    response.extra["merge_target_id"] = merge_result.target_memory_id or ""
                    s.set_output({
                        "should_merge": merge_result.should_merge,
                        "target_id": merge_result.target_memory_id or "",
                    })

            response.success = True
            response.tokens_used = total_tokens

            # ── 汇总 sys1 timing ──
            _ops_count = len(response.extra.get("agent_stored_ids", []))
            _ops_avg_ms = _sys1_workflow_ms / _ops_count if _ops_count > 0 else 0
            response.extra["timing"] = {
                "sys1_waiting_ms": round(_sys1_waiting_ms, 1),
                "sys1_l1_process_ms": round(_sys1_l1_process_ms, 1),
                "sys1_workflow_ms": round(_sys1_workflow_ms, 1),
                "sys1_ops_avg_ms": round(_ops_avg_ms, 1),
            }

            # Metrics: S1 完成 + VDB ops
            _mc = MetricsCollector.get()
            _mc.sys1_end(response.extra["timing"], success=True)
            if _ops_count > 0:
                for _ in range(_ops_count):
                    _mc.record_vdb_op(_ops_avg_ms)

        except Exception as e:
            logger.error(f"MemoryWriter.write failed: {e}", exc_info=True)
            response.error_code = 500
            response.error_message = str(e)
            tracer.set_error(str(e))
            # Metrics: S1 失败
            try:
                MetricsCollector.get().sys1_end({}, success=False)
            except Exception:
                pass
        finally:
            await self._await_graph_projection(request)
            response.extra["workload"] = workload_snapshot()
            self._attach_graph_executor_diagnostics(response)
            response.elapsed_ms = (datetime.now() - start_time).total_seconds() * 1000
            tracer.set_output({
                "success": response.success,
                "layer": response.layer,
                "memory_id": response.memory_id,
                "entities_count": len(response.entities),
                "entities": [
                    {"name": e.get("name", ""), "type": e.get("type", "")}
                    if isinstance(e, dict) else {"name": str(e)}
                    for e in response.entities
                ],
                "summary": response.extra.get("summary", ""),
                "content_stored": request.content,
                "tokens_used": response.tokens_used,
                "pipeline_ms": response.elapsed_ms,
                "agent_status": response.extra.get("agent_status", ""),
            })
            await self._emit_write_timeline(request, tracer)
            tracer.finish(write_file=False)

        return response
```

### `MemoryWriter.write_extracted`

- **原始文件**：`hy_memory/pipelines/writer.py`
- **原始行号**：L2426–L2564
- **固定版本链接**：https://github.com/Tencent-Hunyuan/Hy-Memory/blob/d8138b501a755f662a024f7e8eb879613eabf1d3/hy_memory/pipelines/writer.py#L2426-L2564

以下代码未改写；省略号若存在也是源码自身内容，并非整理时省略。

```python
    async def write_extracted(
        self,
        request: WriteRequest,
        ctx: Optional[PipelineContext] = None,
        tracer: Optional[PipelineTracer] = None,
    ) -> WriteResponse:
        """写入「agent 已抽取好的」记忆：跳过 extract，直接进 reconcile。

        适用于调用方（如 openclaw memory_add tool）已经把对话抽象成一条/多条
        结论性 memory content 的场景。跳过 LLM extract（省一次 LLM 调用），
        但仍走完整 reconcile：与已有记忆判重 / 合并 / 矛盾演化，并落 L2_FACT。

        与 write() 的区别：
        - 不写 L1_RAW 原始节点（content 本身即事实，无原始对话可留档）。
        - 不调 extractor（mem_agent.process_add）。
        - 直接把 content 列表喂给 _reconcile_and_store（或 RECONCILE_ENABLED=false
          时的 _direct_store）。

        输入约定：request.extra["extracted_contents"] = List[str]（每条一个事实）。
        为空时回退到 request.content（单条）。layer 统一 L2_FACT。
        """
        start_time = datetime.now()
        response = WriteResponse()

        if not request.request_id:
            request.request_id = get_request_id()

        if tracer is None:
            tracer = create_tracer(
                operation="write_extracted",
                pipeline_version="system1",
                uid=request.user_id,
                agent_id=request.agent_id,
                request_id=request.request_id,
                content_preview=request.content,
            )

        try:
            # 收集已抽取事实：优先 extra["extracted_contents"]，否则回退 content
            raw_contents = request.extra.get("extracted_contents")
            if not raw_contents:
                raw_contents = [request.content] if request.content else []
            contents = [c.strip() for c in raw_contents if isinstance(c, str) and c.strip()]

            if not contents:
                response.error_code = 400
                response.error_message = "extracted_contents or content is required"
                return response
            if not request.user_id:
                response.error_code = 400
                response.error_message = "user_id is required"
                return response

            if request.memory_at is None:
                request.memory_at = start_time

            _req_id = request.request_id or get_request_id()
            vector_store = await self._get_vector_store()

            # 直接构造 reconcile 输入（跳过 extract）。layer 统一 L2_FACT。
            new_memory_texts: List[str] = list(contents)
            new_memories_meta: List[Dict] = [
                {"content": c, "layer": "L2_FACT", "tags": []} for c in contents
            ]

            # 抽取好的多条之间互相判重；这里算出的向量继续透传给 reconcile / store。
            precomputed_embeddings: Dict[str, List[float]] = {}
            if len(new_memory_texts) >= 2:
                try:
                    (
                        new_memory_texts,
                        new_memories_meta,
                        precomputed_embeddings,
                    ) = await self._dedup_extracted(
                        new_memory_texts, new_memories_meta, request, _req_id,
                    )
                except Exception as e:
                    logger.warning(f"[write_extracted] dedup failed (non-fatal): {e}")

            _t_recon = datetime.now()
            if _RECONCILE_ENABLED:
                stored_ids, recon_error, ops_counts, recon_tokens = await self._reconcile_and_store(
                    new_memory_texts=new_memory_texts,
                    new_memories_meta=new_memories_meta,
                    request=request,
                    vector_store=vector_store,
                    req_id=_req_id,
                    precomputed_embeddings=precomputed_embeddings,
                )
            else:
                stored_ids, recon_error, ops_counts, recon_tokens = await self._direct_store(
                    new_memories_meta=new_memories_meta,
                    request=request,
                    vector_store=vector_store,
                    req_id=_req_id,
                    precomputed_embeddings=precomputed_embeddings,
                )
            _recon_ms = (datetime.now() - _t_recon).total_seconds() * 1000

            response.extra["reconcile_ops"] = ops_counts
            response.extra["reconcile_tokens"] = recon_tokens
            response.extra["extract_tokens"] = {"prompt": 0, "completion": 0, "total": 0}

            if recon_error is not None:
                # 与 write() 一致：reconcile 失败不落任何记忆，报失败供调用方重跑。
                self._mark_reconcile_failure(response, recon_error)
                response.extra["agent_mode"] = "extracted"
                logger.warning(f"[write_extracted] reconcile failed: {recon_error}")
                return response

            response.success = True
            response.layer = MemoryLayer.L2_FACT.value
            response.memory_id = stored_ids[0] if stored_ids else ""
            response.extra["agent_stored_ids"] = stored_ids
            response.extra["agent_status"] = "success"
            response.extra["agent_error"] = ""
            response.extra["agent_nodes"] = len(stored_ids)
            response.extra["agent_mode"] = "extracted"
            response.elapsed_ms = (datetime.now() - start_time).total_seconds() * 1000
            logger.info(
                f"[write_extracted] done: {len(stored_ids)} nodes stored from "
                f"{len(contents)} extracted contents, recon_ms={_recon_ms:.0f}"
            )
            return response

        except Exception as e:
            logger.error(f"[write_extracted] failed: {e}", exc_info=True)
            response.success = False
            response.error_code = 500
            response.error_message = str(e)
            return response
        finally:
            await self._await_graph_projection(request)
            response.extra["workload"] = workload_snapshot()
            self._attach_graph_executor_diagnostics(response)
            try:
                await self._emit_write_timeline(request, tracer)
            except Exception:
                pass
```

### `hy_memory/pipelines/system2_writer.py`：显式 System 2

先保留文件头部原始说明，它明确规定：`write()` 不自动触发 System 2，`evolve()` 同步阻塞、全量加工且非幂等。

```python
"""
HY Memory - System 2 Writer (ultra 模式)

写入流程:
  System 1 (同步): 复用 MemoryWriter 的 write 逻辑（含意图抽取 → L7_INTENTION，
                   见 extractor + writer._store_intentions；意图属于 S1/pro，不是 S2）。
                   write 只跑 S1 即返回。
  System 2 (显式): 由 System 2 Agent（LLM + Graph tools）对 VDB 全量做认知加工，
                   归纳心智模型 → L6_SCHEMA，再跑 cross-domain sweeper。
                   Agent 是 Graph 的唯一写入者。

触发时机由调用方（App 层）通过 evolve() 显式控制：
  - write 不入队、不自动触发；SDK 不维护进程内 S2 队列（重启丢任务、多 Pod
    各自一套队列、与 App 持久化 write 队列双轨等问题由此消除）。
  - evolve() 一次 = 对该 user 的 VDB 全量跑一次 S2 + sweeper（同步阻塞、非幂等）。
"""

import os
from typing import Optional, Dict, Any
from datetime import datetime
import logging

from .base import WritePipeline, WriteRequest, WriteResponse, PipelineContext
from .writer import MemoryWriter
from ..config import MemoryConfig
from ..core.embed_service import EmbedService
from ..data.vector_store_base import VectorStoreBase
from ..data.graph_store_base import GraphStoreBase
from ..models.memory import MemoryNode
from ..utils.tracer import PipelineTracer, create_tracer

import time
logger = logging.getLogger(__name__)

_SWEEPER_ENABLED = os.getenv("SWEEPER_ENABLED", "true").lower() == "true"


# ================================================================
# System 2 Trigger Mode
# ================================================================

# ================================================================
# Pro Write Pipeline
```

### `System2Writer.write`

- **原始文件**：`hy_memory/pipelines/system2_writer.py`
- **原始行号**：L97–L145
- **固定版本链接**：https://github.com/Tencent-Hunyuan/Hy-Memory/blob/d8138b501a755f662a024f7e8eb879613eabf1d3/hy_memory/pipelines/system2_writer.py#L97-L145

以下代码未改写；省略号若存在也是源码自身内容，并非整理时省略。

```python
    async def write(
        self,
        request: WriteRequest,
        ctx: Optional[PipelineContext] = None,
        tracer: Optional[PipelineTracer] = None,
    ) -> WriteResponse:
        """
        执行 Pro 写入流程:
        1. System 1 同步写入 (复用 Lite)，写完即返回。
        2. System 2 不在此触发 —— 由调用方显式调用 evolve()。
        """
        start_time = datetime.now()

        # 创建 tracer
        if tracer is None:
            tracer = create_tracer(
                operation="system2_write",
                pipeline_version="system2",
                uid=request.user_id,
                agent_id=request.agent_id,
                request_id=request.request_id,
                content_preview=request.content,
            )

        # 确保已初始化
        if not self._initialized:
            await self.initialize()

        # ============================================
        # System 1: 复用 Lite 的完整写入流程
        # ============================================
        with tracer.span("system1_write") as s:
            response = await self._writer.write(request, ctx=ctx)
            s.set_output({
                "success": response.success,
                "memory_id": response.memory_id,
                "layer": response.layer,
            })

        if not response.success:
            response.elapsed_ms = (datetime.now() - start_time).total_seconds() * 1000
            return response

        # System 2 由调用方通过 evolve() 显式触发，write 不入队、不自动跑。
        response.extra["pipeline_version"] = "system2"
        response.extra["system2_task_ids"] = []

        response.elapsed_ms = (datetime.now() - start_time).total_seconds() * 1000
        return response
```

### `System2Writer.write_extracted`

- **原始文件**：`hy_memory/pipelines/system2_writer.py`
- **原始行号**：L147–L162
- **固定版本链接**：https://github.com/Tencent-Hunyuan/Hy-Memory/blob/d8138b501a755f662a024f7e8eb879613eabf1d3/hy_memory/pipelines/system2_writer.py#L147-L162

以下代码未改写；省略号若存在也是源码自身内容，并非整理时省略。

```python
    async def write_extracted(
        self,
        request: WriteRequest,
        ctx: Optional[PipelineContext] = None,
        tracer: Optional[PipelineTracer] = None,
    ) -> WriteResponse:
        """已抽取事实直写：委托给内部 MemoryWriter.write_extracted（跳过 extract）。

        System 2 不在此触发——与 write() 一致，认知加工由 evolve() 显式触发。
        """
        if not self._initialized:
            await self.initialize()
        response = await self._writer.write_extracted(request, ctx=ctx, tracer=tracer)
        response.extra["pipeline_version"] = "system2"
        response.extra["system2_task_ids"] = []
        return response
```

### `System2Writer.evolve`

- **原始文件**：`hy_memory/pipelines/system2_writer.py`
- **原始行号**：L1172–L1263
- **固定版本链接**：https://github.com/Tencent-Hunyuan/Hy-Memory/blob/d8138b501a755f662a024f7e8eb879613eabf1d3/hy_memory/pipelines/system2_writer.py#L1172-L1263

以下代码未改写；省略号若存在也是源码自身内容，并非整理时省略。

```python
    async def evolve(
        self,
        user_id: str,
        agent_id: str = "default_agent",
        max_batches: Optional[int] = None,
        language: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        手动触发 System 2 认知加工（由调用方/App 层控制触发时机）。

        语义：evolve 一次 = 对该 user 的 VDB 全量跑一次 System 2（S2 Agent +
        cross-domain sweeper）。S2 的输入是 prepare_materials 全量扫描的 VDB
        （L2/L4 聚类 + 已有 Graph schema），与写入次数无关，只跑一次完整认知周期。

        非幂等：每次 evolve 看到的是当前最新的 VDB 全量，连续多次 evolve 有意义
        （例如先 add 一批 → evolve → 再 add 一批 → 再 evolve）。

        Args:
            user_id: 用户 ID
            agent_id: Agent ID

        Returns:
            {"success": True, "request_id": "...", "tasks_processed": 1, "results": {...}}
        """
        import uuid
        request_id = str(uuid.uuid4())
        logger.info(f"[S2] evolve triggered: user={user_id} agent={agent_id} request_id={request_id}")

        payload = {
            "user_id": user_id,
            "agent_id": agent_id,
            "session_id": "default_session",
            "memory_id": "",
            "request_id": request_id,
            "agent_stored_ids": [],
            "content": "",
            "created_at": datetime.now().isoformat(),
            "max_batches": max_batches,
            # 显式 prompt 语言码（None → System 2 按 materials 做 zh/en 检测）
            "language": language,
        }
        results = await self._run_system2_workers(payload)

        # Sweeper consumes the completed Schema set. Running it after a partial
        # cycle makes its output depend on where the batch budget happened to end.
        # Defer it until this user's current evoling cycle is complete.
        should_continue = bool(results.get("should_continue"))
        if should_continue:
            sweeper_result = {
                "skipped": True,
                "reason": "evoling_cycle_partial",
            }
        else:
            sweeper_result = await self._run_cross_domain_sweeper(
                user_id=user_id,
                agent_id=agent_id,
                llm_call=self._get_llm_call(),
                request_id=request_id,
                language=language,
            )

        agent_success = bool((results.get("system2_agent") or {}).get("success", True))
        first_failure = next(iter(
            (results.get("system2_agent") or {}).get("batch_failures") or []
        ), {})
        return {
            "success": agent_success,
            "request_id": request_id,
            "tasks_processed": 1,
            "results": results,
            "cross_domain_sweeper": sweeper_result,
            "should_continue": should_continue,
            "continuation_reason": results.get("continuation_reason", "complete"),
            "remaining_clusters": int(results.get("remaining_clusters") or 0),
            "remaining_actionable_clusters": int(
                results.get("remaining_actionable_clusters") or 0
            ),
            "remaining_fresh_facts": int(results.get("remaining_fresh_facts") or 0),
            "cycle_status": (
                (results.get("system2_agent") or {}).get("cycle_status") or "complete"
            ),
            "batch_failures": (
                (results.get("system2_agent") or {}).get("batch_failures") or []
            ),
            **({
                "error_code": int(first_failure.get("error_code") or 502),
                "error_message": str(
                    first_failure.get("error") or "System2 evoling batch failed"
                ),
                "failure_kind": first_failure.get("failure_kind") or "batch_failed",
            } if not agent_success else {}),
        }
```

### `hy_memory/agent/reconciler.py`：冲突协调、时间顺序与操作解析

### `ReconcileOp`

- **原始文件**：`hy_memory/agent/reconciler.py`
- **原始行号**：L81–L129
- **固定版本链接**：https://github.com/Tencent-Hunyuan/Hy-Memory/blob/d8138b501a755f662a024f7e8eb879613eabf1d3/hy_memory/agent/reconciler.py#L81-L129

以下代码未改写；省略号若存在也是源码自身内容，并非整理时省略。

```python
@dataclass
class ReconcileOp:
    """
    单条操作指令（v2 flat 格式）。

    op = "ADD"：纯新增节点，信息完全新颖，不引用任何现有记忆。

    op = "SUPERSEDE"：状态演变/矛盾链。新记忆取代旧记忆成为链头部。
      - memory_id 指向被取代的旧节点
      - content 仅描述新/变更的信息（旧节点自动保留在链中）
      - supersede_reason 描述矛盾原因
      - 执行：旧节点 → SHADOW + is_latest=False；新节点 supersedes=[old_id]（进演化链）

    op = "UPDATE"：合并与精炼。新记忆与旧记忆描述同一主题且不矛盾，合并为高密度节点。
      - memory_id 指向被更新的旧节点
      - content 是合并后的完整文本
      - 执行：旧节点 → SHADOW + is_latest=False；新节点独立创建（不进演化链，无 supersedes）
      - 旧节点作为历史保留在 VDB 中（status=SHADOW），但不形成链关系
    """

    op: str = "ADD"
    # --- 共用字段 ---
    content: Optional[str] = None  # 最终存储内容
    layer: Optional[str] = None  # "L2_FACT" / "L4_IDENTITY"
    owner: Optional[str] = None  # 'user' / 'agent'（仅 L2_FACT 有意义）
    tags: List[str] = field(default_factory=list)  # 1-3 keywords；专名保留大小写
    tag_ners: List[str] = field(default_factory=list)  # 与 tags 等长的 NER label
    # 写入时显式组织结构。topic_paths 从宽到窄；event_facet 只描述事实语义，
    # 不携带 future query 的问句类型或路由提示。
    topic_paths: List[List[str]] = field(default_factory=list)
    event_facet: Dict[str, Any] = field(default_factory=dict)
    topic_assignments: List[Dict[str, Any]] = field(default_factory=list)
    structure_references: List[Dict[str, str]] = field(default_factory=list)
    topic_paths_provided: bool = False
    event_facet_provided: bool = False
    topic_assignments_provided: bool = False
    speculate: Optional[str] = None  # 隐性偏好推导（仅 identity）
    # --- SUPERSEDE / UPDATE 字段 ---
    memory_id: Optional[str] = None  # 目标旧节点 ID（单节点；多节点链时为链上最新的那个）
    memory_ids: List[str] = field(default_factory=list)  # SUPERSEDE 多节点链：有序（旧→新）的现有节点 ID 列表；用于把多条同维度旧记忆折叠进同一条演化链
    supersede_reason: str = ""  # SUPERSEDE 的矛盾描述
    # --- 关系图（pro 模式，见 docs/pro_graph_design.md）---
    # LLM 标注的与现有记忆的关系：[{"target_id": <existing memory_id>, "relation_type": ...}]
    # relation_type ∈ causes / elaborates / contrasts / same_series。
    # reconcile 本来就同时摊开了 existing 和 new memories，让它多输出这个字段只花输出 token，
    # 不增加 LLM 调用；而 causes / contrasts 这类边的两端余弦往往很低，向量检索永远发现不了。
    related: List[Dict[str, str]] = field(default_factory=list)
    # --- 通用 ---
    reason: str = ""
```

### `ReconcileResult`

- **原始文件**：`hy_memory/agent/reconciler.py`
- **原始行号**：L132–L156
- **固定版本链接**：https://github.com/Tencent-Hunyuan/Hy-Memory/blob/d8138b501a755f662a024f7e8eb879613eabf1d3/hy_memory/agent/reconciler.py#L132-L156

以下代码未改写；省略号若存在也是源码自身内容，并非整理时省略。

```python
@dataclass
class ReconcileResult:
    """Reconcile 结果"""

    ops: List[ReconcileOp] = field(default_factory=list)
    success: bool = True
    error: Optional[str] = None
    # success=False 时的稳定失败码：LLM_UNAVAILABLE / EMPTY_RESPONSE /
    # JSON_PARSE_FAILED / RECONCILE_EXCEPTION。失败时 ops 恒为空：writer 什么都
    # 不落库，整次写入报失败，调用方换个 request_id 重跑即可（reconcile 会判重）。
    error_code: Optional[str] = None
    # reconcile 链路 LLM token 消耗（search-query + reconcile 两次 LLM 调用之和）
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    # 候选池的相似度快照：{新记忆 content: [(existing_node_id, score), ...]}
    #
    # reconcile 本来就为每条新记忆做了 hybrid 检索并算出融合分数，用完就丢。写侧把它
    # 存成 `semantic_neighbor` 边是**零额外计算**的（见 docs/pro_graph_design.md §2.2）。
    # 用 content 作 key 而不是 node_id：新记忆此刻还没入库、没有 id。
    candidate_scores: Dict[str, List[Tuple[str, float]]] = field(default_factory=dict)
    # reconcile 候选检索已经为每条新 memory 算过 embedding。把原始文本对应向量交回
    # writer，原文不变的 ADD 可直接落库，避免同一事实再次请求 embedding。
    # 仅按完全相同 content 复用；LLM 改写后的 UPDATE/SUPERSEDE 会重新计算，防止错配。
    new_memory_embeddings: Dict[str, List[float]] = field(default_factory=dict)
```

### `enforce_time_order`

- **原始文件**：`hy_memory/agent/reconciler.py`
- **原始行号**：L201–L259
- **固定版本链接**：https://github.com/Tencent-Hunyuan/Hy-Memory/blob/d8138b501a755f662a024f7e8eb879613eabf1d3/hy_memory/agent/reconciler.py#L201-L259

以下代码未改写；省略号若存在也是源码自身内容，并非整理时省略。

```python
def enforce_time_order(
    ops: List["ReconcileOp"],
    new_memory_at: Any,
    existing: Dict[str, Any],
) -> List["ReconcileOp"]:
    """An older memory must never replace a newer one, whatever the model says.

    Memories are not always written in the order they happened: history is
    imported late, and a person can add a memory while older history is still
    being processed. The prompt tells the model to compare `memory_at`; this
    makes it hold. A SUPERSEDE or UPDATE aimed at an existing memory whose
    `memory_at` is later than the memory being written is turned into an ADD,
    so the newer memory stays the current state. Unknown times are not
    compared. A content-less UPDATE (the legacy DELETE mapping) is dropped.
    """
    written_at = _as_aware(new_memory_at)
    if written_at is None:
        return ops
    kept: List[ReconcileOp] = []
    for op in ops:
        if op.op not in ("SUPERSEDE", "UPDATE"):
            kept.append(op)
            continue
        targets = list(op.memory_ids) if op.memory_ids else [op.memory_id]
        newer = [
            target for target in targets
            if target and (node := existing.get(target)) is not None
            and (target_at := _as_aware(getattr(node, "memory_at", None))) is not None
            and target_at > written_at
        ]
        if not newer:
            kept.append(op)
            continue
        logger.warning(
            "[reconciler] %s blocked: memory_at %s is older than existing %s; "
            "kept the newer memory",
            op.op, written_at.isoformat(), ",".join(newer),
        )
        if not op.content:
            continue
        kept.append(ReconcileOp(
            op="ADD",
            content=op.content,
            layer=op.layer,
            owner=op.owner,
            tags=list(op.tags),
            tag_ners=list(op.tag_ners),
            topic_paths=list(op.topic_paths),
            event_facet=dict(op.event_facet),
            topic_assignments=list(op.topic_assignments),
            structure_references=list(op.structure_references),
            topic_paths_provided=op.topic_paths_provided,
            event_facet_provided=op.event_facet_provided,
            topic_assignments_provided=op.topic_assignments_provided,
            speculate=op.speculate,
            related=list(op.related),
            reason=f"time_order: older than {','.join(newer)}; {op.reason}"[:500],
        ))
    return kept
```

### `build_reconcile_prompt`

- **原始文件**：`hy_memory/agent/reconciler.py`
- **原始行号**：L262–L294
- **固定版本链接**：https://github.com/Tencent-Hunyuan/Hy-Memory/blob/d8138b501a755f662a024f7e8eb879613eabf1d3/hy_memory/agent/reconciler.py#L262-L294

以下代码未改写；省略号若存在也是源码自身内容，并非整理时省略。

```python
def build_reconcile_prompt(
    *,
    new_memories: List[str],
    new_memories_block: str,
    existing_memories_block: str,
    current_date: str,
    few_shot_enabled: bool = False,
    structure_metadata_enabled: bool = False,
    language: Optional[str] = None,
) -> str:
    """Build the reconcile prompt used by the write path.

    ``language`` set → that language's prompt plus the output-language rule;
    None → zh/en auto-detection over the new memories (unchanged behaviour).
    """
    explicit = normalize_language(language)
    code = resolve_language(explicit, "\n".join(new_memories))
    few_shot = (
        ("\n" + get_prompt("RECONCILE_FEW_SHOT", code) + "\n")
        if few_shot_enabled else ""
    )
    prompt = get_prompt("RECONCILE_PROMPT", code).format(
        current_date=current_date,
        new_memories=new_memories_block,
        existing_memories=existing_memories_block,
        few_shot_section=few_shot,
    )
    prompt = append_reconcile_structure_prompt(
        prompt,
        enabled=structure_metadata_enabled,
        language=code,
    )
    return with_output_language(prompt, code, explicit=explicit is not None)
```

### `MemoryReconciler.reconcile`

- **原始文件**：`hy_memory/agent/reconciler.py`
- **原始行号**：L397–L1212
- **固定版本链接**：https://github.com/Tencent-Hunyuan/Hy-Memory/blob/d8138b501a755f662a024f7e8eb879613eabf1d3/hy_memory/agent/reconciler.py#L397-L1212

以下代码未改写；省略号若存在也是源码自身内容，并非整理时省略。

```python
    async def reconcile(
        self,
        new_memories: List[str],
        user_id: str,
        agent_id: str,
        vector_store,  # VectorStoreBase
        embed_service,  # EmbedService
        layers=None,  # Optional[List[MemoryLayer]]
        cache=None,  # Optional[CacheBase], 用于写 pipeline_logs
        request_id: str = "",
        current_time: str = "",
        new_memories_with_meta: Optional[List[Dict]] = None,  # 含 tags 的完整 meta
        session_id: str = "",  # 隔离维度，透传到 pipeline_logs
        graph_store=None,  # Optional GraphStore：Entity MENTIONS boost
        new_memory_embeddings: Optional[Dict[str, List[float]]] = None,
        source: str = "default",
        language: Optional[str] = None,
    ) -> ReconcileResult:
        """
        对 new_memories 做 reconcile。

        Args:
            new_memories: 新记忆内容列表（content only，用于 embed 搜索）
            new_memories_with_meta: 可选，含 tags 的完整 meta
            language: 显式 prompt 语言码；None 时按新记忆做 zh/en 自动检测
        """
        if not new_memories:
            return ReconcileResult(ops=[], success=True)

        from ..models.memory import MemoryLayer, MemoryStatus, MemoryNode
        import asyncio

        if layers is None:
            layers = [MemoryLayer.L2_FACT, MemoryLayer.L4_IDENTITY]

        try:
            import time as _time

            # ── Step 1: Search Query 生成（可消融）──
            search_queries: List[str] = []
            sq_response = None
            t_sq = _time.perf_counter()

            if self._enable_search_query:
                search_queries, sq_response = await self._generate_search_queries(
                    new_memories, language=language,
                )
            sq_elapsed = (_time.perf_counter() - t_sq) * 1000

            # token 累计：search-query 这次 LLM 调用的消耗（reconcile 调用稍后追加）
            _tok_pt = sq_response.prompt_tokens if sq_response else 0
            _tok_ct = sq_response.completion_tokens if sq_response else 0
            _tok_total = sq_response.tokens_used if sq_response else 0

            # 写 SEARCH_QUERY pipeline log
            if cache and request_id:
                if self._enable_search_query:
                    sq_prompt = build_search_query_prompt(
                        new_memories, language=language,
                    )
                else:
                    sq_prompt = "[search query disabled — hybrid retrieval per new memory]"
                try:
                    await cache.store_pipeline_log(
                        request_id=request_id,
                        user_id=user_id,
                        agent_id=agent_id,
                        session_id=session_id,
                        step="SEARCH_QUERY",
                        prompt=sq_prompt,
                        response=json.dumps(search_queries, ensure_ascii=False),
                        parsed=json.dumps(search_queries, ensure_ascii=False),
                        elapsed_ms=sq_elapsed,
                        prompt_tokens=sq_response.prompt_tokens if sq_response else 0,
                        completion_tokens=(
                            sq_response.completion_tokens if sq_response else 0
                        ),
                        total_tokens=sq_response.tokens_used if sq_response else 0,
                    )
                except Exception as e:
                    logger.warning(f"[reconciler] store SEARCH_QUERY log failed: {e}")

            # ── Step 2: 候选搜索，合并候选池 ──
            candidate_map: Dict[str, MemoryNode] = {}
            candidate_scores: Dict[str, float] = {}

            supplied_embeddings = dict(new_memory_embeddings or {})
            mem_embeddings: List[Optional[List[float]]] = [
                supplied_embeddings.get(text) for text in new_memories
            ]
            missing_mem_indices = [
                i for i, emb in enumerate(mem_embeddings) if not emb
            ]
            texts_to_embed = [new_memories[i] for i in missing_mem_indices]
            texts_to_embed.extend(search_queries)
            computed_embeddings = (
                await embed_service.embed_batch(texts_to_embed)
                if texts_to_embed else []
            )
            for i, emb in zip(
                missing_mem_indices,
                computed_embeddings[: len(missing_mem_indices)],
            ):
                mem_embeddings[i] = emb
            query_embeddings = computed_embeddings[len(missing_mem_indices):]

            def _merge_hits(hits: List[Dict[str, Any]], source: str) -> None:
                logger.debug(f"[reconciler] search {source}: {len(hits)} results")
                for r in hits:
                    node = r.get("node")
                    score = float(r.get("score", 0))
                    if not node:
                        continue
                    # Canonical states are materialized and versioned by nightly
                    # evoling using an exact state_key.  Letting the free-form S1
                    # reconciler mutate them turns a stable state back into an
                    # event summary and breaks deterministic lifecycle handling.
                    if is_canonical_state_node(node):
                        continue
                    nid = node.node_id
                    if nid not in candidate_map:
                        candidate_map[nid] = node
                        candidate_scores[nid] = score
                    else:
                        candidate_scores[nid] = max(candidate_scores[nid], score)

            from ..pipelines._retrieval.reconcile_retrieval import (
                ReconcileHybridRetriever,
                ReconcileRetrievalConfig,
            )

            hybrid = ReconcileHybridRetriever(
                ReconcileRetrievalConfig.from_env(
                    limit=self.SEARCH_TOPK,
                    vec_pool_multiplier=self.VEC_POOL_MULTIPLIER,
                    min_score=self.HYBRID_MIN_SCORE,
                )
            )

            new_memory_embeddings = {
                text: emb
                for text, emb in zip(new_memories, mem_embeddings)
                if text and emb
            }

            hybrid_indices = [
                i for i in range(len(new_memories))
                if i < len(mem_embeddings) and mem_embeddings[i]
            ]

            query_indices = []
            if self._enable_search_query and search_queries:
                query_indices = [
                    i for i in range(len(search_queries))
                    if i < len(query_embeddings)
                ]

            _t_candidate_search = _time.perf_counter()
            hybrid_result = []
            query_result = []
            tasks = []
            if hybrid_indices:
                tasks.append(hybrid.search_candidates_batch(
                    [new_memories[i] for i in hybrid_indices],
                    [mem_embeddings[i] for i in hybrid_indices],
                    vector_store=vector_store,
                    user_id=user_id,
                    agent_id=agent_id,
                    layers=layers,
                    embed_service=embed_service,
                    graph_store=graph_store,
                    include_sources=[source],
                ))
            if query_indices:
                tasks.append(vector_store.search_batch([
                    {
                        "query_embedding": query_embeddings[i],
                        "user_id": user_id,
                        "agent_ids": None,
                        "layers": layers,
                        "limit": self.QUERY_SEARCH_TOPK,
                        "score_threshold": self.SEARCH_THRESHOLD,
                        "status_filter": [
                            MemoryStatus.ACTIVE, MemoryStatus.SUPERSEDED,
                        ],
                        "only_latest": False,
                        "include_sources": [source],
                    }
                    for i in query_indices
                ]))
            if tasks:
                task_results = await asyncio.gather(*tasks, return_exceptions=True)
                cursor = 0
                if hybrid_indices:
                    hybrid_result = task_results[cursor]
                    cursor += 1
                if query_indices:
                    query_result = task_results[cursor]
            _candidate_search_ms = round(
                (_time.perf_counter() - _t_candidate_search) * 1000, 2,
            )
            # 关系图用：记下"每条新记忆的 hybrid 候选及其分数"。
            # 这些分数本来算完就丢，写侧拿它建 semantic_neighbor 边是零额外计算的。
            # 用 content 作 key —— 新记忆此刻还没入库，没有 node_id。
            per_memory_candidates: Dict[str, List[Tuple[str, float]]] = {}

            if isinstance(hybrid_result, Exception):
                logger.warning("[reconciler] hybrid batch failed: %s", hybrid_result)
                hybrid_result = []
            if isinstance(query_result, Exception):
                logger.warning("[reconciler] query batch failed: %s", query_result)
                query_result = []

            for source_index, result in zip(hybrid_indices, hybrid_result):
                _merge_hits(result, f"memory_hybrid[{source_index}]")
                per_memory_candidates[new_memories[source_index]] = [
                            (r["node"].node_id, float(r.get("score", 0.0)))
                            for r in (result or [])
                            if r.get("node") is not None
                            and not is_canonical_state_node(r["node"])
                ]
            for source_index, result in zip(query_indices, query_result):
                _merge_hits(
                    [
                        {"node": r.get("node"), "score": r.get("score", 0)}
                        for r in result
                    ],
                    f"query[{source_index}]",
                )

            logger.debug(
                f"[reconciler] search: {len(new_memories)} memories (hybrid) + "
                f"{len(search_queries)} queries → {len(candidate_map)} raw candidates"
            )

            # ── Step 2.5: 按演化链合并（复用 reader 侧 _trace_full_chain）──
            # 召回池可能含 SUPERSEDED 旧节点（链身）。对每个候选节点双向追溯
            # （supersedes / superseded_by）补全整条链，以链头（is_latest）为代表
            # 去重：同一条链的多个命中（链头+链身）合并为一个候选，链头作代表，
            # 链头分数取该链所有命中的最高分。
            # 注：祖先节点仅用于去重/避免重复候选，**不进 prompt**（见 Step 4，
            # supersede 时只暴露 head 的 id+content，history 不提供，防止 LLM 误操作）。
            from ..pipelines._retrieval.evolution import trace_full_chains

            chain_head_node: Dict[str, MemoryNode] = {}   # head_id → head node
            chain_best_score: Dict[str, float] = {}       # head_id → 链上最高命中分
            node_to_head: Dict[str, str] = {}             # 任一命中 node_id → 其链头 id
            chain_members: Dict[str, List[str]] = {}      # head_id → 整条链 node_id（head+bodies）

            _t_chain_expand = _time.perf_counter()
            try:
                traced_chains = await trace_full_chains(
                    vector_store, list(candidate_map.values()),
                )
            except Exception as e:
                logger.warning("[reconciler] batch chain trace failed: %s", e)
                traced_chains = {}
            for nid, node in candidate_map.items():
                if nid in node_to_head:
                    continue  # 已被某条已展开的链覆盖
                chain = traced_chains.get(nid) or [node]
                head = chain[0]  # _trace_full_chain 保证 [0] 为链头（is_latest 优先）
                head_id = head.node_id
                chain_head_node.setdefault(head_id, head)
                chain_members[head_id] = [cn.node_id for cn in chain]
                # 该链上所有“恰好被召回”的节点，分数并入链头候选分
                for cn in chain:
                    node_to_head[cn.node_id] = head_id
                    if cn.node_id in candidate_scores:
                        chain_best_score[head_id] = max(
                            chain_best_score.get(head_id, 0.0),
                            candidate_scores[cn.node_id],
                        )

            # 按链头候选分排序，取 top（留足余量）
            sorted_chains = sorted(
                chain_head_node.keys(),
                key=lambda hid: chain_best_score.get(hid, 0.0),
                reverse=True,
            )[: self.FINAL_TOPK * 2]

            # 最终候选：以链头为代表（prompt 只展示 head）
            final_candidates: Dict[str, MemoryNode] = {}
            for head_id in sorted_chains:
                final_candidates[head_id] = chain_head_node[head_id]
                candidate_scores[head_id] = chain_best_score.get(head_id, 0.0)

            candidate_map = final_candidates
            _chain_expand_ms = round(
                (_time.perf_counter() - _t_chain_expand) * 1000, 2,
            )
            logger.debug(
                f"[reconciler] after chain merge: {len(candidate_map)} chain groups "
                f"(traced from {len(node_to_head)} recalled chain nodes)"
            )

            # ── Step 2.7: 候选构成埋点 ──
            # 候选检索已放宽到 user 维度（不再按 agent 收窄），候选池里会混入其他
            # agent 的记忆。在 topk 不变的前提下，多 agent 用户的本 agent 候选
            # 可能被挤出去（"稀释"）。这里把构成落进 pipeline log，上线后可直接
            # 从日志确认稀释是否真的发生，而不必等业务反馈。
            #
            # 单 agent 用户 cross_agent_count 恒为 0 —— 放宽前后捞回的是同一批。
            try:
                _cand_own_agent = 0
                _cand_cross_agent = 0
                _cand_owner_user = 0
                _cand_owner_agent = 0
                _cross_agent_ids: set = set()
                for _n in candidate_map.values():
                    _naid = getattr(_n, "agent_id", "") or ""
                    if _naid and _naid != agent_id:
                        _cand_cross_agent += 1
                        _cross_agent_ids.add(_naid)
                    else:
                        _cand_own_agent += 1
                    if (getattr(_n, "owner", None) or "user") == "agent":
                        _cand_owner_agent += 1
                    else:
                        _cand_owner_user += 1

                _cand_parsed = {
                    "candidate_count": len(candidate_map),
                    "own_agent_count": _cand_own_agent,
                    "cross_agent_count": _cand_cross_agent,
                    "cross_agent_ids": sorted(_cross_agent_ids)[:20],
                    "owner_user_count": _cand_owner_user,
                    "owner_agent_count": _cand_owner_agent,
                    "recalled_chain_nodes": len(node_to_head),
                    "final_topk": self.FINAL_TOPK * 2,
                    # 候选池打满时才可能发生稀释；未打满说明没有竞争
                    "topk_saturated": len(candidate_map) >= self.FINAL_TOPK * 2,
                    "scope": "user",
                    "new_memory_count": len(new_memories),
                    "hybrid_query_count": len(hybrid_indices),
                    "query_query_count": len(query_indices),
                    "dense_batch_count": int(bool(hybrid_indices))
                    + int(bool(query_indices)),
                    "keyword_batch_count": int(bool(hybrid_indices)),
                    "candidate_search_ms": _candidate_search_ms,
                    "chain_expand_ms": _chain_expand_ms,
                    "vector_store_local": bool(
                        getattr(vector_store, "_is_local", False)
                    ),
                }
                logger.info(
                    f"[reconciler] candidates={len(candidate_map)} "
                    f"own_agent={_cand_own_agent} cross_agent={_cand_cross_agent} "
                    f"owner_user={_cand_owner_user} owner_agent={_cand_owner_agent} "
                    f"saturated={_cand_parsed['topk_saturated']}"
                )
                if cache:
                    await cache.store_pipeline_log(
                        request_id=request_id,
                        user_id=user_id,
                        agent_id=agent_id,
                        session_id=session_id,
                        step="RECONCILE_CANDIDATES",
                        prompt="",
                        response="",
                        parsed=json.dumps(_cand_parsed, ensure_ascii=False),
                    )
            except Exception as e:
                logger.debug(f"[reconciler] store RECONCILE_CANDIDATES log failed: {e}")

            # ── Step 2.6: 候选去重（pre-search）──
            # 候选都是链头（is_latest）。只对 L2_FACT + L4_IDENTITY（重复重灾区）
            # 判重，其他层不参与（与 search 链路一致）。命中即置 SHADOW（逻辑删除，
            # 被判重的链头连带其历史链），并从 candidate_map 移除，避免 LLM 看到
            # 重复候选。
            #
            # 分批维度由 owner 决定（group_items_by_owner）：owner=user 的记忆属于
            # 用户这一侧，跨 agent 合并判重；owner=agent 的按 agent 隔离。
            try:
                import time as _time
                from ..pipelines._retrieval.dedup import (
                    DedupItem, execute_dedup, group_items_by_owner,
                )

                _DEDUP_LAYERS = {MemoryLayer.L2_FACT, MemoryLayer.L4_IDENTITY}
                head_ids = [
                    hid for hid, node in candidate_map.items()
                    if node.layer in _DEDUP_LAYERS
                ]
                _t_emb = _time.perf_counter()
                head_embs = await vector_store.get_embeddings(head_ids)
                _get_emb_ms = round((_time.perf_counter() - _t_emb) * 1000, 2)
                dedup_items = []
                for hid in head_ids:
                    node = candidate_map[hid]
                    emb = head_embs.get(hid)
                    if not emb:
                        continue
                    dedup_items.append(DedupItem(
                        node_id=hid,
                        embedding=emb,
                        content=node.content or "",
                        is_latest=True,
                        is_chain_head=True,
                        gmt_created=(node.gmt_created.timestamp() if node.gmt_created else None),
                        chain_node_ids=chain_members.get(hid, [hid]),
                        # 分批维度：owner 决定跨不跨 agent
                        owner=getattr(node, "owner", None),
                        user_id=getattr(node, "user_id", "") or user_id,
                        agent_id=getattr(node, "agent_id", "") or agent_id,
                        source=getattr(node, "source", "default") or "default",
                    ))

                if len(dedup_items) >= 2:
                    # 每批传各自准确的 user_id/agent_id，DEDUP log 归属才正确
                    for _batch in group_items_by_owner(
                        dedup_items,
                        default_user_id=user_id,
                        default_agent_id=agent_id,
                    ):
                        plan = await execute_dedup(
                            _batch["items"],
                            vector_store=vector_store,
                            cache=cache,
                            trigger="reconcile",
                            request_id=request_id,
                            user_id=_batch["user_id"],
                            agent_id=_batch["agent_id"],
                            delete_from_store=True,
                            extra_parsed={
                                "embedding_source": "vdb_get_embeddings",
                                "get_embeddings_ms": _get_emb_ms,
                                "embed_count": len(head_ids),
                                "embed_ok_count": len(dedup_items),
                                "owner_bucket": _batch["owner"],
                                "source_bucket": _batch["source"],
                                "batch_size": len(_batch["items"]),
                            },
                        )
                        for did in plan.get("delete_ids", []):
                            candidate_map.pop(did, None)
            except Exception as e:
                logger.warning(f"[reconciler] candidate dedup failed: {e}")

            # ── Step 3: 如果没有任何候选，全部 ADD（supersedes=[]）──
            if not candidate_map:
                logger.debug(
                    f"[reconciler] no candidates found, all ADD ({len(new_memories)} items)"
                )
                all_add_ops = []
                if new_memories_with_meta:
                    for meta in new_memories_with_meta:
                        all_add_ops.append(
                            ReconcileOp(
                                op="ADD",
                                content=meta.get("content", ""),
                                layer=meta.get("layer"),
                                owner=meta.get("owner") or "user",
                                tags=list(meta.get("tags") or []),
                                speculate=meta.get("speculate"),
                                topic_paths=meta.get("topic_paths") or [],
                                event_facet=meta.get("event_facet") or {},
                                topic_assignments=meta.get("topic_assignments") or [],
                                topic_paths_provided=bool(
                                    meta.get("topic_paths_provided", "topic_paths" in meta)
                                ),
                                event_facet_provided=bool(
                                    meta.get("event_facet_provided", "event_facet" in meta)
                                ),
                                topic_assignments_provided=bool(meta.get(
                                    "topic_assignments_provided",
                                    "topic_assignments" in meta,
                                )),
                            )
                        )
                else:
                    all_add_ops = [
                        ReconcileOp(op="ADD", content=m) for m in new_memories
                    ]

                if cache and request_id:
                    try:
                        await cache.store_pipeline_log(
                            request_id=request_id,
                            user_id=user_id,
                            agent_id=agent_id,
                            session_id=session_id,
                            step="RECONCILE",
                            prompt="[skipped - no candidates found in search]",
                            response=json.dumps(
                                [{"op": "ADD", "content": m} for m in new_memories],
                                ensure_ascii=False,
                            ),
                            parsed=json.dumps(
                                [
                                    {"op": o.op, "content": o.content}
                                    for o in all_add_ops
                                ],
                                ensure_ascii=False,
                            ),
                            elapsed_ms=0,
                        )
                    except Exception as e:
                        logger.warning(
                            f"[reconciler] store skipped RECONCILE log failed: {e}"
                        )
                logger.info(
                    f"[reconciler] no candidates → all ADD: "
                    f"{len(new_memories)} new memories → {len(all_add_ops)} ops"
                )
                _log_ops_detail(all_add_ops)
                return ReconcileResult(
                    ops=all_add_ops,
                    success=True,
                    prompt_tokens=_tok_pt,
                    completion_tokens=_tok_ct,
                    total_tokens=_tok_total,
                    candidate_scores=per_memory_candidates,
                    new_memory_embeddings=new_memory_embeddings,
                )

            # ── Step 4: 构造 prompt ──
            _structure_metadata_on = bool(getattr(
                self.config.llm, "structure_metadata_enabled", False
            ))

            # 收集该 user 下所有已有 tags（去重，供 LLM 复用，减少发散）
            _existing_tags_set: set = set()
            try:
                for node in candidate_map.values():
                    if getattr(node, "tags", None):
                        _existing_tags_set.update(node.tags)
            except Exception:
                pass
            # Helper: format memory_at as date string to minute precision
            def _format_memory_at(val) -> Optional[str]:
                if val is None:
                    return None
                if isinstance(val, datetime):
                    return val.strftime("%Y-%m-%d %H:%M")
                if isinstance(val, str) and val:
                    try:
                        dt = datetime.fromisoformat(val)
                        return dt.strftime("%Y-%m-%d %H:%M")
                    except (ValueError, TypeError):
                        return val
                return None

            # new_memories 展示（JSON list 格式，与 existing_memories 对齐）
            if new_memories_with_meta:
                new_mem_list = []
                for meta in new_memories_with_meta:
                    item: Dict[str, Any] = {
                        "content": meta.get("content", ""),
                        "owner": meta.get("owner") or "user",
                        "memory_at": _format_memory_at(current_time) if current_time else None,
                        "tags": list(meta.get("tags") or []),
                    }
                    if _structure_metadata_on and meta.get("topic_paths"):
                        item["topic_paths"] = meta["topic_paths"]
                    if _structure_metadata_on and meta.get("event_facet"):
                        item["event_facet"] = meta["event_facet"]
                    if _structure_metadata_on and meta.get("topic_assignments"):
                        item["topic_assignments"] = meta["topic_assignments"]
                    new_mem_list.append(item)
                new_mem_lines = json.dumps(new_mem_list, ensure_ascii=False, indent=2)
            else:
                new_mem_list = [{"content": m, "owner": "user", "memory_at": _format_memory_at(current_time) if current_time else None, "tags": []} for m in new_memories]
                new_mem_lines = json.dumps(new_mem_list, ensure_ascii=False, indent=2)

            def _sort_key(n):
                t = n.memory_at or n.gmt_created
                return t.isoformat() if t else ""

            sorted_candidates = sorted(candidate_map.values(), key=_sort_key)

            existing_mem_list = []
            for node in sorted_candidates:
                item: Dict[str, Any] = {
                    "memory_id": node.node_id,
                    "content": node.content,
                    "owner": getattr(node, "owner", None) or "user",
                    "memory_at": _format_memory_at(node.memory_at),
                }
                if getattr(node, "tags", None):
                    item["tags"] = list(node.tags)
                if _structure_metadata_on:
                    _custom = getattr(node, "custom", None) or {}
                    if _custom.get("topic_paths"):
                        item["topic_paths"] = _custom["topic_paths"]
                    if _custom.get("event_facet"):
                        item["event_facet"] = _custom["event_facet"]
                    if _custom.get("topic_assignments"):
                        item["topic_assignments"] = _custom["topic_assignments"]
                # 每条演化链只暴露链头（head）的 memory_id + content，**不提供
                # history_versions**：reconcile 只应针对当前有效版本（head）做
                # ADD/UPDATE/SUPERSEDE，暴露历史旧节点会诱导 LLM 误操作（如去
                # supersede 一个已经被取代的旧节点）。链的完整展开只发生在 reader 侧。
                existing_mem_list.append(item)
            existing_lines = json.dumps(existing_mem_list, ensure_ascii=False, indent=2)

            # 构建 current_date（精确到分钟）
            _current_date_str = datetime.now().strftime("%Y-%m-%d %H:%M")

            prompt = build_reconcile_prompt(
                new_memories=new_memories,
                new_memories_block=new_mem_lines,
                existing_memories_block=existing_lines,
                current_date=_current_date_str,
                few_shot_enabled=bool(
                    getattr(self.config.llm, "few_shot_enabled", False)
                ),
                structure_metadata_enabled=_structure_metadata_on,
                language=language,
            )

            # ── Step 5: LLM 调用 + 重试 ──
            if _log_llm_content_enabled():
                logger.debug(f"[reconciler] full prompt: {prompt!r}")
            else:
                logger.debug(
                    "[reconciler] prompt hidden; len=%d sha256=%s",
                    len(prompt), _content_fingerprint(prompt),
                )
            # 动态估算 max_tokens
            # 取基础值与动态值的较大者，并夹在上限以内。
            dyn_max_tokens = min(
                self.MAX_TOKENS_UPPER_BOUND,
                max(
                    self.MAX_TOKENS,
                    len(new_memories) * self.PER_OP_TOKENS + self.BASE_OVERHEAD_TOKENS,
                ),
            )
            t_recon = _time.perf_counter()
            llm = self._get_llm()
            response = None
            raw_response = ""
            ops = []
            _parse_ok = False
            # JSON 解析失败只重试一次（首次 + 1 次重试 = 共 2 次）。
            # 配合 _parse_ops 的 json_repair 兜底，多数残缺输出首次即可修复。
            # 两次用同一温度（此前是 [base, base] 的列表，等价于常量），
            # 且不再显式传 temperature —— 交给 provider 统一按配置解析，
            # 否则 omit_temperature 会被这里的显式传参绕过。
            _MAX_PARSE_ATTEMPTS = 2
            _llm_error: Optional[str] = None

            for _attempt in range(_MAX_PARSE_ATTEMPTS):
                try:
                    response = await llm.complete(
                        prompt=prompt,
                        max_tokens=dyn_max_tokens,
                        audit_stage="reconcile",
                    )
                except Exception as e:
                    # LLM 彻底不可用（provider 已按 max_retries 重试过，网关 500 /
                    # 连接错误等）。不冒泡：下面统一记 RECONCILE 失败日志，再返回
                    # success=False —— writer 不落任何新记忆，整次写入报失败。
                    _llm_error = f"{type(e).__name__}: {e}"
                    logger.warning(f"[reconciler] RECONCILE LLM unavailable: {_llm_error}")
                    break
                # 每次 reconcile LLM 调用（含重试）都计入 token 消耗
                _tok_pt += response.prompt_tokens
                _tok_ct += response.completion_tokens
                _tok_total += response.tokens_used
                raw_response = response.content or ""
                ops = self._parse_ops(raw_response)
                ops = enforce_time_order(ops, current_time, candidate_map)
                ops = self._inherit_exact_input_structure(
                    ops, new_memories_with_meta,
                )
                if _structure_metadata_on:
                    ops = self._resolve_structure_references(ops, candidate_map)

                # 只有字面量 "[]" 才是「模型判定无需任何操作」。HTTP 200 但 content
                # 为空不是决策，是失败：按 EMPTY_RESPONSE 处理，不能当成 0 条成功。
                _is_empty_array = self._strip_code_fence(raw_response) == "[]"
                if ops or _is_empty_array:
                    _parse_ok = True
                    break
                logger.warning(
                    f"[reconciler] RECONCILE JSON parse failed "
                    f"(attempt {_attempt+1}/{_MAX_PARSE_ATTEMPTS}), "
                    f"retrying: raw({len(raw_response or '')} chars)"
                )
                if _log_llm_content_enabled():
                    logger.debug(f"[reconciler] unparsable raw={raw_response[:200]!r}")

            recon_elapsed = (_time.perf_counter() - t_recon) * 1000

            # ── Step 6: 解析仍失败 ──
            if not _parse_ok:
                _n_attempts = _MAX_PARSE_ATTEMPTS
                if _llm_error:
                    error_msg = f"RECONCILE LLM unavailable: {_llm_error}"
                    error_code = "LLM_UNAVAILABLE"
                elif raw_response.strip():
                    error_msg = (
                        f"RECONCILE JSON parse failed after {_n_attempts} attempts "
                        f"({len(raw_response)} chars)"
                    )
                    error_code = "JSON_PARSE_FAILED"
                else:
                    error_msg = (
                        f"RECONCILE LLM returned empty response after {_n_attempts} attempts"
                    )
                    error_code = "EMPTY_RESPONSE"
                logger.warning(f"[reconciler] {error_msg}")

                if cache and request_id:
                    try:
                        await cache.store_pipeline_log(
                            request_id=request_id,
                            user_id=user_id,
                            agent_id=agent_id,
                            session_id=session_id,
                            step="RECONCILE",
                            prompt=prompt,
                            response=raw_response,
                            parsed=json.dumps(
                                {
                                    "error": error_code,
                                    "message": error_msg,
                                    "stored": 0,
                                },
                                ensure_ascii=False,
                            ),
                            elapsed_ms=recon_elapsed,
                            # LLM 彻底不可用时 response 是 None —— 直接取属性会抛
                            # AttributeError，把失败日志本身也废掉
                            prompt_tokens=getattr(response, "prompt_tokens", 0) or 0,
                            completion_tokens=getattr(response, "completion_tokens", 0) or 0,
                            total_tokens=getattr(response, "tokens_used", 0) or 0,
                        )
                    except Exception as e:
                        logger.warning(
                            f"[reconciler] store failed RECONCILE log failed: {e}"
                        )

                # 不做 ADD-all 兜底：没经过判重 / 演化的整批 ADD 会在重跑时产生重复，
                # 而且调用方看到 success 就不会重试。这里报失败、不落库，由调用方重跑。
                return ReconcileResult(
                    ops=[],
                    success=False,
                    error=error_msg,
                    error_code=error_code,
                    prompt_tokens=_tok_pt,
                    completion_tokens=_tok_ct,
                    total_tokens=_tok_total,
                )

            # 写 RECONCILE pipeline log
            if cache and request_id:
                related_ids = []
                for op in ops:
                    if op.op in ("SUPERSEDE", "UPDATE") and op.memory_id:
                        related_ids.append(op.memory_id)
                try:
                    await cache.store_pipeline_log(
                        request_id=request_id,
                        user_id=user_id,
                        agent_id=agent_id,
                        session_id=session_id,
                        step="RECONCILE",
                        prompt=prompt,
                        response=response.content,
                        parsed=json.dumps(
                            [
                                {
                                    "op": o.op,
                                    "content": o.content,
                                    "layer": o.layer,
                                    "memory_id": o.memory_id,
                                    "tags": o.tags,
                                    "topic_paths": o.topic_paths,
                                    "event_facet": o.event_facet,
                                    "topic_assignments": o.topic_assignments,
                                    "structure_references": o.structure_references,
                                    "related": o.related,
                                    "speculate": o.speculate,
                                    "supersede_reason": o.supersede_reason,
                                    "reason": o.reason,
                                }
                                for o in ops
                            ],
                            ensure_ascii=False,
                        ),
                        memory_ids=related_ids,
                        elapsed_ms=recon_elapsed,
                        prompt_tokens=response.prompt_tokens,
                        completion_tokens=response.completion_tokens,
                        total_tokens=response.tokens_used,
                    )
                except Exception as e:
                    logger.warning(f"[reconciler] store RECONCILE log failed: {e}")

            logger.info(
                f"[reconciler] reconciled {len(new_memories)} new memories, "
                f"{len(candidate_map)} candidates → {len(ops)} ops"
            )
            _log_ops_detail(ops)
            return ReconcileResult(
                ops=ops,
                success=True,
                prompt_tokens=_tok_pt,
                completion_tokens=_tok_ct,
                total_tokens=_tok_total,
                candidate_scores=per_memory_candidates,
                new_memory_embeddings=new_memory_embeddings,
            )

        except Exception as e:
            logger.error(f"[reconciler] failed: {e}", exc_info=True)
            # reconcile 链路任意环节炸了（候选检索、embed、prompt 组装…）：此时还
            # 没有任何新记忆落库，报失败让整次写入可以干净地重跑。
            return ReconcileResult(
                ops=[],
                success=False,
                error=f"{type(e).__name__}: {e}",
                error_code="RECONCILE_EXCEPTION",
            )
```

### `MemoryReconciler._parse_ops`

- **原始文件**：`hy_memory/agent/reconciler.py`
- **原始行号**：L1321–L1575
- **固定版本链接**：https://github.com/Tencent-Hunyuan/Hy-Memory/blob/d8138b501a755f662a024f7e8eb879613eabf1d3/hy_memory/agent/reconciler.py#L1321-L1575

以下代码未改写；省略号若存在也是源码自身内容，并非整理时省略。

```python
    def _parse_ops(self, text: str) -> List[ReconcileOp]:
        """
        解析 LLM 返回的 RECONCILE 输出。

        支持格式：
        - Flat list（推荐）：[{op, content, ...}, {op, content, ...}]
        - Group 格式（向后兼容）：[{"reason": ..., "ops": [...]}]

        支持的 op 类型：ADD, SUPERSEDE, UPDATE
        """
        text = self._strip_code_fence(text)

        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            match = re.search(r"\[.*\]", text, re.DOTALL)
            data = None
            if match:
                try:
                    data = json.loads(match.group())
                except json.JSONDecodeError:
                    data = None
            if data is None:
                # 兜底：json_repair 修复常见 LLM 残缺输出（缺逗号/引号/未闭合等）
                try:
                    from json_repair import repair_json

                    repaired = repair_json(text, return_objects=True)
                    if repaired not in (None, "", {}):
                        logger.info("[reconciler] JSON recovered via json_repair")
                        data = repaired
                except Exception as _re:
                    logger.debug(f"[reconciler] json_repair failed: {_re}")
            if data is None:
                logger.warning(f"[reconciler] failed to parse ops JSON ({len(text)} chars)")
                logger.debug(f"[reconciler] unparsable ops output: {text[:200]!r}")
                return []

        if not isinstance(data, list):
            data = [data]

        # ── 展平：把 (op_dict, group_reason) 二元组放到 flat 列表里 ──
        flat_items: List[tuple] = []  # (op_dict, group_reason)
        for entry in data:
            if not isinstance(entry, dict):
                continue
            # 分支 A：group 结构（向后兼容）— 带 reason + ops 子列表
            if "ops" in entry and isinstance(entry.get("ops"), list):
                group_reason = str(entry.get("reason") or "").strip()
                for op_dict in entry["ops"]:
                    if isinstance(op_dict, dict):
                        flat_items.append((op_dict, group_reason))
            # 分支 B：扁平 op 结构（推荐）
            elif "op" in entry:
                flat_items.append((entry, ""))
            else:
                logger.warning(
                    f"[reconciler] unrecognized entry shape, skipped: {entry}"
                )

        # Pass 1: 结构解析
        parsed: List[ReconcileOp] = []
        for op_dict, group_reason in flat_items:
            op_type = str(op_dict.get("op", "")).upper()
            op_reason = str(op_dict.get("reason") or "").strip() or group_reason

            # 通用字段提取
            raw_tags = op_dict.get("tags", []) or []
            if not isinstance(raw_tags, list):
                raw_tags = [raw_tags]
            # 保留专名大小写（Jasper / Canada）；只做 strip，不再 lower。
            # 主题词 LLM 仍可给小写；NER 属性写入 tag_ners。
            tags = [str(t).strip() for t in raw_tags if t and str(t).strip()][:3]
            try:
                from ..pipelines._retrieval.ner import annotate_tag_ners
                tag_ners = annotate_tag_ners(tags)
            except Exception:
                tag_ners = [""] * len(tags)
            speculate = op_dict.get("speculate") or None
            if speculate and isinstance(speculate, str):
                speculate = speculate.strip() or None

            # owner：仅接受 user/agent（assistant→agent），否则 None
            _raw_owner = op_dict.get("owner")
            owner = None
            if _raw_owner:
                _ov = str(_raw_owner).strip().lower()
                if _ov in ("user", "agent"):
                    owner = _ov
                elif _ov == "assistant":
                    owner = "agent"

            related = self._parse_related(op_dict.get("related"))
            from ..structure import (
                normalize_event_facet,
                normalize_structure_references,
                normalize_topic_assignments,
                normalize_topic_paths,
            )
            topic_paths = normalize_topic_paths(op_dict.get("topic_paths"))
            event_facet = normalize_event_facet(op_dict.get("event_facet"))
            topic_assignments = normalize_topic_assignments(
                op_dict.get("topic_assignments")
            )
            structure_references = normalize_structure_references(
                op_dict.get("structure_references")
            )
            topic_paths_provided = "topic_paths" in op_dict
            event_facet_provided = "event_facet" in op_dict
            topic_assignments_provided = "topic_assignments" in op_dict

            if op_type == "ADD":
                parsed.append(
                    ReconcileOp(
                        op="ADD",
                        content=op_dict.get("content"),
                        layer=op_dict.get("layer"),
                        owner=owner,
                        tags=tags,
                        tag_ners=tag_ners,
                        topic_paths=topic_paths,
                        event_facet=event_facet,
                        topic_assignments=topic_assignments,
                        structure_references=structure_references,
                        topic_paths_provided=topic_paths_provided,
                        event_facet_provided=event_facet_provided,
                        topic_assignments_provided=topic_assignments_provided,
                        speculate=speculate,
                        related=related,
                        reason=op_reason,
                    )
                )

            elif op_type == "SUPERSEDE":
                # 接受单 id（memory_id）或多 id 链（memory_ids，有序 旧→新）
                raw_ids = op_dict.get("memory_ids")
                id_list: List[str] = []
                if isinstance(raw_ids, list):
                    id_list = [str(x).strip() for x in raw_ids if x and str(x).strip()]
                mid = str(op_dict.get("memory_id") or "").strip()
                if mid and mid not in id_list:
                    # memory_id 视为链上最新的目标，追加到末尾
                    id_list.append(mid)
                if not id_list:
                    logger.warning(
                        f"[reconciler] SUPERSEDE op missing memory_id(s), skipped: {op_dict}"
                    )
                    continue
                # memory_id 始终指向链上最新的现有节点（新 head 直接 supersede 它）
                parsed.append(
                    ReconcileOp(
                        op="SUPERSEDE",
                        memory_id=id_list[-1],
                        memory_ids=id_list,
                        content=op_dict.get("content"),
                        layer=op_dict.get("layer"),
                        owner=owner,
                        tags=tags,
                        tag_ners=tag_ners,
                        topic_paths=topic_paths,
                        event_facet=event_facet,
                        topic_assignments=topic_assignments,
                        structure_references=structure_references,
                        topic_paths_provided=topic_paths_provided,
                        event_facet_provided=event_facet_provided,
                        topic_assignments_provided=topic_assignments_provided,
                        speculate=speculate,
                        supersede_reason=str(
                            op_dict.get("supersede_reason") or ""
                        ).strip(),
                        related=related,
                        reason=op_reason,
                    )
                )

            elif op_type == "UPDATE":
                mid = str(op_dict.get("memory_id") or "").strip()
                if not mid:
                    logger.warning(
                        f"[reconciler] UPDATE op missing memory_id, skipped: {op_dict}"
                    )
                    continue
                parsed.append(
                    ReconcileOp(
                        op="UPDATE",
                        memory_id=mid,
                        content=op_dict.get("content"),
                        layer=op_dict.get("layer"),
                        owner=owner,
                        tags=tags,
                        tag_ners=tag_ners,
                        topic_paths=topic_paths,
                        event_facet=event_facet,
                        topic_assignments=topic_assignments,
                        structure_references=structure_references,
                        topic_paths_provided=topic_paths_provided,
                        event_facet_provided=event_facet_provided,
                        topic_assignments_provided=topic_assignments_provided,
                        speculate=speculate,
                        related=related,
                        reason=op_reason,
                    )
                )

            elif op_type == "DELETE":
                # 向后兼容：旧 prompt 可能仍返回 DELETE，映射为 SHADOW 旧节点
                mid = str(op_dict.get("memory_id") or "").strip()
                if not mid:
                    logger.warning(
                        f"[reconciler] DELETE op missing memory_id, skipped: {op_dict}"
                    )
                    continue
                logger.info(
                    f"[reconciler] legacy DELETE op mapped (memory_id={mid}), "
                    f"will shadow the node"
                )
                parsed.append(
                    ReconcileOp(
                        op="UPDATE",
                        memory_id=mid,
                        content=None,  # 标记为无 content 的 shadow-only op
                        reason=op_reason,
                    )
                )

            else:
                logger.warning(
                    f"[reconciler] unknown op '{op_type}', skipped: {op_dict}"
                )
                continue

        # Pass 2: 校验"同一 existing memory 不得被多处 touch"
        touched: Dict[str, str] = {}  # memory_id → first-seen op description
        validated: List[ReconcileOp] = []
        for op in parsed:
            # SUPERSEDE 多节点链：登记链上所有 id；UPDATE/单节点 SUPERSEDE 登记 memory_id
            if op.op == "SUPERSEDE" and op.memory_ids:
                target_ids = list(op.memory_ids)
            elif op.op in ("SUPERSEDE", "UPDATE"):
                target_ids = [op.memory_id] if op.memory_id else []
            else:
                target_ids = []
            if target_ids:
                clash = next((t for t in target_ids if t in touched), None)
                if clash is not None:
                    logger.warning(
                        f"[reconciler] memory_id {clash} already touched by '{touched[clash]}', "
                        f"current op '{op.op}' dropped"
                    )
                    continue
                for t in target_ids:
                    touched[t] = op.op
            validated.append(op)

        return validated
```

### `hy_memory/data/cache_base.py` 与 `cache_sqlite.py`：持久化写入结果

### `CacheBase.claim_write_outcome`

- **原始文件**：`hy_memory/data/cache_base.py`
- **原始行号**：L121–L131
- **固定版本链接**：https://github.com/Tencent-Hunyuan/Hy-Memory/blob/d8138b501a755f662a024f7e8eb879613eabf1d3/hy_memory/data/cache_base.py#L121-L131

以下代码未改写；省略号若存在也是源码自身内容，并非整理时省略。

```python
    @abstractmethod
    async def claim_write_outcome(
        self,
        request_id: str,
        user_id: str,
        agent_id: str,
        session_id: str,
        operation: str,
    ) -> Optional[Dict[str, Any]]:
        """Claim one idempotent write; return the existing row if already claimed."""
        ...
```

### `CacheBase.finish_write_outcome`

- **原始文件**：`hy_memory/data/cache_base.py`
- **原始行号**：L133–L141
- **固定版本链接**：https://github.com/Tencent-Hunyuan/Hy-Memory/blob/d8138b501a755f662a024f7e8eb879613eabf1d3/hy_memory/data/cache_base.py#L133-L141

以下代码未改写；省略号若存在也是源码自身内容，并非整理时省略。

```python
    @abstractmethod
    async def finish_write_outcome(
        self,
        request_id: str,
        status: str,
        result: Dict[str, Any],
    ) -> bool:
        """Persist the terminal/unknown result for a claimed write."""
        ...
```

### `CacheBase.get_write_outcome`

- **原始文件**：`hy_memory/data/cache_base.py`
- **原始行号**：L143–L146
- **固定版本链接**：https://github.com/Tencent-Hunyuan/Hy-Memory/blob/d8138b501a755f662a024f7e8eb879613eabf1d3/hy_memory/data/cache_base.py#L143-L146

以下代码未改写；省略号若存在也是源码自身内容，并非整理时省略。

```python
    @abstractmethod
    async def get_write_outcome(self, request_id: str) -> Optional[Dict[str, Any]]:
        """Read one durable write outcome by exact request id."""
        ...
```

### `SqliteCache.claim_write_outcome`

- **原始文件**：`hy_memory/data/cache_sqlite.py`
- **原始行号**：L435–L467
- **固定版本链接**：https://github.com/Tencent-Hunyuan/Hy-Memory/blob/d8138b501a755f662a024f7e8eb879613eabf1d3/hy_memory/data/cache_sqlite.py#L435-L467

以下代码未改写；省略号若存在也是源码自身内容，并非整理时省略。

```python
    async def claim_write_outcome(
        self,
        request_id: str,
        user_id: str,
        agent_id: str,
        session_id: str,
        operation: str,
    ) -> Optional[Dict[str, Any]]:
        def _claim():
            with self._lock:
                now = datetime.now().isoformat()
                cursor = self._conn.execute(
                    """
                    INSERT OR IGNORE INTO write_outcomes (
                        request_id, user_id, agent_id, session_id, operation,
                        status, result_json, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, 'running', '{}', ?, ?)
                    """,
                    (request_id, user_id, agent_id, session_id, operation, now, now),
                )
                self._conn.commit()
                if cursor.rowcount == 1:
                    return None
                row = self._conn.execute(
                    "SELECT * FROM write_outcomes WHERE request_id = ?",
                    (request_id,),
                ).fetchone()
                return dict(row) if row else None

        existing = await _run_in_sqlite_pool(_claim)
        if existing is None:
            return None
        return await self.get_write_outcome(request_id)
```

### `SqliteCache.finish_write_outcome`

- **原始文件**：`hy_memory/data/cache_sqlite.py`
- **原始行号**：L469–L493
- **固定版本链接**：https://github.com/Tencent-Hunyuan/Hy-Memory/blob/d8138b501a755f662a024f7e8eb879613eabf1d3/hy_memory/data/cache_sqlite.py#L469-L493

以下代码未改写；省略号若存在也是源码自身内容，并非整理时省略。

```python
    async def finish_write_outcome(
        self,
        request_id: str,
        status: str,
        result: Dict[str, Any],
    ) -> bool:
        def _finish():
            with self._lock:
                cursor = self._conn.execute(
                    """
                    UPDATE write_outcomes
                    SET status = ?, result_json = ?, updated_at = ?
                    WHERE request_id = ?
                    """,
                    (
                        status,
                        json.dumps(result, ensure_ascii=False, default=str),
                        datetime.now().isoformat(),
                        request_id,
                    ),
                )
                self._conn.commit()
                return cursor.rowcount == 1

        return await _run_in_sqlite_pool(_finish)
```

### `SqliteCache.get_write_outcome`

- **原始文件**：`hy_memory/data/cache_sqlite.py`
- **原始行号**：L495–L511
- **固定版本链接**：https://github.com/Tencent-Hunyuan/Hy-Memory/blob/d8138b501a755f662a024f7e8eb879613eabf1d3/hy_memory/data/cache_sqlite.py#L495-L511

以下代码未改写；省略号若存在也是源码自身内容，并非整理时省略。

```python
    async def get_write_outcome(self, request_id: str) -> Optional[Dict[str, Any]]:
        def _get():
            with self._lock:
                row = self._conn.execute(
                    "SELECT * FROM write_outcomes WHERE request_id = ?",
                    (request_id,),
                ).fetchone()
                return dict(row) if row else None

        row = await _run_in_sqlite_pool(_get)
        if row is None:
            return None
        try:
            row["result"] = json.loads(row.pop("result_json") or "{}")
        except (TypeError, json.JSONDecodeError):
            row["result"] = {}
        return row
```

### `hy_memory/coding/types.py`：Working／Coding 数据契约完整原文

以下为该文件完整内容，而非摘要。
```python
# -*- coding: utf-8 -*-
"""
Coding Memory 数据结构

设计原则：
- 与 chat 链路完全分轨，独立 schema
- task + search_keys 多 key 召回
- boundary_envs 记录经验依赖的环境，供消费方判断是否仍适用
- 覆盖式 update（不留历史），可携带 DELETE op

对外 scene 与返回结构见 docs/scene_coding_usage.md。
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional, Dict, Any, Literal


# 事实层 status 取值
FACT_STATUSES = ("active", "superseded")
FactStatus = Literal["active", "superseded"]

# 写演变总结时最多往回追几代。不设上限的话，长命事实每次覆盖都要顺着 fact_link
# 走完整条链，既多查库又把提示词撑爆。超出的部分在提示词里标一句"更早若干代已略"。
MAX_FACT_CHAIN_ENTRIES = 8


class CodingWriteError(RuntimeError):
    """working / coding 写入链路里让整次写入失败的模型错误。

    error_code 是稳定失败码，CodingWriter 原样透传为 agent_error_code：
    - LLM_ERROR          抽取 LLM 调用失败
    - EMPTY_RESPONSE     抽取 LLM 返回 200 但 content 为空
    - JSON_PARSE_FAILED  抽取 LLM 的回复解析不出 JSON 对象
    - OUTPUT_TRUNCATED   抽取 LLM 的回复被 token 预算截断（finish_reason=length），
                         解析不出完整 JSON 对象；提高 max_tokens 后重试可恢复
    - EMBEDDING_FAILED   经验 / 事实向量化失败（不落没有向量的节点）
    - RECONCILE_FAILED   经验 / 事实 reconcile 的模型决策失败；具体原因在 cause
                         （LLM_UNAVAILABLE / EMPTY_RESPONSE / JSON_PARSE_FAILED），
                         透传为 reconcile_error_code，与 chat 链路一致
    """

    def __init__(self, error_code: str, message: str, cause: Optional[str] = None):
        super().__init__(message)
        self.error_code = error_code
        self.cause = cause


def _epoch(value: Optional[datetime]) -> Optional[int]:
    """memory_at 对外是秒级 epoch，与 chat 一致。"""
    return int(value.timestamp()) if isinstance(value, datetime) else None


# ================================================================
# 草稿（LLM extract 阶段输出）
# ================================================================

@dataclass
class CodingMemoryDraft:
    """
    LLM extractor 产出的草稿，未经 reconcile / 持久化。

    字段用于 coding/working 链路内部抽取与 reconcile。
    """
    # 检索主键
    task: str
    search_keys: List[str] = field(default_factory=list)
    solution: str = ""
    boundary_envs: str = ""

    confidence: float = 0.7

    # 上下文（SDK 注入）
    user_id: str = ""
    agent_id: str = "default_agent"
    workspace_id: Optional[str] = None
    branch: Optional[str] = None
    session_id: Optional[str] = None
    files: List[str] = field(default_factory=list)
    source: str = "default"
    extraction_source: str = "auto_extract"
    # 对话时间（SDK 注入，同 chat 的 memory_at）
    memory_at: Optional[datetime] = None

    def __post_init__(self) -> None:
        from ..utils.source_filter import normalize_source
        self.source = normalize_source(self.source)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "task": self.task,
            "search_keys": list(self.search_keys),
            "solution": self.solution,
            "boundary_envs": self.boundary_envs,
            "confidence": self.confidence,
            "user_id": self.user_id,
            "agent_id": self.agent_id,
            "workspace_id": self.workspace_id,
            "branch": self.branch,
            "session_id": self.session_id,
            "files": list(self.files),
            "source": self.source,
            "extraction_source": self.extraction_source,
            "memory_at": _epoch(self.memory_at),
        }


# ================================================================
# 已持久化记忆
# ================================================================

@dataclass
class CodingMemory:
    """已持久化的经验层记忆（SQLite + VDB 双层共同表示一条）"""
    # 主键
    experience_id: str
    user_id: str
    agent_id: str = "default_agent"

    # 检索主键
    task: str = ""
    search_keys: List[str] = field(default_factory=list)
    solution: str = ""
    boundary_envs: str = ""

    # 作用域（随结果透出，同时作为 search / list 的可选筛选条件）
    workspace_id: Optional[str] = None
    branch: Optional[str] = None

    # 上下文
    session_id: Optional[str] = None
    files: List[str] = field(default_factory=list)

    # 两层互链：本经验由哪些 fact 衍生（同批全互链回填）
    source_fact_ids: List[str] = field(default_factory=list)

    # 元数据
    confidence: float = 0.7
    source: str = "default"
    extraction_source: str = "auto_extract"

    # 时间
    # memory_at 是对话时间（同 chat），created_at / updated_at 是写库时间。
    # UPDATE 合并时取两者中较晚的那个对话时间，见 store.update。
    memory_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    def __post_init__(self) -> None:
        from ..utils.source_filter import normalize_source
        self.source = normalize_source(self.source)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "experience_id": self.experience_id,
            "user_id": self.user_id,
            "agent_id": self.agent_id,
            "task": self.task,
            "search_keys": list(self.search_keys),
            "solution": self.solution,
            "boundary_envs": self.boundary_envs,
            "workspace_id": self.workspace_id,
            "branch": self.branch,
            "session_id": self.session_id,
            "files": list(self.files),
            "source_fact_ids": list(self.source_fact_ids),
            "confidence": self.confidence,
            "source": self.source,
            "extraction_source": self.extraction_source,
            "memory_at": _epoch(self.memory_at),
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


# ================================================================
# 事实层（episodic）：WorkingFact
#
# 与经验层（procedural）并排的第二层。经验层存"怎么干"（可复用方法，跨会话），
# 事实层存"这次怎么推进的"（一段 trace/session 的整体记录，为对话连贯服务）。
#
# 设计决策（见对话记录）：
#   - 无 TTL：靠 embed 召回 top-K + 独立 FactReconciler(LLM) 判覆盖来保新鲜，
#             而非过期淘汰。覆盖时旧 fact status→superseded 并回填 fact_link。
#   - session_id 只存不强隔离（同经验层），检索按 user 召回。
#   - 两层互链：fact.derived_experience_ids ↔ experience.source_fact_ids（同批全互链）。
#   - subject 硬锚点（可开关，见 fact_reconciler._SUBJECT_GATE_DEFAULT）：开启时覆盖
#     判定先过 subject 闸门，再走语义召回 + LLM。
#     没有这个锚点时（纯语义 + LLM 判覆盖），"同一 workspace 下有多个并列主体"的
#     场景容易出错：多人共用一份行程、多台机器共用一套部署脚本时，各主体的
#     statement 语义高度相似，LLM 可能把它们判成同一任务的先后版本，一次写入顶掉
#     别人的事实。subject 不同就禁止覆盖可以避免这一点：措辞相近顶多多留一条，
#     跨主体覆盖则是直接把别人的状态删掉。
#
#     为什么做成开关：这个闸门是精确字符串相等（见下面 normalize_subject），
#     它的正确性完全取决于 subject 是不是稳定实体名。subject 是自由文本或位置
#     标签时，同一实体会被写成不同 subject 而互相拦截；如果后续步骤依赖前一步
#     的结果，拦掉一次真实更新会让它读到过期值。所以默认关闭，需要时用
#     HY_FACT_SUBJECT_GATE=1 开启。

# ================================================================


def normalize_subject(subject: Optional[str]) -> str:
    """subject 的比较形式：去空白、折叠内部空格、小写。

    锚点只用来判"是不是同一个主体"，所以 `Dylan` / `dylan ` / `DYLAN` 必须同值；
    但不做同义词归并（`auth/middleware.ts` 与 `middleware` 是两个主体），那属于
    语义判断，是 LLM 那一步的事。空 subject 返回空串，调用方按"没有锚点"处理。
    """
    return " ".join((subject or "").split()).lower()


@dataclass
class WorkingFactDraft:
    """LLM extractor 产出的会话级事实草稿，未经 reconcile / 持久化。

    上下文（user_id / session_id 等）不在草稿里，由 FactReconciler 落库时注入。
    每段 trace 最多一条；statement 是可恢复状态记录，简洁覆盖用户任务、实际处理、
    证据边界与当前结束状态，并保留文件/目录路径、符号、命令、错误字符串、版本和
    配置值等检索锚点。
    """
    statement: str = ""
    files: List[str] = field(default_factory=list)
    # 这段会话的主体：被操作的那个人 / 文件 / 服务 / 组件。覆盖判定的硬锚点。
    subject: str = ""
    # 会话产出的可寻址原文：计划表、配置块、命令输出、结构化结果。statement 是
    # 摘要（检索向量），details 是被摘要掉的那些具体取值——按原样保留，供检索
    # 命中之后真正读取。摘要天然会丢"第二天午餐吃什么、多少钱"这种被寻址的格子，
    # 而那正是下游唯一需要的东西。
    details: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return {
            "statement": self.statement,
            "files": list(self.files),
            "subject": self.subject,
            "details": self.details,
        }


@dataclass
class WorkingFact:
    """一段 trace/session 的整体记录（SQLite working_fact + 独立 facts 集合）。"""
    # 主键
    fact_id: str
    user_id: str
    agent_id: str = "default_agent"

    # 上下文（存但不强隔离，同经验层）
    session_id: Optional[str] = None
    workspace_id: Optional[str] = None
    branch: Optional[str] = None
    source: str = "default"

    # 内容
    statement: str = ""                    # 会话摘要（任务/做法/结果）= 检索向量
    files: List[str] = field(default_factory=list)  # 本次 trace 实际操作或调查的文件/目录路径

    # 这段会话的主体（人 / 文件 / 服务 / 组件）。覆盖判定的硬闸门：subject 不同
    # 一律不许覆盖，见模块头注释。空串表示抽取时没能定出主体，此时退回纯语义 + LLM
    # 判定（老库里的行也是空串，行为与改动前一致）。
    subject: str = ""

    # 会话产出的可寻址原文，不进检索向量，命中后随 statement 一起交给下游读取。
    # statement 负责"能被找到"，details 负责"找到之后真的有那个值"。
    details: str = ""

    # 覆盖 / 互链
    fact_link: Optional[str] = None        # 被哪条新 fact 覆盖（覆盖后回填，追溯用）
    derived_experience_ids: List[str] = field(default_factory=list)  # 衍生了哪些经验
    status: FactStatus = "active"          # active / superseded（软删除）

    # LLM 写的进展总结："同一任务怎样跨 session 推进到当前状态"，每次 SUPERSEDE 重写。
    # 空串表示没有演变可讲（从没被覆盖过），或那次 LLM 调用失败了。
    #
    # 历史本身不存在这里——被覆盖的事实原样留在库里，fact_link 指向后继，顺着
    # 反向走就能还原历代说法。这里只放提炼过的那句话。
    #
    # 不进向量库：检索认的是 statement 的当前值，把历史说法一起 embed 会让已经
    # 作废的措辞重新具备召回力。
    fact_chain_summary: str = ""

    # 时间
    memory_at: Optional[datetime] = None   # 对话时间（同 chat），没传时是收到请求的时间
    created_at: Optional[datetime] = None  # 产生时间，新的优先

    def __post_init__(self) -> None:
        from ..utils.source_filter import normalize_source
        self.source = normalize_source(self.source)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "fact_id": self.fact_id,
            "user_id": self.user_id,
            "agent_id": self.agent_id,
            "session_id": self.session_id,
            "workspace_id": self.workspace_id,
            "branch": self.branch,
            "source": self.source,
            "statement": self.statement,
            "files": list(self.files),
            "subject": self.subject,
            "details": self.details,
            "fact_link": self.fact_link,
            "derived_experience_ids": list(self.derived_experience_ids),
            "status": self.status,
            "fact_chain_summary": self.fact_chain_summary,
            "memory_at": _epoch(self.memory_at),
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ================================================================
# 事实血统
# ================================================================

def short_date(iso: str) -> str:
    """ISO 时间取到日。解析不了就原样返回，宁可难看也别丢信息。"""
    s = (iso or "").strip()
    return s[:10] if len(s) >= 10 else s


# ================================================================
# Reconcile op
# ================================================================

ReconcileAction = Literal["ADD", "UPDATE", "DELETE", "SKIP"]


@dataclass
class ReconcileOp:
    """
    Reconciler 决策出的单个操作。

    - ADD     ← 由某 draft 触发新增；draft_idx 必填，target_experience_id 不填
    - UPDATE  ← 由某 draft 触发更新；draft_idx + target_experience_id 都必填
    - DELETE  ← 新内容明确否定/作废了某 candidate；draft_idx 记录"由哪条 draft 触发"
                可空（少数情况），target_experience_id 必填
    - SKIP    ← duplicate；draft_idx 必填，target_experience_id 不填

    注：一次 reconcile 调用产出的 ops 数 *可以超过* drafts 数（一个 draft 可能伴随多条 DELETE）。
    """
    action: ReconcileAction
    draft_idx: Optional[int] = None
    target_experience_id: Optional[str] = None
    reason: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "action": self.action,
            "draft_idx": self.draft_idx,
            "target_experience_id": self.target_experience_id,
            "reason": self.reason,
        }


# ================================================================
# 事实层 op
#
# 会话级事实不设价值门槛，所以每条 draft 必定产出一个 INSERT；若它继续推进
# 某个旧 fact 所记录的同一用户任务，还会额外产出 SUPERSEDE（软删并过继经验链）。
# ================================================================

FactReconcileAction = Literal["INSERT", "SUPERSEDE"]


@dataclass
class FactReconcileOp:
    """
    - INSERT     ← 新事实入库 active；draft_idx + fact_id 必填
    - SUPERSEDE  ← 旧 session fact 与新 fact 属于同一用户任务的连续推进；
                   fact_id 是旧记录，superseded_by 是新的进展记录
    """
    action: FactReconcileAction
    draft_idx: Optional[int] = None
    fact_id: Optional[str] = None
    superseded_by: Optional[str] = None
    reason: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "action": self.action,
            "draft_idx": self.draft_idx,
            "fact_id": self.fact_id,
            "superseded_by": self.superseded_by,
            "reason": self.reason,
        }
```

### `hy_memory/coding/writer.py`：生产力双层写入与事实—经验互链

### `CodingWriter.write`

- **原始文件**：`hy_memory/coding/writer.py`
- **原始行号**：L73–L282
- **固定版本链接**：https://github.com/Tencent-Hunyuan/Hy-Memory/blob/d8138b501a755f662a024f7e8eb879613eabf1d3/hy_memory/coding/writer.py#L73-L282

以下代码未改写；省略号若存在也是源码自身内容，并非整理时省略。

```python
    async def write(
        self,
        messages: List[ChatMessage],
        *,
        user_id: str,
        agent_id: str = "default_agent",
        workspace_id: Optional[str] = None,
        branch: Optional[str] = None,
        session_id: Optional[str] = None,
        request_id: Optional[str] = None,
        source: str = "default",
        memory_at: Optional[datetime] = None,
        language: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        working/coding 段写入端到端。memory_at 是对话时间，记到这次写出的经验和
        事实上；不传则用收到请求的时间（与 chat 链路一致）。language 是显式 prompt
        语言码，透传给抽取、经验 reconcile、事实 reconcile 与演变总结；None 时各步
        沿用 zh/en 自动检测。返回响应 dict（兼容 client.add 返回结构）：
            {
                "success": True,
                "scene": "productivity",
                "request_id": "...",
                "elapsed_ms": ...,
                "ops": [
                    {"action": "ADD", "draft_idx": 0, "target_experience_id": "...", "reason": ...},
                    ...
                ],
                "experience_ids": ["..."],   # 所有 ADD/UPDATE 涉及的 experience_id
                "fact_ops": [
                    {"action": "INSERT", "draft_idx": 0, "fact_id": "...", ...},
                    ...
                ],
                "fact_ids": ["..."],         # 这趟真正落库的 fact_id
            }

        模型失败（抽取 LLM 调用失败 / 空回复 / 解析不出）或向量化失败时返回
        success=False，agent_error_code 为 LLM_ERROR / EMPTY_RESPONSE /
        JSON_PARSE_FAILED / EMBEDDING_FAILED，error_code=502。经验层 / 事实层
        reconcile 的模型决策失败时 agent_error_code=RECONCILE_FAILED，原因在
        reconcile_error_code（LLM_UNAVAILABLE / EMPTY_RESPONSE / JSON_PARSE_FAILED），
        本次什么都不落库。模型答了但没有值得记的内容仍是 success=True、0 条。
        """
        request_id = request_id or str(uuid.uuid4())
        t0 = time.perf_counter()
        if memory_at is None:
            memory_at = datetime.now()

        if not messages:
            return self._empty_response(request_id, t0)

        tool_max_bytes = int(
            getattr(self.store.config.coding, "tool_result_max_bytes", 2048) or 2048
        )

        # 1. 历史与新输入分离。
        #    - history_messages：之前 write 的最近 5 个 user-turn，仅作上下文
        #    - current_messages：本次 write 的全部 turn，只限制单条消息体积，不裁 turn
        history_turns = int(
            getattr(self.store.config.extractor, "history_turns", 5) or 5
        )
        try:
            history_messages = await self.store.get_recent_trace_messages(
                user_id=user_id,
                agent_id=agent_id or "default_agent",
                max_user_turns=history_turns,
                source=source,
            )
        except Exception as e:
            logger.warning(f"[coding-write] recent trace lookup failed, continue without history: {e}")
            history_messages = []
        current_messages = prepare_extractor_messages(
            messages, tool_max_bytes=tool_max_bytes,
        )

        # 2. 抽取双层 drafts（一次 LLM 调用）
        #
        # 刻意不给 extractor 看用户已有的 task。抽取只该忠实读这一段发生了什么，
        # 跟库里已有的什么关系是 reconcile 的事。把已有 task 摆到它面前，它会把
        # 一个其实不同的任务往清单里某个措辞上靠，reconciler 随后判成 UPDATE 合并
        # 掉，那个区别就没了——措辞对不上顶多多存一条，措辞被带偏是直接写错。
        #
        # 模型失败（LLM 调用失败 / 空回复 / 解析不出）抛 CodingWriteError：整次写入
        # 报失败、什么都不存，连 trace 也不追加——调用方换个 request_id 重跑时，
        # 历史窗口里不会多出这段本该是「新消息」的对话。
        try:
            drafts, fact_drafts = await self.extractor.extract(
                messages,
                history_messages=history_messages,
                tool_result_max_bytes=tool_max_bytes,
                user_id=user_id,
                agent_id=agent_id,
                workspace_id=workspace_id,
                branch=branch,
                session_id=session_id,
                request_id=request_id,
                language=language,
            )
        except CodingWriteError as e:
            return self._failure_response(request_id, t0, e)

        trace_kwargs = dict(
            request_id=request_id,
            user_id=user_id,
            agent_id=agent_id or "default_agent",
            session_id=session_id,
            workspace_id=workspace_id,
            branch=branch,
            source=source,
        )

        if not drafts and not fact_drafts:
            # 模型答了、只是没有值得记的：正常的空抽取，仍算成功。历史服务于下一次
            # write；即使本次没跨过价值门槛，也不能丢掉上下文。
            logger.info(
                f"[coding-write] no drafts produced (value bar); request_id={request_id}"
            )
            await self._append_trace(current_messages, **trace_kwargs)
            return self._empty_response(request_id, t0)

        # extractor 只负责内容；调用来源由 SDK 入口注入，不能交给 LLM 生成。
        for draft in drafts:
            draft.source = source
            draft.memory_at = memory_at

        # 3. 两层 reconcile 的模型决策（只检索 + 调 LLM，不落库）
        # 4. 两层决策都成功后才落库：经验层 apply → 事实层 apply
        #
        # 先把所有模型决策做完再写库，任何一层的决策失败（LLM 失败 / 空回复 /
        # 解析不出 → CodingWriteError(RECONCILE_FAILED)）都发生在落库之前，本次
        # 写入一条经验 / 事实都没存、也没覆盖旧事实，换个 request_id 重跑即干净。
        # 两层决策互不依赖（各自检索各自的候选），提前做不改变结果。
        #
        # 向量化失败抛 CodingWriteError(EMBEDDING_FAILED)：不落没有向量的节点，
        # 整次写入报失败。
        facts: List[WorkingFact] = []
        fact_ops: List[FactReconcileOp] = []
        ops: List[ReconcileOp] = []
        try:
            experience_plan = (
                await self.reconciler.plan(
                    drafts,
                    request_id=request_id,
                    user_id=user_id,
                    agent_id=agent_id,
                    session_id=session_id or "",
                    language=language,
                )
                if drafts else None
            )
            fact_plan = (
                await self.fact_reconciler.plan(
                    fact_drafts,
                    user_id=user_id,
                    agent_id=agent_id,
                    session_id=session_id,
                    workspace_id=workspace_id,
                    branch=branch,
                    source=source,
                    memory_at=memory_at,
                    language=language,
                )
                if fact_drafts else None
            )
            if experience_plan is not None:
                ops = await self.reconciler.apply(experience_plan)
            if fact_plan is not None:
                facts, fact_ops = await self.fact_reconciler.apply(fact_plan)
        except CodingWriteError as e:
            return self._failure_response(request_id, t0, e)

        experience_ids = [op.target_experience_id for op in ops
                          if op.action in ("ADD", "UPDATE") and op.target_experience_id]
        fact_ids = [f.fact_id for f in facts]

        # 5. 同批全互链
        await self._crosslink(experience_ids, facts, user_id=user_id)
        await self._append_trace(current_messages, **trace_kwargs)

        add_cnt = sum(1 for op in ops if op.action == "ADD")
        update_cnt = sum(1 for op in ops if op.action == "UPDATE")
        delete_cnt = sum(1 for op in ops if op.action == "DELETE")
        skip_cnt = sum(1 for op in ops if op.action == "SKIP")
        ops_summary = {
            "add": add_cnt,
            "update": update_cnt,
            "delete": delete_cnt,
            "skip": skip_cnt,
            "total": add_cnt + update_cnt + delete_cnt + skip_cnt,
        }
        insert_cnt = sum(1 for op in fact_ops if op.action == "INSERT")
        supersede_cnt = sum(1 for op in fact_ops if op.action == "SUPERSEDE")

        return {
            "success": True,
            "scene": "productivity",
            "variant": self.variant,
            "request_id": request_id,
            "elapsed_ms": round((time.perf_counter() - t0) * 1000, 2),
            "ops": [op.to_dict() for op in ops],
            "ops_summary": ops_summary,
            "experience_ids": experience_ids,
            "fact_ops": [op.to_dict() for op in fact_ops],
            "fact_ops_summary": {
                "insert": insert_cnt,
                "supersede": supersede_cnt,
                "total": insert_cnt + supersede_cnt,
            },
            "fact_ids": fact_ids,
        }
```

### `CodingWriter._crosslink`

- **原始文件**：`hy_memory/coding/writer.py`
- **原始行号**：L288–L329
- **固定版本链接**：https://github.com/Tencent-Hunyuan/Hy-Memory/blob/d8138b501a755f662a024f7e8eb879613eabf1d3/hy_memory/coding/writer.py#L288-L329

以下代码未改写；省略号若存在也是源码自身内容，并非整理时省略。

```python
    async def _crosslink(
        self,
        experience_ids: List[str],
        facts: List[WorkingFact],
        *,
        user_id: str,
    ) -> None:
        """把同一批落库的经验与事实两两连起来。

        只连真入库的：经验取 ADD/UPDATE 的 id，事实取真正 INSERT 的；SKIP 和
        DELETE 天然不在名单里。两边都取并集——UPDATE 的旧链要保留，事实那边可能
        已经从 SUPERSEDE 过继来一批经验，不能覆盖掉。
        """
        if not experience_ids and not facts:
            return
        fact_ids = [f.fact_id for f in facts]

        # 正向：经验 ← 事实
        if fact_ids:
            for eid in experience_ids:
                try:
                    exp = await self.store.get_by_id(eid, user_id=user_id)
                    if exp is None:
                        continue
                    merged = _union(exp.source_fact_ids, fact_ids)
                    if merged != list(exp.source_fact_ids):
                        await self.store.set_experience_source_facts(eid, merged)
                except Exception as e:
                    logger.warning(f"[coding-write] crosslink experience {eid} failed: {e}")

        # 反向：事实 ← 经验
        if experience_ids:
            for f in facts:
                try:
                    merged = _union(f.derived_experience_ids, experience_ids)
                    if merged != list(f.derived_experience_ids):
                        await self.store.set_fact_derived_experiences(f.fact_id, merged)
                        f.derived_experience_ids = merged
                except Exception as e:
                    logger.warning(
                        f"[coding-write] crosslink fact {f.fact_id} failed: {e}"
                    )
```

### `CodingWriter._failure_response`

- **原始文件**：`hy_memory/coding/writer.py`
- **原始行号**：L338–L364
- **固定版本链接**：https://github.com/Tencent-Hunyuan/Hy-Memory/blob/d8138b501a755f662a024f7e8eb879613eabf1d3/hy_memory/coding/writer.py#L338-L364

以下代码未改写；省略号若存在也是源码自身内容，并非整理时省略。

```python
    def _failure_response(
        self, request_id: str, t0: float, error: CodingWriteError,
    ) -> Dict[str, Any]:
        """模型 / 向量化失败：success=False，稳定失败码在 agent_error_code。

        形状与 chat 链路的失败回执一致（error_code=502，error_message 带
        「[CODE] 」前缀），调用方据 success 判定并重跑。
        """
        code = error.error_code
        cause = getattr(error, "cause", None)
        message = f"{cause}: {error}" if cause else str(error)
        logger.warning(
            f"[coding-write] failed: code={code} request_id={request_id}: {message}"
        )
        resp = self._empty_response(request_id, t0)
        resp.update({
            "success": False,
            "error_code": 502,
            "error_message": f"[{code}] {message}",
            "agent_status": "failed",
            "agent_error_code": code,
            "agent_error": message,
        })
        if cause:
            # 与 chat 链路一致：reconcile 失败的具体原因
            resp["reconcile_error_code"] = cause
        return resp
```

### `hy_memory/coding/chain_store.py`：真实 Diff 采集与检索装饰

### `HyCodeMem.observe`

- **原始文件**：`hy_memory/coding/chain_store.py`
- **原始行号**：L180–L228
- **固定版本链接**：https://github.com/Tencent-Hunyuan/Hy-Memory/blob/d8138b501a755f662a024f7e8eb879613eabf1d3/hy_memory/coding/chain_store.py#L180-L228

以下代码未改写；省略号若存在也是源码自身内容，并非整理时省略。

```python
    def observe(self, mem_text, meta=None):
        """agent 每改完一轮调一次。零 LLM、零 embedding。

        meta 可给 branch / file / commit / kind / key / seg —— 都是可选的加速项:
        branch 给了就不猜, commit 给了就不反查。全不给也能跑。
        """
        meta = meta or {}
        text = mem_text or ""
        if not text.strip():
            return 0
        if not self._pass_gate(text, meta):
            return 0

        branch = meta.get("branch") or self._guess_branch(text)
        patch = self._get_patch(text, meta)
        if not patch:
            return 0
        said = self._get_said(text)

        with self._repository.transaction():
            n = 0
            # 同一轮的所有 hunk 共用一个时间, 且只有它们之间才允许合并成一版:
            # 跨轮但用户原话相同(said 相等)是两次独立的修改, 必须各记一版。
            round_at = self._round_time(meta)
            seen = set()
            for file, symbol, lo, hi, hunk in self._split_hunks(patch):
                if meta.get("file") and file != meta["file"] and not meta.get("_multi"):
                    pass  # meta.file 只是提示, 不做过滤 —— 一轮可能真的改了多个文件
                # 合成 diff(_patch_from_edits)的行号是假的(真实行号无从得知, 一律写 1)。
                # 直接交给 _upsert_thread 会因"区间不重叠"给同一个符号另起一条链 ——
                # 合成 diff 的行号不可信，因此按 symbol 归并。pkey 还必须进入 thread 键，
                # 否则同一文件/符号上的多个独立决策点会串成一条链，版本序数失去语义。
                tid = self._upsert_thread(branch, file, symbol, lo, hi,
                                          by_symbol=_SYNTH_MARK in hunk,
                                          pkey=meta.get("pkey") or "")
                self._add_round(tid, said, hunk, at=round_at, same_round=tid in seen)
                seen.add(tid)
                # body: 这一轮改完后那段代码的完整样子(含未被改动的行)。每轮覆写 →
                # 灌完留下的是**最后一版**的全文, 正是 _body_at 需要的那一版。
                # 取不到就不动(老 body 保留 / 一直为空), 绝不因为它失败而丢掉这一轮。
                if self.BODY_CTX > 0 and _SYNTH_MARK not in hunk:
                    # 合成 diff 的行号是假的(一律写 1), 拿它取上下文会取到文件头 —— 跳过。
                    _c = meta.get("commit") or self._commit_for(
                        str(meta.get("key") or meta.get("pkey") or ""), meta.get("seg"))
                    _b = self._body_at(_c, file, lo, hi)
                    if _b:
                        self._repository.set_body(tid, _b)
                n += 1
        return n
```

### `HyCodeMem._patch_from_edits`

- **原始文件**：`hy_memory/coding/chain_store.py`
- **原始行号**：L286–L323
- **固定版本链接**：https://github.com/Tencent-Hunyuan/Hy-Memory/blob/d8138b501a755f662a024f7e8eb879613eabf1d3/hy_memory/coding/chain_store.py#L286-L323

以下代码未改写；省略号若存在也是源码自身内容，并非整理时省略。

```python
    def _patch_from_edits(self, text):
        """从对话里 agent 的"写文件"动作合成一段 diff。

        为什么需要这条路: git 反查会落空。很多轮次的 commit 是空的 —— agent 明明写了文件,
        但改动没进那一轮的 commit(例如后续的 `git checkout` 把未提交的改动冲掉)。
        这些轮次一律 observe→0, 于是 thread/round 建不起来, 链上会缺版本, 注入块可能
        只剩错误的旧版。

        能救回的: 空 commit 轮次里常见的是 `old='''…''' new='''…'''` 这种 Python 替换
        或带 `REPLACED=` 的同类变体, old/new 两段代码都在对话里, 信息
        其实比 git diff 更全(连"从什么改成什么"都有)。剩下 sed -i / cat heredoc / 纯口头
        确认那些抽不出来, 不猜 —— 抽错比抽不到更坏。

        合成的 diff 只求能过 _split_hunks: 行号给 1(真实行号无从得知, 而 thread 按
        symbol+区间分链, 同一符号的多版仍会并到一条链上), 符号名放进 @@ 后面的上下文位
        让 _SYM 能抓到。
        """
        out = []
        for m in _EDIT_PY.finditer(text or ""):
            path, old, new = m.group("path"), m.group("old"), m.group("new")
            if not path or old is None or new is None or old == new:
                continue
            if self._edit_failed(text, m.end()):
                continue
            sym = ""
            sm = _SYM.search(new) or _SYM.search(old)
            if sm:
                sym = sm.group(0)          # 整个 "func Xxx" 片段, 让 _SYM 在 @@ 上下文里再抓一次
            else:
                # old/new 片段常是函数**中段**, 抓不到函数头 → 从整段文本里找它所属的函数
                seg = text[:m.start()]
                cands = list(_SYM.finditer(seg))
                sym = cands[-1].group(0) if cands else ""
            ol, nl = old.splitlines(), new.splitlines()
            body = "".join(f"-{x}\n" for x in ol) + "".join(f"+{x}\n" for x in nl)
            out.append(f"diff --git a/{path} b/{path}\n--- a/{path}\n+++ b/{path}\n"
                       f"@@ -1,{max(1,len(ol))} +1,{max(1,len(nl))} @@ {sym} {_SYNTH_MARK}\n{body}")
        return "".join(out)
```

### `HyCodeMem._patch_from_git`

- **原始文件**：`hy_memory/coding/chain_store.py`
- **原始行号**：L353–L364
- **固定版本链接**：https://github.com/Tencent-Hunyuan/Hy-Memory/blob/d8138b501a755f662a024f7e8eb879613eabf1d3/hy_memory/coding/chain_store.py#L353-L364

以下代码未改写；省略号若存在也是源码自身内容，并非整理时省略。

```python
    def _patch_from_git(self, meta):
        """按 commit message 反查那一轮的提交。

        宿主每轮改完会提交一次, message 里带该轮的标识(key/seg)。给了 commit 就直接用。
        """
        c = meta.get("commit")
        if not c:
            key, seg = meta.get("key") or meta.get("pkey"), meta.get("seg")
            if not key:
                return ""
            c = self._commit_for(str(key), seg)
        return self._git("show", "--format=", "--unified=3", c) if c else ""
```

### `HyCodeMem.decorate`

- **原始文件**：`hy_memory/coding/chain_store.py`
- **原始行号**：L504–L544
- **固定版本链接**：https://github.com/Tencent-Hunyuan/Hy-Memory/blob/d8138b501a755f662a024f7e8eb879613eabf1d3/hy_memory/coding/chain_store.py#L504-L544

以下代码未改写；省略号若存在也是源码自身内容，并非整理时省略。

```python
    def decorate(self, facts, instruction="", scope=None):
        """核心接口: 给向量层选出的 facts 挂上 round。

        facts: [{"statement": str, "branch": str, "files": [str], "status": str}, ...]
                顺序 = 向量层给的顺序, 不重排(它的 top-k 是它的事)。
        scope: 可选的**同仓过滤**。给了就只挂 branch/文件路径属于这个 scope 的 thread。
        返回   (block, used_idx):
                block    = 要放在 bullet 列表**之前**的多行结构块(挂不上任何 round 时为 "")
                used_idx  = 已挂进 block 的 fact 下标; 宿主应把这些从 bullet 列表里去掉,
                            避免同一条 fact 出现两次。

        scope 用于防止共享索引中的跨仓污染。不同仓的语义相似事实可能同时进入
        top-k，但它们的 diff 对当前工作区不可能有用，因此挂链前必须做同仓过滤。
        """
        facts = facts or []
        # 高级消融开关: HCM_BLOCK_OFF=1 → 完全不出块, 也不从 bullet 删任何 fact。
        # 公共 opt-in 见 CodingConfig.chain_block_enabled /
        # MEMORY_CODING_CHAIN_BLOCK_ENABLED（默认关；客户端在调用 decorate 前拦截）。
        if os.environ.get("HCM_BLOCK_OFF") == "1":
            return "", []
        picked, used = [], []
        seen_tid = set()
        for i, fa in enumerate(facts):
            # 只给前 TOPN_FACTS 条**成功挂上链**的 fact 出块; 其余 fact 不挂链, 照常留在
            # bullet 列表(信息不丢, 只是不带 diff)。块大小近似线性于挂链 fact 数，
            # 因此必须限制数量以控制上下文长度。
            if TOPN_FACTS > 0 and len(picked) >= TOPN_FACTS:
                break
            th = self._threads_for(fa, scope=scope)
            if scope:
                th = [t for t in th if self._in_scope(t, scope)]
            th = [t for t in th if t[0] not in seen_tid]
            th = self._rank_threads(th, instruction)
            if not th:
                continue
            seen_tid.update(t[0] for t in th)
            picked.append((fa, th))
            used.append(i)
        if not picked:
            return "", []
        return self._render(picked, instruction), used
```

## 第三部分：`docs/usage.md` 原文

- **固定版本链接**：https://github.com/Tencent-Hunyuan/Hy-Memory/blob/d8138b501a755f662a024f7e8eb879613eabf1d3/docs/usage.md
- **SHA-256**：`defe0aaeabd471da742fe10a77ef0b3669e51749a8972e5e380937825e050272`

# Hy Memory 使用指南

本文只描述当前 `HyMemoryClient` 已公开的方法和返回结构。

## 安装与快速开始

```bash
pip install hy-memory==2.0.4

# 可选后端
pip install 'hy-memory[qdrant]==2.0.4'
pip install 'hy-memory[faiss]==2.0.4'
pip install 'hy-memory[graph]==2.0.4'     # Neo4j；Kuzu 已在核心依赖中
pip install 'hy-memory[mysql]==2.0.4'
pip install 'hy-memory[rerank]==2.0.4'    # 本地多语言 cross-encoder rerank
```

默认 LLM 和 Embedding 均使用 OpenAI-compatible 接口。使用 OpenAI 时可只设置：

```bash
export OPENAI_API_KEY="sk-your-key"
```

```python
from hy_memory import HyMemoryClient

with HyMemoryClient(mode="pro") as client:
    client.add(
        "用户喜欢科幻电影，特别是《星际穿越》",
        user_id="user_001",
    )
    result = client.search(
        "用户喜欢什么？",
        user_ids=["user_001"],
    )
    for channel, memories in result["memories"].items():
        for memory in memories:
            print(channel, memory["score"], memory["content"])
```

## 业务存储

Working / Coding 业务数据默认使用 SQLite，也支持 PostgreSQL；向量配置独立。安装、部署和切换边界见 [业务存储后端](business_storage.md)。

## 配置

SDK 会加载项目目录中的 `.env`。完整配置见 [env_reference.md](env_reference.md)。

```bash
MEMORY_MODE=pro
MEMORY_LLM_MODEL=deepseek-chat
MEMORY_LLM_API_KEY=sk-your-key
MEMORY_LLM_BASE_URL=https://api.deepseek.com
MEMORY_EMBEDDER_MODEL=text-embedding-v4
MEMORY_EMBEDDER_API_KEY=sk-your-key
MEMORY_EMBEDDER_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
MEMORY_EMBEDDING_DIMS=1024
```

也可以使用当前公开的 `from_config()`：

```python
client = HyMemoryClient.from_config({
    "mode": "pro",
    "llm": {
        "model": "deepseek-chat",
        "api_key": "sk-xxx",
        "base_url": "https://api.deepseek.com",
    },
    "embedder": {
        "model": "text-embedding-v4",
        "api_key": "sk-xxx",
        "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "embedding_dims": 1024,
    },
    "vector_store": {
        "provider": "chroma",
        "embedding_dims": 1024,
    },
})
```

通过 `from_config()` 配置时，Embedder 与 Vector Store 的维度是两个独立字段，必须保持
一致；环境变量方式则统一使用 `MEMORY_EMBEDDING_DIMS`。

支持的向量后端为 `chroma`、`qdrant`、`faiss`。Graph 后端通常使用
`kuzu` 或 `neo4j`。

## Client API

同步和异步方法使用相同参数。异步方法以 `async_` 为前缀。

### `add()` / `async_add()`

```python
result = client.add(
    [
        {"role": "user", "content": "推荐一部电影"},
        {"role": "assistant", "content": "推荐《星际穿越》"},
    ],
    user_id="user_001",
    agent_id="default_agent",
    session_id="default_session",
    source="openclaw",
    scene=None,
    memory_at=None,
    metadata=None,
    meta=None,
    embed_override=None,
    language=None,
)
```

`metadata` 与 `meta` 不是同一字段：

- `metadata` 是兼容旧调用方保留的 SDK 处理选项，会进入内部
  `WriteRequest.extra`，不保证持久化或随查询结果返回。
- `meta` 是调用方的业务上下文，会持久化并在 `search()`、`get()` 等结果中返回。
  同一记忆被多次合并时，各次 `meta` 会按写入顺序保存在列表中。

需要以后读回的数据必须放在 `meta`，不要放在 `metadata`。

`scene` 的公开取值：

- `None`：普通文本直接走 chat；messages 含 tool 时执行快速场景判断。
- `chat`：强制走普通记忆链路。
- `working`：强制走生产力记忆链路。
- `coding`：强制走软件工程变体，并维护版本演进链。

强制 `working` / `coding` 时输入必须含 tool 消息，否则回退 chat。普通 chat 写入返回
`success`、`scene`、`memory_id`、`request_id`、`elapsed_ms` 等字段；生产力链路返回其
双层 reconcile 操作、`experience_ids`、`fact_ids` 等字段，完整结构见
[scene_coding_usage.md](scene_coding_usage.md#4-返回结构)。

写入失败时 `success=False`，`error_code` 为 HTTP 风格的整数，`agent_error_code` 给出稳定
失败码。pro / ultra 的 reconcile（新事实与已有记忆判重、合并）模型调用失败、返回空
content 或回复解析不出时，`add` 与 `add_extracted` 都报 `agent_error_code="RECONCILE_FAILED"`，
具体原因在 `reconcile_error_code`（`LLM_UNAVAILABLE` / `EMPTY_RESPONSE` /
`JSON_PARSE_FAILED` / `RECONCILE_EXCEPTION`）。此时本次一条新记忆都不落库，`add` 已写入
的原始对话按抽取失败同样回滚（`l1_rollback.retry_safe=True`）；模型恢复后换一个
`request_id` 重跑即可。`RECONCILE_ENABLED=false` 时不调用 reconcile，直接写入。

`mode="lite"` 不执行 LLM 抽取，写入内容直接以 `L1_RAW` 形式保存。lite 的 Search 是
严格的 raw-only 向量检索：无论调用方传入什么 `layers`、`scene` 或 `search_mode`，都只
召回 `L1_RAW`，不会进入 working/coding、Schema 或 Intention 链路，也不会调用场景判断
LLM。pro / ultra 仍遵循各自的层级与场景参数，默认不公开原始对话。

`source` 是调用方应用来源，例如 `openclaw`、`cursor`、`codex`。它与 `agent_id`
正交：前者说明“从哪个产品/入口写入”，后者仍是记忆隔离中的 agent 身份。source 会
执行 `strip().lower()` 后存储，并随 chat、working、coding 记忆一起返回。

### 提示词语言（`language`）

SDK 的 LLM 提示词提供 11 种语言，按语言码注册在 `hy_memory/prompts/`
（每种语言一个模块，`get_prompt(name, language)` 统一取用）：

| 语言码 | 语言 | 别名 |
|---|---|---|
| `en` | English | `en-US`、`en-GB` |
| `zh-Hans` | 简体中文 | `zh`、`zh-CN`、`zh-SG` |
| `zh-Hant` | 繁體中文 | `zh-TW`、`zh-HK`、`zh-MO` |
| `ja` | 日本語 | |
| `es` | Español | |
| `de` | Deutsch | |
| `pt` | Português | `pt-BR`、`pt-PT` |
| `fr` | Français | |
| `ko` | 한국어 | |
| `ru` | Русский | |
| `id` | Bahasa Indonesia | |

语言码大小写不敏感，`_` 与 `-` 等价；未知语言码抛 `ValueError` 并列出支持的语言码。

```python
# client 默认值（也可用环境变量 MEMORY_LANGUAGE=ja）
client = HyMemoryClient.from_config({"mode": "pro", "language": "ja"})

# per-call 覆盖 client 默认值
client.add(messages, user_id="u1", language="de")
client.add_extracted(["Der Nutzer trinkt keinen Kaffee."], user_id="u1", language="de")
client.finalize_session(user_id="u1", session_id="s1", language="de")
client.evolve(user_id="u1", language="de")   # ultra
client.sweep(user_ids=["u1"], language="de")  # ultra
```

优先级：per-call `language` > `MemoryConfig.language`（`MEMORY_LANGUAGE`）> 自动检测。

- **未指定语言（默认）**：行为与以前完全一致。SDK 按输入做 zh/en 自动检测，中文输入用
  简体中文提示词，其余用英文提示词；自动检测不会选到其他语言。提示词里的「输出语言与
  输入语言一致」规则仍然生效，所以记忆正文保持对话的原始语言。
- **显式指定语言**：本次请求的全部 LLM 调用（抽取、基础画像、reconcile、working /
  coding 链路的抽取与两个 reconciler 及演变总结、episode / topic 摘要、System 2）都使用
  该语言的提示词，并在提示词末尾追加该语言的「输出语言」规则：记忆正文、摘要等自然语言
  字段一律用该语言书写，即使对话是另一种语言。JSON 键、字段名、枚举值、代码、路径、
  报错信息和专有名词保持原样；tags 仍是英文小写关键词。
- 只有英文版的提示词（session / dynamic episode、cross-domain sweeper）在显式指定语言时
  同样追加该输出规则；搜索侧的场景判断 / query rewrite 只有英文版且保持 query 原语言，
  因此 `search()` 不接受 `language`。
- 自定义 `extract_system_prompt_zh` / `extract_system_prompt_en` 只覆盖 `zh-Hans` / `en`。

### `search()` / `async_search()`

普通 chat 检索：

```python
result = client.search(
    query="用户喜欢什么？",
    user_ids=["user_001"],
    agent_ids=None,
    session_ids=None,
    include_sources=["openclaw", "codex"],
    exclude_sources=["cursor"],
    limit=10,
    min_score=0.4,
    schema_limit=10,
    schema_min_score=0.4,
    intention_limit=0,
    reader="",                  # HY_MEMORY_READER；默认 legacy
    layers=None,
    created_after=None,
    search_mode="default",
)
```

source 过滤语义为：

```text
source IN include_sources AND source NOT IN exclude_sources
```

任一列表为空时省略对应条件；两者冲突时黑名单优先。Chroma/Qdrant/Graph 会在数据库
候选截断前执行过滤，FAISS 使用 ID selector 在索引搜索前限定候选，不采用多路召回或
扩大 top-k 后过滤。多来源证据派生出的聚合记忆标记为 `mixed`；开启任意 source 过滤
时默认排除 `mixed`，只有显式将 `mixed` 放入白名单才返回。

chat 成功路径返回：

```python
{
    "request_id": "...",
    "memories": {
        "normal": [],      # L2/L3 普通记忆；L4/L5 当前未启用
        "schema": [],      # L6 Schema
        "proactive": [],   # L7 Intention；默认关闭
    },
    "rewrite": {
        "used": False,
        "original_query": "用户喜欢什么？",
        "effective_query": "用户喜欢什么？",
        "created_after": None,
        "scene": "normal",
    },
    "elapsed_ms": 12.3,
}
```

Reader 执行失败时返回空的 `memories` 三桶和 `request_id` / `elapsed_ms`；当前失败兜底不
包含 `rewrite`。

L0 用户画像不在 Search 中。`schema_limit` 只控制 L6，不会被 L0 占位。

Search 也可以路由到独立生产力记忆库：

```python
result = client.search(
    "这个异常最后是怎么修复的？",
    user_ids=["user_001"],
    scene="coding",
    workspace_id="repo-id",
    branch="main",
)
```

`working` / `coding` 路径返回 `scene="productivity"`、`facts`、`experiences`，不使用
chat 的三桶结构；`coding` 还会返回 `chain_block` 和 `chain_used` 字段（默认空；
需 `MEMORY_CODING_CHAIN_BLOCK_ENABLED=true` 才注入 diff 块）。

#### `search_mode`

| `search_mode` | `scene` | 行为 |
|---|---|---|
| `default` | `None` + 单个 `query` | 固定 chat/normal，零 LLM |
| `default` | `None` + `queries=[...]` | 行为由 Coding 与 Query Rewrite 开关共同决定，见下表 |
| `agentic` | `None` + 单/多 query | 一次 LLM 完成场景判断、改写和时间解析 |
| 任意 | 显式 `chat/working/coding` | 直接路由，不调用 judge/rewrite LLM |

`query` 与 `queries` 二选一；`queries` 最后一项是目标 query，前面的项用于上下文消解。
LLM 或解析失败时回退到 chat/normal 和原 query。

default 多-query 在总字符数不超过 `MEMORY_QUERY_REWRITE_MAX_CHARS` 时：

| `MEMORY_CODING_ENABLED` | `MEMORY_ENABLE_QUERY_REWRITE` | 行为 |
|---|---|---|
| `true` | 任意 | 一次 LLM 完成 `chat / working / coding` 分类和 query rewrite |
| `false` | `true` | 一次 LLM 完成 rewrite 与时间解析，不做场景分类 |
| `false` | `false` | 零 LLM，固定 chat/normal，使用最后一条 query |

超过长度保护时不做 rewrite；Coding 开启时只执行有界场景分类，关闭时零 LLM。

### `get_user_profile()` / `async_get_user_profile()`

用户画像只由 `user_id` 唯一确定，不接收 `agent_id` 或 `session_id`：

```python
result = client.get_user_profile(user_id="user_001")
profile = result["profile"]
```

```python
{
    "request_id": "...",
    "profile": {
        "memory_id": "...",
        "user_id": "user_001",
        "content": "...",
        "layer": "l0_basic_info",
        "basic_info": {"name": "Alice"},
        "catalog": {"attached": False},
        "supplement": {"attached": False},
        "tags": [],
        "memory_at": 1234567890,
        "gmt_created": 1234567890,
    },
    "elapsed_ms": 1.2,
}
```

不存在 L0 且没有可附加的 balanced catalog 时，`profile` 为 `None`。该接口不调用
Embedding 或 LLM。启用对应开关后，active catalog 和 supplement 会附加到同一画像；
catalog 也可以在没有基础 L0 时形成只读的合成画像。

### CRUD、列表与克隆

以下均为当前公开方法：

```python
memory = client.get("memory_id")
# raw ID 返回 L1_RAW，fact ID 返回对应事实层。
raw_memory = client.get("raw_id")
result = client.update("memory_id", "更新后的内容")
result = client.delete("memory_id")
result = client.delete_all(user_id="user_001")

page = client.list_memories(
    user_id="user_001",
    limit=100,
    offset=0,
    order="desc",
    layers=["l1_raw"],  # 显式列出 raw；不传仍沿用默认语义层列表
    with_evolution=False,
)

result = client.clone_user("user_001", "user_002", agent_id=None)

# 备份 / 恢复：按原 id 与向量导出、写回一个用户（向量库全部层级与状态，含 raw）
exported = client.export_user_memories("user_001")
restored = other_client.import_user_memories("user_001", exported["nodes"])
```

启用图写入时，`update()` 和 `async_update()` 会在返回前同步已有 chat 图节点的正文。
这项编辑保留节点的标签和已有关系边，不创建新的图节点。图写入失败时，返回的
`success` 仍表示向量库已保存，并附加 `graph_sync_failed: true` 表明图可能仍是旧内容。

对应异步方法为 `async_get()`、`async_update()`、`async_delete()`、
`async_delete_all()`、`async_list_memories()`、`async_clone_user()`、
`async_export_user_memories()`、`async_import_user_memories()`。

`export_user_memories()` 返回该用户向量库里的每个节点（`MemoryNode.to_dict()`，
默认带 `embedding`），每个层级（含 `L1_RAW`）、每种状态（含 superseded / shadow），
并给出 `embedding_dims` 与 `embedding_model`。`import_user_memories()` 把这些节点
原样写回：保留 `node_id`、层级、状态、演化链指针与时间；带向量的按原向量写入
（宽度必须与目标向量库一致），不带的用当前 embedding 服务重算。目标用户默认
必须为空，写入失败会回滚。两者都不碰图库：图是派生数据，恢复后用
`build_memory_graph()` 重建。Chroma、Qdrant、FAISS 后端都适用。

Qdrant BM25 schema/backfill 是显式维护操作，不在普通初始化时修改远程数据：

```python
plan = client.plan_qdrant_bm25_upgrade()  # 只读；不会加载或下载模型

# 仅在所有写入者均已停止的维护窗口执行。
if plan["state"] == "upgrade_required":
    result = client.upgrade_qdrant_bm25(
        writers_stopped=True,
        batch_size=256,
    )
```

升级使用 Qdrant 1.18+ 原生 named sparse vector 与 IDF modifier，只回填派生的
`bm25` vector；不会改 dense vector、用户 payload 字段或 point id。Qdrant 服务端过旧、
FastEmbed 不可用或覆盖校验失败时返回结构化 `blocked`/失败状态，不删除 collection。
空文本或零 token 文档不写 sparse，而是在同一 Qdrant point 中写 SDK 私有派生
payload 状态 `_hy_memory_bm25_state=empty`，用于明确记录 coverage；不会引入
可搜索 sentinel、外部索引或旁路状态。返回值中的 `schema_ready`、`reader_enabled` 和
`resumable` 分别说明 schema、读取开关和可重跑状态。

实例内锁只防止同一 `HyMemoryClient` 重复执行升级，不是跨进程停写锁；
`writers_stopped=True` 是调用方对整个部署维护窗口的承诺。此 API 仅属于
Hy Memory SDK 2.0.17；普通启动和 MemHub 桌面 Runtime/CLI 都不会自动执行，
MemHub 的 SDK pin、离线 FastEmbed 资源和维护入口将在后续独立接入。
对应异步方法为 `async_plan_qdrant_bm25_upgrade()` 和
`async_upgrade_qdrant_bm25()`。

`get()` / `async_get()` 是统一的 ID 精确读取：返回结果的 `layer`、`kind` 和
`variant` 表明实际类型。授权由调用 SDK 前的产品边界完成，不由 SDK 根据 layer
猜测。`list_memories()` 默认仍不包含 `L1_RAW`；显式传
`layers=["l1_raw"]` 时按同一列表合同返回 raw。

普通 `list_memories()` 返回 `vdb` 桶，并在 Graph 有结果时附带 `graph`；传入
`workspace_id` 时返回生产力记忆的 `scene="productivity"` 和 `experiences`。

### `evolve()` / `async_evolve()`（Ultra）

System 2 不在 `add()` 中自动触发，当前也没有 `get_write_status()` 接口。调用方完成一批
写入后显式执行：

```python
result = client.evolve(
    user_id="user_001",
    agent_id="default_agent",
)
```

`evolve()` 仅允许 `mode="ultra"`；同步方法阻塞到本次认知加工完成。它读取当前 VDB
全量，生成或更新 L6 Schema，并执行配置允许的 System 2 处理。

### 其他当前公开方法

- `finalize_session()` / `async_finalize_session()`：在功能开关开启时归档指定 session。
- `get_user_basic_info()` / `async_get_user_basic_info()`：读取 L0 basic info 记录。
- `sweep()` / `async_sweep()`：Ultra 下显式执行 cross-domain sweeper。
- `get_metrics()` / `async_get_metrics()`：读取 SDK 指标。
- `build_memory_graph()` / `async_build_memory_graph()`：回填普通记忆关系图。
- `build_entity_store()` / `async_build_entity_store()`：回填独立 Entity Store。
- `history()` / `async_history()`、`get_recent_history()` / `async_get_recent_history()`。

## Embedding 端点覆盖

`add()` / `async_add()` / `search()` / `async_search()` 支持 per-call
`embed_override`：

```python
override = {
    "base_url": "http://embedding-host:8000/v1",
    "api_key": "sk-xxx",
    "extra_headers": {"X-Route": "direct"},
    "timeout": 15,
}
client.add("用户喜欢篮球", user_id="u1", embed_override=override)
client.search("兴趣爱好", user_ids=["u1"], embed_override=override)
```

它只覆盖接入端点，不覆盖 model、维度或 `extra_body`。新端点必须运行与已入库数据兼容的
Embedding 模型。

## 数据隔离与处理模式

普通记忆使用 `user_id → agent_id → session_id` 三层作用域。Search 必须传非空
`user_ids`；不传 `agent_ids` / `session_ids` 时可跨对应维度检索。

用户画像是例外：L0、balanced catalog 和 specific supplement 从生成到读取都只由
`user_id` 唯一确定。

- `lite`：原文向量化，不调用提取 LLM。
- `pro`：Embedding + LLM 提取 + reconcile；Graph 可通过 `MEMORY_ENABLE_GRAPH` 开启。
- `ultra`：具备 pro 能力并强制启用 Graph；System 2 由调用方显式调用 `evolve()`。

Reader、Rerank 和 Search 参数详见 [hy_memory_search_skill.md](hy_memory_search_skill.md)。

## 第四部分：`docs/scene_coding_usage.md` 原文

- **固定版本链接**：https://github.com/Tencent-Hunyuan/Hy-Memory/blob/d8138b501a755f662a024f7e8eb879613eabf1d3/docs/scene_coding_usage.md
- **SHA-256**：`d8d8feb0dd2bf8953ab2f88df39c9ea63964eff161a3fc2bf95ad277cf94a775`

# Working 与 Coding 场景

Hy Memory 的公开 `scene` 参数支持三个值：

| `scene` | 用途 | 存储与检索路径 |
|---|---|---|
| `"chat"` | 闲聊、个人事实、一般问答 | 通用 memory pipeline |
| `"working"` | 文档、办公、研究、财经、内容创作和电脑操作等生产力任务 | working 双层 memory |
| `"coding"` | 编码、调试、测试、构建、API/SDK、脚本、SQL 等软件工程任务 | coding 双层 memory，并附带版本演进链 |

working 与 coding 复用同一套生产力 pipeline 结构和数据 schema，但使用不同的抽取规范、业务存储命名空间和向量集合，数据不会混在一起。业务存储默认 SQLite，也可配置 PostgreSQL，详见[业务存储后端](business_storage.md)。

## 1. 写入路由

### 显式指定 scene

生产力写入需要包含 tool message 或 assistant `tool_calls`：

```python
from hy_memory import HyMemoryClient

client = HyMemoryClient(mode="pro")

messages = [
    {"role": "user", "content": "Fix the timeout in the search client."},
    {
        "role": "assistant",
        "content": "",
        "tool_calls": [
            {
                "id": "call_1",
                "type": "function",
                "function": {
                    "name": "apply_patch",
                    "arguments": '{"path":"src/search.py"}'
                },
            }
        ],
    },
    {
        "role": "tool",
        "tool_call_id": "call_1",
        "name": "apply_patch",
        "content": "Patch applied successfully",
    },
]

result = client.add(
    messages,
    scene="coding",
    user_id="user_123",
    workspace_id="github.com/example/service",
    branch="fix/search-timeout",
)
```

公开行为：

- `scene="chat"`：跳过 scene judge；tool 轨迹会被移除后进入 chat pipeline。
- `scene="working"`：跳过 scene judge，进入 working pipeline。
- `scene="coding"`：跳过 scene judge，进入 coding pipeline，并尝试记录版本演进链。
- 显式 `working/coding` 但输入没有 tool/tool_calls：当前实现会回退 chat pipeline。
- 非法 scene 会抛出 `ValueError`。

### 不指定 scene

`scene=None` 时：

- 输入没有 tool/tool_calls：直接进入 chat pipeline，不调用 scene judge LLM。
- 输入包含 tool/tool_calls：使用 user query 与工具名的有界摘要进行一次 `chat / working / coding` 三分类。
- judge 失败或输出无法解析：回退 chat。
- 判定为 chat 后，tool 轨迹会被移除再进入 chat pipeline。

分类边界：

- `coding`：代码或开发产物是工作对象或实现媒介，包括源码、脚本、SQL、notebook、测试、构建、编译/运行错误、API/SDK 和代码评审。
- `working`：存在明确生产力操作或交付物，但代码不是核心工作媒介，例如文档、PPT、表格、翻译、财经/业务分析、研究报告、邮件日程、项目管理、设计、文件整理、软件安装和设备操作。
- `chat`：闲聊、个人信息、建议和一般事实问答。仅使用 search/browser 工具不会自动变成 working。

## 2. 搜索路由

显式传 `scene` 会直接选择对应检索路径，不调用 judge/rewrite LLM：

```python
result = client.search(
    "Which timeout implementation was finally kept?",
    scene="coding",
    user_ids=["user_123"],
    workspace_id="github.com/example/service",
    branch="fix/search-timeout",
    limit=5,
)
```

默认与 agentic 行为：

| 调用方式 | 当前行为 |
|---|---|
| `search(query="...", search_mode="default")` | 固定走 chat/normal light search，零 LLM |
| `search(queries=[...], search_mode="default")` | Coding 开启时分类并 rewrite；仅 Query Rewrite 开启时只 rewrite/time；两者关闭时零 LLM |
| `search(query="...", search_mode="agentic")` | LLM 三分类、query rewrite 和时间范围解析 |
| `search(queries=[...], search_mode="agentic")` | 同上，前置 query 作为上下文 |
| 任意模式显式传 `scene` | scene 优先，零 judge/rewrite LLM |

`search_mode="agentic"` 使用有界 query 视图，单 query 与多 query 都会走 judge/rewrite。`search_mode="default"` 的单 query 保证不调用该 LLM。

default 多-query 超过 `MEMORY_QUERY_REWRITE_MAX_CHARS` 时不改写；Coding 开启时仍做有界
场景分类，关闭时直接使用最后一条 query。

若 coding 功能被 `MEMORY_CODING_ENABLED=false` 关闭，生产力搜索会安全回退 chat/normal 检索。

## 3. Extractor 输入窗口

working/coding extractor 将输入分成：

- `LAST 5 USER TURNS`：之前 write 的历史，只用于指代消解和上下文，不重复抽取。
- `NEW MESSAGES`：本次 `add()` 传入的全部消息，全部作为抽取主体，不受 last-5 裁剪。

当前压缩规则：

- tool result 默认最大 `2048` bytes，保留头尾并省略中段；由 `MEMORY_CODING_TOOL_RESULT_MAX_BYTES` 配置。
- 单条 assistant 文本超过 `6000` 字符时，默认保留前 `3000` 和后 `3000` 字符。
- 历史按 user-turn 窗口裁剪；一个 user-turn 包含该 user 消息以及下一条 user 消息前的 assistant/tool 消息。
- `MEMORY_EXTRACT_HISTORY_TURNS` 控制 store 回读多少历史，默认 5；当前 extractor 最终最多注入最近 5 个 user-turn，因此大于 5 的配置不会扩大 prompt 中的历史窗口。

例如本次写入包含 10 个 user-turn 时，10 个 turn 都进入 `NEW MESSAGES`；历史区另外最多提供最近 5 个 user-turn。

working/coding 的 Extractor、经验 Reconcile、事实 Reconcile 与跨 session 进展总结均有
中英文模板。路由优先检查本次新输入前 10 个有效语言字符；Extractor 只看本次 NEW user
messages，不使用历史或 tool result 决定语言。中文开头后接大量代码、路径或错误信息时仍走
中文模板；英文开头后面偶尔出现中文术语时保持英文模板。

## 4. 返回结构

working/coding 写入返回双层结果：

```python
{
    "success": True,
    "scene": "productivity",
    "request_id": "...",
    "ops": [...],
    "ops_summary": {...},
    "experience_ids": [...],
    "fact_ops": [...],
    "fact_ops_summary": {...},
    "fact_ids": [...],
    "memory_id": "..." or None,
    "elapsed_ms": 123.4,
}
```

抽取 LLM 调用失败、返回空 content 或回复解析不出 JSON，以及经验 / 事实向量化失败时，
写入返回 `success=False`、`error_code=502`，`agent_error_code` 依次为 `LLM_ERROR`、
`EMPTY_RESPONSE`、`JSON_PARSE_FAILED`、`EMBEDDING_FAILED`，`error_message` 以
`[CODE]` 开头；没有向量的经验 / 事实不会落库，失败的写入也不追加对话 trace，换一个
`request_id` 重跑即可。模型正常作答但没有值得记的内容仍是 `success=True`、0 条。
显式开启 `MEMORY_CODING_VERBATIM_FALLBACK_ENABLED` 时抽取失败沿用原文兜底。

经验层 / 事实层 reconcile 的模型决策同样不再兜底：LLM 调用失败、返回空 content 或回复
不是带 `ops` 列表的 JSON 对象时，写入返回 `success=False`、
`agent_error_code="RECONCILE_FAILED"`，原因在 `reconcile_error_code`（`LLM_UNAVAILABLE` /
`EMPTY_RESPONSE` / `JSON_PARSE_FAILED`，与 chat 链路一致）。两层的模型决策都在落库之前
完成，任何一层失败时本次一条经验 / 事实都不存，旧事实也不会被覆盖。经验层回复
`{"ops": []}` 表示「无需任何操作」，写入成功、经验层不存；`ops` 非空却没有一条可识别的
op 视为解析失败。事实层回复 `{"ops": []}` 表示都不覆盖、照常插入新事实；没有候选时不
调用 LLM。

`scene="coding"` 还会返回 `chain_rounds`（写入失败时不记录演进链，也不返回该字段）。出于历史兼容，该字段当前统计本次识别并处理
的 diff hunk 数，而不保证等于最终合并后的唯一演进 round 数。`0` 表示没有识别到可记录
的代码修改，不代表双层 memory 写入失败。

working/coding 搜索返回：

```python
{
    "request_id": "...",
    "scene": "productivity",
    "facts": [...],
    "experiences": [...],
    "elapsed_ms": 123.4,
}
```

`limit` 分别限制 facts 与 experiences，因此两层最多各返回 `limit` 条。

`scene="coding"` 额外返回 `chain_block` 和 `chain_used` 字段（键始终存在；默认内容为空）：

- 注入 diff / 版本演进块需显式开启 `MEMORY_CODING_CHAIN_BLOCK_ENABLED=true`
  （或 `CodingConfig.chain_block_enabled=True`）。默认关闭，以节约 prompt token。
- 开启后，`chain_block` 是与已召回 fact 对齐的版本演进上下文；无法挂链时为 `""`。
- `chain_used` 是已经进入 chain block 的 `facts` 下标。
- SDK 不会从 `facts` 删除这些条目。调用方若要拼成“chain block + 剩余 facts”，需自行按 `chain_used` 过滤。

## 5. 存储与作用域

默认本地文件：

```text
<coding db directory>/
├── coding_memory.db          # working 经验/事实 metadata
├── coding_memory_cv.db       # coding 经验/事实 metadata
├── coding_memory_trace.db    # working/coding 共用的历史消息
└── hy_code_chain/
    └── hy_code.db            # coding 版本演进链
```

向量集合：

| 变体 | 经验层 | 事实层 |
|---|---|---|
| working | `{base}_coding_keys` | `{base}_working_facts` |
| coding | `{base}_coding_keys_cv` | `{base}_working_facts_cv` |

同一个 client 可以交替使用 working 与 coding；实现会按变体分别缓存 writer/store。

`workspace_id` 与 `branch` 用于生产力 memory 的作用域：

- 不传 `workspace_id`：不按 workspace 过滤。
- 传 `workspace_id`：精确匹配该 workspace。
- `branch` 只有在同时传 `workspace_id` 时生效。
- branch 过滤会保留 `branch IS NULL` 的历史数据，避免未记录分支的通用经验被误删。

建议写入和搜索使用相同的规范化 `workspace_id`。版本链的 owner 由 `user_id` 与 `workspace_id` 共同构成，避免不同用户或仓库的 patch 串链。

## 6. Coding 版本演进链

版本演进链由 `hy_memory/coding/chain_store.py` 实现。它不调用 LLM 或 embedding，而是从以下来源识别修改：

- 设置 `MEMORY_CODING_CHAIN_REPO_ROOT` 后，从本地 Git 工作区或变更中读取 diff。
- 从工具轨迹中识别带 path、old、new 的确定性替换动作。

无法可靠解析的编辑形式会被跳过。链层是 best-effort：记录失败不会阻断 working/coding 的双层 memory 写入或检索。

## 7. 配置

| 变量 | 默认值 | 作用 |
|---|---|---|
| `MEMORY_CODING_ENABLED` | `true` | 启用 working/coding pipeline |
| `MEMORY_CODING_DB_PATH` | `{DATA_DIR}/data/coding_memory.db` | working 基础 SQLite 路径；coding/trace 路径由此派生 |
| `MEMORY_CODING_TOOL_RESULT_MAX_BYTES` | `2048` | 单条 tool result 的字节上限 |
| `MEMORY_CODING_VERBATIM_FALLBACK_ENABLED` | `false` | 模型无结果时是否保存原文 fact；默认关闭，避免 assistant/tool trace 直接展示 |
| `MEMORY_CODING_CHAIN_BLOCK_ENABLED` | `false` | search 是否注入版本演进链块（`chain_block` / diff）；默认关闭（opt-in） |
| `MEMORY_EXTRACT_HISTORY_TURNS` | `5` | 回读的历史 user-turn 数；当前 prompt 最终最多使用 5 |
| `MEMORY_CODING_CHAIN_REPO_ROOT` | 空 | coding 版本链读取本地 Git diff 的仓库路径 |

`HCM_*` 变量属于版本链的高级调优项，不是稳定的公共配置契约；普通接入不应依赖其默认值。
其中 `HCM_BLOCK_OFF=1` 可在已开启 `MEMORY_CODING_CHAIN_BLOCK_ENABLED` 时做消融（完全不出块）。

## 8. 定向验证

```bash
python -m pytest -q \
  tests/coding/test_write_scene_routing.py \
  tests/coding/test_search_scene_routing.py \
  tests/coding/test_scene_coding_variant.py \
  tests/coding/test_scene_coding_search.py \
  tests/coding/test_coding_pipeline_log.py
```

## 附录：LICENSE 原文

- **固定版本链接**：https://github.com/Tencent-Hunyuan/Hy-Memory/blob/d8138b501a755f662a024f7e8eb879613eabf1d3/LICENSE
- **SHA-256**：`cb0bf7a8bfb3d8ad32ef3f4223820ca977fa78b78828459ec30af335fb2b60dd`

```text
Tencent is pleased to support the community by making Hy-Memory available.

Copyright (C) 2026 Tencent. All rights reserved.

Hy-Memory is licensed under Apache-2.0. Hy-Memory does not impose any additional restrictions beyond those specified in the license.

For the avoidance of doubt, Hy-Memory refers solely to code, parameters, and weights made publicly available by Tencent in accordance with Apache-2.0.

Terms of the Apache-2.0 License:
--------------------------------------------------------------------
Apache License
Version 2.0, January 2004
http://www.apache.org/licenses/

TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

1. Definitions.

"License" shall mean the terms and conditions for use, reproduction, and distribution as defined by Sections 1 through 9 of this document.

"Licensor" shall mean the copyright owner or entity authorized by the copyright owner that is granting the License.

"Legal Entity" shall mean the union of the acting entity and all other entities that control, are controlled by, or are under common control with that entity. For the purposes of this definition, "control" means (i) the power, direct or indirect, to cause the direction or management of such entity, whether by contract or otherwise, or (ii) ownership of fifty percent (50%) or more of the outstanding shares, or (iii) beneficial ownership of such entity.

"You" (or "Your") shall mean an individual or Legal Entity exercising permissions granted by this License.

"Source" form shall mean the preferred form for making modifications, including but not limited to software source code, documentation source, and configuration files.

"Object" form shall mean any form resulting from mechanical transformation or translation of a Source form, including but not limited to compiled object code, generated documentation, and conversions to other media types.

"Work" shall mean the work of authorship, whether in Source or Object form, made available under the License, as indicated by a copyright notice that is included in or attached to the work (an example is provided in the Appendix below).

"Derivative Works" shall mean any work, whether in Source or Object form, that is based on (or derived from) the Work and for which the editorial revisions, annotations, elaborations, or other modifications represent, as a whole, an original work of authorship. For the purposes of this License, Derivative Works shall not include works that remain separable from, or merely link (or bind by name) to the interfaces of, the Work and Derivative Works thereof.

"Contribution" shall mean any work of authorship, including the original version of the Work and any modifications or additions to that Work or Derivative Works thereof, that is intentionally submitted to Licensor for inclusion in the Work by the copyright owner or by an individual or Legal Entity authorized to submit on behalf of the copyright owner. For the purposes of this definition, "submitted" means any form of electronic, verbal, or written communication sent to the Licensor or its representatives, including but not limited to communication on electronic mailing lists, source code control systems, and issue tracking systems that are managed by, or on behalf of, the Licensor for the purpose of discussing and improving the Work, but excluding communication that is conspicuously marked or otherwise designated in writing by the copyright owner as "Not a Contribution."

"Contributor" shall mean Licensor and any individual or Legal Entity on behalf of whom a Contribution has been received by Licensor and subsequently incorporated within the Work.

2. Grant of Copyright License. Subject to the terms and conditions of this License, each Contributor hereby grants to You a perpetual, worldwide, non-exclusive, no-charge, royalty-free, irrevocable copyright license to reproduce, prepare Derivative Works of, publicly display, publicly perform, sublicense, and distribute the Work and such Derivative Works in Source or Object form.

3. Grant of Patent License. Subject to the terms and conditions of this License, each Contributor hereby grants to You a perpetual, worldwide, non-exclusive, no-charge, royalty-free, irrevocable (except as stated in this section) patent license to make, have made, use, offer to sell, sell, import, and otherwise transfer the Work, where such license applies only to those patent claims licensable by such Contributor that are necessarily infringed by their Contribution(s) alone or by combination of their Contribution(s) with the Work to which such Contribution(s) was submitted. If You institute patent litigation against any entity (including a cross-claim or counterclaim in a lawsuit) alleging that the Work or a Contribution incorporated within the Work constitutes direct or contributory patent infringement, then any patent licenses granted to You under this License for that Work shall terminate as of the date such litigation is filed.

4. Redistribution. You may reproduce and distribute copies of the Work or Derivative Works thereof in any medium, with or without modifications, and in Source or Object form, provided that You meet the following conditions:

You must give any other recipients of the Work or Derivative Works a copy of this License; and
You must cause any modified files to carry prominent notices stating that You changed the files; and
You must retain, in the Source form of any Derivative Works that You distribute, all copyright, patent, trademark, and attribution notices from the Source form of the Work, excluding those notices that do not pertain to any part of the Derivative Works; and
If the Work includes a "NOTICE" text file as part of its distribution, then any Derivative Works that You distribute must include a readable copy of the attribution notices contained within such NOTICE file, excluding those notices that do not pertain to any part of the Derivative Works, in at least one of the following places: within a NOTICE text file distributed as part of the Derivative Works; within the Source form or documentation, if provided along with the Derivative Works; or, within a display generated by the Derivative Works, if and wherever such third-party notices normally appear. The contents of the NOTICE file are for informational purposes only and do not modify the License. You may add Your own attribution notices within Derivative Works that You distribute, alongside or as an addendum to the NOTICE text from the Work, provided that such additional attribution notices cannot be construed as modifying the License.
You may add Your own copyright statement to Your modifications and may provide additional or different license terms and conditions for use, reproduction, or distribution of Your modifications, or for any such Derivative Works as a whole, provided Your use, reproduction, and distribution of the Work otherwise complies with the conditions stated in this License.

5. Submission of Contributions. Unless You explicitly state otherwise, any Contribution intentionally submitted for inclusion in the Work by You to the Licensor shall be under the terms and conditions of this License, without any additional terms or conditions. Notwithstanding the above, nothing herein shall supersede or modify the terms of any separate license agreement you may have executed with Licensor regarding such Contributions.

6. Trademarks. This License does not grant permission to use the trade names, trademarks, service marks, or product names of the Licensor, except as required for reasonable and customary use in describing the origin of the Work and reproducing the content of the NOTICE file.

7. Disclaimer of Warranty. Unless required by applicable law or agreed to in writing, Licensor provides the Work (and each Contributor provides its Contributions) on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied, including, without limitation, any warranties or conditions of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A PARTICULAR PURPOSE. You are solely responsible for determining the appropriateness of using or redistributing the Work and assume any risks associated with Your exercise of permissions under this License.

8. Limitation of Liability. In no event and under no legal theory, whether in tort (including negligence), contract, or otherwise, unless required by applicable law (such as deliberate and grossly negligent acts) or agreed to in writing, shall any Contributor be liable to You for damages, including any direct, indirect, special, incidental, or consequential damages of any character arising as a result of this License or out of the use or inability to use the Work (including but not limited to damages for loss of goodwill, work stoppage, computer failure or malfunction, or any and all other commercial damages or losses), even if such Contributor has been advised of the possibility of such damages.

9. Accepting Warranty or Additional Liability. While redistributing the Work or Derivative Works thereof, You may choose to offer, and charge a fee for, acceptance of support, warranty, indemnity, or other liability obligations and/or rights consistent with this License. However, in accepting such obligations, You may act only on Your own behalf and on Your sole responsibility, not on behalf of any other Contributor, and only if You agree to indemnify, defend, and hold each Contributor harmless for any liability incurred by, or claims asserted against, such Contributor by reason of your accepting any such warranty or additional liability.

END OF TERMS AND CONDITIONS
```
