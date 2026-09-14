# Harness 飞轮参考包 v1.2：实际 Agent / Skill / Tools 案例

**本轮新增：用上传的三个真实会话、Agent/Skill 配置和课程产物做契约评测。** 进入 [case_eval/README.md](case_eval/README.md) 查看三个轻量脚本；先读 [实际案例分析](docs/actual_harness_cases.md)。包含 Markdown 解析、交接/产物审计、5 个校验器探针、7 个评测起点。只需 Python 3.9+ 标准库。

已在上传样例上执行文本解析、产物一致性检查和工具探针；没有重跑生成 Agent 或浏览器交互，也没有修改上传配置。`case_eval/examples/` 是实际处理摘要。

下面保留 v1.1 的会话与部门统计入口；本次 MD 导出缺少的大多数状态/token/退出码不补造，不能直接当完整运行日志使用。

**先提取可追溯观测，再生成有边界的候选，最后做一个小改动的同题验证。** 本版补齐缺少 branch/version 时的会话入口，以及部门之间的共同切片比较。Python 3.9+ 标准库，无需安装依赖。

先读 [实测反馈修订说明](docs/feedback_revision.md)。它说明哪些实证值得保留，哪些结论需要收紧，以及文件、Skill、Agent、部门比较和评测集怎么接起来。

```sh
# 一次虚构离线 demo；输出目录需不存在
python3 demo_session_first.py demo_v11

# 接已有 adapter 的 session JSONL（不是任意原始 OpenCode JSON）
python3 session_first.py /path/to/sessions.jsonl \
  --dataset-id dept-study-202609 --window-seconds 300 --out session_signals

python3 compare_departments.py session_signals/tool_metric_rows.jsonl \
  --dataset-id dept-study-202609 --tenant-id YOUR_TENANT \
  --org-a IAD-D --org-b YAE --out department_comparison
```

`demo_v11/department_comparison/comparison.md` 展示一个虚构例子：原始报错率不同，统一任务构成后相同。它只是说明比较方法，不是公司数据或“部门无关”的证据。

| 入口 | 用途 |
|---|---|
| `session_first.py` | 读/写/edit 操作、共享路径候选、时间窗序列、Skill/Agent 调用接触、question 复盘入口、任务分布 |
| `compare_departments.py` | 保留原始率、共同切片下同权重率、覆盖、用户/会话数与未调整上下文 |
| `review_prompt.md` | 给已有 AI 的取证复盘规则；观察范围和改进负责人分开判断 |
| `bench_card.example.json` | 从真实摩擦点整理一张待验收评测卡，不自动生成正确答案 |
| `docs/feedback_revision.md` | 信号口径、实证纠偏、最小适配、评测与改动优先级 |
| `collect_signals.py` / `resource_diagnostics.py` | 保留上一版的明确链接、版本/来源信号；新增断言覆盖，收紧供给分母 |
| `compare_change.py` / `demo.py` | 保留上一版同题旧/新对照，见 [原流程](docs/earlier_strict_flow.md) |

两种入口按证据条件使用。新入口不会把 session_id 伪造为 branch_id，也不会把工具输入/输出哈希写成文件字节哈希。旧入口的强关联条件继续保留；不要把新入口的路径候选直接灌成“已确认复用”。

新入口主要输出：

- `session_file_events.jsonl`：读/写/edit 的工具报告、路径、存储身份、payload_hash 来源。没有把 bash 文本登记为文件变更。
- `shared_path_candidates.jsonl`：共享存储下先修改后跨会话读的候选，内容版本和业务采用仍为 unknown。
- `session_candidates.jsonl`：同工具时间窗线索、question 和可能写文件的 shell 命令复盘入口。信号可以重叠，条数不是失败次数。
- `capability_contacts.jsonl`：直接来自 skill/task 调用；加载失败、分派返回与下游验收分开。
- `tool_metric_rows.jsonl`：会话×工具等分区的原始报错计数。包含测试错误的可能性，不等同生产缺陷率。
- `task_map.jsonl`：部门×任务类型×标签来源的会话数与已知用户数，包括无工具会话。
- `manifest.json`：当前导出快照哈希、字段覆盖与未展开 shell 数。

已有原始会话解析器继续用，只借鉴 `tool_part_to_event()` 的字段映射。完整字段说明与最小接线在修订说明中。默认分析你传入的导出范围；月底统计先在已有导出器选择时间窗，所有月份按 UTC 分桶。

这些 v1.1 入口沿用此前虚构 demo 的验证；v1.2 实际样例验证范围见上方 case_eval。未接内网、未运行真实模型；没有实现通用 shell 解释器、跨会话语义聚类、完整文件跟踪服务或自动上线流程。
