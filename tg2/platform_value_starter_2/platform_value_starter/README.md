# 企业 Agent 平台：价值证据与任务改进参考包 v2.2

本版根据你的实证报告更新。**近期优先：全平台只读诊断 → skill/agent 与产物使用证据 → 同模型提示对照。** 已有用户级导出与 CPU 路由继续用；人工反馈是可选支路，SFT 默认关闭。

本包更新的是上一版交付代码，没有合并你未上传的公司内改版，也没有重新验证报告中的真实数字。所有运行示例均为虚构数据。核心需要 Python 3.9+ 标准库；可选 TF-IDF 训练/推断需要 scikit-learn。无 Docker、无数据库服务；离线 demo 不联网。内网采集与模型调用只有显式运行对应命令时发生。

## 从这里开始

本轮重点：[06_empirical_update.md](docs/06_empirical_update.md) 开头的代码实查修正清单，以及 [07_task_atlas_and_bench.md](docs/07_task_atlas_and_bench.md) 的任务分布和评测选题。v2.2 只补实际会误导的边界：缺失不填零、断言失败不漏选、加载与调用分开、已见失败保留调试入口。快速入口见 [00_quickstart.md](docs/00_quickstart.md)。

1. 阅读 [06_empirical_update.md](docs/06_empirical_update.md)：逐项回应你的实证，说明采纳与保留意见。
2. 阅读 [01_priority_and_value.md](docs/01_priority_and_value.md)：最小实施顺序和汇报口径。
3. 跑一次虚构示例：

```sh
sh run_demo.sh /tmp/platform_value_demo_v2
python3 -m unittest discover -s tests -v
```

输出目录必须不存在。Windows 可逐条运行 Python 命令。

| 示例输出 | 用途 |
|---|---|
| `tasks/task_atlas.md`、`tasks/bench_seed_candidates.jsonl` | 组织 × 主任务分布、能力共现及覆盖/失败候选；不自动生成标准答案 |
| `brief/action_board.md` | 已有观测与行动候选的一页汇总 |
| `report/value_report.md`、`usage_ledger.jsonl` | 窗口、分母、未知、请求级 token 明细；AUTO 不计人工采用 |
| `resources/resource_diagnostics.md` | 组织 × 阶段 × 工具/skill/agent 诊断 |
| `resources/artifact_relations.jsonl` | 明确来源关联、同内容候选、上传/读取、来源歧义 |
| `resources/supply_candidates.jsonl` | 有可靠目录可见范围时，列出未观测调用候选 |
| `evidence/cases.jsonl` | 当前全量案例与来源版本；人工确认和自动候选分别存放 |
| `dataset_v1/` | 真实标签来源分流；示例目录名沿用 v1，manifest 是 dataset-v2 |
| `bench_v1/`、`model_comparison.md` | 冻结任务与 MOCK 对比，只验证流程 |
| `synthetic_candidates.jsonl` | 训练种子衍生候选；未自动进入 SFT |

## 脚本分工

| 脚本 | 你需要改什么 |
|---|---|
| `task_atlas.py` | 接已有会话主任务标签；输出分布与选题来源，不调用模型，不自动批准题目 |
| `make_action_board.py` | 汇总现有指标与诊断，不增加价值总分 |
| `adapt_exports.py` | 在现有 OpenCode 导出上做字段映射；空导出拒收、summary dict 保留元数据 |
| `pull_sessions.py`（新增） | 可选用户级只读游标参考；配置真实接口字段。已有拉取器只搬审计逻辑 |
| `value_loop.py` | 幂等 SQLite 台账、版本、自动/人工证据分流、token 去重与组织切片 |
| `resource_diagnostics.py`（新增） | 对接工具来源/运行阶段、skill/agent 调用、目录、产物上传/读取；也提供文件哈希命令 |
| `build_datasets.py` | 来源组必选、组织隔离可选；弱标签诊断题分流；SFT 必须显式开启且参考合格 |
| `train_router.py` | 同一分集比较 TF-IDF+LR / keywords / majority；按你们 taxonomy 修改关键词 JSON |
| `route_prompts.py`（新增） | 配置短任务提示；低分或歧义透传；保留用户原文 |
| `bench.py` | 已验证/弱参考两种题集；固定上下文评测、同模型提示对照、组织/真实/合成分片 |
| `synthesize_slots.py` | 只生成可检查的窄任务候选；不自动训练 |
| `run_weekly.sh` | 自动分析批入口，人工确认不阻塞；不会替你创建调度任务 |
| `run_prompt_ablation.sh`（新增） | 同模型 A 原提示 / B 通用提示 / C 关键词 / D 分类器四组对照 |

## 可选 CPU 实验

在公司已准备的 wheelhouse 安装依赖，或使用现有环境。演示集成绩不代表公司数据效果。

```sh
python3 -m pip install --no-index --find-links /path/to/wheelhouse scikit-learn
python3 scripts/train_router.py \
  --train /tmp/platform_value_demo_v2/dataset_v1/router_train.jsonl \
  --dev /tmp/platform_value_demo_v2/dataset_v1/router_dev.jsonl \
  --test /tmp/platform_value_demo_v2/dataset_v1/router_holdout.jsonl \
  --out /tmp/platform_value_demo_v2/router_cpu
```

先在 dev 选阈值，holdout 不调参。分类器 pickle 只加载受信任内部训练产物。同模型提示实验要用**下游任务题**，不使用路由类别题；详见 [03_benchmark_training.md](docs/03_benchmark_training.md)。

## 升级说明

- SQLite 表结构兼容旧版；旧 `AUTO:*` 记录读取时自动分流，不会继续被当作人工确认。缺显式来源的旧记录为兼容保留原非 AUTO reviewer 的人工解释，请补齐 `label_source`。
- 新输入会生成新 source_revision；旧人工确认不继承到改过的会话。`summary` dict 也影响版本。
- `build_datasets.py` 默认不导出 SFT；需要时显式 `--export-sft`。旧 AUTO 题应重新导出到诊断集。
- 评分/提示执行代码升级，旧 bench 包仍保留作历史；用同一批题另冻新版本，双方重跑。不要篡改原 manifest 绕过校验。
- 保留 `evidence.db`、原始导出、版本化数据/模型/bench、同一个 `split_registry.json`。单写者批处理即可，不新增服务。

未实现：公司 API 的真实 schema 适配、OpenCode 全工具回放、语义近重复去重、财务账单自动分摊、GPU/LoRA 训练、自动发送确认卡、实时产品路由发布。数据契约、参考伪代码和验证边界分别在 docs 与 [VALIDATION.md](VALIDATION.md)。
