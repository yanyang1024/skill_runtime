# v2 变更清单

v2.2 实查修正（不新增依赖或服务）：

- 行动看板区分未提供数据与空文件；显式错误路径报错；断言失败即使工具 success 也进入候选。各阶段轮流展示，避免生产错误条目挤掉所有开发问题。
- 供给候选区分仅加载、版本无法匹配和未观测调用；任务能力边增加 `action=load/invoke`，不能相加为去重使用会话。
- 人工仅确认采用时不覆盖已有自动任务标签；标签来源仍是自动，不冒充人工分类。
- 增加 `development_regression_candidates.jsonl`，保留原 train/dev 归属的失败来源，不能作为未见 holdout。
- 同模型四组实验补 `classifier_vs_keywords.md`，使用已有结果，不新增模型调用。
- 五个针对性边界用例；文档明确已有评测器只支持固定输出，不等于完整 Agent 回放。

v2.1 增补：`task_atlas.py`、主任务标签演示、组织任务分布图、能力共现边、覆盖/失败候选，以及 `07_task_atlas_and_bench.md` 选题指南。另补一页 quickstart 与 action board；已有 v2 机制保留，不新增服务或依赖。

基于 suggestion_aft_process.md 更新上一版交付。公司内改版源码未上传，本次没有合并或复现实证报告中的内部运行。

| 变更 | 结果 |
|---|---|
| resource_diagnostics.py 新增 | 组织×工具/skill/agent；阶段与工具来源；已验证预期错误；目录供给候选；上传/read/字节关联 |
| route_prompts.py + run_prompt_ablation.sh 新增 | 同模型四组提示策略；原文保留、低分与歧义透传 |
| pull_sessions.py 新增 | 可选游标采集参考及查询范围/分页/详情/owner 审计 |
| value_loop.py 更新 | AUTO 与 human 分流；请求明细；组织冲突记未知；主报告使用保守资产关联 |
| build_datasets.py 更新 | 可选组织隔离；弱参考诊断集；SFT 默认关闭且需可信目标 |
| train_router.py 更新 | 三基线统一标签口径；参考来源、组织切片；仅 dev 阈值曲线与训练来源记录 |
| bench.py 更新 | validated/diagnostic 区分；真实/合成/组织切片；提示对照轴与路由答案泄漏拒绝 |
| adapt_exports.py 更新 | 拒绝空导出/索引条目；结构化 summary 留作元数据；明确消息类型 |
| run_weekly.sh 更新 | 自动诊断不等待人工确认 |
| docs 更新 | 实证逐项判断、现实优先级、业务未知边界、同模型实验及可选人工支路 |

SQLite 无表结构迁移；保留旧状态和 split_registry。旧 benchmark 因执行器升级应保留历史并另冻新版本重跑。交付中的 examples 全部为虚构数据。
