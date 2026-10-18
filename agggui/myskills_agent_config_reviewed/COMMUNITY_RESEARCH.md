# 多 Skill 分析、组合与合并：外部方案及本套配置改进

调研日期：2026-10-16。对象是 OpenCode 中目录式 Skill、primary/subagent 配置及其生态维护。此次检索与阅读的是官方文档、项目 README、公开 Skill 文件和论文；未安装运行外部框架，也未复现其效果。下文“本套设计”是针对当前配置的工程推导，不是这些项目已经实现的共同标准。

## 1. 最值得借鉴的四个方向

**先区分三个层次：选择方法、安排任务、改造资产。** “采用 A+B”不必改写 A/B；“把 A/B 合并”则要迁移指令、脚本和参考资源，并重新检查触发与原场景。多 Skill 也不自然对应多个 Agent。

| 工作/资料 | 可核对设计 | 对本套配置的启发 | 采用边界 |
| --- | --- | --- | --- |
| [AgentSkillOS](https://github.com/ynulihao/AgentSkillOS) | 能力树、相关 Skill 检索、DAG 编排，支持不同编排策略 | 分开能力目录、候选选择、任务依赖和主体映射 | README 的收益来自其基准；不能推出你的内网场景同样获益，也不能说它已解决所有依赖识别问题 |
| [skillmeld](https://github.com/ifylab/skillmeld) | 运行前合并、去重、冲突处理、来源追踪与支持资源打包 | 合并应有内容去向和资源迁移表，不能拼接 SKILL.md 就结束 | 项目声明的字节追踪有专门实现；本包只提供可解释来源记录，不声称等价证明 |
| [Generative Skill Composition](https://skill-composer.github.io/) | 将选哪些、选多少和先后顺序共同视作结构化组合问题 | 候选集合与拓扑分开检查但可互相修正；不把 top-k 检索当最终计划 | 是研究方案，当前不引入训练过的组合模型；有效 ID 也不保证输入、权限和业务前提成立 |
| [SkillComposer：Learning to Evolve](https://arxiv.org/html/2606.06079v1) | create/improve/merge，区分面向任务细化与跨任务泛化 | 合并检查共享不变量，改进检查具体失败；保留原场景差异 | 与上一行同名但不同工作。其主要形式化聚焦 name/description/body，不能代替多文件迁移与 OpenCode 兼容验证 |

这四类工作对应不同问题：检索与编排解决“这次怎么用”；资产合并解决“以后维护什么”；方法改进解决“已有流程哪里不够”。当前小集合优先用短索引、证据与按需参考，不需要先搭一套新的 Skill OS。

## 2. 工程资料补充了什么

[LangChain Skills](https://docs.langchain.com/oss/python/langchain/multi-agent/skills) 将 Skill 描述为单个 Agent 可按需采用的轻量专业化方法；[Router](https://docs.langchain.com/oss/python/langchain/multi-agent/router) 则处理分类、分发和结果综合，并区分路由与持续持有上下文的主管。这里采用其职责区分：方法切换留在当前主体，有自包含任务和隔离收益才拆子 Agent。文档中的动态工具注册是扩展实现，不当作 OpenCode 的默认机制。

[Superpowers](https://github.com/obra/superpowers) 展示了从需求、计划到执行、审查的阶段式方法组合。[using-superpowers](https://raw.githubusercontent.com/obra/superpowers/main/skills/using-superpowers/SKILL.md) 对流程方法优先和触发有强约束。借鉴阶段衔接与平台适配；本套不照搬“任何可能相关都加载”的策略，保留单选、直接创建、无需 Skill 与中间阶段进入。

[Anthropic skill-creator](https://github.com/anthropics/skills/blob/main/skills/skill-creator/SKILL.md) 把样例执行、基线对照、产物检查和迭代结合；其 [run_eval.py](https://github.com/anthropics/skills/blob/main/skills/skill-creator/scripts/run_eval.py) 面向触发评估。因此本套将触发、组合合法性、最终质量和成本分开记录。相关 [Issue #1478](https://github.com/anthropics/skills/issues/1478) 报告了运行错误与未触发混记的风险；这是问题报告，未在本次复现或确认当前分支修复状态。我们据此明确 error 不计为正确拒选。

[Agent Skills 规范](https://agentskills.io/specification) 支持分层披露，入口、正文和资源分层加载。[OpenCode Skills](https://opencode.ai/docs/skills/) 与 [Agents](https://opencode.ai/docs/agents/) 则定义实际发现、权限和主体配置。本套保留原有配置形式，不将自定义画像/生态字段写成 OpenCode frontmatter，也不依赖最新可选元数据来兼容你的内部 fork。

[Vercel skills CLI](https://github.com/vercel-labs/skills) 侧重发现、安装和更新等资产分发能力；它不是当前分析、合并与任务调度链路的直接替代。本次没有为了编排方法引入安装器或自动更新行为。

## 3. 针对你当前场景的设计判断

### 3.1 建四种视图，避免一张图包办所有事情

| 视图 | 节点/关系 | 解决的问题 |
| --- | --- | --- |
| 能力索引 | Skill 的能力、适用与不适用条件 | 去哪里找候选 |
| 方法关系 | 方法借用、互补、替代、指令冲突 | 能否一起采用，如何限定作用阶段 |
| 任务执行 | 步骤与产物依赖、条件、验收 | 先后顺序、阻塞与汇总 |
| 主体委托 | Agent 及其 Task 边界 | 谁做、上下文为何隔离、权限是什么 |

资产合并另附内容/资源去向表。它不能从任务 DAG 自动推出：A→B 只表明步骤可能依赖，不证明应该把两份 Skill 合成一份。

### 3.2 “最小充分”同时约束数量和证据

先从目标提出能力缺口，再选候选；对必要依赖、已有输入与替代方案检查后形成路线。候选不合适时允许重选，也允许零 Skill。用户明文指定范围时不扩选；全选则逐项交代，不能静默筛掉不适用对象。

技能很多时使用短画像与多标签能力目录即可。目录中的父子关系只是检索视图，不能误作执行顺序。只有规模与实际误召回问题证明有必要时，再引入向量索引或层级检索；当前不预设一套大型检索服务。

### 3.3 合并是维护决策，需要原场景分别保真

建议顺序是：保留独立并组合→抽公共参考/脚本→建立薄组合方法→满足条件才合并或拆分。判断依据是共享目标、前提、权限与成功条件，以及实际维护重复；不是句子相似程度。

合并保留全部关键差异、失败分支和必要资源。针对 A 原场景、B 原场景、跨 Skill 场景与触发反例分别检查。总平均提升不能掩盖某一关键任务族退化。只有静态检查时保留候选状态，不宣称泛化改善。

### 3.4 增量维护沿证据传播，不机械全库重做

name/description 变化影响发现与导航；输入输出变化影响消费者；工具权限变化影响可行性；引用文件变化影响采用其规则的判断。来源指纹先提示“可能变了”，再通过引用关系判断影响面。外部 API、模型、权限与输入快照另行核对，不能靠本地文件未变推断仍可用。

本次附带 inventory.py 仅做只读包指纹与文件差异，无第三方库和模型调用。它帮助定位该读什么，不负责判断语义、推断依赖或运行任何对象 Skill。

### 3.5 方法约束与 runtime 保障分开

Agent 文档可以指导阶段切换、控制输出与交接；不能硬性保证旧 Skill 文本退出上下文、工具权限撤回、进程取消、幂等或崩溃恢复。需要强制约束时，后续应由你的 OpenCode fork 在 task/run/step 与权限/沙盒层实施。当前交付明确这些是待接入能力。

## 4. 本次实际修改

| 位置 | 改动 |
| --- | --- |
| skill-relations-analysis/SKILL.md | 增加选择、资产整理、增量维护与组合验证入口；保持只分析 |
| selection.md | 目标驱动能力召回、同名消歧、拒选与零 Skill、重规划 |
| consolidation.md（分析侧） | 组合/抽取/合并/拆分决策、内容去向与回归范围 |
| incremental.md | 指纹与证据失效、依赖影响、中途目标变化与恢复边界 |
| composition-validation.md | 触发/拓扑/质量/成本分开，对照与错误口径 |
| creator-flow.md | 本包分析→装配→按需补方法→续接的具体衔接 |
| skill-creator/references/consolidation.md | 授权改造实施、资源迁移、兼容、来源和回交 |
| agents-creator 及相关参考 | 接收新交接字段、检查受影响调用方与 runtime 缺口 |
| 生态与创建入口 Agent | 增加资产决策与增量续接导航，保留精确权限 |
| evals/scenarios.json | 16 个构造设计案例，未运行 |
| scripts/inventory.py | 只读指纹与前次清单差异工具 |

原三个方法 Skill、四个入口 Agent 不增加数量。画像 schema_version: 2 的核心保留，维护字段使用兼容扩展。新文件均通过条件导航接入，不要求每次任务通读。

## 5. 使用建议与下一步验证

可以直接这样请求生态 Agent：

> 对指定 Skill 集合复用仍有效的画像，按本次目标选择最小充分组合。区分方法关系、任务依赖和主体委托，逐项交代同名、替代、冲突及缺口。对重复资产给出保留/抽取/合并/拆分建议；需要创建时生成业务 Agent，授权范围内补齐方法，并检查受影响入口。只输出本次需要的产物。

内部验证先选少量真实案例：单选不扩权、全选状态完整、混合依赖、同名来源、合并保真、参考变更增量更新、普通问答不误触发。然后在固定输入和预算下对照旧版、新版与必要的无 Skill/单 Skill 条件，记录加载轨迹、关键方法采用证据及产物质量。未做这些运行前，本次结论仅为配置和方法完善。
