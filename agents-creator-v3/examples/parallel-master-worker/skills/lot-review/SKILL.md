---
name: lot-review
description: 依据提供的规则复核独立 lot，并支持主 agent 分单、worker 回传与覆盖汇总。
---

# Lot 复核方法

## 输入与契约

每个任务包含 task_id、lot_id、source（绝对路径）、该 lot 的记录范围、用户提供的规则、允许资源。各任务只使用本 task 的内容；不能假定继承主会话。

返回 JSON：task_id、lot_id、status、finding、evidence、issues、missing_inputs。

- status 为 PASS / FAIL / BLOCKED，表示复核任务是否有效完成，不表示生产放行。
- finding 为 CLEAR / FLAGGED / UNDETERMINED，表示输入规则下的业务发现。复核完成且发现异常可以是 status PASS + finding FLAGGED。
- evidence 为带 source、record、observation 的对象数组；issues 和 missing_inputs 为字符串数组。
- 关键记录或规则缺失用 BLOCKED + UNDETERMINED；执行后产出未通过检查用 FAIL；字段齐全且规则复核完成才 PASS。

## 协调模式

核对任务清单与真实输入；给每个 lot 明确自包含任务包，并在单独子会话中调用同一个 worker 定义。运行时支持并发才并发；受容量限制分批执行即可。

按 task_id + lot_id 接收结果，重复、错配或缺项先标为未完成并核实。汇总各 lot 的状态与发现、计划数量与完成数量。超时无回传需单独报告，不记为正常。

如果缺失的是上游可补的文件，补齐后再发起针对性任务；没有新信息时不重复调用。跨 lot 趋势分析另行明确目标与证据，不把独立复核结果直接拼成因果结论。

## Worker 模式

读取当前 lot 的授权记录与规则，逐项比较，给出证据定位。规则可能因任务不同而不同，不在 skill 中硬编码企业阈值。

核对返回的 task_id、lot_id、覆盖范围和证据与本次输入一致。原始数据缺项或规则不明确时返回具体缺口。输出结构化结果，不回传其他 lot 或大量日志。
