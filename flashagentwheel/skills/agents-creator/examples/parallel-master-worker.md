# 并行 master-worker：按 lot 分单

对应原包提到的多 lot OCAP 分析形态，补写一个不依赖内网接口的只读规则复核示例。输入、规则均为合成教学材料；没有设备控制或工艺处置能力。

将本例源目录的 `agents/`、`skills/`、`input/` 合并到一个测试项目的 `.opencode/` 下。两个 agent 与一个方法 skill 即可表达任意数量的独立 lot，实际并发数量由运行时能力和任务资源决定，不把“多个 skill”误认为“多个 worker”。

## 源文件

文件内容仅在链接目标维护；本页只说明设计与验收。原包没有提供内部实例原文，这些文件是教学实现。

| 文件 | 内容 |
| --- | --- |
| `agents/lot-master.md` | [打开源文件](../../../examples/parallel-master-worker/agents/lot-master.md) |
| `agents/lot-worker.md` | [打开源文件](../../../examples/parallel-master-worker/agents/lot-worker.md) |
| `skills/lot-review/SKILL.md` | [打开源文件](../../../examples/parallel-master-worker/skills/lot-review/SKILL.md) |
| `input/lots-demo.md` | [打开源文件](../../../examples/parallel-master-worker/input/lots-demo.md) |

## 手工验收任务

- 请求：“分别复核 .opencode/input/lots-demo.md 的三个 lot，独立处理并汇总完成范围。”
- W-01：复核完成，CLEAR；W-02：复核完成，FLAGGED；W-03：BLOCKED，UNDETERMINED。不能把 W-02 的任务 PASS 当成无异常。
- 覆盖应为计划 3 个、完成复核 2 个、阻塞 1 个；只验证汇总逻辑，不预设运行时一定并发。
- 让一个 worker 返回错误 lot_id：master 应发现错配，不纳入正常完成数量。
