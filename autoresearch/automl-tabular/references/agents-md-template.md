# AGENTS.md 模板 —— 放在你自己的 ML 项目仓库根目录

opencode / Cursor / Copilot / Claude Code 等 coding agent 都会自动读仓库根的
`AGENTS.md`（或 `CLAUDE.md`）。仿照 PyCaret 4.0 的写法，把项目约定写进去，
agent 就不会自由发挥。以下为模板，尖括号处替换为你的内容。

```markdown
# AGENTS.md — <项目名> agent 须知

## TL;DR
- 这是一个 <分类/回归> 项目，任务契约在 `task_contract.yaml`（样本单位、预测时点、
  标签定义、划分方式、主指标都以此为准），评估指标是 <average_precision/rmse/...>。
- 数据在 `data/`，原始文件只读；处理后的数据写 `data/processed/`。
- 划分清单固定在 `data/split_v1.parquet`，任何实验不得改用随机划分。
- 基线由 <FLAML/AutoGluon> 产出，脚本 `scripts/prepare.py` + `scripts/train.py`；
  精调用 Optuna，脚本 `scripts/tune.py`。
- 建模全流程约定见 skills/automl-tabular/SKILL.md。

## 硬性规则
1. 建模前先确认 `task_contract.yaml` 存在且与本轮任务一致；不一致先找用户更新契约。
2. 测试集只允许在最终评估用一次；任何调参不许碰它。
3. 覆盖 `data/` 下任何文件前必须先问用户。
4. 每轮实验必须落盘结果 JSON 到 `experiments/`（schema 见 result-schema.md）：
   数据/划分/代码/环境四指纹、fold 分数、失败分类、耗时、产物路径、下一轮假设。
5. 工具白名单：FLAML 或 AutoGluon（二选一）、Optuna、sklearn、lightgbm/xgboost/catboost。
   不推荐引入：Hyperopt（Databricks 已移除，基本停维护）、auto-sklearn（2023 后无 release）、
   NNI（已归档）。PyCaret 4.x 为 FSL 许可证且 Alpha，需用户批准才可引入。
6. 单次训练超过 30 分钟的配置，先向用户报告计划再执行。
7. 调参按批次进行：每批 10–20 个 trial 连续跑完后复盘一次，不逐 trial 调用 LLM。

## 常用命令
- 备数据：`python scripts/prepare.py --contract task_contract.yaml`
- 打基线：`python scripts/train.py --preset good_quality --time-limit 1800`
- 精调：`python scripts/tune.py --model lgbm --trials 20 --study lgbm_v1`
- 查看历史：`experiments/` 目录按日期倒序

## 当前状态
- 最优分数：<填>（<模型>，<日期>，见 experiments/<文件>）
- 已知问题：<填>
```

## 设计要点（为什么这样写）

1. **TL;DR 放最前**：agent 注意力有限，任务契约位置、指标、划分文件这三件事
   30 秒内必须能被读到。
2. **禁止清单要写证据**：写"Hyperopt（Databricks 已移除，基本停维护）"比只写
   "禁止 Hyperopt"更经得起复核——措辞按证据写，不写"完全无人维护"这类绝对断言。
3. **实验落盘是"快速迭代"的前提**：没有 `experiments/` 的结构化历史，agent 每轮
   都在重新发明轮子；有了结果 JSON，慢循环的复盘才有依据。
4. **"当前状态"段要人工或 agent 每次实验后更新**——这是低配版 memory，
   让跨会话的 agent 接上上下文。
5. **批次节奏写进硬性规则**：防止 agent 把每个 trial 都过一遍 LLM，
   白烧 token 还引入决策抖动。
