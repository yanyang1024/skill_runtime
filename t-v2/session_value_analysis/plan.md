# 任务计划：会话数据 → 汇报/优化/训练 三用途闭环体系

## 背景
企业内部 AI 平台（半导体公司），已有：会话解析、用户身份解析、平台 CSV 数据。
三个目标：(1) 向上汇报"抠细节讲价值" (2) 用户侧使用优化 (3) 积攒 good/bad case →
SFT/DPO 后训练数据、小模型任务训练、内部 bench 评新模型；形成持续迭代闭环。

## 阶段
- Stage 1 研究（并行 explore 子代理）：
  A. LLM 交互数据 → 训练数据/bench 的业界做法（OpenAI evals、RLHF/DPO 数据管线、
     LangSmith/Langfuse、Chatbot Arena、HumanEval 类内部 bench 构建）
  B. 企业内部 AI 平台价值度量与分析业界做法（Copilot analytics、Langfuse/Dify 平台
     侧指标、内部 AI ROI 汇报实践）
- Stage 2 工程（主代理并行进行）：按用户真实字段结构写脚本：
  1. case_miner.py — good/bad case 自动挖掘 → cases.jsonl（版本化、增量更新）
  2. training_data_builder.py — cases → SFT 样本 / DPO 偏好对 导出
  3. bench_manager.py — 从真实任务构建内部 bench + 用 bench 评新模型（OpenAI 兼容 API）
- Stage 3 整合：把研究结论写成《业界做法参考.md》，与脚本、闭环流程图整合交付。

## 交付
/mnt/agents/output/session_value_analysis/ 下：3 个新脚本 + 业界做法参考.md + 更新使用说明.md
