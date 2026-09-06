# 组织 × 工具 / skill / agent 诊断

窗口 [2026-07-31T16:00:00+00:00, 2026-08-31T16:00:00+00:00)。这是一份问题与使用线索表，不是部门价值排名。

开发、验收、生产只接受明确来源元数据；缺失保持 unknown。自定义工具不自动等于测试；原生 bash 也可能在运行自定义脚本。

| 组织 | 阶段 | 来源 | 工具 / 版本 | 直接绑定能力 | 原始错误/已知调用 | 已验证预期错误 | 非预期错误/排除预期测试后的调用 | 断言失败次数 | 样本 |
|---|---|---|---|---|---|---|---|---|---|
| 演示工艺 | development | native | bash / v1 | skill:demo-analysis@v1 | 0/1 (0.0%) | 0 | 0/1 (0.0%) | 0 | small_sample |
| 演示工艺 | production | native | bash / v1 | skill:demo-analysis@v1 | 1/2 (50.0%) | 0 | 1/2 (50.0%) | 0 | small_sample |
| 演示工艺 | unknown | custom | custom_measurement / v1 | skill:demo-parser@v1 | 1/1 (100.0%) | 0 | 1/1 (100.0%) | 0 | small_sample |
| 演示工艺 | unknown | unknown | read_measurement / unknown | unknown:unbound@unknown | 3/3 (100.0%) | 0 | 3/3 (100.0%) | 0 | small_sample |
| 演示研发 | development | custom | custom_measurement / v1 | skill:demo-parser@v1 | 1/2 (50.0%) | 1 | 0/1 (0.0%) | 0 | small_sample |
| 演示研发 | production | custom | custom_measurement / v1 | skill:demo-parser@v1 | 0/1 (0.0%) | 0 | 0/1 (0.0%) | 0 | small_sample |
| 演示研发 | unknown | native | bash / v1 | skill:demo-analysis@v1 | 0/1 (0.0%) | 0 | 0/1 (0.0%) | 0 | small_sample |
| 演示研发 | unknown | unknown | read_measurement / unknown | unknown:unbound@unknown | 3/3 (100.0%) | 0 | 3/3 (100.0%) | 0 | small_sample |

表中‘非预期’只表示未被证明是通过断言的预期错误，不等于已确认缺陷。工具事件只有直接带 capability 绑定时才做错误归属，不向所有加载过的 skill 平摊。表内错误仍不是最终任务失败；先看 error_kind、underlying_target、assertion_failed 与恢复结果，再决定该改工具、数据、提示还是模型。

## 能力使用与扩散

| 类型 / 能力 / 版本 | 提供部门 | 使用部门 | 成功加载会话 | 调用会话 | 已知成功调用会话 | 用户数 |
|---|---|---|---|---|---|---|
| agent:demo-checker@v1 | 演示研发 | 演示研发 | 0 | 1 | 1 | 1 |
| skill:demo-analysis@v1 | 演示研发 | 演示工艺 | 3 | 3 | 2 | 3 |
| skill:demo-analysis@v1 | 演示研发 | 演示研发 | 1 | 1 | 1 | 1 |
| skill:demo-parser@v1 | 演示研发 | 演示工艺 | 1 | 1 | 0 | 1 |
| skill:demo-parser@v1 | 演示研发 | 演示研发 | 3 | 3 | 2 | 3 |

可见但未观察到调用的候选：2。加载不等于执行，调用不等于成果被采用。查看 supply_candidates.jsonl；没有可靠可见范围时不会生成该候选。

## 文件产物的再次进入与使用

观察到关联 3 条：上传 2；读取 1。
其中仅字节匹配候选 1，来源有歧义 1。不按 basename 关联，也不把 hash 相同直接归功于某一部门。

覆盖信息见 coverage.json。无事件表示未观察到，不表示没有复用。测试期与发布后应按 capability/tool 版本及阶段分别观察；不从部门名称猜阶段。
