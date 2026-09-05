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

## 文件与实施边界

| 文件 | 当前实现 |
|---|---|
| `scripts/adapt_exports.py` | 按显式清单解析 JSON / 每行一个会话的 JSONL / 有明确角色标题的 Markdown；不递归扫产出文件 |
| `scripts/value_loop.py` | SQLite 台账、内容版本、幂等导入、人工确认记录、未知状态、实测 token、部门切片、资产读取证据 |
| `scripts/build_datasets.py` | 人工整理任务包 → 训练/验证/保留集；来源、精确重复和历史分组冲突检查 |
| `scripts/bench.py` | 冻结输入与评分；固定上下文 JSON 任务；可显式调用内网 Chat Completions 网关 |
| `scripts/synthesize_slots.py` | 仅从训练种子生成可验证的查询条件抽取候选 |
| `scripts/train_router.py` | 可选：CPU 字符 TF-IDF + 逻辑回归；验证集评估、低分数转人工/原路由的依据 |
| `run_weekly.sh` | 单写者批处理参考；不自动确认价值、不自动发布模型 |
| `docs/03_benchmark_training.md` | benchmark、合成、小模型、LoRA 伪代码与适用边界 |
| `docs/04_legacy_review.md` | 原包具体问题、证据位置、保留/替换建议 |
| `docs/05_review_and_reporting.md` | 用户确认卡、管理层报告与每周运营方法 |
| `tests/test_invariants.py` | 指标可信度、增量、泄漏与缺失评分回归检查 |

没有实现：真实内网接口、生产任务分割、语义近重复检测、完整 OpenCode 工具回放、自动模型裁判、财务账单分摊、GPU 训练。这里刻意只做当前容易验证的部分，其余给出可参考的接口/伪代码。

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
