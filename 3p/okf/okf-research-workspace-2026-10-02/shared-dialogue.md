## user

分析okf这个项目如何对领域知识的处理，这个项目的动机是为了从agent层面解决领域知识不足的问题吗，并且比较下wren AI的做法，分析两者的重叠度。以及从这些项目里分析哪些信息是可以持久化和对agent消费起来友好的，如果要设计多agent的消息通信和串联，有哪些启发

## assistant

## 结论先行

我对两者的定位是：

> **OKF 是“领域知识的可移植源代码格式”；Wren AI 是“面向数据 Agent 的领域上下文运行时”。**

OKF 解决的是：领域知识散落在数据库元数据、文档、网页和人的经验中，缺少一种人和 Agent 都能读写、可用 Git 管理、能跨工具交换的统一载体。

Wren AI 解决得更进一步：不仅把知识写下来，还要让 Agent 在查询时检索正确知识、限制可用对象、复用批准过的定义与 Join，并在执行前规划、校验和报错。

所以，对“是否从 Agent 层面解决领域知识不足”这个问题：

- **OKF：是，但主要停留在知识表示与交换层。**
- **Wren AI：是，而且覆盖到了检索、推理约束、执行和反馈沉淀层。**
- 两者并非同类产品。它们更像可以上下组合，而不是相互替代。

---

# 一、OKF 实际怎样处理领域知识

## 1. OKF 的核心不是 Agent，而是知识中间格式

OKF v0.1 将知识定义为围绕数据和系统的“元数据、上下文与经过整理的洞察”，用一个 Markdown 目录表示知识包，每份 Markdown 带 YAML frontmatter。它明确希望这些知识可以由人编写、由 Agent 生成、跨组织交换，再由人和 Agent 共同消费。citeturn782539view0

一个 OKF Bundle 大致是：

```text
domain_bundle/
├── index.md
├── log.md
├── concepts/
│   ├── entity-a.md
│   └── metric-b.md
├── tables/
│   └── orders.md
├── playbooks/
│   └── incident-response.md
└── references/
    └── authoritative-doc.md
```

这里最重要的设计不是 Markdown 本身，而是三个约束：

1. **一个概念一份文档**
2. **路径就是稳定的 Concept ID**
3. **概念之间通过链接形成知识图**

一个概念既可以是数据库表、API，也可以是指标、业务流程、Playbook 或抽象业务术语。citeturn782539view0

这与传统 RAG 的“把文档切成若干 chunk”不同。OKF 更接近：

> 先把知识整理成有语义边界的概念，再由检索系统决定如何索引它。

而不是：

> 先按照 token 长度切片，再希望模型从相邻文本中恢复语义边界。

---

## 2. 它把领域知识分成了结构化外壳和自然语言主体

OKF 的 frontmatter 只强制要求 `type`，推荐使用：

```yaml
---
type: Metric
title: Monthly Active User
description: Number of active non-service-account users in a calendar month.
resource: ...
tags: [engagement, user]
timestamp: 2026-07-01T00:00:00Z
---
```

其余内容放在 Markdown 正文中，包括 Schema、Examples、Citations 等。生产者可以自由增加字段，消费者应该容忍未知字段。citeturn782539view0

这种处理方式对 Agent 很友好，因为：

- frontmatter 适合做过滤、路由、索引和权限判断；
- Markdown 正文适合 LLM 阅读；
- 标题、表格、列表、代码块可以保留领域知识的结构；
- Agent 不需要专用 SDK 就能理解内容；
- 文件可直接 diff、review、版本化。

项目也明确强调，结构化字段用于查询和索引，自然语言正文用于承载 Schema、解释、示例和实际供人或 LLM 阅读的知识。citeturn635917view0

---

## 3. OKF 的参考 Agent 是一个“知识编译器”

OKF 项目的参考实现采用两阶段：

```text
BigQuery metadata
       ↓
结构抽取 Pass
       ↓
初始概念文档
       ↓
权威网页和文档
       ↓
Web enrichment Pass
       ↓
补充定义、指标、关系、引用和参考文档
```

第一阶段根据 BigQuery 元数据，为数据源暴露的每个概念生成一份 OKF 文档；第二阶段让 LLM 从明确提供的种子 URL 出发爬取权威资料，并决定：

- 丰富已有概念；
- 新建 `references/<slug>.md`；
- 或跳过无价值页面。

抓取范围还有页面数和允许域名约束。citeturn647870view0

以 GA4 示例为例，表概念中不仅有字段 Schema，还有：

- 表的用途说明；
- Event Count、User Count 等业务指标链接；
- 字段和嵌套结构解释；
- 业务查询相关知识；
- 外部来源引用。

每个指标又被拆成单独的概念文档，而不是全部塞进表文档或一个大 Prompt 中。citeturn635917view1turn635917view2

所以参考 Agent 的真正作用是：

> 将数据库结构和外部权威资料，编译成可供下游 Agent 渐进读取的领域知识包。

---

# 二、OKF 是否是为了从 Agent 层解决领域知识不足

## 是，但只解决了其中的一部分

“Agent 领域知识不足”其实至少包含五类不同问题：

| 问题 | 典型表现 | OKF 覆盖程度 |
|---|---|---:|
| 知识不存在 | 业务规则只在人脑里 | 部分覆盖，依赖人或 Enrichment Agent |
| 知识未结构化 | 文档、表结构、术语彼此割裂 | **主要解决** |
| 知识没有被正确检索 | Agent 找不到当前任务所需知识 | 不规定实现 |
| 知识没有转化为行为约束 | 知道正确 Join，但仍然乱 Join | 基本不解决 |
| 知识没有验证与更新机制 | 旧定义长期污染结果 | 仅通过 Git、引用和日志部分支持 |

OKF 的目标明确包括：定义 Enrichment Agent 可以写入的通用格式，并指导 Consumption Agent 如何读取和遍历知识。但它也明确将存储、服务、查询基础设施以及固定领域 Schema 列为非目标。citeturn782539view0

因此，更精确的说法是：

> **OKF 不是通过增强 Agent 推理能力来弥补领域知识，而是通过外部化、原子化和标准化领域上下文，减少 Agent 必须临场猜测的内容。**

这与“训练一个更懂行业的模型”完全不同，也与完整 RAG Runtime 不同。

OKF 自己不提供：

- 向量检索或重排序；
- Query Planning；
- 权限执行；
- 规则注入；
- 冲突消解；
- 事实有效期判断；
- 自动验证；
- 知识晋升流程；
- 多 Agent 编排。

项目 README 也明确表示，格式本身才是主要贡献，参考 Agent 和可视化器只是生产端与消费端的概念验证。citeturn635917view0

---

# 三、Wren AI 怎样处理领域知识

需要注意，当前 WrenAI 主线在 2026 年 5 月完成了项目整合，原有 Docker 化、Chat-first 的 GenBI 应用被保留到 `legacy/v1`；新的主线更强调面向 AI Agent 的 Open Context Engine。citeturn480606view0turn480606view1

## 1. Wren 对问题的判断比 OKF 更具体

Wren 的核心观点是：

> Agent 能看到数据库，不代表它理解业务。

数据库 Schema 可以告诉 Agent 有一个 `status` 字段，却不能告诉它：

- `status = 4` 表示退款；
- 哪张表是公司认可的 canonical table；
- “活跃用户”是否排除服务账号；
- 哪些 Join 是批准的；
- 哪些问题应该先要求用户澄清。

Wren 将这类失败视为“缺少上下文”，而不仅是模型不够聪明或 SQL 能力不足。citeturn480606view2

---

## 2. Wren 将领域上下文划分为五层

Wren 的上下文模型包括：

| 上下文层 | 内容 |
|---|---|
| Structural | 表、列、类型、主键、关系 |
| Semantic | 模型、指标、计算字段、枚举、canonical table |
| Business | 活跃客户、收入、流失、内部项目名等公司定义 |
| Operational | 批准的 Join、默认过滤、禁止计算、治理规则 |
| Behavioral | 成功的 NL→SQL、纠正、反馈与历史经验 |

citeturn480606view2

这很重要，因为它说明领域知识不应只理解为“术语解释和参考文档”。

在 Agent 系统里，领域知识还包括：

- 应该选哪个对象；
- 应该如何计算；
- 哪些操作允许；
- 应该先做什么后做什么；
- 哪些历史结果已经被验证过。

---

## 3. MDL 是可执行的领域语义契约

Wren 使用 MDL 描述：

- Models；
- Columns；
- Relationships；
- Calculated fields；
- Views；
- Cubes；
- 稳定的业务查询接口。

这些内容存放在可读、可版本化的 YAML 中，并被编译成引擎使用的 `target/mdl.json`。citeturn275997view0

MDL 和 OKF 最大的区别是：

> **OKF 中的知识主要是“描述性的”；MDL 中的部分知识是“可执行的”。**

例如：

- OKF 可以写“orders 应通过 customer_id 与 customers 连接”；
- Wren 的 MDL 可以把该 Relationship 定义为可被规划引擎实际展开的 Join；
- OKF 可以写“收入不含退款订单”；
- Wren 可以在 Dry Plan 阶段注入规则或使用批准的计算字段；
- OKF 可以引用某个指标定义；
- Wren 可以让 Agent 只能通过已建模的指标和列生成查询。

Wren 明确将 MDL 定义为数据团队、Agent 和查询引擎之间的 contract，而不仅是给 Prompt 阅读的文档。citeturn275997view0

---

## 4. Wren 将持久知识和检索索引分开

Wren 当前设计中，持久化真源包括：

```text
MDL YAML
knowledge/rules/
knowledge/sql/*.md
```

其中：

- MDL 保存结构、语义和关系；
- `knowledge/rules/` 保存业务规则、术语、默认过滤、表选择规则和 Caveat；
- `knowledge/sql/*.md` 保存经过确认的自然语言—SQL 对。

LanceDB 或 grep 只是建立在这些文件上的检索层。`.wren/memory/` 是可重新生成、可丢弃的派生索引，不是真源。citeturn275997view1

这是一个很值得借鉴的观点：

> **向量数据库不应该是知识的唯一持久化载体；它应当是由可读、可审查源文件重建出的缓存。**

---

## 5. Wren 不只“给知识”，还约束 Agent 的执行过程

它的典型流程是：

```text
用户问题
   ↓
Recall 已验证的相似问题
   ↓
Fetch 当前任务相关 Schema / Rule
   ↓
Agent 基于 MDL 写查询
   ↓
Dry Plan / Dry Run
   ↓
数据库执行
   ↓
人工或规则确认
   ↓
将成功 NL→SQL 写入知识文件
```

Wren 使用 Skill 规定 Agent 必须先检索、再建模查询、再 Dry Plan、再执行、最后保存已确认结果；MDL 限制可见对象；规划阶段提前暴露错误；连接器承担实际方言、权限和执行检查。citeturn275997view2turn635917view3

所以 Wren 不是“领域文档 RAG”，而更接近：

> 领域知识 + 语义编译器 + 检索记忆 + 确定性校验工具 + Agent 操作规程。

---

# 四、OKF 与 Wren AI 的重叠度

## 功能对比

| 维度 | OKF | Wren AI | 重叠判断 |
|---|---|---|---|
| 核心问题 | 知识缺少统一、开放、Agent-friendly 的表示 | Agent 不理解业务语义且会错误执行 | 高 |
| 目标领域 | 通用，可表示数据、API、流程、Playbook 等 | 以业务数据、BI、Text-to-SQL 为核心 | 中 |
| 基础载体 | Markdown + YAML frontmatter | MDL YAML + Markdown Rules/Memory | 高 |
| 知识单元 | 任意 Concept | Model、Column、Relationship、Rule、NL-SQL 等 | 中高 |
| 人类可读与 Git 管理 | 核心目标 | 核心目标 | 高 |
| 概念关系 | Markdown 链接，关系语义主要在正文中 | MDL 中明确、可执行的 Relationship | 中低 |
| 外部知识丰富 | 参考 Agent 从元数据和网页生成 | Enrichment Skill 从数据库和原始资料补充 | 中高 |
| 渐进式上下文加载 | `index.md` 导航 | Memory Fetch / Recall | 中 |
| 检索系统 | 不规定 | grep 或 LanceDB | 低 |
| 可执行语义 | 没有 | SQL 规划与语义展开 | 很低 |
| 验证与错误恢复 | 不规定 | Dry Plan、Dry Run、结构化错误、重试 | 很低 |
| 经验记忆 | 可自行扩展 | 明确保存已确认 NL→SQL | 中低 |
| Agent 工作流 | 只说明生产和消费方向 | Skill 明确规定操作顺序 | 低 |

## 我的重叠度判断

这不是项目官方指标，而是基于上述能力做的分析性估计：

- **问题意识重叠：约 70%–80%**
- **持久化表示重叠：约 50%–60%**
- **知识抽取与丰富重叠：约 40%–50%**
- **运行时检索、约束与执行重叠：约 15%–25%**
- **作为完整产品的综合重叠：约 35%–45%**

更准确地说：

```text
OKF
└── 知识源文件与交换协议

Wren AI
├── 领域知识源文件
├── 领域语义模型
├── 检索与行为记忆
├── Agent Skill
├── SQL Planner
├── Validator
└── Execution Runtime
```

所以 Wren 覆盖了类似 OKF 的一部分理念，但加入了强领域 Schema 和执行引擎；OKF 则比 Wren 更通用、更轻、更适合跨不同 Agent 和领域交换。

---

# 五、哪些信息值得持久化，而且对 Agent 消费友好

结合两者，我建议把持久化内容分成六类，而不是笼统地叫“知识库”。

## 1. 领域概念与术语

包括：

- 标准术语；
- 别名、黑话和缩写；
- 正式定义；
- 适用范围；
- 容易混淆的概念；
- 正例与反例；
- 所属子领域。

例如半导体领域：

```yaml
---
id: etch/ar-de
type: domain_term
title: ARDE
aliases:
  - Aspect Ratio Dependent Etching
domain: semiconductor/etch
status: approved
---
```

这种内容适合 OKF 式“一概念一文件”。

---

## 2. 对象、属性和关系

包括：

- 数据实体；
- 表和列；
- 工艺步骤；
- 设备、腔体、Recipe；
- 上下游依赖；
- Join；
- 输入输出；
- 单位和数据粒度。

关系最好不要只写在正文里。

OKF v0.1 中，链接本身是无类型的，`depends-on`、`joins-with`、`supports` 等语义依赖周围文字，由消费端通常构造成无类型有向边。citeturn782539view0

这对通用交换足够，但对多 Agent 执行不够。建议扩展为：

```yaml
relationships:
  - type: depends_on
    target: process/hard-mask-open
  - type: measured_by
    target: metrics/bottom-cd
  - type: constrained_by
    target: constraints/max-temperature
```

---

## 3. 业务或领域规则

这是最容易被普通 RAG 忽略、却最能影响结果的一类：

- canonical source；
- 默认过滤条件；
- 指标公式；
- 合法枚举值；
- 禁止组合；
- 适用前提；
- 失效条件；
- 权限和合规限制；
- 什么时候必须澄清用户。

规则应包含：

```yaml
status: approved
owner: process-integration-team
valid_from: 2026-01-01
valid_to: null
scope:
  products: [MCH]
  tools: [ETCH-A]
confidence: authoritative
```

否则 Agent 只知道“有一条规则”，却不知道它对当前产品、设备和时间是否适用。

---

## 4. 可复用程序与操作流程

例如：

- 数据清洗 SOP；
- DOE 设计步骤；
- 故障排查 Playbook；
- SQL 查询流程；
- 工具使用前提；
- 验证和停止条件。

这类内容最好分为两部分：

```text
知识描述：为什么做、何时做、成功标准是什么
确定性实现：scripts、SQL、API、validator
```

不要让 Markdown 中的自然语言规则代替真正需要确定执行的脚本。

Wren 中 MDL、Skill 和 Planner 的分层正好说明：

- Skill 负责“该按什么顺序做”；
- MDL 负责“哪些对象和关系合法”；
- Engine 负责“怎样确定性执行”。

---

## 5. 经过验证的案例

可以持久化：

- 已确认的用户问题；
- 采用的领域解释；
- 实际调用的数据与工具；
- 最终 Query 或参数；
- 验证结果；
- 适用条件；
- 失败案例和修正方式。

不应该只保存“最终回答文本”，因为回答可能只对当时上下文成立。

更好的案例格式是：

```yaml
---
type: validated_case
status: accepted
question: ...
scope: ...
used_concepts:
  - metrics/etch-rate
  - constraints/selectivity
evidence:
  - runs/run-103/measurement.csv
validation:
  method: historical-backtest
  result: passed
---
```

Wren 保存确认过的 NL→SQL，而不是自动将所有历史对话都视为知识，其原则是“保存被证明有效的行为”。citeturn275997view1

---

## 6. 来源、证据和知识谱系

每个重要知识单元最好带有：

- 原始来源；
- 来源位置；
- 抽取时间；
- 抽取方式；
- 作者或责任人；
- 当前状态；
- 前一版本；
- 替代或废弃关系；
- 事实与推断的区分。

尤其建议明确区分：

```yaml
epistemic_status: fact | inference | hypothesis | recommendation
```

这是多 Agent 场景中非常重要的字段。

否则第一个 Agent 推测出的东西，经过三次转述后，很容易被第四个 Agent 当成事实。

---

# 六、哪些信息不应该直接晋升为长期知识

不建议直接持久化为领域真源的内容包括：

- 原始 Chain of Thought；
- 每次工具尝试的全部日志；
- 未验证的临时假设；
- 用户随口提出但未确认的定义；
- 单次任务中的临时路径和句柄；
- 失败重试产生的大量相似输出；
- 模型自己总结、但没有来源的“经验”。

这些内容可以保存在 Run Trace 中，但不能自动进入领域知识层。

我建议使用一个明确的知识晋升流程：

```text
Runtime observation
       ↓
Candidate knowledge
       ↓
Evidence check
       ↓
Conflict detection
       ↓
Human / deterministic validation
       ↓
Approved durable knowledge
       ↓
Rebuild retrieval index
```

这比“每次会话结束后让模型自动写 Memory”更安全。

一个非共识但重要的判断是：

> **Agent 越会自动总结，越需要限制它自动修改长期知识。**

因为高质量表达并不等于事实已被验证。

---

# 七、对多 Agent 消息通信的启发

## 1. 不要把多 Agent 通信设计成角色之间互相聊天

最常见但不理想的模式是：

```text
专家 Agent 说一段话
→ 分析 Agent 再总结一次
→ Reviewer Agent 再复述一次
→ 主 Agent 根据复述生成答案
```

这种设计会产生：

- 上下文重复；
- 事实逐层失真；
- 推断被包装成事实；
- 每个 Agent 都在自圆其说；
- 无法定位某个结论的原始证据；
- 很难做局部重跑。

更合理的模式是：

> **消息只负责传递控制信息，文件或 Artifact 负责承载完整知识。**

即：

```text
Control Plane: task、status、artifact refs、acceptance criteria
Data Plane:   concept docs、datasets、reports、queries、evidence、validation
```

---

## 2. Agent 之间传“引用”，而不是传整个上下文

一个消息 Envelope 可以是：

```yaml
message_version: "1.0"
task_id: etch-analysis-20260720-001
message_id: msg-005
parent_message_id: msg-003

producer: domain-mapper
consumer: mechanism-analyst
intent: analyze

artifacts:
  - ref: domain/terms/arde.md
    version: 7
    required: true
  - ref: process/current-recipe.yaml
    version: 3
    required: true
  - ref: evidence/sem-image-summary.md
    version: 1

constraints:
  - Do not infer chamber condition without sensor evidence.
  - Distinguish mechanism hypothesis from measured fact.

expected_output:
  type: mechanism_hypothesis_set
  schema: schemas/mechanism-hypothesis.schema.json

acceptance_criteria:
  - Each hypothesis has supporting and contradicting evidence.
  - Unknowns are explicitly listed.

deadline_policy: fail_fast
idempotency_key: mechanism-analysis-v3
```

消息中不需要复制所有知识正文。消费 Agent 根据 `artifact refs` 按需读取。

这就是 OKF 的 progressive disclosure 对多 Agent 的直接启发：先读索引和摘要，再打开当前任务真正需要的概念。OKF 的 `index.md` 就是为了让人或 Agent 不必一次加载整个 Bundle。citeturn782539view0turn635917view0

---

## 3. 把“事实、推断、决策、请求”分开

建议多 Agent 输出至少分为四个区：

```yaml
facts:
  - claim: ...
    evidence: ...

inferences:
  - claim: ...
    based_on: ...
    confidence: 0.72

decisions:
  - action: ...
    rationale: ...

open_questions:
  - question: ...
    blocking: true
```

这样 Validator 可以只验证 `facts` 和推断依据，而不是重新阅读一篇混合了事实与建议的长报告。

---

## 4. Agent 串联应当是一张 Artifact DAG

适合你的 Domain Mapping 场景的初步结构是：

```text
                    ┌──────────────────┐
                    │ Raw user request │
                    │ docs / data / log│
                    └────────┬─────────┘
                             ↓
                    ┌──────────────────┐
                    │ Domain Mapper    │
                    │ 上下文编译       │
                    └────────┬─────────┘
                             ↓
                 Domain Context Bundle
                  /        |          \
                 ↓         ↓           ↓
        Mechanism Agent  Data Agent  Literature Agent
                 \         |           /
                  \        |          /
                   ↓       ↓         ↓
                  Evidence Artifacts
                         ↓
                  Independent Validator
                         ↓
                     Synthesizer
                         ↓
                    Final Response
                         ↓
              Candidate Knowledge Patch
                         ↓
                 Knowledge Curator Gate
```

关键不是有多少角色，而是：

- 哪些任务需要上下文隔离；
- 哪些任务可以并行；
- 哪些产物可以独立验证；
- 哪些知识需要进入长期真源；
- 哪些只属于当前 Run。

这与你此前对 Multi-Agent 的判断一致：应该先基于模型局限和任务边界设计上下文隔离，再考虑角色模拟，而不是先虚构一套“数字组织”。

---

## 5. Validator 不应继承生产 Agent 的全部解释

若 Validator 直接阅读生产 Agent 的长篇推理，它很容易受到锚定影响。

更好的验证输入是：

```text
原始任务
+ 原始证据
+ 待验证 Claim 列表
+ 验收规则
```

而不是：

```text
生产 Agent 的完整思考和说服性叙述
```

验证 Agent 应独立重建证据到结论的路径。

这也是 Wren 的 `dry-plan` 思路带来的启发：不要再启动一个“审查角色”让它凭感觉评价；应给它一个可确定检查的中间表示和明确错误接口。Wren 将规划、验证、执行与结构化错误暴露成独立原语，而不是只依赖另一个 LLM 判断 SQL 看起来是否正确。citeturn275997view2turn635917view3

---

# 八、对你的 Domain Mapping Skill 的直接启发

你的 Domain Mapping Skill 很适合定位为：

> **面向通用 Agent 的领域上下文编译器。**

它不负责直接解决最终任务，而是把用户问题和现有资料编译成一个可供后续 Agent 消费的 Context Bundle。

## 推荐输出结构

```text
domain-context/
├── index.md
├── manifest.yaml
├── request/
│   ├── normalized-task.md
│   ├── assumptions.md
│   └── open-questions.md
├── concepts/
│   ├── terms/
│   ├── entities/
│   ├── metrics/
│   └── processes/
├── rules/
│   ├── constraints/
│   ├── policies/
│   └── decision-rules/
├── relationships/
│   └── edges.yaml
├── procedures/
│   ├── recommended-workflow.md
│   └── validation-plan.md
├── evidence/
│   ├── sources.yaml
│   └── extracted-facts.md
├── cases/
│   └── relevant-examples.md
└── routing/
    └── agent-context-map.yaml
```

其中：

- `concepts/` 借鉴 OKF；
- `relationships/edges.yaml` 补上 OKF 无类型关系的不足；
- `rules/` 借鉴 Wren 的 Knowledge Rules；
- `procedures/` 对应 Skill；
- `cases/` 对应 Wren 的行为记忆；
- `evidence/` 保证知识来源可追踪；
- `routing/agent-context-map.yaml` 明确每个下游 Agent 应读取哪些文件。

例如：

```yaml
agents:
  mechanism_agent:
    required:
      - concepts/processes/current-step.md
      - concepts/terms/plasma-chemistry.md
      - rules/constraints/process-window.md
    optional:
      - cases/similar-defect-cases.md

  data_agent:
    required:
      - concepts/metrics/*.md
      - rules/constraints/data-validity.md
    forbidden:
      - evidence/operator-personal-notes.md
```

这比让所有 Agent 共享整个知识包更稳，也更符合上下文隔离的目标。

---

# 九、我认为最值得吸收的几个原则

## 原则一：领域知识不是更多文本，而是更少的可猜空间

OKF 通过原子概念和引用减少模糊。

Wren 通过语义模型、批准关系、规则和执行验证进一步收窄 Agent 的自由度。

真正有效的领域知识系统不是让 Prompt 越来越长，而是让 Agent：

- 知道哪些对象可用；
- 哪些定义可信；
- 哪些关系合法；
- 哪些内容不确定；
- 哪些操作必须验证。

---

## 原则二：知识真源必须可读，索引必须可重建

推荐：

```text
Markdown / YAML / SQL / structured artifacts
                ↓
          Search / vector index
                ↓
             Agent
```

不推荐：

```text
Raw chat
   ↓
Embedding
   ↓
Vector DB becomes only source of truth
```

OKF 的文件式知识包和 Wren 的“`knowledge/` 是真源、LanceDB 是派生索引”都支持这一方向。citeturn635917view0turn275997view1

---

## 原则三：知识、规则、程序、记忆和运行状态要分层

不能把所有东西都放进同一套 RAG。

建议至少区分：

```text
Knowledge    什么是真的
Rules        什么适用于当前场景
Procedures   应该怎样做
Memory       什么过去被验证有效
Run State    当前任务进行到哪里
```

不同层有不同的更新、审核、检索和失效机制。

---

## 原则四：多 Agent 的核心通信对象应是 Artifact，不是 Message

Message 只应该说：

- 做什么；
- 读取什么；
- 输出到哪里；
- 验收标准是什么；
- 有什么未决问题。

完整内容通过有版本的 Artifact 传递。

---

## 原则五：不要用更多 Agent 弥补缺少领域上下文

缺少领域知识时，增加“领域专家 Agent”“审查 Agent”“反思 Agent”，往往只是让同一个基础模型在不同角色里重复猜测。

更有效的顺序是：

```text
先建立领域 Context Bundle
→ 再建立检索与作用域选择
→ 再建立确定性验证
→ 最后才判断是否需要上下文隔离的 Subagent
```

---

# 最终判断

OKF 和 Wren AI 共同反映了一个比较清晰的趋势：

> Agent 应用正在从“给模型塞 Prompt”，转向“建设可版本化的上下文基础设施”。

但两者处在不同层次：

```text
OKF   = 知识如何被写下、组织、链接和交换
Wren  = 知识如何被检索、约束、编译、验证和执行
```

对你当前要做的 Domain Mapping Skill 和多 Agent 框架，最合理的吸收方式不是二选一，而是：

```text
OKF-like portable context source
        +
Wren-like typed semantic contracts
        +
Disposable retrieval index
        +
Skill-defined procedures
        +
Artifact-based multi-agent DAG
        +
Independent validation and knowledge promotion
```

其中最关键的非共识点是：

> **未来多 Agent 系统的核心协议可能不是“Agent 如何互相对话”，而是“不同 Agent 如何共同读写一套有类型、有来源、有生命周期、可验证的上下文制品”。**