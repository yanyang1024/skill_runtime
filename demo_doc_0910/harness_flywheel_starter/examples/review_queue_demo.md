# 信号复盘入口

以下是观测候选，未做 AI 根因判断，也未更改任何运行时规则。

| 信号 | 类型 | 范围 | 下一步 |
|---|---|---|---|
| 0d057459ccfb6da7a4aaf59b | call_error_then_success | {'tenant_id': 'DEMO', 'run_id': 'run-1', 'branch_id': 'main', 'issue_id': 'date-1', 'tool_id': 'date_query', 'tool_version': 'v1', 'phase': 'production'} | 复盘前后改变及预期负例；调用恢复不证明任务完成，也不证明修改造成成功 |
| 0ef89089eaac7b991c15a1de | tool_problem | {'tenant_id': 'DEMO', 'org': '示例工艺', 'phase': 'production', 'origin': 'custom', 'tool_id': 'date_query', 'tool_version': 'v1', 'capability_kind': 'skill', 'capability_id': 'date-helper', 'capability_version': 'v1'} | 先核对测试阶段、错误输入和工具契约；不把错误比例当部门价值或工具缺陷率 |
| 130bad6acc2e731194864b3c | same_args_error_repeated | {'tenant_id': 'DEMO', 'run_id': 'run-1', 'branch_id': 'main', 'tool_id': 'date_query', 'tool_version': 'v1', 'phase': 'production'} | 3 次只是排查示例；核对动态数据、轮询和限流后，才能判断是否无进展；不要求连续发生 |
| 4fe1bdde363868cb0ef1fe82 | capability_contact | {'tenant_id': 'DEMO', 'consumer_org': '示例工艺', 'provider_org': '示例研发', 'kind': 'skill', 'capability_id': 'date-helper', 'version': 'v1'} | 分别看加载和调用；仅作为能力使用与扩散线索，不证明任务收益 |
| 863e7a4421f9b25a94ccb3de | tool_problem | {'tenant_id': 'DEMO', 'org': '示例研发', 'phase': 'acceptance', 'origin': 'custom', 'tool_id': 'date_query', 'tool_version': 'v1', 'capability_kind': 'skill', 'capability_id': 'date-helper', 'capability_version': 'v1'} | 先核对测试阶段、错误输入和工具契约；不把错误比例当部门价值或工具缺陷率 |
| e67ea0311bcaa20f1fec3388 | artifact_reintroduced | {'tenant_id': 'DEMO', 'org': '示例研发'} | 核对来源、实际使用和验收；hash 候选不自动归因，上传不等于采用 |

原始计数、分母、缺失时间戳及资产关联见 resources/。未发现候选不表示没有问题；不同类型可能引用同一事件，不能把信号条数当失败次数。
