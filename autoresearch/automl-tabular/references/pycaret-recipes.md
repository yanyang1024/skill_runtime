# PyCaret 配方（备选路线：低代码对比与解释）

依据：本地克隆源码 `repos/pycaret`（主分支 commit 5ec8f66, 2026-05-16）。
关键文件：`LICENSE`、`AGENTS.md`、`docs/for_agents/TASK_CHEATSHEET.md`、
`packages/engine/pycaret/tasks/`、`packages/engine/pycaret/api/`。

## 0. 先读这段：版本与许可证（2026-09 时点）

**PyCaret 3.x 和 4.x 是两条不同的线，不能混用语义：**

| | 3.x | 4.x（主分支） |
|---|---|---|
| 许可证 | MIT | **FSL-1.1-MIT**（源码可用，含竞争性商业使用限制；明确允许内部使用） |
| API | 函数式：`setup()` + `compare_models()` | OOP 无状态：`ClassificationExperiment().fit(df)`，函数式已删除 |
| 成熟度 | 稳定，但进入维护态 | **4.0.0a8 / Alpha**，迁移公告（#4177）统一关闭了大量 3.x issue |
| 依赖 | 重（捆绑 xgboost/optuna/shap 等） | 瘦身：xgboost/lightgbm/optuna 等需自装 |

由此得出定位：

- **默认依赖优先级降低。** 本 skill 的主力路径是 FLAML/AutoGluon + Optuna；PyCaret 不再是"无条件推荐的开源库"。
- **3.x**：MIT、稳定、教程多——需要低代码对比/教学演示且可接受其依赖体积时，仍可用，内部使用 4.x 前也可先用 3.x 验证流程。
- **4.x**：许可证为 FSL（内部使用允许，竞争性商业使用受限）、接口仍在 Alpha 变动（如旧 `evaluate_model` 面板已移除，#4190 显示自定义 test_data/分层划分能力仍在恢复中）。**当前主要价值是架构与设计参考**，不是生产依赖。
- 网络上的教程绝大多数是 3.x 写法；写代码前先确认安装的是哪条线，3.x 与 4.x 的安装、导入和示例要分别维护。

## 1. 3.x 配方（低代码对比，MIT）

```python
from pycaret.classification import setup, compare_models, tune_model, predict_model, save_model

s = setup(data=df, target="target", session_id=42, fold=5)
best = compare_models()          # 一次对比十几种算法，按指标排序
tuned = tune_model(best)
predict_model(tuned)
save_model(tuned, "model_v1")
```

- `compare_models(sort="F1")` 可改排序指标。
- 精调仍回 Optuna（见 optuna-recipes）——PyCaret 自带 tune_model 搜索强度有限。

## 2. 4.x 配方（Alpha，FSL，先确认许可证适用再使用）

```python
from pycaret.tasks import ClassificationExperiment   # 回归用 RegressionExperiment

exp = ClassificationExperiment(target="target", session_id=42, fold=5)
exp.fit(df)                       # 无状态引擎，数据从 fit 进
best = exp.compare_models()       # 返回 CompareResult（强类型 dataclass，不是裸 DataFrame）
tuned = exp.tune_model(best)      # 返回 TuneResult
exp.predict_model(tuned)          # 返回 PredictResult
exp.save_model(tuned, "model_v1")
```

注意：

- **不要照抄 3.x 的 `setup()` / `evaluate_model()`**——4.x 已删除/重做这些接口；动词×任务可用性以 `docs/for_agents/TASK_CHEATSHEET.md` 的矩阵为准。
- 4.x 不再默认捆绑 xgboost/lightgbm/catboost/optuna/shap，用前先 `pip install`，引擎检测到才会点亮对应模型容器。
- agent 自省接口：`from pycaret.api import list_models, describe_model, list_metrics`。
- 排错读 `exp.events` 结构化事件流，不读 stdout。

## 3. 值得借鉴的设计（不依赖 PyCaret 本身也能用）

PyCaret 4.0 的架构文档是"coding-agent-first"设计的好样本，可移植到你自己的项目：

1. **Config is the contract**：一个配置 schema 驱动所有入口（notebook/API/UI/LLM 生成）。
2. **LLM is advisory**：LLM 输出统一为 `suggested_config_json + suggested_action + reasoning_summary + risk_flags`，人批准后确定性引擎才执行；LLM 不直接触发破坏性动作。
3. **强类型结果**：每个动词返回 dataclass，agent 可可靠解析。
4. **KILL_LIST.md**：明确列出永不可重新引入的淘汰设计。

借鉴接口设计即可——第一版浓缩为"一个任务配置、一个训练入口、一份结果 JSON"
（见 task-contract.md 与 result-schema.md），不必连 React/FastAPI/数据库控制面一起搬。

## 4. 护栏

- 生产部署不要依赖 PyCaret 的 serving 链路，导出模型后走正常服务。
- 评估 PyCaret 的稳定性不能看 issue 关闭率——#4177 迁移公告统一关闭了大量 3.x issue，关闭率高不代表缺陷少。
- 引用 PyCaret 时永远标注 3.x 还是 4.x，以及对应许可证。
