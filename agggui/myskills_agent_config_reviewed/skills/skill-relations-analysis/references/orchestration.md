# 从画像到场景编排

本文件用于主 agent 的生态综合阶段。只分析调用可行性并输出配置设计输入，不运行被分析的业务 skill，也不直接生成 Agent 文件。画像 PASS 仅说明画像交付有效，不说明业务能力已验证。

## 两个正交维度

| 维度 | 选项 | 决策依据 |
| --- | --- | --- |
| 选择范围 | 单选、用户指定集合、全选、动态子集 | 用户目标、明确限制、能力覆盖 |
| 执行拓扑 | 单节点、串行、并行、串并混合、条件分支 | 输入输出依赖、资源冲突、条件是否成立 |

全选也可能串行；动态子集也可能并行。依次加载多个 skill 不等于并发；skill 是方法指导，不是独立执行主体。并行要由真实工具并发或受控 subagent 实现。

## 接口画像与兼容性

先按 skill-semantics.md 区分 Skill 类型和关系，再依据 contract.md 的 extensions.orchestration 提取适用的输入输出接口。不明确就记 unknown，不用文档没提到推断为没有副作用。

逐条检查 A 的输出能否填 B 的必需输入：业务对象及标识、字段语义、类型/格式、单位、时间范围、聚合粒度、版本/新鲜度、质量与权限。相似的文件名或同属一个主题不是依赖证据。

- required：没有上游产物或等价现成输入，B 无法有效执行。
- optional：上游只增强质量；可省略但需说明影响。
- conditional：只有显式条件成立时需要上游。
- none：只是互补、共源或替代，不加执行先后约束。

统一执行边方向为 **生产者 → 消费者**，使用 producer、consumer、output、input、mapping、dependency、condition、compatibility、evidence 字段，避免旧关系 from/to 语义歧义。旧 consumes_output 的“A 使用 B”应转换为 producer=B、consumer=A。输出侧单方声称能供另一 skill 使用，只能作为候选匹配；需核对消费侧接口。

compatibility 为 compatible / adapter_required / incompatible / unknown。适配只记具体缺口及转换建议，未实现的转换不可视为已可执行。有效的已有产物能直接满足依赖时复用，记录来源和有效性，避免机械重跑上游。

## 五类模式的适用性

| 用户意图 | 编排方法 | 常见失败与处理 |
| --- | --- | --- |
| 只用 B / 明文指定 B | 固定 B；先核对所需输入 | 缺 A 产物时只请求该输入或说明需放宽限制，不偷偷加 A |
| 先 A 再 B | 校验 A→B，B 只消费通过检查的产物 | A 失败或产物不合格，阻塞 B；不以 A 的口头结论代替产物 |
| 独立分析 A、B 后汇总 | 相同输入快照、分离输出；检查无依赖和共享写冲突 | 无实际并发能力则按顺序独立执行，如实披露 |
| 所有 skill 都分析 | 冻结当前授权集合，逐项检查适用性后排拓扑 | 不适用、互斥、缺输入、越权项目逐项列出，不能假报全部成功 |
| 根据需求动态选择 | 将目标拆成能力缺口，选最小充分集合，补齐必需依赖 | 弱推荐关系不强行加入；低置信度且影响路线时才澄清 |

全量画像分析意味着所有对象都要有画像或缺口交代；全量业务执行意味着授权集合逐项评估并对可执行项排程。不能混淆这两种“全量”。用户强制要求互斥方法全部执行时，可以作为隔离的对照分支，不能将结果混为单一结论。

## 规划算法与边界

1. 冻结用户目标、明确指定/排除项、数据范围、输出及预算。用户指定优先于默认推荐；新增权限不由计划自动授予。
2. 按能力覆盖选择候选；仅在动态选择时删除重复能力；显式集合与全选逐项保留并交代状态，保留必要的互补与有价值的对照。
3. 对必需输入递归补依赖，直到外部输入/有效已有产物闭合；显式单选不扩展。unknown 边留为候选，不直接充当已验证执行链。
4. 区分同级替代、必需依赖、条件依赖和冲突。检查环：优先拆成阶段或提供初始输入；确实需要迭代时指定轮次与停止条件。无法消环则 BLOCKED，不无限重试。
5. 将满足前置条件的节点分层；同层无读写冲突、资源额度允许时才并发。共享文件不能同时覆盖；只读共源通常可并行，但先确认快照与读取限制。
6. 为每个节点记输入绑定、输出契约、验收、失败传播及汇总用途。依赖未满足则 BLOCKED；失败只影响下游，独立支路继续。
7. 动态重规划只在新结果、新输入或明确失败出现后发生。默认最多两次重规划、一次有依据重试；用户/项目另有预算则从其约定。无新信息就停止。
8. 汇总先对齐对象、时间、单位及口径；冲突并列回溯证据，不投票或简单平均。说明完成、失败、阻塞、跳过与未执行覆盖。

## 生态产物与业务 Agent 生成

输出 ecosystem.yaml：schema_version、skills、execution_edges、conflicts、alternatives、scenario_plans、gaps。每项事实引用画像 claim；假设案例明确标 hypothetical。

scenario_plans 每项包含 id、user_goal、selection_mode、requested、selected、excluded（及原因）、external_inputs、steps、merge_policy、status、evidence。steps 每项包含 id、skill_id、phase、executor（current_agent / proposed_subagent / tool，含选择理由）、depends_on、condition、input_bindings、output_contract、acceptance、failure_policy。depends_on 引用步骤 id，可复用同一 skill 的不同阶段；所有引用需存在并检查环。

输出编排建议并不等于配置可执行。另记 readiness：design_only / inputs_missing / permission_missing / runtime_unverified / verified，并列阻塞项。只有实际执行和验收证据齐全才用 verified。

用户要求形成 Agent 时按 design-handoff.md 输出设计交接包。由当前 Agent 决定是否加载 agents-creator；本分析方法不直接生成配置、不自动加载创建 Skill。

执行图的节点是“任务步骤 + 所采用 Skill/阶段”，不是 Skill 目录本身；Agent 分工另作 executor 映射。同一 Agent 可执行多个顺序步骤，同一 Skill 也可用于多个独立任务。一个 YAML 计划只是设计记录，OpenCode 不会自动解释它为调度程序。

产出只包含本次目标所需文件；画像、关系、生态覆盖分别报告。readiness 可为多个缺口标签；verified 必须附适用版本、真实执行与验收证据，不能因静态通过而填写。

## 选择、维护和验证的条件入口

候选召回与重叠处理采用 selection.md；资产改造建议采用 consolidation.md；来源变更与中途续接采用 incremental.md；对照设计采用 composition-validation.md。它们补充本文件，不新增自动执行层。

步骤还可记录 load_when、active_rules、carry_forward、completion_evidence 和 invalidated_by，描述何时采用方法、保留什么状态及何时失效。未被当前步骤选中的规则不应扩大本阶段行动，但已加载文本是否真正退出上下文取决于 runtime，不能声称已卸载。

## 规划未知与执行阻塞分开

缺业务数据时，本次设计可完成，未来业务步骤记 inputs_missing；用户要求固化的业务口径冲突则影响当前设计，按 interaction.md 由 primary 提问。每个缺口记录 affects（影响步骤）和 needed_at（design / runtime），避免全局停工。条件节点没有命中应 skipped，不算失败；未知条件不能当作 false。
