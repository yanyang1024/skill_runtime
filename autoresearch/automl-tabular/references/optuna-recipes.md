# Optuna 配方（阶段二主力：批次调参与迭代）

依据：本地克隆源码 `repos/optuna`（commit 0d05a96, 2026-09-25），关键文件
`optuna/study/study.py`、`optuna/study/_tell.py`、`optuna/trial/_trial.py`、
`optuna/samplers/`、`optuna/pruners/`、`optuna/importance/`、`optuna/integration/`。

## 1. 标准 objective 模板（以 LightGBM 为例）

```python
import optuna
import lightgbm as lgb
from sklearn.model_selection import cross_val_score

def objective(trial):
    params = {
        "learning_rate": trial.suggest_float("learning_rate", 1e-3, 0.3, log=True),
        "num_leaves": trial.suggest_int("num_leaves", 16, 256),
        "max_depth": trial.suggest_int("max_depth", 3, 12),
        "min_child_samples": trial.suggest_int("min_child_samples", 5, 100),
        "subsample": trial.suggest_float("subsample", 0.5, 1.0),
        "colsample_bytree": trial.suggest_float("colsample_bytree", 0.5, 1.0),
        "reg_lambda": trial.suggest_float("reg_lambda", 1e-3, 10.0, log=True),
        "n_estimators": 2000,
        "early_stopping_rounds": 100,   # 迭代轮数用 early stopping 解决，不进搜索空间
    }
    model = lgb.LGBMClassifier(**params)
    return cross_val_score(model, X_train, y_train, cv=5, scoring="roc_auc").mean()

study = optuna.create_study(
    direction="maximize",
    study_name="lgbm_v1",
    storage="sqlite:///optuna.db",      # 持久化：断点续搜 + 跨进程读历史
    load_if_exists=True,
)
study.optimize(objective, n_trials=20)  # 一批 20 个 trial，见第 3 节快慢循环
print(study.best_params, study.best_value)
```

**搜索空间书写规则**（agent 必须遵守）：

- 连续正值尺度（学习率、正则强度）一律 `log=True`；架构/优化器/离散 batch 用 `suggest_categorical`。
- 条件参数（选了某 kernel 才有 gamma）直接在 objective 里写 if——这就是 define-by-run 的用法；条件参数只在对应分支出现。
- trials 预算：<20 维搜索空间以 100 为参考起点；有 pruning 可加。这只是起点不是定律。
- 若只有少量候选且单次训练很便宜，sklearn 的 RandomizedSearchCV / 手工对照可能已足够；Optuna 的价值随条件空间、训练成本和剪枝需求上升。
- **第一轮先调试搜索空间而不是扩大试验量**：少量 trial 检查参数是否被模型接受、条件组合是否合法、指标方向、训练时长/显存、checkpoint 能否重载预测。各模型族的第一轮搜索范围见 `references/diagnostics.md` 第 2 节。

## 2. 深度学习 / 长训练：pruning 要接实

```python
from optuna.integration import LightGBMPruningCallback  # 也有 XGBoost / PyTorch / PyTorchLightning 版本
pruning_cb = LightGBMPruningCallback(trial, "auc")
```

`optuna/pruners/` 内置：MedianPruner（默认起点）、HyperbandPruner（大预算）、
SuccessiveHalvingPruner、PercentilePruner、ThresholdPruner、WilcoxonPruner。

DL 任务注意：**配置 warmup 后再剪枝**，避免把前期慢热的候选全部淘汰。
验收 pruning 要看实效：中间指标是否写入、未完成的 trial 是否真的提前结束、
GPU 是否释放、OOM 与正常 pruning 是否区分。Early stopping、跨 trial pruning、
checkpoint 是三个不同机制，只配一个不算完整。
（教训来源：Ludwig 原生 Optuna executor 配置了 pruner 但默认路径没接
`trial.report()`——"配置里有 pruner" ≠ "训练中已接好剪枝"。）

## 3. 快慢双循环（迭代节奏的核心）

- **快循环**：脚本连续跑一批（每批 10–20 个有效 trial 或固定计算预算——这是可调起点，不是硬性最优值），期间不调用 LLM。
- **慢循环**：一批结束后，agent 读结构化摘要（best_params、best_value、参数重要性、失败分类、耗时），提出**一个**有依据的改变，再开下一批。

单进程普通训练直接用 `study.optimize(objective)` 即可。
`ask()`/`tell()` 留给训练由外部 worker、远程设备或人工实验执行的场景——
不要为了让 agent 参与而把每个 trial 的采样和回报都绕经 LLM。

```python
trial = study.ask()
params = {"lr": trial.suggest_float("lr", 1e-3, 0.3, log=True)}
score = run_my_own_training(params)        # 外部执行
study.tell(trial, score)                   # trial 挂了：study.tell(trial, state=TrialState.FAIL)
```

`tell()` 行为细节（`_tell.py`，5.0 实现）：

- 显式 `COMPLETE` + NaN 值 → 报错；显式 `COMPLETE` 无值 → 报错。
- `PRUNED` / `FAIL` 状态不许带值。
- 默认状态（不显式给 state）下传入无效值可被记录为 `FAIL` 并警告。
- runner 应保留原始状态和错误原因，不要笼统"拒绝后自动重试"。

## 4. 每批之后的分析（决定下一批怎么调）

```python
from optuna.importance import get_param_importances
from optuna.visualization import plot_optimization_history, plot_param_importances, plot_slice

print(get_param_importances(study))   # Optuna 5.0 默认评估器是 PED-ANOVA；
                                       # 需要 fANOVA 时显式传 evaluator=FanovaImportanceEvaluator()
plot_optimization_history(study).write_html("history.html")
plot_param_importances(study).write_html("importance.html")
plot_slice(study).write_html("slice.html")
```

注意：**5.0 起默认 importance evaluator 是 PED-ANOVA，不是 fANOVA**。
文档与实验记录里写"参数重要性分析"并显式记录所用 evaluator。

参数重要性的解读边界：它是"当前采样空间和试验记录下的敏感性线索"，
不是特征重要性，也不是因果证明。少量 trial 不足以宣布某参数不重要，
更不应据此自动删掉整个搜索方向。

下一批决策规则（完整版见 `references/diagnostics.md`）：

- 最优值贴着搜索边界 → 有依据地扩大边界，同时保留原默认参照。
- 最优值在区间中段且 slice 图平坦 → 该参数不敏感，固定它。
- 参数重要性集中 → 下一批 refine 头部参数，其余固定为当前最优。
- 无提升持续出现 → 对照诊断表，区分"该回数据层"和"该停"；按时间预算、噪声、有效 trial 数与提升幅度联合判断，不设单一固定阈值。

## 5. study 的版本纪律

- 模型族、数据、标签、split 或指标语义变化时，**新建 study**（改 study_name）。
- Optuna 允许某些数值范围变化，但不能随意修改同名 categorical 参数的选项。
- 只迁移仍兼容的好参数作为新 study 的起点（`study.enqueue_trial(...)`），不把不同任务的旧分数混入同一目标。

## 6. 记录与复现

```python
df = study.trials_dataframe()   # 所有 trial 的参数/分数/耗时/状态
df.to_csv("trials.csv", index=False)
```

- study 不保管训练好的模型对象：最佳模型、预处理管线、标签映射必须独立保存为产物。
- 本机顺序实验 SQLite 足够；增加并发 worker 时再考虑 Journal 存储或服务型数据库（SQLite 锁竞争不能靠加并发解决）。
- 结果 JSON 落盘按 `references/result-schema.md`。
- 与 MLflow 联动：`optuna-integration` 的 MLflowCallback；出现多人检索/大量实验的真实需求后再接 MLflow，不提前上。

## 7. 可选：Optuna MCP

官方有 `optuna-mcp`（study 管理、ask/tell、绘图、Dashboard，`uvx` 可启动），
但它标 Alpha：实例保存当前 study（多会话要隔离）、tell 工具只开放 COMPLETE、
依赖比裸 Optuna 重。**先有稳定训练脚本，确实需要对话式 study 管理/绘图时再启用。**

## 8. 版本提示

Optuna 5.0（2026-09-07）默认采样器改为 multivariate TPE + constant liar，
多目标默认也改为 TPE。跨 5.0 边界对比两轮搜索结果前必须重跑基线；
实验记录里写清 Optuna 版本与 sampler 配置，不要把算法变化误认为业务改进。
另有用户报告 5.0 读取旧 RDB 时间戳的时区偏移（#6868，未证实普遍故障），
跨版本比较历史耗时/时间线时增加核对。
