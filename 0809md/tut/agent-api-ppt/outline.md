# 演示文稿大纲：从 Chat API 到 Agent Runtime

> 内容模式：摘要模式（源文档《大模型推理接口与Agent协议演进.md》已完整读取，内容高度完整）
> 受众：AI 工程师 / 技术团队内部分享，专业受众，保留技术细节与关键数据
> 叙事主线：反直觉实验（钩子）→ 认知重构（能力公式）→ 现状（推理接口 + 工具接口）→ 协议层 → 案例验证 → 实战与未来
> 章节一致性：5 个章节均有过渡页

## Page 1 [cover]
- **Title**: 从 Chat API 到 Agent Runtime：接口如何解锁模型的隐藏能力
- **Content**: 副标题：同一个模型，不换权重、不重训练，只改接口与状态管理，基准得分翻近三倍。数据钩子：13.3%→38.3%（ARC-AGI-3 公开集）、输出 Token 约 1/6、重新训练次数 0。

## Page 2 [table_of_contents]
- **Title**: 学习路径
- **Content**: 01 认知重构——能力公式：模型只是六分之一；02 接口现状——推理接口四次进化 · Tool 五级台阶；03 协议层——MCP · Skill · A2A · Policy 各管一段；04 案例深扒——ARC-AGI-3 分数如何翻三倍；05 实战与未来——8 个 Tricks · 下一代接口长什么样

## Page 3 [chapter]
- **Title**: 01 认知重构
- **Content**: 模型 ≠ 你观察到的能力。传统 Chat API 暴露"说话能力"，Agent API 暴露"持续工作的能力"。

## Page 4 [content]
- **Title**: 能力公式：模型只是六个变量之一
- **Content**: 源自文档"摘要"部分。核心公式 Observed Capability = F(Model, Inference API, Reasoning State, Context Policy, Tools, Harness)，六个变量逐一解释；厨师类比：Chat API = 门口口头点单（厨师做完就忘），Agent Runtime = 给厨师一间自己的厨房（记事本/工具架/规范）。

## Page 5 [chapter]
- **Title**: 02 接口现状
- **Content**: 推理接口与工具接口。主线：从"一次性问答"走向"持续工作的运行时"。

## Page 6 [content]
- **Title**: 推理接口的四次进化
- **Content**: 源自 1.1 节。时间轴：Chat/Message API → Responses-like API → Realtime（节奏轴）→ Async/Background（寿命轴）；四类接口对比表（核心对象/状态管理/适合场景）；结论：选型先问"任务是否需要跨回合推理连续性"。

## Page 7 [content]
- **Title**: Responses API：把一次运行拆成"积木"
- **Content**: 源自 1.1 节 Responses-like 部分。Chat 抽象 messages→model→message 及其短板（Message 装不下推理状态/工具阶段/检查点）；Item 积木：消息、reasoning、tool call/output、compaction、多模态；新抽象：input items + previous state → response items + new state；坑：无状态回放必须带完整 response.output。

## Page 8 [content]
- **Title**: Tool 接口五级台阶：越往上，模型搬的砖越少
- **Content**: 源自 1.2 节。阶梯图：L1 Function Calling → L2 Hosted Tool → L3 Tool Search → L4 Programmatic Calling → L5 Stateful Tool（handle）；判断口诀：下一步只依赖结构化字段与确定性规则？是→程序化；否→回模型；写入/付款/删除→直接调用+审批。

## Page 9 [content]
- **Title**: 三个立刻能用的工具工程实践
- **Content**: 源自 1.2 节。① Schema 是模型理解工具的说明书：错误返回对比（400 Bad Request vs 可恢复 JSON：error_type/field/expected/retryable）；② Tool Search 按需加载：按用户意图划分 namespace、低频大 Schema 用 defer_loading、单 namespace ≤10 个；③ Tool 输出双视图：summary/structured/resources/evidence/control。

## Page 10 [chapter]
- **Title**: 03 协议层
- **Content**: MCP · Skill · A2A · Policy/Memory：各管一段，不会合并成万能协议。

## Page 11 [content]
- **Title**: 五层地图：思考、经验、外设、外包、规矩
- **Content**: 源自 1.3 节。分层架构图：Responses-like Runtime（认知运行时）/ Skill（可装载的经验包）/ MCP（设备驱动与 I/O 总线）/ A2A（分布式任务协作）/ Policy-Memory（横向治理层）；比喻卡：MCP=USB 总线，A2A=外包合同，Skill=老师傅经验包；分界：是否具备自主任务生命周期。

## Page 12 [content]
- **Title**: Policy/Memory：四种状态必须分开放
- **Content**: 源自 1.3 Policy/Memory 与 1.4 节。状态表：Reasoning State（不作长期记忆）/ Run-Task State（存到任务结束）/ Artifact State（按业务生命周期）/ Durable Memory（验证后保存）；MCP 安全细节：handle 只是协议层字符串，每次调用必须重新验证权限；MCP 与 A2A 不合并：抽象不同（原子能力 vs 自主任务）。

## Page 13 [chapter]
- **Title**: 04 案例深扒
- **Content**: ARC-AGI-3：同一个 GPT-5.6 Sol，未重新训练，得分 13.3%→38.3%。

## Page 14 [content]
- **Title**: 规则未知的游戏：长程闭环任务的软肋
- **Content**: 源自 2.1、2.2 节。任务循环：观察画面→形成假设→选择动作→新画面→修正假设（循环几十上百步）；原始 Harness 两个致命伤：① 每步丢弃私有推理（反复从头推导）② 滚动截断早期历史（破坏因果链）；密室逃脱类比。

## Page 15 [content]
- **Title**: 只做对两件事：保留推理 + 压缩替代截断
- **Content**: 源自 2.3、2.4 节。调整① Retained Reasoning（all_turns/current_turn/auto 三档）；调整② Compaction（不透明工作状态检查点，≠摘要≠审计日志）；结果图：13.3% vs 38.3%，Token 降至约 1/6；结论：评测对象 = 模型 + API + Harness，勿外推到单轮任务。

## Page 16 [content]
- **Title**: 八个可以直接抄的实战 Tricks
- **Content**: 源自 2.6 节。8 条清单：① 先判断是否需要推理连续性 ② Compaction 替代硬截断+外部权威状态 ③ 推理强度按阶段设 ④ 工具定义按需加载 ⑤ 区分直接/程序化调用 ⑥ 输出双视图 ⑦ 错误信息支持自我恢复 ⑧ 评测记录完整 Harness。

## Page 17 [content]
- **Title**: 未来：从 generate() 到 run()
- **Content**: 源自 3.1、3.3、3.4、3.5 节。接口签名对比：generate(messages)→text vs run(task, state_refs, capabilities, policy, budget, output_contract)→events+artifacts+evidence+checkpoint；三大趋势：上层语义化/下层类型化；上下文变成被调度的工作集（Context OS）；协议边界不消失。

## Page 18 [final]
- **Title**: 结语
- **Content**: 核心金句："Chat API 暴露模型的'说话能力'；下一代 Agent API 暴露的是模型在一个受控世界中持续工作、恢复状态、调用能力并交付可验证结果的能力。" 附参考资料链接（OpenAI 官方博客与 API 文档、MCP 规范、A2A 规范）。
