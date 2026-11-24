# 开源参考与采用判断

核查日期：2026-11-17。以下为官方发布说明与文档核查，不代表已在用户应用安装或完成联调。旧 Astryx 压缩包缺少可确认的版本基线，因此不能把每条近期更新都声称为旧样例之后的新增。实施时重新核对锁定版本、许可证、维护状态和真实导出；不要把 main、Lab、issue 或模板空回调当稳定可用接口。

## Astryx：采用行为修复，按需采用模块

官方 releases 此次显示最新为 v0.7.16。近期相关线索：

| 线索 | 应吸收到方法中的部分 | 采用判断 |
| --- | --- | --- |
| v0.7.10 输入 token 插入同步 onChange 的修复 | 文件引用插入后，显示值、受控状态和实际提交值一致 | 高优先级验收；已使用组件时核对版本 |
| v0.7.12 Markdown 的 data URL 处理 | 对不可信链接和图片建立明确协议策略 | 更新渲染验收；不能由此假定所有渲染器同策略 |
| v0.7.16 日期/时间字段错误呈现时机 | 避免用户输入尚未完成便强烈报错，提交仍完整校验 | 适合 A 的人工核对与改写 |
| Chat、面板与文件导航的组合 | 复用已有组件组织对象、输入、结果 | 按场景验证，不视为文件存储或文档编辑引擎 |

来源：[v0.7.10](https://github.com/meta/astryx/releases/tag/v0.7.10)、[v0.7.12](https://github.com/meta/astryx/releases/tag/v0.7.12)、[v0.7.16](https://github.com/meta/astryx/releases/tag/v0.7.16)。

对已有 React 前端评估 Astryx 的收益；HTML/Jinja 项目优先借鉴交互，不为此整体迁移。只复制模板前核查保存、版本、上传、提交回调是否真实接入。Lab 或绘图型 Canvas 不因名称相近就成为文档协作默认选择。

## 分层评估其他方案

| 需求 | 候选与已核实事实 | 应用仍需承担 |
| --- | --- | --- |
| 对话编辑与分支导航 | assistant-ui 提供编辑/重新生成后的分支选择；运行中切换受 runtime 能力约束 | 分支持久化、权限、与文件版本的关联；不要为使用 UI 强换 Flask/FastAPI |
| 文本/Markdown 差异 | CodeMirror merge 是文本差异候选；GitHub 镜像已归档并声明迁移 | 当前维护源、版本与 API 须再核验；本次迁移站点不可访问，不宣称完成适配 |
| React 富文档与多人同步 | Lexical 有基于 Yjs 的协作绑定；Yjs 13 与实验性 Yjs 14 绑定/布局不同 | 文档 schema、持久化、权限、初始化及迁移；不为单用户编辑默认引入协作 |
| AI 修改审阅 | Tiptap 展示建议与持久修改追踪两种模式 | AI Toolkit 是付费附加项，Tracked Changes 单独销售；勿误写成免费开源组合 |

来源：[assistant-ui 分支](https://www.assistant-ui.com/docs/guides/branching)、[CodeMirror merge 迁移声明](https://github.com/codemirror/merge)、[Lexical 协作](https://lexical.dev/docs/collaboration/react)、[实验绑定](https://lexical.dev/docs/collaboration/y)、[Tiptap 审阅](https://tiptap.dev/docs/ai/ai-toolkit/client/agents/review-changes)。这些是不同层的备选，不要求一起安装。

先用现有技术栈实现文件列表、当前产物、草稿保护、局部改写提案与执行摘要；再按真实瓶颈增加文本差异编辑器、分支导航或富文档；最后才考虑多人协作、复杂轨迹图和多文件事务。对每个依赖做一个小型真实场景验证，检查移动端、中文 IME、授权、撤销与恢复，记录收益和新增维护成本。

## 结构化生成 UI 与执行可观测（核查日期：2026-11-23）

| 需求 | 候选与已核实事实 | 应用仍需承担 |
| --- | --- | --- |
| agent → 前端的类型化事件流 | AG-UI（CopilotKit，MIT）定义 run/step 生命周期、文本消息 start/content/end、工具调用 start/args/end/result、状态 snapshot/delta 等事件，通常以 JSON over SSE 传输；2026-09 发布 1.0 规范 | 只是事件契约，不是 UI 规范；采用时按锁定版本核对事件清单，不为小应用强引入整套 SDK |
| agent 生成界面结构 | A2UI（Google）让 agent 以受约束的声明式、扁平可流式 JSON 描述 UI，由宿主映射原生组件；可经 AG-UI 承载 | 组件注册表、校验、权限、交互回传；不等于允许模型输出任意 HTML |
| 执行轨迹/耗时瀑布 | OpenTelemetry GenAI 语义约定给出 `invoke_agent`/`chat`/`execute_tool` 父子 span 与 `gen_ai.conversation.id`；Phoenix、Microsoft Agent Framework DevUI、Elastic Agent Builder 等提供 span 瀑布视图，Elastic 支持从对话单轮打开对应 trace | 语义约定仍处 development，属性名可能变；面向用户的轨迹要做业务化摘要、脱敏与权限，不能直接暴露调试 trace |

来源：[AG-UI 文档](https://docs.ag-ui.com/)、[A2UI](https://a2ui.org/)、[CopilotKit Generative UI 指南](https://www.copilotkit.ai/blog/the-developer-s-guide-to-generative-ui-in-2026)、[OTel DevUI tracing](https://learn.microsoft.com/en-us/agent-framework/user-guide/devui/tracing)、[Phoenix tracing](https://mintlify.com/Arize-ai/phoenix/tracing/overview)、[Elastic Agent Builder 瀑布视图](https://www.elastic.co/search-labs/blog/opentelemetry-tracing-agent-builder)。采用边界见 execution-timeline.md 与 streaming-structured-ui.md；小应用可先按相同形状自定义最小事件，不必引入协议全家桶。
