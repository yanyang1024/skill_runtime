# 单 primary：BEOL 数据复核

对应原包提到的 BEOL 单主体形态，以下是补写的教学示例，不是原内部实例的复原。使用用户提供的规则和文本表格进行只读复核，不调用内网 API，不提供制程处置指令。

同一主体完成相关数据比较，暂无独立验收或并行需求，所以只配置一个 primary。Agent 保存选择理由与能力导航；比对细节由 skill 维护。以下数据为合成样例，数值规则仅对示例任务有效。

将本例源目录的 `agents/`、`skills/`、`input/` 合并到一个测试项目的 `.opencode/` 下；`input/` 也相对于 `.opencode/`。内部平台按其实际加载目录调整。示例 agent 仅开放列出的只读能力，结果在会话中交付。

## 源文件

文件内容仅在链接目标维护；本页只说明设计与验收。原包没有提供内部实例原文，这些文件是教学实现。

| 文件 | 内容 |
| --- | --- |
| `agents/beol-primary-dev.md` | [打开源文件](../../../examples/single-primary/agents/beol-primary-dev.md) |
| `skills/beol-review/SKILL.md` | [打开源文件](../../../examples/single-primary/skills/beol-review/SKILL.md) |
| `input/beol-demo.md` | [打开源文件](../../../examples/single-primary/input/beol-demo.md) |

## 手工验收任务

- 请求：“按 .opencode/input/beol-demo.md 的本次规则检查三条记录，指出证据和缺口。”
- 可检查结果：B-01 在区间内，B-02 高于上界，B-03 缺值；不产生工艺处置结论，不调用 task。
- 缺口输入：移除规则后再次请求；应要求提供规则或只报告观测值，不能沿用示例阈值当生产规范。
- 维护检查：只修改 beol-review 的结果组织方式，agent 导航不应需要修改。
