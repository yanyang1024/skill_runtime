# 企业 Agent 平台：价值证据、内部评测与训练候选最小包

建议先完成：**会话证据台账 → 小批量用户确认 → 修复一个高频问题 → 用固定任务验证**。与此同时，把经过整理的任务留作 benchmark 和训练候选。暂缓全量对话 SFT、自动 DPO、业务价值总分和复杂仪表盘。

本包参考并审查了你提供的三份压缩包。它是一套独立的简化替代实现，保留原包不动；不是直接连接公司内网的成品。示例数据全部虚构。**核心流程只需 Python 3.9+ 标准库，无 Docker、无数据库服务、无自动联网。** 可选 CPU 分类训练需要 scikit-learn；LoRA 只提供伪代码。

## 从这里开始

1. 先读 [01_priority_and_value.md](docs/01_priority_and_value.md)：做什么、哪些口径要改、如何向上汇报。
2. 运行离线示例，查看结果形态：

```sh
sh run_demo.sh /tmp/platform_value_demo
```

输出目录必须不存在。Windows 可照脚本逐条运行 Python 命令，不依赖 shell 才能使用核心脚本。

3. 主要输出：

| 文件 | 用途 |
|---|---|
| `report/value_report.md`、`report/metrics.json` | 有分母、覆盖率、未知状态的证据报告 |
| `evidence/cases.jsonl`、`evidence/review_queue.md` | 全量当前案例与复核入口，支持回看来源版本 |
| `evidence/review_template.jsonl` | 只复制要确认的记录到人工填写文件；不回写空白模板 |
| `dataset_v1/`、`split_registry.json` | 明确分组的训练/验证/保留集，以及跨版本分组记录 |
| `bench_v1/`、`model_comparison.md` | 冻结题集与 MOCK 流程比较，不是实际模型效果 |
| `synthetic_candidates.jsonl` | 可检查的字段抽取合成候选，默认未批准训练 |

4. 真实接入只先做一个适配器：[02_data_contract.md](docs/02_data_contract.md)。现有 API 导出的字段不符合约定时应改映射，不能继续用“尽力解析成功”的数据出汇报。

## 全管道总览

```text
                 ┌──────────────── 数据进入 ────────────────┐
 平台导出/API ──▶ adapt_exports.py ──▶ sessions.jsonl（统一契约，坏数据进 .rejected）
                                              │
              ┌───────────────────┬───────────┼────────────────────┐
              ▼                   ▼           ▼                    ▼
       value_loop.py      task_atlas.py  org_skill_map.py   reuse_signals.py
       证据台账(SQLite)    任务分布图谱    部门×技能×工具      产物/技能复用
       ingest→queue→       意图×部门×月   可靠性(公平护栏)    (upload>read,
       review→report       标签分级可信    修复候选清单        跨用户>同用户)
              │                   │
              ▼                   ▼
        cases.jsonl ──▶ build_datasets.py（分组防泄漏，org 锁 split）
              │                   │
              │                   ▼
              │            bench.py freeze/run/compare（冻结题集、模型对比、组织分片）
              │                   │
              │            route_hint.py apply/ab（路由提示改写 A/B）
              │                   │
              └────▶ synthesize_slots.py（仅 train 种子）→ train_router.py（可选 CPU 基线）
```

## 命令速查（真实接入后的最小月度节奏）

```sh
# 1. 适配导出（坏数据会整体拒绝，退出码 2）
python3 scripts/adapt_exports.py import_manifest.jsonl --out normalized/sessions.jsonl

# 2. 台账与证据报告
python3 scripts/value_loop.py --db state/evidence.db ingest normalized/sessions.jsonl
python3 scripts/value_loop.py --db state/evidence.db queue --out review/$(date +%Yw%V)
python3 scripts/value_loop.py --db state/evidence.db report \
  --start '2026-08-01T00:00:00+08:00' --end '2026-09-01T00:00:00+08:00' --out reports/2026-08

# 3. 三份只读分析（随时可跑，不改状态）
python3 scripts/task_atlas.py     normalized/sessions.jsonl --labels router_preds.jsonl --out analysis/atlas
python3 scripts/org_skill_map.py  normalized/sessions.jsonl --out analysis/org_map
python3 scripts/reuse_signals.py  normalized/sessions.jsonl --out analysis/reuse

# 4. 评测与模型对比（冻结 → 跑 → 比）
python3 scripts/build_datasets.py curated.jsonl --cases review/cases.jsonl \
  --registry state/split_registry.json --out datasets/v2
python3 scripts/bench.py freeze datasets/v2/bench_candidates.jsonl --out benchmarks/v2
python3 scripts/bench.py run benchmarks/v2 --model X --api-base http://internal-gateway/v1 --trials 3 --out runs/X_v2
python3 scripts/bench.py compare runs/base_v2 runs/X_v2 --out comparisons/v2.md
```

## 文档地图

| 想知道 | 读 |
|---|---|
| 先做什么、怎么汇报 | [01](docs/01_priority_and_value.md) |
| 数据怎么接、字段语义 | [02](docs/02_data_contract.md) |
| benchmark / 合成 / 训练边界 | [03](docs/03_benchmark_training.md) |
| 旧脚本为什么被替换 | [04](docs/04_legacy_review.md) |
| 用户确认卡与汇报模板 | [05](docs/05_review_and_reporting.md) |
| 真实数据实证对照（含护栏） | [06](docs/06_field_notes.md) |
| 任务分布图谱方法论 | [07](docs/07_task_atlas.md) |
| 组织归因公平性与复用证据 | [08](docs/08_org_fairness_and_reuse.md) |

## 文件与实施边界

| 文件 | 当前实现 |
|---|---|
| `scripts/adapt_exports.py` | 按显式清单解析 JSON / 每行一个会话的 JSONL / 有明确角色标题的 Markdown；不递归扫产出文件 |
| `scripts/value_loop.py` | SQLite 台账、内容版本、幂等导入、人工确认记录、未知状态、实测 token、部门切片、资产读取证据 |
| `scripts/org_skill_map.py` | 部门×技能×工具可靠性；tool_dev 会话单列、origin 拆分、小样本不排名；不输出跨部门裸排名 |
| `scripts/task_atlas.py` | 任务分布图谱：意图×部门×月份×交互深度；标签来源分级（human>router>keywords>unknown），小单元格抑制，输出 benchmark 选题配额 |
| `scripts/reuse_signals.py` | 产物复用证据（upload 强于 read，跨用户强于同用户）+ 技能作为可复用资产的覆盖统计 |
| `scripts/build_datasets.py` | 人工整理任务包 → 训练/验证/保留集；来源、精确重复、历史分组和 org_section 跨科泄漏检查 |
| `scripts/bench.py` | 冻结输入与评分；固定上下文 JSON 任务；可显式调用内网 Chat Completions 网关 |
| `scripts/route_hint.py` | 路由置信度达标才加任务类型提示；`ab` 子命令做同模型有无提示的成对 A/B |
| `scripts/synthesize_slots.py` | 仅从训练种子生成可验证的查询条件抽取候选 |
| `scripts/train_router.py` | 可选：CPU 字符 TF-IDF + 逻辑回归；`--keywords` 规则基线同场对比；低分数转人工/原路由的依据 |
| `run_weekly.sh` | 单写者批处理参考；不自动确认价值、不自动发布模型 |
| `docs/03_benchmark_training.md` | benchmark、合成、小模型、LoRA 伪代码与适用边界 |
| `docs/04_legacy_review.md` | 原包具体问题、证据位置、保留/替换建议 |
| `docs/05_review_and_reporting.md` | 用户确认卡、管理层报告与现实化运营节奏 |
| `docs/06_field_notes.md` | 真实数据实证对照：哪些假设成立、哪些结论加了护栏 |
| `docs/07_task_atlas.md` | 任务分布图谱方法论：标签分级、抽样核对、图谱驱动评测选题 |
| `tests/test_invariants.py` | 指标可信度、增量、泄漏与缺失评分回归检查 |

没有实现：真实内网接口、生产任务分割、语义近重复检测、完整 OpenCode 工具回放、自动模型裁判、财务账单分摊、GPU 训练。这里刻意只做当前容易验证的部分，其余给出可参考的接口/伪代码。**实证修正：平台会话 API 支持按用户全量拉取（docs/02 §3.1），因此「先做全平台只读分析」是低成本高信号的第一步；「全量数据平台/全量训练」仍然暂缓。**

## 可选小模型实验

把 scikit-learn 及其依赖准备到内网 wheelhouse，按公司环境安装。核心示例无需安装它。

```sh
python3 -m pip install --no-index --find-links /path/to/wheelhouse scikit-learn
python3 scripts/train_router.py \
  --train /tmp/platform_value_demo/dataset_v1/router_train.jsonl \
  --dev /tmp/platform_value_demo/dataset_v1/router_dev.jsonl \
  --out /tmp/platform_value_demo/router_cpu
```

这个实验检验“便宜的任务分类是否够用”；不把首轮问题映射到后续 good/bad 或轮数。真正的模型成本路由还需要每类任务在候选模型上的质量证据。演示集很小，训练结果只证明代码可运行。

## 运行检查

```sh
python3 -m unittest discover -s tests -v
```

所有源文件和说明均可修改后在公司环境复用。保留 `evidence.db`、输入导出、每版数据/模型/benchmark 及 `split_registry.json`。报告、数据和模型目录用新版本路径，不覆盖历史结果。参见 [VALIDATION.md](VALIDATION.md) 了解本次实际验证范围。
