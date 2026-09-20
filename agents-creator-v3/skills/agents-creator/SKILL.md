---
name: agents-creator
description: 创建、修改或审查 OpenCode primary/subagent 文档，设计职责、skill 导航、权限与协作契约。需要配套新 skill 时协调 skill-creator，交付 agent 及明确的依赖关系。
---

# OpenCode Agent 创建与维护

将需求落成目标环境可加载、职责清楚的 agent 文档。遵循调用方的设计原则；独立使用本 skill 时默认单 primary，只有明确的隔离、独立验收、并行或能力差异收益才拆分。

## 工作流程

1. **读取需求与现状。** 区分新建、修改、审查；确认目标职责、输入、产出、授权资源和目标目录。读取已有配置及相关 agent，保留无关定制。优先使用已知信息，只追问影响结果的缺口；内部 fork 的版本或加载行为未核实时标为待验证。
2. **选择形态与能力。** 判断单 primary、单独的 subagent 或协作系统。核对可用 skill 的名称、description、输入输出和必需权限；只读取候选 skill 的必要内容。复用能满足需求的 skill，简短稳定行为可直接内联，方法缺口需要配套 skill 时进入下一步。
3. **按需补充 skill。** 读取 [skill-composition.md](references/skill-composition.md)，由当前 agent 加载 `skill-creator`，传达目标与授权范围；完成后续接本流程，不重启整个设计。仅设计或仅审查时只列出依赖与建议，不额外创建文件。
4. **读取匹配参考与样例。** 按下表选择分支。需要完整成例时先看 examples 索引，只加载最接近的一例；样例的业务规则、工具与权限不得直接视为当前项目事实。完整源文件在分发包的顶层 examples；仅在采用该例时读取所需 agent、skill 和契约，目录未安装时继续使用随 skill 的模板。
5. **形成并写入文档。** 正文写职责、适用于该 agent 的设计意图、能力导航、交付责任和边界。将命令、参数、完整 SOP 与详细检查项留在 skill。使用真实依赖，不把创建器 examples 路径写成目标 agent 的运行依赖。路径按已确认的目标配置解析。
6. **校验并交付。** 按校验参考检查落盘文件与相关依赖；修改时检查 diff。明确静态检查和运行时验证的区别。问题可修复则修复后复查；缺能力、权限或输入时报告阻塞并保留已完成结果。

## 按需读取

| 条件 | 文件 |
| --- | --- |
| 新建或修改 frontmatter，判断加载与权限 | [frontmatter.md](references/frontmatter.md) |
| 编写 primary 正文 | [primary-agent.md](references/primary-agent.md) |
| 编写 subagent 正文 | [subagent.md](references/subagent.md) |
| 设计多个 agent 的边界和通信 | [multi-agent.md](references/multi-agent.md) |
| 新建／修改配套 skill，或考虑引入其他 skill | [skill-composition.md](references/skill-composition.md) |
| 需要完整样例对照 | [examples/index.md](examples/index.md) |
| 交付前或完整审查 | [validation.md](references/validation.md) |

Skill 内部实现变化不要求改 agent；名称、适用范围、必需权限或对外契约变化时，要检查调用方兼容性。保留足以作出选择的抽象原则，不以“精简”为由删除设计意图。
