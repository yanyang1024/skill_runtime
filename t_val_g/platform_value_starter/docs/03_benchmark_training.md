# 同一份案例沉淀三种产物，但不共用一个质量标签

`good_reviewed` 只表示本次结果经过确认可用。能用于业务汇报、能作为评测标准、能用于训练，是三次不同判断。例如：一份被采用的报告可能依赖不可导出的资料，无法成为自包含 benchmark；一个失败会话很适合做回归题，其最后回答却不适合当训练目标。

## 1. 首批 benchmark 选什么

| 任务族 | 建议首批内容 | 验收方式 | 实现状态 |
|---|---|---|---|
| 任务分类 | 给出首轮问题，识别知识查询/代码工作/数据分析 | JSON 标签匹配；补模糊与混合问题标签 | 完整脚本与演示 |
| 查询条件抽取 | lot、wafer、metric、时间范围；缺字段明确询问/unknown | 类型、字段和值；不能默默猜测 | 完整 JSON 评分器，三字段合成候选 |
| 给定材料的差异整理 | 两份脱敏 recipe JSON，输出指定字段差异和单位 | 程序计算 golden JSON；结果不依赖隐藏材料 | 输入包/评分器可用，题目需要你整理 |
| 小型代码修复/数据分析 | 一份冻结小 CSV、一个失败脚本和独立验证输入 | 执行测试、结果数值/边界、不破坏原功能 | 提供下面的 runtime 回放伪代码；未实现执行器 |
| 企业知识查证 | 给定文档快照/版本，回答并定位证据 | 内容正确+引文真实，不仅仅有引用标记 | 需领域复核；初版不自动用关键词打分 |

先选当前确有高频使用、输入能冻结的两类。20–30 题是启动规模建议，不能支持很细的全公司准确率结论。代表性题与历史失败回归题分开标 `subset`，同时报告样本数；失败优先的题集不代表线上任务分布。

不要优先把“下一阶段工艺 tuning knob 的最优方向和幅度”做合成真值任务。这类任务需要实际量测、条件、工程边界及按 lot/run/时间的分组验证；模型写出合理解释不等于实验结果成立。

## 2. 一道题必须带完整条件

`curated.jsonl` 的一行是人工整理的独立任务包：

```json
{
  "id": "query-001",
  "case_id": "从案例快照复制",
  "source_revision": "从案例快照复制",
  "source_group": "tenantA/source-family-001",
  "parent_ids": [],
  "split": "holdout",
  "review_status": "approved",
  "reviewer_id": "确认人ID",
  "context_complete": true,
  "task_type": "query_extract",
  "subset": "representative",
  "allowed_uses": ["bench"],
  "messages": [
    {"role":"system","content":"提取 lot_id、wafer（整数）、metric，只输出 JSON。"},
    {"role":"user","content":"查询 LOT-DEMO-001，第 3 片晶圆的 cd。"}
  ],
  "target": {"lot_id":"LOT-DEMO-001","wafer":3,"metric":"cd"},
  "rubric": ["批次原样保留","wafer 为整数","不猜测未提供信息"]
}
```

`target` 是人工/程序确认的期望结果，不是自动取最后一条 assistant。重建条件时要保留必要的历史限制、工具 schema 和材料快照。用户在后续补充了新事实时，明确这是一道“已具备补充事实的新任务”；不能让原始首问承担未来答案。

固定输入任务只把 `messages` 发送给模型，`target/rubric/source` 留在评分侧。它不向模型提供原会话的最终产物，也不读取内网动态知识库。JSON 精确评分适合结构化、事先约定字段的题；开放回答应换为适合的验收器。当前评分器将输出截断、格式不对、字段/类型不符视为未通过；不会因为包含若干关键词或很长而加分。

## 3. 真实新模型怎么跑

```sh
python3 scripts/build_datasets.py curated.jsonl --cases evidence/cases.jsonl \
  --registry state/split_registry.json --out datasets/v1
python3 scripts/bench.py freeze datasets/v1/bench_candidates.jsonl --out benchmarks/v1

# BENCH_API_KEY 由你们的凭证方式注入环境，避免写入脚本或命令参数。
python3 scripts/bench.py run benchmarks/v1 \
  --model current-model --api-base http://internal-gateway/v1 \
  --trials 3 --out runs/current_v1
python3 scripts/bench.py run benchmarks/v1 \
  --model candidate-model --api-base http://internal-gateway/v1 \
  --trials 3 --out runs/candidate_v1
python3 scripts/bench.py compare runs/current_v1 runs/candidate_v1 --out comparisons/v1.md
```

上述地址和模型名是占位符，未实际访问。调用使用 Python `urllib`；不自动安装依赖，不自动重试请求，不跟随网关重定向。网关不支持某个参数/协议时，应改适配器并重跑双方基线；API 报错保留为失败记录。

比较要求题集、输入、评分代码、temperature、预算、试次数一致。真实接入还应把模型 revision、runtime/skill/tool 版本、检索快照、权限配置写入发布记录。网关改动属于环境变更，不能全部归因到模型。

看三项：关键题是否退步；总体及任务族可用性是否满足当前要求；相同质量下 token/延迟是否有优势。比较报告保留缺失试次与错误，不将两边空评分算成平局。需要估算不确定性时按独立任务/来源组做配对 bootstrap，不能把同题的多次试验当成很多独立题。

`bench.py` 只实现固定文本输入的 model benchmark。要证明 OpenCode 平台的总体任务成功率，必须测试模型和脚手架的组合。Agent 评测需要关心工具交互与环境最终状态；这是方法上把当前脚本限定为固定输入评测的原因。[Anthropic：Agent evaluation structure](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)

## 4. 接入你现有 bwrap/OpenCode 的回放伪代码

```python
# 仅伪代码：函数名代表你们已有的平台能力。不要直接执行历史会话里的 shell。
for task in approved_runtime_tasks:
    for model in [baseline_model, candidate_model]:
        for trial in range(3):
            workspace = prepare_fresh_workspace(task.input_snapshot)
            budget = {"wall_seconds": 180, "max_tool_calls": 20}
            # 使用你们现成的 bwrap、权限与租户隔离；不是只创建临时目录。
            run = run_existing_platform(
                model=model, workspace=workspace, prompt=task.prompt,
                skill_version=task.skill_version, tool_version=task.tool_version,
                budget=budget, network="recorded_readonly_fixtures")
            # 验收器由你维护，模型无权修改。隔离生成轨迹与验收上下文。
            result = trusted_validator(
                workspace, hidden_inputs=task.validation_inputs,
                criteria=task.criteria, output_from=run)
            record(task.id, trial, result, run.usage, run.errors, run.stop_reason)
```

冻结读接口响应/固定 CSV 只覆盖离线工具使用能力，不代表实时系统健康。读写业务接口用你们批准的测试环境和权限；不直接在生产重放有副作用的旧调用。上面的 180 秒/20 次是可调示例，不是通用合理阈值。

## 5. 更新持续发生，如何避免题库与训练互相污染

1. **先分组再分集**：同一源 session、同一业务事项、同一 recipe/实验 run 或复制模板的衍生任务在同一组。批次与项目等不一定都要整组隔离，按你要证明的泛化范围选择并记录。
2. `split_registry.json` 在不同数据版本间一直保留。旧保留组改为 train 会失败。不要每月删除 registry、随机重新分集。
3. 明确 train/dev/holdout；开发与选择超参只用 train/dev。只有 holdout 可进入正式比较题库，holdout 不导出 SFT。
4. 每个合成样本带 parent IDs、来源组、生成规则/模型版本、验证依据；衍生数据继承来源分组。精确输入冲突会被拦截；语义改写/近重复仍需人工或后续去重工具检查。
5. 保留固定 anchor v1 支持历史可比；新增失败进入候选队列，整理为挑战集 v2。比较 v2 时让旧模型也跑 v2；不要拿新题分数与旧题分数直接比较。
6. 已被反复查看并用于调环境的题，应标为开发/回归参考，不再声称是未见测试。旧 holdout 继续禁止进入训练，另建新独立来源的未来 holdout。

初版分组是你显式填写的，脚本不会假装仅凭哈希就能识别所有语义近重复。手工把同一任务换个 group 名也不能消除泄漏。

## 6. 训练：先学一个定义清楚的小判断

推荐第一步是首轮任务分类或工具错误原因分类。任务标签在决策时可判断，且有独立验证标准。不要用“最终 good/bad”或“后续几轮”作为意图标签；那是在学习结果相关性，模型、用户、难度与环境变化会一起污染标签。

包内的 CPU 基线使用字符 TF-IDF 与逻辑回归，省去 GPU 和预训练权重下载。中文可先不做分词。它提供 macro-F1、每类结果、混淆矩阵、majority baseline，以及给定阈值下的覆盖和正确率。[scikit-learn：TfidfVectorizer](https://scikit-learn.org/stable/modules/generated/sklearn.feature_extraction.text.TfidfVectorizer.html)、[LogisticRegression](https://scikit-learn.org/stable/modules/generated/sklearn.linear_model.LogisticRegression.html)

运行时对低分数/未知任务保持原有流程；默认 0.75 只是实验阈值，预测概率未校准。先在 dev 上观察覆盖与误分损失，再设阈值；holdout 只用于最终验收。你们已有简单关键词规则时也要保留作基线。若 TF-IDF 已够用，就不必为了“训练小模型”引入更重模型。

**任务分类不自动等于省推理费**。只有知道某类任务在便宜模型上仍满足质量要求，才把该分类接入模型路由。节省要计路由调用成本、错误路由后的重跑/升级成本、训练与维护摊销。

## 7. 合成先做程序有真值的部分

`synthesize_slots.py` 生成 lot/wafer/metric 的虚构查询条件和精确 JSON 目标。程序生成槽位再渲染文本，不让大模型自行编造实验结果。

```sh
python3 scripts/synthesize_slots.py curated.jsonl --cases evidence/cases.jsonl \
  --n 10 --seed 42 --out candidates/query_extract_synthetic.jsonl
```

默认只用 train 种子，只输出 candidate。确认模板表达与任务语义一致后，再由你记录批准人/验证来源，并把批准的少量衍生行与原种子一起送入新的数据版本；保留 parent 行以验证 lineage。先用合成数据补字段组合、缺失值、格式边界，不无限扩增相似模板。真正效果仍在独立真实任务上比较。

更一般的 teacher 合成可参考：

```python
for seed in training_seeds_only:
    proposals = teacher_generate(seed, variation="改写表达，不增加事实")
    for proposal in proposals:
        if not matches_source_constraints(proposal, seed):
            continue
        verdict = independent_validator(proposal)  # 规则/执行/领域复核，不能只让生成者自评
        save_candidate(proposal, parent=seed.id, split=seed.split, verdict=verdict)
```

失败会话的首选用途是错误分析和回归题。想做 SFT，应在完整、正确的输入条件下重写并验证目标答案，而不是保留所有中间错误。不要伪造原模型不可见的推理过程或删去必要工具观察后仍训练“答案凭空知道结果”。

## 8. LoRA 参考伪代码：仅在前面有价值时尝试

环境尚未验证 GPU、权重或你们的离线依赖版本，因此以下是伪代码。核心原则是只对被认可的 completion 计 loss；输入、工具/用户文本及失败草稿不作为要模仿的目标。TRL 支持 prompt-completion 格式与 PEFT adapters；需以你们实际安装版本的接口为准。[TRL：SFT Trainer](https://huggingface.co/docs/trl/en/sft_trainer)

```python
# PSEUDOCODE — prepare compatible offline wheels, local licensed weights and GPUs first.
from datasets import load_dataset
from transformers import AutoTokenizer, AutoModelForCausalLM
from peft import LoraConfig
from trl import SFTConfig, SFTTrainer

model_path = "/internal/models/approved_small_instruct_model"
tokenizer = AutoTokenizer.from_pretrained(model_path, local_files_only=True)
model = AutoModelForCausalLM.from_pretrained(model_path, local_files_only=True)
data = load_dataset("json", data_files={
    "train": "datasets/v1/sft_train.jsonl", "validation": "datasets/v1/sft_dev.jsonl"})
data = data.remove_columns([c for c in data["train"].column_names if c == "meta"])

# 训练前用真实 tokenizer 检查：chat template、EOS、completion 边界、loss mask；
# 超长样本先排除/重构，不能把目标截掉仍继续训练。下方长度与 LoRA 参数仅示意。
trainer = SFTTrainer(
    model=model, processing_class=tokenizer,
    train_dataset=data["train"], eval_dataset=data["validation"],
    peft_config=LoraConfig(r=8, lora_alpha=16, target_modules="all-linear", task_type="CAUSAL_LM"),
    args=SFTConfig(output_dir="models/task_lora_v1", max_length=2048,
        num_train_epochs=1, per_device_train_batch_size=1,
        gradient_accumulation_steps=8, learning_rate=1e-4,
        completion_only_loss=True, packing=False,
        eval_strategy="epoch", save_strategy="epoch", report_to="none"))
trainer.train()
trainer.save_model("models/task_lora_v1")
# 在同一冻结真实 holdout 上比较：基模+最佳简单提示 vs LoRA+相同输入/验收。
```

chat template 和版本兼容检查是训练前的实质验证。这里只给流程，不承诺上述超参适配你们的小模型，也不假装已执行训练。

## 9. 当前为什么不自动 DPO

DPO 数据是同一 prompt 对应 chosen/rejected 两个 completion；训练器支持这种偏好数据形状。[TRL：DPO Trainer](https://huggingface.co/docs/trl/en/dpo_trainer)

你的旧脚本把前回答与后回答配成对，但后回答已看过新用户消息。例如“再限制到 2026 年数据”“换成英文”“补这个文件”改变了信息条件，两个回答不在同一个问题下比较。普通追问也未必是否定旧回答。

以后真要做偏好对：冻结同一个完整 prompt 和工具条件，在此条件下生成两个候选；由独立规则/复核人确认可比性与偏好方向。若使用纠正后的答案，需在相同补充条件下重新评价另一个候选。先产候选供审查，不要自动以后一条为优选。
