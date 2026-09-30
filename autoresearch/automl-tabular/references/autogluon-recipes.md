# AutoGluon 配方（阶段一主力）

依据：本地克隆源码 `repos/autogluon`（commit de52cca, 2026-09-25），关键文件
`tabular/src/autogluon/tabular/predictor/predictor.py`、
`tabular/src/autogluon/tabular/configs/hyperparameter_configs.py`。

## 1. 最小基线（先跑通）

```python
from autogluon.tabular import TabularPredictor

predictor = TabularPredictor(
    label="target",            # 目标列名
    eval_metric="roc_auc",     # 分类常用 roc_auc/f1/accuracy；回归常用 rmse/mae/r2
).fit(
    train_data="train.csv",    # 直接传路径或 DataFrame，无需预处理
    time_limit=300,
    presets="medium_quality",  # 跑通后换更重的 preset 出正式 baseline
)
predictor.leaderboard(test_data, display=True)
```

**必须检查的日志行**：fit 开头会打印
`AutoGluon infers your prediction problem is: 'multiclass'`。
agent 要 grep 这行并与任务契约核对；推断错了就用
`TabularPredictor(label=..., problem_type="binary"|"multiclass"|"regression")` 显式指定。

## 2. 数据整理：让 AutoGluon 做，agent 做监督

AutoGluon 在 fit 内自动完成（`features/` 特征生成管线）：
类型推断 → 缺失填充 → 类别编码 → 布尔转换 → 去唯一列 → 文本特征（可关）。

agent 的职责只剩三件：

1. **泄漏审查**：对照任务契约检查列名和样本值，找出 ID 列、目标的同义列、预测时点之后才产生的字段，fit 前 drop。
2. **划分策略**：契约里有 `time_column` 或 `group_column` 时，先按契约生成固定 split 文件再传入；**不要把最终测试集传给 `tuning_data`**（官方 docstring 明确警告会过拟合到它）。
3. **极稀疏类别**：唯一值 <5 的类会被 AutoGluon 丢弃（日志有 Warning），如果业务上这些类重要，要么合并要么补数据。

## 3. 模型建议 = leaderboard + fit_summary + 成本

```python
lb = predictor.leaderboard(test_data, display=True)
# 关键列：model / score_val / score_test / fit_time / pred_time_test
info = predictor.fit_summary(verbosity=1)
```

解读规则（写给 agent）：

- `score_val` 用于排序，`score_test` 用于汇报；两者差距大 → 过拟合预警信号。
- 汇报时**必须连同成本**：实际训练了哪些模型、哪些失败、fit_time、pred_time_test、模型目录磁盘占用。只看 validation score 的模型建议不完整（参考 AutoGluon #3415：训练能装内存不代表大批量推理也能）。
- WeightedEnsemble 领先但单模型差距 < 1% → 报告"单模型已够用"，优先简单方案。
- 模型键名对照（hyperparameter_configs.py）：`GBM`=LightGBM、`XGB`=XGBoost、`CAT`=CatBoost、`RF`=随机森林、`XT`=极端随机树、`KNN`、`LR`=线性、`NN_TORCH`=PyTorch 全连接、`TABPFNV2`/`TABICL` 等=表格基础模型。

## 4. preset 是资源与模型组合的选择（不只是便利入口）

preset 与 time_limit、metric、模型集合、资源约束**共同**构成配置。
第一轮显式选较轻配置并设预算；质量实验再上重配置。

| preset | 含义 | 何时用 |
|---|---|---|
| `medium_quality` | 最快，默认 | 只用于验证管线 |
| `good_quality` | 快推理 + 不错精度 | 部署导向 |
| `high_quality` | 高精度 + 快推理 | 要上线又要精度 |
| `best_quality` | 高精度（无 GPU 首选） | 正式 baseline / 比赛 |
| `extreme_quality` | +Nori/TabICLv2/TabDPT，需 GPU 和 `autogluon.tabular[tabarena]` | ≤10 万行数据 + 有 GPU |
| `optimize_for_deployment` | 删冗余模型省 2-4x 磁盘 | 与上面任一组合成 list |
| `interpretable` | 只训规则模型（imodels） | 强可解释场景 |

组合写法：`presets=["best_quality", "optimize_for_deployment"]`（后者覆盖前者同名参数）。

**许可证警告**：`extreme_quality` 一类 preset 可能下载预训练权重；`noncommercial` preset 含 TabPFN-3，商用需单独授权。不能仅根据 AutoGluon 自身 Apache-2.0 推断所有附加模型权重同样许可。

## 5. 限定搜索范围（想省时或想对比特定模型时）

```python
predictor.fit(
    train_data,
    hyperparameters={"GBM": {}, "XGB": {}, "CAT": {}},  # 只训这三类
    time_limit=600,
    presets="good_quality",
)
```

## 6. 常见坑

- 不给 `presets` 跑出来的分数不代表 AutoGluon 的真实水平（官方明确警告）；对外汇报基线必须显式记录 preset。
- `time_limit` 是墙钟秒数软上限；`best_quality` 建议 ≥3600。
- Windows 上部分表格基础模型装不上属正常，退回 `best_quality`。
- 锁版本与安装环境：新版本也可能有平台安装回归（参考 #5881，macOS wheel 问题在 1.6.2 修复）——旧 issue 不自动代表当前缺陷，以锁定版本的实测为准。

## 7. 划分边界警告（重要）

任务契约声明了时间/分组预测时，只固定外部 split 不够：
AutoGluon 内部的 holdout / bagging / stacking 默认是随机的，可能破坏你的边界。
需要按任务正确配置 holdout/bagging/stacking，或先在不破坏边界的设置下跑，
并在结果 JSON 里记录内部验证方式。FLAML 支持 group、time 和自定义 splitter，
边界严格时它是更直接的选择。

## 8. 关于"基准第一"的措辞

引用基准成绩时必须具体到某个 benchmark 与版本（如 OpenML AutoML Benchmark、
TabArena），不写"常年第一"这类无统一依据的表述。业务选型永远以自己
固定划分下的比较为准。
