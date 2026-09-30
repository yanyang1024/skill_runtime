# 结果 JSON Schema —— 每轮实验必须落盘的记录

每一轮实验（基线或一批调参）结束后落盘一份 JSON 到 `experiments/` 目录。
它是跨会话、跨 agent 传递上下文的载体——**多轮迭代之间传递的是这份 JSON，不是散文。**

## Schema

```json
{
  "schema_version": 1,
  "run_id": "example_run_001",
  "task_id": "quality_prediction_v1",
  "data_hash": "sha256_of_training_data",
  "split_hash": "sha256_of_split_manifest",
  "code_revision": "git_commit_or_script_hash",
  "environment_lock": "requirements.lock",
  "search_space_version": "space_v1",
  "tool_versions": {"optuna": "5.0.0", "autogluon": "1.6.3"},
  "metric": {"name": "average_precision", "direction": "maximize"},
  "score": null,
  "fold_scores": [],
  "seeds": [42],
  "status": "PLANNED",
  "counts": {"complete": 0, "pruned": 0, "fail": 0},
  "failures": [{"trial": 3, "type": "OOM", "log": "logs/run_001/trial_3.log"}],
  "cost": {"wall_seconds": 0, "gpu_seconds": 0, "llm_tokens": 0},
  "artifacts": {"model": null, "preprocessor": null, "label_mapping": null, "predictions": null, "error_slices": null},
  "next_action": {"type": "run_baseline", "hypothesis": "", "evidence": []}
}
```

## 逐字段要点

- **可比性四指纹**：`data_hash`、`split_hash`、`code_revision`、`environment_lock`。
  缺了任何一个，两轮分数就不可直接比较。Optuna 5.0 前后、FLAML 2.7.0 前后这类
  版本变更也要体现在 `tool_versions`——小版本升级也可能改变结果。
- **fold_scores**：只记平均分会掩盖 fold 间方差；配对多 seed 复核时逐个记录。
- **counts + failures**：把 trial 按 COMPLETE/PRUNED/FAIL 分类计数，每条失败记
  类型（OOM / 超时 / 配置错误 / 数据错误）和日志路径。**不要把系统异常伪装成模型低分。**
- **artifacts**：Optuna 的 study 不替你保管训练好的模型对象——模型、预处理器、
  标签映射必须独立保存并在这里登记路径。`best_params`  alone 无法复现预测。
- **cost**：墙钟、GPU 秒、LLM token 都记。agent 方案 vs 纯脚本方案的比较要用
  相同总预算下的产出衡量，token 是成本的一部分。
- **next_action**：`type` 枚举建议：
  `run_baseline` / `refine_search_space` / `expand_boundary` / `fix_data` /
  `add_feature_family` / `change_loss` / `change_model_family` /
  `full_budget_recheck` / `stop`。
  `hypothesis` 写一句人话，`evidence` 引用本次 JSON 里的字段（如
  `["param_importances.learning_rate=0.61", "best_at_boundary:num_leaves"]`）。
- **status**：`PLANNED / RUNNING / DONE / FAILED / ABORTED`。真实运行才填分数，
  不用虚构数值占位。

## 验收清单（一轮实验合格的标准）

1. 划分正确（对照任务契约的 `internal_cv_must_respect`）；
2. 中断后可恢复（storage 持久化 + 状态字段）；
3. 模型能加载并对新数据预测（artifacts 齐全）；
4. 预算与成本记录完整；
5. 与默认基线（Dummy/线性）可比且同协议；
6. 分数改善能在相同预算下复现（多 seed 复核后仍成立）。
