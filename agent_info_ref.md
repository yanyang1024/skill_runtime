
通过react swe 到openclaw codex的一个agent原理和context相关技术演化的教程素材信息如下:

```
**什么叫一个 Agent？**
**它为什么不只是“会调用几个工具的大模型”？**
**为什么从 ReActAgent 走到 SWE-agent，最后又会走到 OpenClaw、Codex 这种更重的运行时？**

---

# 从 ReActAgent 到 SWEAgent：一个 Agent 是怎么被“抽象”出来的

先给一句适合放在教程里的总定义：

**一个 Agent，不是一个模型，而是一个“带状态的决策循环”**。
它至少包含六个部分：**目标（Goal）**、**状态（State）**、**动作空间（Actions）**、**观察空间（Observations）**、**决策策略（Policy）**、**运行时（Runtime）**。

你可以把它想成一个“会工作的软件工人”：

* **目标**：这次要完成什么事
* **状态**：它现在知道什么，已经做到了哪一步
* **动作**：它能做什么，比如读文件、跑测试、改代码、查文档
* **观察**：动作做完之后，它看到了什么结果
* **策略**：下一步该做什么，由模型来决定
* **运行时**：谁负责排队、持久化、重试、压缩上下文、控制权限

真正的技术演进，就是把这六件事一点一点补齐。ReAct 把“决策循环”讲清楚了；Function Calling 把“动作接口”做结构化；SWE-agent 把“软件工程环境”变成专门的 ACI；OpenClaw、Codex 则把“会话、记忆、压缩、并行、多任务、后台执行”这些运行时问题做成了产品级系统。([arXiv][1])

## 1）ReActAgent：最小可用的 Agent 抽象

ReAct 这篇论文最重要的贡献，不是“让模型更聪明”，而是把 **Agent 的最小闭环** 讲明白了：
**Reasoning → Action → Observation → 再 Reasoning**。

论文原话是，ReAct 让模型以“交错”的方式生成 reasoning traces 和 task-specific actions；reasoning 帮助模型追踪和更新行动计划、处理异常，而 actions 让模型能够去访问外部环境拿信息。换句话说，ReAct 不是让模型坐在那儿想完再答，而是让它 **边想边做，边做边修正**。([arXiv][1])

这一步特别像一个刚入职的工程师在排障：

1. 先想一个假设：“可能是缓存没失效。”
2. 去做个动作：“跑测试 / 看日志 / grep 代码。”
3. 拿到观察：“不是缓存，是 payment retry 重复提交。”
4. 再修正假设：“那应该去查 idempotency key 的落盘逻辑。”
5. 再做动作。

所以，**ReActAgent 的本质不是“有思维链”，而是“有闭环”**。
它第一次把 agent 从“单次回答”变成了“多步试探式解决问题”的东西。([arXiv][1])

## 2）但 ReActAgent 还不够：因为“动作”太模糊

只靠 ReAct 的 Thought / Action / Observation 形式，模型虽然已经像 agent 了，但它的动作通常还是自然语言风格的，比如：

* “我去查一下测试”
* “我想打开这个文件”
* “我准备运行一下命令”

对真实软件系统来说，这种动作太松了。
后端没法靠“我去查一下”去执行事情，所以工程上下一步自然就是：**把动作做成结构化接口**。

---

# 从 ReAct 到 Function Calling：把“动作”做成可执行接口

OpenAI 的 Function Calling 文档给出的定义很直接：function calling/tool calling 是让模型通过工具去对接外部系统；函数工具由 **JSON Schema** 定义输入参数。还可以通过 `tool_choice` 控制是自动选工具、必须调工具、强制某个函数，或者只允许部分工具；如果不希望一轮里并行调多个函数，可以把 `parallel_tool_calls` 设为 `false`。在 strict 模式下，函数参数会按 schema 严格约束。([OpenAI 开发者][2])

这一步你可以打个很直观的比方：

**ReAct 里的 Action 像“跟同事口头说一下要干嘛”；Function Calling 像“提交一张工单”。**

前者适合思考，后者适合执行。

比如一个 coding agent 的动作，不再是：

> “我想跑测试看看”

而会变成这样一张标准工单：

```json
{
  "type": "function",
  "name": "run_tests",
  "description": "Run a targeted test command and return summarized failures.",
  "parameters": {
    "type": "object",
    "properties": {
      "command": { "type": "string" },
      "timeout_sec": { "type": "integer" }
    },
    "required": ["command"],
    "additionalProperties": false
  },
  "strict": true
}
```

模型返回的就不是随意文本，而是类似：

```json
{
  "name": "run_tests",
  "arguments": {
    "command": "pytest tests/payment/test_retry.py -q",
    "timeout_sec": 120
  }
}
```

到了这里，一个 Agent 才第一次拥有了**稳定的动作空间**。
这点非常关键：**没有结构化动作，Agent 只是“会描述自己想做什么”；有了 Function Calling，它才开始“真的能做”。** ([OpenAI 开发者][2])

---

# Agent 如何“自己做 reasoning”

这里特别容易被误解。很多人一提 reasoning，就想到“把完整思维过程全写出来”。但现代工程化 agent 并不一定这么做。

OpenAI 的 reasoning 文档说明，推理模型会先生成 reasoning tokens 来思考，再生成可见答案；如果在 Responses API 里把 reasoning model 和 function calling 结合使用，官方建议把上一次函数调用相关的 reasoning items 一并传回，或者直接用 `previous_response_id`，这样模型就能在后续工具调用中延续那段推理状态。([OpenAI 开发者][3])

所以生产系统里通常有两层 reasoning：

**第一层是内部推理。**
这是模型在“脑子里”做的工作，主要用来选择下一步动作。

**第二层是外部化推理。**
不是把所有想法吐出来，而是把真正对后续执行有价值的东西外化成：

* 计划
* TODO
* 验证结论
* handoff summary
* memory 条目
* 失败原因和 stop rule

这点特别像真实工程团队。一个成熟工程师脑子里会想很多，但不会把所有脑内独白都写进工单；他会把**对协作和后续执行有价值的部分**写出来，比如“已复现、根因怀疑在 X、下一步验证 Y”。([arXiv][1])

所以教程里可以明确写一句：

> **Agent 的 reasoning，不等于把思维链暴露给用户；更重要的是把可复用的“中间决策结果”沉淀出来。**

---

# 为什么 SWE-agent 是一个分水岭

到了软件开发场景，问题就变了。

一个通用 ReActAgent 即便能调用函数，也仍然会遇到三个大坑：

1. **代码库太大**，不知道先看哪
2. **工具太原始**，终端、文件、编辑器接口太碎
3. **观察太脏**，日志、测试、报错输出太长，容易把上下文打爆

SWE-agent 之所以重要，是因为它提出了一个非常工程化的观点：
**软件工程任务，不能只靠“模型 + 通用工具”，而要给模型一个专门为软件开发设计的 Agent-Computer Interface（ACI）。**

SWE-agent 论文明确说，他们引入了一个自定义 ACI，显著增强了 agent 创建和编辑代码文件、浏览整个仓库、运行测试和其他程序的能力；论文把 SWE-agent 定义成“LM + ACI”的系统。文档层面，SWE-agent 的入口是 `sweagent` CLI，它初始化 `SWEEnv`；在 1.0 中，`SWEEnv` 进一步包装了 SWE-ReX，可以启本地 Docker，也可以起远程环境。([arXiv][4])

这句话你可以翻译成很直白的教程语言：

**SWE-agent 不是“让模型会写代码”，而是“给模型配了一套适合做软件工程的工作台”。**

就像人类程序员不是赤手空拳写系统，而是要有：

* 终端
* 文件浏览器
* 编辑器
* 测试运行器
* 代码搜索
* 仓库环境
* 调试反馈

SWE-agent 就是在给 agent 配这些“工位设施”。([arXiv][4])

## 1）SWE-agent 的抽象，已经比 ReAct 更完整

在 SWE-agent 里，你已经能看到一个较完整的 Agent 抽象：

* **Policy**：语言模型 + 提示模板
* **Action space**：工具 bundle
* **Observation space**：命令输出、文件内容、环境状态
* **State**：当前工作目录、当前打开文件、历史轨迹
* **Runtime**：环境管理、轨迹记录、执行循环

官方文档里，工具是按 **tool bundles** 组织的；除了普通命令，还支持一个 `state_command`，它会在每次 action 后执行，并把结果转成 JSON 供 prompt 模板使用。文档还举例说明，经典 SWE-agent 会把 `working_dir` 和 `open_file` 这类状态抽出来。SWE-agent 的 `.traj` 轨迹文件则是理解 agent 行为的主要输出。([Swe Agent][5])

这很值得讲，因为它说明了一件事：

> **一个好的 coding agent，不只是“能调工具”，而是会把环境状态显式化。**

也就是说，agent 不是每一步都靠模型自己“记得刚刚打开了哪个文件”，而是运行时主动把当前状态喂回去。

这就像 IDE 顶部始终显示你当前文件和分支，不需要你每 30 秒自己回忆一次。

---

# 一个软件开发任务，如何被 agentic 地拆分和执行

这里建议你用一个很具体的模拟案例来讲，比如：

> “修复支付系统里 retry 导致偶发重复扣款的问题，并补一条回归测试。”

这类任务用 agentic 的方式，通常不是一上来就改代码，而是拆成下面这几层。

## 1）第一层：问题 intake 和验收标准

Agent 先要把任务转成“可执行目标”：

* 现象是什么
* 怎么算修好
* 需要补测试吗
* 能不能改接口
* 风险点是什么

如果这一步没做，后面就很容易“修对了一个 bug，修错了一个需求”。

## 2）第二层：证据收集，而不是立刻开改

这一步更像 SWE-agent / ReAct 的典型循环：

* 看失败测试
* 搜索代码路径
* 找入口函数
* 读关键文件
* 跑最小复现命令
* 收集报错和日志

一个简化的 trajectory 看起来很像这样：

```text
Thought: 先复现问题，别急着改代码。
Action: run_tests("pytest tests/payment/test_retry.py -q")
Observation: duplicate_charge_when_retrying fails

Thought: 去看 retry 和 idempotency 相关逻辑。
Action: search_code("idempotency retry charge")
Observation: payment/retry.py, payment/charge_service.py

Thought: 怀疑 idempotency key 只在内存里，没有持久化。
Action: read_file("payment/retry.py")
Observation: key cached in process-local map, not persisted

Thought: 根因比较清楚了，下一步做最小改动并补回归测试。
```

这就是 ReAct 的精髓：
**先让观察把假设收窄，再去修改系统。** ([arXiv][1])

## 3）第三层：实现和验证分开

很多初级 agent 会把“写 patch”和“验证 patch”混成一步。成熟一点的 agent 会把它拆开：

* 实现最小修复
* 跑定向测试
* 跑相关 lint/typecheck
* 检查是否引入副作用
* 再决定是否继续扩改

这其实就是人类资深工程师常说的：**先让问题收敛，再扩大修改面。**

## 4）第四层：什么时候该从单 agent 变多 agent

不是每个开发任务都值得多 agent。
适合并行拆分的，通常是“证据可以并行收集”的任务。

比如同一个 bug，可以拆成三条并行线：

* **explorer**：只负责 map 代码路径，不改代码
* **docs researcher**：只负责查框架 / API 文档
* **reviewer**：只负责从 correctness 和 test coverage 看风险

Codex 的官方 subagent 示例就是这么设计的：`pr_explorer` 用只读模式做代码路径探索，`reviewer` 用更强模型和更高 reasoning 负责审查 correctness/security/tests，`docs_researcher` 则通过 docs MCP server 验证文档和 API 行为。官方也说明 subagents 可以并行运行并把结果汇总回一个响应。([OpenAI 开发者][6])

这对教程特别重要，因为它说明：

> **多 agent 的价值，不是“更像科幻片”，而是“把可并行的证据收集并行化”。**

---

# 用 OpenClaw 看：ReActAgent 是怎么长成“运行时系统”的

如果 ReAct 和 SWE-agent 主要是在讲“循环”与“接口”，那 OpenClaw 很适合用来讲 **agent runtime**。

OpenClaw 的 agent loop 定义非常清楚：
**intake → context assembly → model inference → tool execution → streaming replies → persistence**。
而且它强调，一个 loop 是 **per-session 单次串行运行**，会在模型思考、调用工具和流式输出时发出生命周期和流事件。OpenClaw 自己构造每次运行的 system prompt；tools 是结构化函数定义；skills 则给出何时以及如何使用这些工具的指导。([OpenClaw][7])

这意味着 OpenClaw 已经不只是“让模型调工具”，而是在补齐前面那几个缺的部分：

* 会话怎么管理
* 上下文怎么组装
* 工具事件怎么流出来
* 一个 session 内如何避免并发冲突
* 中途来新消息时，是排队、followup，还是 steer 进当前 run

OpenClaw 的 queue 文档说明了 `collect`、`followup`、`steer` 等模式；每个 session 会串行，另外还会进全局通道控制总体并发，甚至专门把 `cron`、`subagent` 这类后台运行放到独立通道里跟踪。([OpenClaw][8])

你可以把它讲成一个比方：

**ReActAgent 像一个会自己思考的工人；OpenClaw 像给这个工人配上了工单系统、排队系统、会话存档和调度台。**

一个简化过的 OpenClaw 风格消息流，可以理解成：

```text
用户消息进入
→ Gateway 绑定到 session
→ 组装 system prompt / skills / context
→ 模型输出 assistant 增量
→ 模型发起 tool call
→ 运行时执行工具
→ tool result 回到会话
→ 模型继续推理
→ 最终输出 + 持久化
```

这就是工程上真正的 agent：
**不是“模型自己跑”，而是“模型在一个运行时里被调度着跑”。** ([OpenClaw][7])

OpenClaw 还有一个很适合和 Codex 对照讲的点：
它在 compaction 前会先触发 memory flush，提醒 agent 把重要信息写进 memory 文件，避免上下文压缩时丢失关键事实。([OpenClaw][9])

---

# 再看 Codex：现代 coding agent 把哪些能力产品化了

这里我建议你在教程里加一句说明：

> **下面关于 Codex memory pipeline 和 compact prompt 的细节，主要来自 `openai/codex` 开源仓库，所以它更接近实现层，而不只是产品介绍页；因此也更可能随着版本迭代而变化。** ([GitHub][10])

这反而很适合拿来讲“现代 coding agent 的架构”。

## 1）Codex 的 memory，不是单一记忆，而是分层记忆

如果把 Codex 的记忆体系讲通了，研发人员就会突然明白：
**memory、skills、AGENTS.md、compact 其实不是一回事。**

Codex 的公开文档说明，`AGENTS.md` 会在工作前被读取，并按全局目录、项目根到当前目录的顺序分层合并；越靠近当前目录的文件，优先级越高。也就是说，Codex 的第一层“记忆”其实是**稳定指导和工作约定**。([OpenAI 开发者][11])

而从开源仓库实现看，Codex 还有一套单独的 **memories pipeline**。这个 pipeline 在根 session 启动时异步后台触发，前提包括：session 不是 ephemeral、memory feature 开启、不是 sub-agent session、state DB 可用。它分两阶段：

* **Phase 1**：从最近 rollout 里抽取结构化 memory 和 rollout summary
* **Phase 2**：把这些结果整合到文件系统里的 memory artifacts，并启动一个内部 consolidation sub-agent 做整合

仓库文档还写到，Phase 2 会把结果同步成 `memory_summary.md`、`MEMORY.md`、`raw_memories.md`、`skills/` 和 `rollout_summaries/` 等文件；其中 `memory_summary.md` 是“始终加载进 system prompt”的导航摘要，`MEMORY.md` 是可检索的 handbook。([GitHub][10])

这套设计特别适合你拿来做一个比方：

* **AGENTS.md**：员工手册 / 团队约定
* **SKILL**：作业指导书 / SOP
* **MEMORY.md**：经验手册
* **rollout summary**：单次工单复盘
* **当前 thread transcript**：本次聊天现场记录

也就是说，Codex 不是把所有东西都堆进一个 prompt，而是把“长期规则”“长期经验”“短期上下文”“本轮状态”拆开了。
这就是现代 coding agent 和早期 ReAct demo 最大的差别之一。([OpenAI 开发者][11])

还有一个细节很值得讲：Codex 的 memory read path 模板要求 agent 优先看 `memory_summary.md`，再查 `MEMORY.md`，只有当 `MEMORY.md` 指向某个 rollout summary 或 skill 时，才继续下钻；而且它明确要求 memory lookup 尽量轻量，不要一上来做全量扫描。([GitHub][12])

这本质上就是**记忆版的渐进式加载**。

## 2）Codex 的 auto compact，本质上像“交接班摘要”

Codex 的官方 Prompting 文档写得很清楚：当任务变长时，Codex 可能自动 compact 上下文，把相关信息总结后保留，把不那么重要的细节丢掉；通过反复 compact，它可以在很多步骤后继续做复杂任务。([OpenAI 开发者][13])

如果只看这段文案，你会以为 compact 只是“省 token”。
但从开源仓库里还能看到更具体的实现味道：

* `codex-api` 里有单独的 **Compaction endpoint**，输入是历史 `ResponseItem` 和 compaction instructions，输出是 compact 后的 `ResponseItem`。([GitHub][14])
* compaction prompt 模板直接写着：这是一次 **CONTEXT CHECKPOINT COMPACTION**，要求为“另一个 LLM”创建 handoff summary，包含当前进展、关键决策、剩余工作和关键约束。([GitHub][15])
* 另一个 `summary_prefix` 模板又明确说：另一个语言模型已经开始解这个问题，并留下了思考摘要；你还可以访问之前工具的状态，要基于这些继续推进，避免重复劳动。([GitHub][16])

所以可以很直白地在教程里写：

> **Codex 的 auto compact，不只是“压缩聊天记录”，更像是给下一棒 agent 准备的交接文档。**

这特别像软件团队里的交接班：

* 不是把所有聊天原文搬过去
* 而是提炼出“做到哪了、为什么这么做、别再踩哪些坑、下一步该干嘛”

这个设计很关键，因为长程 coding agent 最大的问题，不是“写不出代码”，而是**做了 40 步之后还记不记得前 20 步为什么这么做**。([OpenAI 开发者][13])

## 3）Codex 的 multi-agent，有两层

Codex 的多 agent 其实至少有两层，教程里最好分开讲。

### 第一层：单个任务里的 subagents

Codex 官方 subagents 文档说明，它可以并行生成 specialized agents，然后把结果收集回一个响应；你还可以自定义 custom agents，分别设置模型、reasoning effort、sandbox、MCP servers、skills 等。全局还有 `agents.max_threads` 和 `agents.max_depth` 控制并发线程和嵌套深度，文档甚至提醒 `max_depth` 默认 1，通常不建议乱加深递归委派。([OpenAI 开发者][6])

官方示例非常适合教学：

* `pr_explorer`：只读代码探索
* `reviewer`：看 correctness / security / tests
* `docs_researcher`：走 docs MCP server 验证 API
* 另一个示例里还有 `code_mapper`、`browser_debugger`、`ui_fixer` 这种角色分工。([OpenAI 开发者][6])

这说明现代 coding agent 已经不是“一个巨型全能体”，而是更像一个小团队：

* 有人探路
* 有人查规范
* 有人修 bug
* 有人审风险

### 第二层：产品层的多线程 / 多 worktree 并行

OpenAI 介绍 Codex app 时明确说，app 支持多个 agent 在不同 thread 里并行工作；并且内建 worktrees，让多个 agent 能在同一仓库上并行但互不冲突，每个 agent 在隔离副本上工作。官方的 Codex cloud 介绍页也说，cloud tasks 可以在后台运行，而且可以并行。([OpenAI][17])

所以可以把 Codex 的 multi-agent 总结成一句话：

> **一个是“同一任务内的角色分工”，一个是“多个任务之间的并行执行”。**

这两层别混。前者解决“如何分工思考”，后者解决“如何提高吞吐量”。([OpenAI 开发者][6])

## 4）Codex 的 background task，也不是一种，而是多层后台

Codex 的“后台能力”也可以分成三层来讲。

### 第一层：本地交互中的后台终端

Codex CLI 的 `/ps` 用来查看 background terminals；文档说明在 `unified_exec` 模式下，可以看到后台命令和最近几行输出。这个功能更像“同一个 agent 在本地开了几个长跑命令”。([OpenAI 开发者][18])

### 第二层：云端 coding task

Codex web / cloud 文档说明，Codex cloud 可以把任务放到云端自己的环境里后台执行，并支持并行；CLI 还能通过 `codex cloud` 来浏览和启动 cloud tasks，把结果 diff 再应用回本地。每个云任务都在隔离环境里运行。([OpenAI 开发者][19])

### 第三层：周期性自动任务

Codex app 的 Automations 支持按计划在后台跑重复任务；文档说它会把结果放进 inbox，或者没结果就自动归档。更进一步，OpenAI 自己写的 harness engineering 文章还提到，他们在固定节奏下跑一组后台 Codex 任务，用来扫描偏差、更新质量等级、开定向重构 PR。([OpenAI 开发者][20])

所以，所谓 background task，不只是“让 agent 慢慢想”这么简单。它背后要解决的是：

* 环境隔离
* 任务恢复
* 结果交付
* 背景可观察性
* 周期调度

这也是为什么现代 coding agent 会越来越像一个“任务操作系统”。([OpenAI 开发者][20])

---

# 把这一段收束成一句教程里的核心结论

你可以这样写：

> 从 ReActAgent 到 SWE-agent，再到 OpenClaw 和 Codex，Agent 的演进本质上是在不断补齐六个槽位：策略、动作、观察、状态、记忆、运行时。ReAct 让模型学会边想边做；Function Calling 让“做”变成结构化动作；SWE-agent 证明软件工程需要专门的 Agent-Computer Interface；OpenClaw 把会话、队列、上下文和工具流变成可控 runtime；Codex 则进一步把分层记忆、自动 compact、多 agent 和后台任务产品化。真正成熟的 coding agent，不是一个更大的 prompt，而是一套更完整的工作系统。 ([arXiv][1])

---

# 对研发人员最值得带走的 4 个设计启发

第一，**先设计动作空间，再谈自治**。
没有好的 function schema、工具约束和验证回路，所谓 agent 只是在放大不稳定性。([OpenAI 开发者][2])

第二，**coding agent 的关键不是“会写”，而是“会查、会试、会证伪”**。
SWE-agent 的 ACI 思想告诉我们，浏览仓库、运行测试、维护状态，比单次代码生成更关键。([arXiv][4])

第三，**长任务能力的核心不是上下文窗口变大，而是 memory + compact + handoff**。
Codex 的 memory pipeline 和 compaction 模板，已经把这一点做得非常明显。([GitHub][10])

第四，**multi-agent 应该优先用在“可并行取证”的场景**。
不是所有任务都该拆很多 agent；真正适合拆的，是代码路径探索、文档验证、复现取证、审查这类能并行但最后需要汇总的工作。([OpenAI 开发者][6])

```
