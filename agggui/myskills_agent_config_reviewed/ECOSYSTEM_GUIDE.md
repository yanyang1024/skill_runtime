# Skill/Agent 生态配置审查与使用说明

## 本次结论

保留三个方法 Skill，明确四个 Agent 的入口职责。画像、关系综合、生态编排继续作为同一分析 Skill 的按需阶段；它们共享证据和公开契约，目前不需要拆成多个会互相触发的 Skill。

| Agent | 用途 | 可采用 Skill | Task |
| --- | --- | --- | --- |
| skill-ecosystem-planner | 画像→关系→生态→业务 Agent 的整体任务 | 分析 + agents-creator + skill-creator | 仅 skill-profiler |
| skill-relations-master | 纯画像与关系分析入口 | 仅分析 | 仅 skill-profiler |
| agents-create-assistant | 已知需求下创建/维护，必要时内联分析 | 三个方法 | 禁止 |
| skill-profiler | 单份材料取证与画像 | 仅分析的画像阶段 | 禁止 |

前两个 primary 不再复制同一套职责；用户任选入口，primary 之间不通过 Task 转包。生态入口和创建入口可在当前主体内完成分析→创建→补方法→续接。

## 发现并修复的问题

| 问题 | 原因及本次修改 |
| --- | --- |
| 生态入口与关系入口高度重复 | 关系入口收敛为分析，生态入口持有全链路交付责任 |
| 创建流程缺方法时无法顺畅完成 | 生态入口增加精确 skill-creator 白名单，接入有限补充与续接规则 |
| Skill 画像像固定数据 API | 补充触发、加载、上下文、指令作用域、权限依赖和完成条件；语义输入输出同样有效 |
| Skill 图被直接理解为 Agent 图 | 分开方法依赖、产物依赖、主体委托三类图；执行节点为具体任务阶段 |
| 小任务也强制画像子任务 | 按隔离/并发收益选择，Task 不可用可内联；独立验收要求不以此降级 |
| worker 声称“不继承上下文” | 改为不依赖隐式继承，真实隔离由 runtime 验证 |
| worker 读取边界误伤分析参考 | 区分方法材料与被分析对象；允许读取自身方法参考 |
| 输出失败可擅自换路径 | 统一由主 Agent 调整任务包，回传路径先校验归属 |
| 部分 examples 指向缺失包外文件 | 改成四份自包含教学片段，消除失效链接 |
| 旧版关系边方向有歧义 | 明确消费者→生产者的关系边与生产者→消费者的执行边转换 |

## 实际串联路径

生态任务通常在当前主体中完成：采用 skill-relations-analysis 得到画像/关系/生态和 design-brief；再采用 agents-creator 装配；仅在需要且获授权时采用 skill-creator 补方法，然后续接装配。画像量大时才把独立读取任务委托给 skill-profiler。

已有有效画像可直接进入生态；已有充分需求可直接创建；只想研究 Skill 集合则在报告处结束。它是一组按条件选择的方法，不是每次必跑完整流水线。

## 选择与拓扑

| 选择范围 | 含义 | 可采用拓扑 |
| --- | --- | --- |
| 单选 | 只采用明确指定 Skill，缺必要输入先说明 | 单节点或该方法内部阶段 |
| 指定集合/全选 | 固定集合，逐项说明适用/执行/阻塞状态 | 串行、并行、混合、隔离对照 |
| 动态子集 | 按目标选最小充分能力及必要依赖 | 单节点、串行、并行、条件分支 |

并行需要实际执行能力，顺序加载两份 SKILL.md 不算并行。全选也不等于全部同时加载全文。知识指南与分析方法可能只是同上下文互补，不必强造文件管道。

## 配置使用

将包内 agents/、skills/ 按已确认的内部平台目录安装；标准项目对应 .opencode/agents/ 与 .opencode/skills/。同名 skill-creator 安装前核对现有实现，避免覆盖不兼容版本。

推荐请求：“分析指定 Skill 集合，复用仍有效的画像，给出单选/全选/动态组合与串并行设计；根据设计生成业务 Agent，必要时补充可复用方法，输出到指定目录。”

生成物默认位于输出根 generated/agents 与必要的 generated/skills。业务 Agent 引用业务方法，不能依赖分析时的临时绝对路径或创建器内部参考。

当前配置允许必要的文件设计工作；未开放任意 bash。若补充脚本需要实际验证，使用目标环境中已有且获授权的验证能力，并记录证据。external_directory/edit 等通用允许项不是按任务路径强制隔离，内部平台需配合路径权限或沙盒。

## 核对依据与验证边界

对照 OpenCode 官方文档核查（2026-10-16）：

- [Agents](https://opencode.ai/docs/agents/)：primary/subagent、Markdown 配置与 Task 目标权限。
- [Agent Skills](https://opencode.ai/docs/skills/)：name/description、按需加载、参考资源及 Skill 权限。
- [Permissions](https://opencode.ai/docs/permissions/)：工具权限、模式匹配与外部目录。

以上为当前上游文档，不保证内部 fork 的版本行为相同。此次验证包括 YAML/frontmatter、所有本地链接、Skill/Task 白名单目标、包内契约与代表场景设计检查；未运行内部 OpenCode、业务脚本或真实并发。画像完成、配置静态通过、业务验证通过分别报告。


## 社区调研后的进一步完善（2026-10-16）

调研与取舍见 [COMMUNITY_RESEARCH.md](COMMUNITY_RESEARCH.md)。本次保持三个方法 Skill、四个 Agent，新增按需规则，不新增外部依赖或业务执行权限。

- 多候选与同名来源：分析 Skill 的 selection.md。
- 资产组合、合并、抽取和拆分：分析 Skill 给建议，skill-creator 实施，agents-creator 核对受影响入口。
- 来源与目标变更：incremental.md 指导复用与失效；可选 inventory.py 只读计算指纹。
- 组合验证：composition-validation.md 与 16 个设计案例，分别检查触发、步骤约束、质量和成本。
- 本包串联成例：skills/skill-relations-analysis/examples/creator-flow.md。

全套细节通过各 SKILL.md 条件导航读取。没有适用方法可不选 Skill；合并不默认删除原文件；静态计划不是 OpenCode 调度程序；已加载指令不保证可卸载。更多阶段不自动意味着更好效果。

推荐请求：“结合已有画像，仅重查变化和缺失维度；对这批 Skill 给出选择/组合方案和必要的合并建议，再按授权修改并续接 Agent 装配。保留来源、独有约束和资源，逐项说明静态检查与运行缺口。”


## 从多 Skill 输入开始使用（本轮使用审查）

常规入口使用 `skill-ecosystem-planner`：可以只做关系分析，也可以续接场景设计和配置生成。`skill-relations-master` 是纯分析快捷入口，`agents-create-assistant` 适合需求明确的直接创建；无需为了开始任务先选择多 Agent 架构。`skill-profiler` 由调用方派单，不作为日常用户入口。

| 输入后的请求 | 默认产出 | 何时提问 |
| --- | --- | --- |
| 看看/比较/怎么组合 | 轻量能力表与候选路线 | 共同分析不足以回答且目标有实质歧义时 |
| 指定目标选组合 | 最小充分选集、依赖与缺口 | 必须由用户决定的业务口径或目标冲突 |
| 整合成一个 Agent | 保留独立 Skill，生成统一入口草稿 | 修改对象/固化规则无法确定时 |
| 合并 Skill 文件 | 内容去向、资源迁移与授权改造 | 不可兼容差异、同名修改对象不明时 |
| 缺 CSV 但只要配置 | 将 CSV/阈值等设计为运行时输入 | 通常不在当前创建阶段询问 |

默认 primary 的 `question: allow`，subagent 的 `question: deny`。worker 只回传缺口；primary 先补委托、查材料、识别可默认和可延后事项，再汇总必要问题。具体决策规则位于分析 Skill 的 interaction.md；创建器模板也同步了角色权限和阶段边界。

完整发现、确定性/提问矩阵与模拟边界见 [USAGE_REVIEW.md](USAGE_REVIEW.md)。本轮并非内部 OpenCode 运行验证；独立模拟与文档推演分别记录。
