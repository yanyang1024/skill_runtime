# 联合创建：发布记录复核 agent 与 skill

本例展示同一个创建助手如何顺序使用两个 creator。业务产物是一个 primary 和一个方法 skill；creator 不成为业务运行依赖。

## 原始需求

“创建一个只读发布记录复核助手，按我每次提供的规则检查缺项并给出证据；方法需要可复用，后续调整规则处理方式时尽量不改 agent。创建 agent 和配套 skill，不执行业务发布。”

## 设计与交接

| 阶段 | 当前使用的指导 | 本例决策或交付 |
| --- | --- | --- |
| 设计 | agents-creator | 单 primary；输入为规则与记录；输出证据和缺项；只读项目材料 |
| 方法 | skill-creator | 创建 release-record-review，维护复核方法和交付约定 |
| 装配 | 续接 agents-creator | 创建 release-reviewer，核对真实 skill 名称与白名单 |
| 检查 | 各自对应检查项 | 配套文件可读取、方法符合输入要求、agent 无重复 SOP |

交给 skill-creator 的信息来自上述需求：方法目标、输入输出、读取权限、目标目录和成功条件。完成后返回实际名称、路径、工具要求和未验证项。复用现有同类 skill 时不新建；仅修改方法内部步骤时不重写 agent。

## 源文件

| 文件 | 内容 |
| --- | --- |
| Agent | [release-reviewer.md](../../../examples/agent-with-skill/agents/release-reviewer.md) |
| 方法 skill | [SKILL.md](../../../examples/agent-with-skill/skills/release-record-review/SKILL.md) |
| 合成记录 | [release.md](../../../examples/agent-with-skill/input/release.md) |
| 本次规则 | [rules.md](../../../examples/agent-with-skill/input/rules.md) |

将本例源目录的 `agents/`、`skills/`、`input/` 合并到测试项目 `.opencode/` 下。业务运行只需这组文件，无需复制两个 creator。

## 手工验收任务

- 请求：“按 .opencode/input/rules.md 检查 .opencode/input/release.md，指出缺项与证据。”应发现回滚说明待补充；证据为记录第 7 行，规则第 3 行。
- 缺少规则时说明阻塞，不使用示例规则代替真实要求。
- 只改方法的证据组织顺序，agent 无需修改；若更名或新增必需权限，则核对调用方。
- 仅要求评估方案时不创建文件；本例的原始需求已明确授权创建，执行时不重复申请同一授权。
