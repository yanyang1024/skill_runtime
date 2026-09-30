# 任务契约（Task Contract）—— 阶段零的产出物

建模开始前，agent 与用户确认并落盘这份 YAML。它回答 dtype 推不出来的问题，
是后续划分方式、指标选择、泄漏审查的依据。**没有任务契约不进阶段一。**

## 模板

```yaml
task_id: quality_prediction_v1          # 唯一标识，结果 JSON 里引用
problem_type: binary_classification     # binary_classification / multiclass_classification / regression
sample_unit: one_item_at_prediction_time  # 一行代表什么对象或事件

data:
  path: data/features.parquet           # 优先 Parquet 保留类型
  sample_id: sample_id                  # 样本唯一标识列
  target: defect                        # 标签列
  feature_allowlist: [temperature, pressure, recipe_type]  # 显式白名单优于事后 drop
  group_column: lot_id                  # 可选：分组列（预测未见分组时必填）
  time_column: prediction_time          # 可选：时间列（预测未来时必填）

label:
  definition: 终检判定为不合格          # 标签如何产生
  maturity: 生产完成后 24h 内可得        # 标签何时成熟；预测时点之后成熟的特征禁用作输入
  missing_means: unknown                # unknown / negative——缺失标签是未知还是负样本

prediction:
  made_at: 生产开始前                    # 预测时点：特征在该时点必须已可获得
  target_population: unseen_lots        # unseen_lots / future_time / iid_new_samples

validation:
  purpose: unseen_lots                  # 划分要模拟的部署场景
  split_manifest: data/split_v1.parquet # 固定划分清单文件，含每行 train/valid/test 标记
  internal_cv_must_respect: [group_column]  # 警告后端内部 CV/stacking 不许破坏的边界

metric:
  name: average_precision               # 按类别稀缺度与错误代价选，不是默认 accuracy
  direction: maximize
  positive_label: 1
  secondary: [roc_auc]                  # 参考指标

cost:
  error_asymmetry: 漏检缺陷代价远高于误报   # 哪类错误代价更高
  max_inference_ms_per_row: 5           # 推理成本约束，模型建议时必须汇报

budget:
  max_wall_seconds: 1800
  max_trials: 30
  max_concurrent_trials: 1
```

## 逐字段要点（agent 确认清单）

1. **sample_unit**：一行=一个预测对象。若一行是"事件"而预测对象是"实体"，先聚合再建模。
2. **label.maturity**：预测时点之后才成熟的字段一律不得出现在特征里——这是最常见的泄漏源。
3. **target_population**：决定划分方式。
   - `future_time` → 按时间切，训练/验证之间按标签成熟窗口留 gap，不能随机拆滑窗；
   - `unseen_groups` → 按 group 切，同一 group 的样本必须在同侧；
   - `iid_new_samples` → 随机切可接受，但仍要固定 split 文件。
4. **metric**：准确率只在类别均衡且错误对称时可接受。类别稀缺看 average_precision；回归按业务量纲选 rmse/mae。
5. **budget**：写进契约就有了停止条件，避免"再跑一轮看看"无限拖延。
6. group/time 列是**元数据**，是否可作特征必须单独明确，默认不作特征。

## 常见任务形态速查

| 输入／输出 | 最小整理方式 | 先比较的模型 | 关键检查 |
|---|---|---|---|
| 数值、类别字段 → 单标签分类／回归 | 每行一个样本；sample_id、特征、target、划分元数据 | Dummy + 正则化线性 + 一种 GBDT；再按预算 FLAML／AutoGluon | ID、泄漏列、缺失、类别基数、分层或分组划分 |
| 文本 → 分类／回归 | 保留原文，记录 label、语言、文档 ID；去重后划分 | TF-IDF + 线性；再试预训练 embedding + 简单模型 | 近重复文本、同来源泄漏、截断长度 |
| 图像／音频 → 分类／回归 | manifest 表：文件路径、label、entity_id、split | 预训练骨干 + 小预测头 | 同一实体的样本划在同侧；增强只用于训练 |
| 时间序列 → 未来值／事件 | series_id、timestamp、target、协变量；明确 horizon | 持续值／季节性基线、滞后特征 + GBDT | 按时间回测并留 gap |
| 多模态 → 分类／回归 | manifest 联合表，稳定 ID 对齐各模态 | 各模态独立基线，再试融合 | 模态缺失、时间对齐、每个模态的增量 |
| 多标签／多输出 | 多输出列 + 逐输出含义 + 缺失掩码 | 独立模型基线，再试共享表示 | 不同目标量纲与损失权重；不能只按 y.shape 判任务 |

预处理不统一成"所有数据 one-hot + 标准化"：线性/距离模型、神经网络、
支持原生类别的树模型要求不同。**统一原始数据契约，允许各模型分支拥有自己的
预处理 Pipeline；所有拟合步骤（imputer/scaler/encoding/特征选择/重采样）
都在训练 fold 内完成。**
