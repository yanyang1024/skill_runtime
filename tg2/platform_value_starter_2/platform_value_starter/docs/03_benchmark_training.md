# benchmark、路由提示与训练：先让简单改动可比较

保留你已实现的跨组织题集与 CPU 路由。近期目标是“能比较新模型/提示，解释退步”，训练仍按收益证据决定。你报告的 51 题应按 31 个真实路由题、10 个合成抽取题、10 个合成差异题分别看；真实路由的 AUTO 参考不因题目来自真实对话就成为人工真值。

## 1. 任务包与参考标签的三种状态

| 状态 | 可做什么 | 默认行为 |
|---|---|---|
| heuristic/model/unknown 参考 | 弱监督训练探索、诊断标签一致性、待验证案例 | 导出诊断 bench 候选，不导出 SFT |
| approved human 参考 | 在自包含条件下评测目标一致性，符合用途时作训练目标 | 可进入已验证参考 bench；SFT 仍需显式开关 |
| approved programmatic_gold + validator_ref | 对确定输入/输出契约做技术验收 | 与真实/合成来源分片出分；不能证明业务采用 |

`AUTO:*` 不被解释为 human，即使你误填 `label_source=human`。`validator_ref` 指向版本化验证规则/固定输入，不能是生成模型“认为正确”的自评。脚本只检查证据契约，验证器语义正确性仍由维护者负责。

例：

```json
{
  "id":"extract-001", "case_id":"复制来源案例ID", "source_revision":"复制来源版本",
  "source_group":"tenant/source-family-001", "parent_ids":[], "split":"holdout",
  "review_status":"approved", "reviewer_id":"validator:slots-v1", "label_source":"programmatic_gold",
  "validator_ref":"validators/slots-v1#fixture-001", "context_complete":true,
  "task_type":"query_extract", "subset":"capability", "synthetic":true,
  "allowed_uses":["bench"],
  "messages":[
    {"role":"system","content":"提取 lot_id、wafer（整数）、metric，只输出 JSON。"},
    {"role":"user","content":"查询 LOT-DEMO-001，第 3 片晶圆的 cd。"}
  ],
  "target":{"lot_id":"LOT-DEMO-001","wafer":3,"metric":"cd"},
  "rubric":["批次原样保留","wafer 为整数","不增加字段"]
}
```

这是字段示意。真实导出必须能回到当前 source_revision。只发 `messages` 给被测模型，不发送 target/rubric；输入截止于任务请求，不把后来纠正/最终答案混入。必要的数据表、工具 schema、历史限制要在输入包里完整冻结。

## 2. 分集：来源隔离必需，组织隔离按目的选

同 session、同任务/实验/复制材料家族、其衍生样本不能跨 train/dev/holdout。包内检查 session、source_group、精确规范化输入、parent 关系及历史 registry；不能发现所有语义近重复，实际 recipe/lot/run 等共源关系需在导出侧归组。

```sh
# 已有部门内按来源组划分，split 由你显式提供
python3 scripts/build_datasets.py curated.jsonl --cases evidence/cases.jsonl \
  --registry state/split_registry.json --out datasets/grouped_v2

# 另一个评测目标：未见部门迁移，输入 split 要提前按组织安排好
python3 scripts/build_datasets.py curated_cross_org.jsonl --cases evidence/cases.jsonl \
  --registry state/split_registry.json --org-field org_section --out datasets/cross_org_v2
```

这两个示意命令不意味着同一来源可以在两个实验换 split；共用 registry 会阻止这种变化。组织键只在你启用时追加；来源/session 键始终保留。源码 `--org-field` 不会自动替你挑 train/dev/holdout，也不会把标签里填的组织当真，组织从来源 session 取。

新部门上线适合跨组织试验；已有部门后续使用更适合来源分组+时间窗口。时间拆分目前由你的导出清单安排，没有自动时间 splitter。“同科”不是充分泄漏条件，“换科”也不能消除共用模板泄漏。[scikit-learn 官方交叉验证文档](https://scikit-learn.org/stable/modules/cross_validation.html)

保留固定 anchor；新增题进入新版挑战集。旧 holdout 一旦用于调提示，只能作为已见回归参考，不能继续声称未见测试，也不能放进训练。另取未来独立来源作 holdout。不要删 registry 来绕过约束。

## 3. 标签来自规则时，CPU 结果怎样读

```sh
python3 scripts/train_router.py --train datasets/cross_org_v2/router_train.jsonl \
  --dev datasets/cross_org_v2/router_dev.jsonl --test datasets/cross_org_v2/router_holdout.jsonl \
  --org-holdout --keywords examples/router_keywords.example.json \
  --threshold 0.5 --out models/router_v2
```

先依据 dev 决定阈值；命令中的 0.5 只是示例，不继承你的其它实验结论。输出包含：三方法同分集成绩、固定标签集合、每类 support/F1、混淆矩阵、标签来源、组织/参考质量切片、选中数与选中正确数、覆盖率。阈值曲线仅在 dev 输出；holdout 只报告给定阈值。

默认关键词只是三类示范，请用公司相同 taxonomy 的独立基线配置。关键词多类命中或未命中都弃权，弃权在全量基线比较中计未命中，不悄悄删样本。宏 F1 对各方法使用同一显式标签集合，包括某切片中暂缺的类别；切片比较要同时看 support，不能只看总 F1。

如果真值也是这些规则生成，结果名为弱标签一致性。标签一致并不能证明意图正确；无人工标签时仍可先探索，再用下游程序验收判断路由是否带来实际好处。分数是未校准选择分数，0.75 不代表真实正确概率 75%。

输出 router.pkl 为可执行反序列化格式，仅加载自己受信任训练产物；保留同目录 metrics.json 以校验后续题目未混入训练。

## 4. 已验证与诊断 benchmark 分开冻结

```sh
python3 scripts/bench.py freeze datasets/grouped_v2/bench_candidates.jsonl \
  --out benchmarks/validated_v2
python3 scripts/bench.py freeze datasets/grouped_v2/bench_diagnostic_candidates.jsonl \
  --mode diagnostic --out benchmarks/diagnostic_v2
```

空候选集不冻结。默认模式拒绝弱参考；diagnostic 模式会把“通过”解释为对当前参考的一致性。真实/合成、参考来源、组织、任务族、代表性/历史失败题分别切片。总通过数是运行检查的汇总，不应该拿不同难度/来源的题混成部门或模型价值分。

`json_exact_v1` 适合严格结构化目标：类型不对、缺字段、多字段、截断、格式错都不通过。recipe_diff 若允许不同顺序/等价单位，先定义规范化验收器；不要通过放宽关键词命中隐藏错误。当前包没有新增 recipe 专用评分器，继续用你已验证的程序 golden 和合适输出契约。

## 5. 同模型提示对照：最小的分类后执行实验

四组：none / generic / keywords / classifier。generic 是必要基线，用来判断类别路由是否真的比统一提示更值。`route_prompts.py` 只追加短任务提示，原始 system/user 内容保持；低分、无映射、多类关键词命中透传。多轮在本版类别路由也透传，避免仅看最后一句丢掉限制。

```sh
# 先把真正下游任务独立冻结；不要使用 intent_routing 题集。
# BENCH_API_KEY 在公司环境注入；地址与模型名为占位。
sh run_prompt_ablation.sh benchmarks/downstream_v2 internal-model-revision \
  http://internal-gateway/v1 models/router_v2/router.pkl runs/prompt_v2 0.5
```

shell 使用默认三类关键词与提示。你们 taxonomy 不同，应在 `route_prompts.py` 修改默认模板，或照下面逐条运行，显式传 JSON：

```sh
python3 scripts/bench.py run benchmarks/downstream_v2 --model internal-model-revision \
  --api-base http://internal-gateway/v1 --trials 3 --prompt-policy classifier \
  --router-model models/router_v2/router.pkl --route-threshold 0.5 \
  --keywords examples/router_keywords.example.json --hints examples/task_hints.example.json \
  --out runs/classifier_v2
python3 scripts/bench.py compare runs/none_v2 runs/classifier_v2 \
  --axis prompt --out reports/prompt_comparison.md
```

`runs/none_v2` 要按相同命令、题集和预算另跑 `--prompt-policy none`。模型对比默认 axis=model，要求提示策略完全相同；提示对比要求模型、网关、题集、采样参数、预算、试次数相同，只允许策略变动。记录模型 revision 和网关后端环境；相同字符串无法防止服务端偷偷换权重。

此实验拒绝 intent_routing 题，防止提示泄露被考类别；classifier 还检查题目来源组、case、精确输入与训练元数据的重合。近重复仍需来源归组。脚本不自动检查人工提示模板是否照抄测试答案，冻结模板只能用 train/dev。

当前 shell 顺序运行四组，便于复用；线上拥塞/缓存会影响速度。真实比较可在不同顺序重复或在测试网关交错运行，固定缓存/负载条件，并记录硬件与检索快照。逐题耗时含分类和模型响应，token 含追加提示；模型/分类器初始化单列。单次固定输入响应耗时不等于多轮 Agent 任务完成耗时。

**判定顺序**：关键题退步 → 全部计划任务的通过与缺失 → 分类提示覆盖 → 含失败的 token/成功任务与延迟。总量和 p95 只有足够且完整资源数据时才比较。若 D 不能超过 B/C，采用简单策略即可。跨模型大小路由留到每个任务族已有可靠质量证据后再加，计入误路由升级/重跑成本。

查询改写是方法启发：从下游效果评价输入变换；其检索实验不证明这里必然提速。[Ma 等，EMNLP 2023](https://aclanthology.org/2023.emnlp-main.322/)

## 6. 新模型对比与真实 Agent 回放

```sh
python3 scripts/bench.py run benchmarks/validated_v2 --model current-revision \
  --api-base http://internal-gateway/v1 --trials 3 --out runs/current_v2
python3 scripts/bench.py run benchmarks/validated_v2 --model candidate-revision \
  --api-base http://internal-gateway/v1 --trials 3 --out runs/candidate_v2
python3 scripts/bench.py compare runs/current_v2 runs/candidate_v2 --out reports/model_v2.md
```

只有显式 run 才调用网关；不跟随重定向、不自动重试。API 错误和缺失保留分母，不当平局；重复试次不能被当作独立题扩大置信度。当前是固定上下文 model bench，没有执行工具循环。

下面才是接到你现有 OpenCode 运行器的参考伪代码：

```python
for task in frozen_runtime_tasks:
    for policy in fixed_prompt_policies:
        workspace = existing_isolated_workspace(task.input_snapshot)
        run = existing_platform.run(
            model=fixed_model_revision,
            messages=policy.apply(task.messages),
            workspace=workspace,
            skill_versions=task.skill_versions,
            tool_versions=task.tool_versions,
            readonly_responses=task.recorded_tool_responses,
            budget=task.fixed_budget,
        )
        verdict = independent_validator(run.final_artifact, task.hidden_checks)
        record(task.id, policy.version, verdict, run.requests, run.elapsed)
```

使用已有测试隔离与权限，不直接执行历史 shell 或写生产接口。验收器不允许被模型改；录制只读响应不代表实时接口健康。没法冻结必要条件的题先留作复现候选，不计入可比评测。

## 7. 合成与后训练仍做减法

优先保留 query_extract/recipe_diff 程序真值能力题；缺失字段、单位、非法输入、格式边界比无限改写同一模板有用。合成题单列，不能拿高分填补真实任务覆盖不足，更不能合成未验证工艺因果或“最优 recipe”真值。

`synthesize_slots.py` 只接受已批准训练种子，产生 candidate，继承 train/source_group/parent。候选批准后明确验证器或人工来源。程序真值标签可以减少逐条复核，但模板语义和验证逻辑仍需验证，不能自动洗成 human。

```sh
python3 scripts/synthesize_slots.py curated.jsonl --cases evidence/cases.jsonl \
  --n 10 --seed 42 --out candidates/slots_v2.jsonl
# 只有你明确需要训练且目标已批准时才加此开关
python3 scripts/build_datasets.py curated_approved.jsonl --cases evidence/cases.jsonl \
  --registry state/split_registry.json --export-sft --out datasets/sft_trial_v2
```

SFT 的 prompt/completion 已分开；只对目标 completion 训练，输入与错误草稿不作为模仿目标。GPU 训练先保留伪代码，不引入依赖栈和超参承诺：

```python
# PSEUDOCODE：用公司现有、已验证的离线训练栈实现这些步骤。
train, dev = load_approved_prompt_completion_data()
assert no_source_overlap(train, dev, frozen_real_holdout)
model, tokenizer = load_local_approved_small_model()
validate_chat_template_eos_and_loss_mask(tokenizer, train)
reject_or_rebuild_truncated_targets(train)
adapter = train_lora(model, train, dev, loss_on="completion_only")
compare_on_same_real_holdout(
    baseline=(model, best_simple_prompt),
    candidate=(model, adapter, best_simple_prompt),
    include_failures_and_resource_cost=True,
)
```

继续保留“不自动 DPO”：追加英文版、补文件或新条件不等于同 prompt 的 rejected/chosen。失败案例先用于错误分类/回归题；若以后要做偏好对，固定同一完整输入，重新产生可比候选，用独立判定确定优劣。
