---
name: automl-tabular
description: 表格数据的分类/回归任务全流程：先生成任务契约（样本单位、预测时点、标签含义、划分与指标），再用 FLAML 或 AutoGluon 打基线给出模型建议，最后用 Optuna 按批次迭代超参数并根据诊断表决定下一步。触发词：分类、回归、表格数据、CSV 建模、调参、超参数优化、AutoML、模型选型。
---

# AutoML Tabular Skill

面向 coding agent（opencode / pi / dsh / Claude Code 等）的表格机器学习工作流。

**分工原则**：agent 负责任务理解、选工具、写配置、读批次结果、提议下一步；确定性引擎（FLAML / AutoGluon / Optuna）负责真正的训练与搜索。覆盖原始数据、发起超过 30 分钟的训练、部署模型这三类动作前，必须先向用户确认。

## 触发条件

用户有以下任一表述时使用本 skill：

- 给了一份表格数据（CSV/Excel/Parquet/数据库表）和一列目标列，要做分类或回归
- 询问"这个数据集该用什么模型"、"数据要怎么整理/预处理"
- 已有模型，嫌效果不好，要"调参"、"调超参数"、"优化模型"
- 要对比多个算法、要 baseline、要 leaderboard

## 工作流（契约 → 基线 → 批次调参 → 诊断复核）

### 阶段零（先于一切）：生成任务契约

**不要先读数据跑模型。** 先与用户确认并落盘一份任务契约（模板见 `references/task-contract.md`），回答五个 dtype 推不出来的问题：

1. 一行代表什么对象或事件（样本单位）？
2. 在什么时刻做预测？特征在那个时点是否已可获得？
3. 标签如何产生、何时成熟？缺失标签是未知还是负样本？
4. 预测对象是未来时间、未见实体（新分组），还是同分布新样本？——这决定划分方式
5. 哪类错误代价更高？主指标和可接受的推理成本是什么？

契约里必须显式给出 `group_column` / `time_column`（如有）和划分清单文件。**警告：只固定外部测试集不够——AutoML 内部的随机 CV/stacking 可能破坏时间与分组边界**，见 autogluon-recipes 第 7 节。

### 阶段一：数据整理 → 打基线 → 模型建议

1. 按任务契约整理数据：每行一个样本、`sample_id`、特征列、target、划分元数据；优先 Parquet 保留类型。数据整理的具体建议（缺失、高基数类别、泄漏列）见 `references/autogluon-recipes.md` 第 2 节。
2. **先跑两个免费基线**：Dummy 模型 + 正则化线性模型，作为一切后续比较的参照。
3. 表格 AutoML 后端**二选一**，不要都上：
   - 预算有限 / CPU / 倾向单模型 → **FLAML**（`time_budget` 控制，配方待补）
   - 愿意用更多训练与推理资源换集成候选 / 有 GPU 且数据 ≤10 万行 → **AutoGluon**（见 `references/autogluon-recipes.md`）
4. `leaderboard()` 输出即"模型建议"。汇报时必须同时给出：训练了哪些模型、哪些失败、推理耗时、模型体积——不能只看 validation score。

### 阶段二：批次调参（快慢双循环）

收到基线结果后的决策：

1. **基线已达标** → 收工交付，不要过度调优。
2. **全部模型都差** → 问题大概率在数据/任务定义，回阶段零，不要盲目调参。
3. **某模型族明显领先** → 用 Optuna 对该族做定向精调（`references/optuna-recipes.md`）。

迭代节奏（核心原则）：

- **快循环**：固定数据/模型族/验证，脚本连续跑一批 trial（10–20 个有效 trial 或固定计算预算），保存数值与状态。**不要每个 trial 都调用 LLM。**
- **慢循环**：agent 读批次结构化摘要（best、参数重要性、失败分类、耗时），提出**一个**有依据的改变：扩/缩某参数边界、换特征族、换损失、换模型族。
- 搜索空间、数据、标签、划分或指标语义变化时，**新建 study/实验版本**，只迁移兼容的好参数作为起点；不同任务的旧分数不混入同一目标。

### 阶段三：诊断驱动下一步 + 收敛复核

每批结果对照 `references/diagnostics.md` 的诊断表决定动作——调参只是八种动作之一。
收敛前对少量入围候选做**完整预算 + 多 seed 配对复核**；提升小于 seed 波动的"改善"不算数。
最终评估器和固定测试集只在方案确定后用一次。

## 护栏（必须遵守）

- 不推荐已停止维护/基本停更的工具作为新项目默认项：Hyperopt（Databricks 已移除并建议迁 Optuna/Ray Tune，虽偶有新修复提交）、auto-sklearn（最新 release 停在 2023-02）、NNI（已归档）。措辞按证据写，不宣称"仓库完全无人维护"。
- AutoML 内部已做模型选择与集成，**不要默认在外面再套一层大规模 Optuna**；先用 AutoML 确定有希望的方向，再决定是否对单一模型精调。
- 评估指标必须与任务契约一致，始终用交叉验证/验证集分数，不用训练集分数。
- 每次实验落盘结果 JSON（schema 见 `references/result-schema.md`）：数据与划分指纹、代码版本、环境锁、搜索空间版本、fold 分数、失败分类、耗时、产物路径、下一轮假设。
- Optuna 跨 5.0 大版本（2026-09 默认采样器变更）的 trial 序列不可直接对比，对比前重跑基线。
- Optuna 的 study 不保管训练好的模型对象——模型、预处理、标签映射必须独立保存为产物。

## 参考文件

- `references/task-contract.md` — 阶段零：任务契约 YAML 模板与逐字段说明
- `references/autogluon-recipes.md` — 阶段一主力：数据整理监督 + 基线 + leaderboard 解读
- `references/optuna-recipes.md` — 阶段二主力：objective 模板、pruning、批次循环、ask/tell 定位
- `references/diagnostics.md` — 阶段三：反馈诊断表 + 各模型族第一轮搜索空间
- `references/result-schema.md` — 每轮实验必须落盘的结果 JSON schema
- `references/pycaret-recipes.md` — 备选：PyCaret 3.x/4.x 说明（4.x 为 FSL 许可证，定位设计参考）
- `references/agents-md-template.md` — 用户自己的 ML 项目仓库里该放的 AGENTS.md 模板
