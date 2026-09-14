# Harness 飞轮：信号 → 小改动 → 同题验证

本文保留上一版的明确链接/版本流程，命令从包根目录运行。v1.1 的会话候选与部门比较见 [修订说明](feedback_revision.md)。本版新增 `assertions_observed`；供给候选另需可信 `publication_source` 与 `usage_event_semantics=invoke_required`，不能用首次观测时间和所有部门列表替代发布与可见性。

这是上一轮信号层建议的启发性实现。**先跑观测和复盘，再决定改哪一个 Skill/Prompt/配置。** Python 3.9+ 标准库；无 Docker、无数据库服务；没有隐式联网或定时任务。

这个包独立运行，复用了上一版 `common.py` 和 `resource_diagnostics.py`。已有采集、任务图谱、裁判和训练分集继续用，不要求重建平台。

## 1. 最短开始方式

```sh
# 离线虚构示例，每次选择一个新目录
python3 demo.py demo_run

# 真实数据沿用已有导出：cases.jsonl 或标准化 session JSONL
sh run_signals.sh /path/to/cases.jsonl \
  '2026-08-01T00:00:00+08:00' '2026-09-01T00:00:00+08:00' signals_aug \
  /path/to/capability_catalog.jsonl
```

最后一个能力目录参数可省略。目录不存在不假装没有能力供给；未知字段仍保持未知。输入可包含更早的产物写入，用于关联报告窗口内的上传/读取；仅导出当月时可能漏掉旧来源。

| 文件 | 做什么 |
|---|---|
| `collect_signals.py` | 生成工具问题、相同参数反复报错、同 issue 调用恢复、能力接触、文件再进入信号 |
| `resource_diagnostics.py` | 复用上一版统计：部门/阶段/工具来源、skill/agent、文件来源/哈希候选 |
| `review_prompt.md` | 给你已有 Agent 的复盘提示：查证据、给替代解释、只提一个可验证修改 |
| `change_record.example.json` | 关联信号、改动目标、适用条件、验收计划、结果与生效版本 |
| `compare_change.py` | 读取既有运行器输出，比较同题旧/新版本，列出改善、退步、缺失与资源覆盖 |
| `demo.py` | 生成可改写的输入、评测计划和结果样例；没有模拟真实模型收益 |

先看 `signals_aug/review_queue.md`，原始分母和覆盖在 `resources/`。`signals.jsonl` 是观测；`review_requests.jsonl` 是待交给 AI 的请求包，尚未执行语义判断。

## 2. 两类信号怎样接上

**确定性部分已经用脚本计算，但只对观测负责：**

- 工具 error、测试断言失败分别保留；明确通过的预期错误不当生产问题。
- 同分支、同工具版本、相同参数反复报错，是排查线索，不自动判浪费。
- 同一 issue 出错后调用成功，是恢复线索，不证明任务完成或修复有效。
- skill/agent 的加载和调用分开；文件上传、读取、内容相同和来源明确分开。

**推理部分复用你的 Agent 或上一版裁判接口：**

```python
# 接口伪代码：不是本包已经实现的内网调用器
for job in selected_review_requests:
    evidence = read_allowed_case_revisions(job.signal.evidence_refs)
    if evidence.incomplete:
        save_candidate(job.signal_id, state="needs_evidence")
        continue
    proposal = internal_agent(job.system_prompt, job.signal, evidence)
    save_candidate(proposal)  # 不直接写入公共 Skill 或运行时记忆
```

先选一个高频可复现问题。AI 必须给观察、假设、替代解释、依据、适用范围和验证办法。仅元数据不足以识别用户目标、背景缺失或根因；按指针读取真实证据后再判断。

要做任务结果判断，继续用上一版 `conversation_judge_starter` 做人工参考与裁判校准；不要把该包的 observed_outcome 自动变成本包所有任务的程序真值。

## 3. 数据适配只改这一小层

支持旧 `{"case_id":...,"source_revision":...,"session":{...}}`，或直接一行 session。每会话只提供一份当前快照。字段约定如下：

| 输入位置 | 最小字段 | 缺失时 |
|---|---|---|
| session | tenant_id、session_id；可选 dept/org_section、user_id、coverage | 未知组织保持 unknown，不推断职位或能力 |
| tool_events[] | event_id、ts、name/tool_id、status；可选 error_kind、tool_version | 缺 ts 跳过时间窗统计并计数；有事件必须有稳定 event_id |
| 测试/来源 | usage_phase+phase_source、tool_origin+origin_source；断言元数据 | 阶段、来源保持 unknown；不按部门猜测 |
| 序列分析增量 | run_id、branch_id；重试需 args；恢复需 issue_id | 缺少链接只做基础统计，不把多 Agent 轨迹硬串起来 |
| capability_events[] | event_id、ts、kind、capability_id、version、action、event_source | 只接受 runtime 的加载/调用作为使用事件 |
| artifact_events[] | event_id、ts、op、success；artifact_id/version 或明确来源 | 路径/文件名不做强关联；无关联不代表没有复用 |
| 可选哈希 | sha256、sha256_source=file_bytes、size_bytes>0 | 局部 read/路径哈希不当完整内容指纹 |

artifact_id/version 必须代表同一存储身份的不可变版本，不要从 basename 生成。相同字节仍可能来自不同生产者，结果保留来源歧义。脚本不报告全平台复用率。

同 event_id 的重复投影按租户去重，冲突内容报错；跨会话投影组织不一致则不武断归给某个部门。请沿用既有事件 ID，别用导出行号冒充全局调用 ID。参考脚本要求调用完成后的事件快照；开始/结束事件应在适配时合为一条最终事件。

`phase_source/origin_source` 只接受 runtime/registry/manifest/human。`expected_error=true` 只有同时带 `expectation_source=test_definition` 且 `assertion_passed=true` 才能说明预期负例通过。

首次可直接复制 demo_run 中的 JSONL 对齐字段，不必实现通用解析器。角色、项目、模型资源的全部统计继续用原包，不在本包重复计算。

## 4. 把一个信号变成一次小实验

复制 `change_record.example.json`：写明 signal_ids、当前实际版本、一个目标文件、一个小改动、适用/不适用条件，再冻结题集。

优先三类题：原失败、原成功、新来源。同源任务家族不能同时用于改提示和未见考试；沿用旧 split_registry。开发集调好后才用 holdout；反复看过的题只能算已见回归。

`demo_run/eval_plan.json` 展示本包的简化计划：

```json
{
  "change_id": "date-example-v1",
  "old_harness": "实际旧快照哈希",
  "new_harness": "实际新快照哈希",
  "model": "固定模型部署版本",
  "environment_hash": "冻结环境与工具版本哈希",
  "grader_version": "固定验收器或裁判契约版本",
  "budget_hash": "同一预算上限策略的哈希",
  "trials": 1,
  "tasks": [{"task_id":"q1","input_hash":"完整题面与必要附件哈希","source_group":"family-1"}]
}
```

哈希必须由实际材料计算，本包只核对你提供的值是否一致，不能证明手工声明真实。计划在运行前冻结；不要根据结果删除题或选择最好一次。trial 从 0 开始。

**运行 Agent 沿用你的现有 Harness，下面只是接线伪代码：**

```python
for task in plan.tasks:
    for trial in range(plan.trials):
        for version in balanced_order(plan.old_harness, plan.new_harness):
            env = reset_from_same_snapshot(task)  # 不共享前一组写过的文件/记忆
            run = your_existing_runner(task, env, harness=version, budget=plan.budget)
            result = your_frozen_validator(task, run)  # 不让被测 Agent 修改验收规则
            emit_result(task, trial, requested=version, loaded=run.actual_version,
                        outcome=result, usage=run.all_attempts_usage, latency=run.elapsed)
```

本包不执行回放/工具，也不生成任务正确答案。旧版 bench.py 输出如字段不同，在这一步映射成 `demo_run/old_results.jsonl` 的结构即可。

## 5. 同题比较命令

```sh
python3 compare_change.py --plan eval_plan.json \
  --old old_results.jsonl --new new_results.jsonl --out comparison_v1
```

每条结果需要 task_id、trial、input_hash、model、environment_hash、grader_version、budget_hash、requested_harness、loaded_harness、outcome。资源字段可选：input_tokens、output_tokens、latency_s；应包含本任务所有失败尝试/重试的消耗。Judge 的成本如需核算另列，不混成 Agent 本身提速。

- outcome 用 pass/fail/unknown/not_applicable；缺失/超时没有可靠结论就 unknown，并保留已耗资源。
- requested_harness 是想运行的版本，loaded_harness 是实际运行快照。未生效的结果保留，标记不可比，不静默排除后宣布提升。
- 改善、退步、双方通过、双方失败、未知和不可比单列。资源缺失不填零。
- `ready_for_decision` 仅表示这轮记录可进入决策复核，不证明有提升；全失败也可能记录齐全。没有自动“达标”或自动上线。
- 相同预算指上限/策略一致，不要求实际 token 一样。双方通过子集的资源差异仅辅助查看，仍需同时看整体质量和全部已知消耗。

## 6. 记忆治理也只用一份记录

按现有流程把 candidate → evaluated → active/retired 记录清楚。只有被验证的有条件经验进入默认加载；原始失败轨迹仍是诊断材料。

记录 source_refs、applicability、base/applied_version、eval_result_ref、decision_reason、supersedes、recheck_when 即可。工具/schema 更新、来源失效或出现明确反例时触发复核；后写入不天然优先，低频不自动删除。退役意味着退出适用范围或默认注入，原证据与历史评测保留。

自动化先到“生成候选和报告”。具体补丁、发布、回滚和 active 记忆更新走你已有的平台流程，不额外引入权限系统。

## 7. 每轮只留下三样东西

1. 一张信号复盘卡：发生什么、证据、候选解释。
2. 一份小修改记录：改哪里、何时适用、怎样验收。
3. 一份旧/新对照：哪些题改善或退步、版本是否生效、资源代价和证据缺口。

没有好验证办法时，下一轮先补一个验收点；不是继续自动堆积“经验”。可以由公司现有调度调用 run_signals.sh，但本包没有安装 cron 或创建定时任务。

## 实现与验证范围

脚本沿用上一轮已经明确的信号口径。本轮只跑虚构离线 demo 和少量关键断言，不做真实模型或内网验证。示例故意保留一条退步与一条缺失结果，展示飞轮如何留下“不应直接启用”的证据。

本包未实现：自由文本根因自动判真、公共 Skill 自动修改、Agent 回放、内网接口采集、完整文件哈希自动追踪、跨版本指标趋势服务、裁判再校准、模型训练。相关接口给出接线位置，按需替换即可。
