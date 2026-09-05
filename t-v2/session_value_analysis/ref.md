# 业界做法参考：从会话数据到汇报、优化、训练数据的闭环

> 结合两份调研纪要（交互数据→训练数据/bench；企业 AI 平台价值度量）与你的平台实际（半导体企业、部门级身份映射、stats/runs/file_trace 字段、CSV 平台数据）整理。

## 一、三条目标线对应的业界锚点

### 目标 1：向上汇报"抠细节、讲价值"

| 你的现状 | 业界对应做法 | 可借鉴点 |
|---|---|---|
| 渗透率 98.5% 怕遭质疑 | ChatGPT Enterprise 的"购买→开通→激活"漏斗 + WAU/激活比 | **把渗透率改成漏斗**：开通≠活跃，主动拆穿比被人拆穿好 |
| 活跃分层（42% 轻度） | GitHub Copilot 按 28 天滚动窗口的四档采纳成熟度 cohort | 分层时加**时间窗**，"近 28 天活跃"比"累计对话数"更有说服力 |
| 缺业务结果归因 | McKinsey 五层框架（模型健康→采纳信任→运营 KPI→战略结果→财务影响），每层指定 owner | 你已有的指标已覆盖 1-3 层；汇报时**明说哪几层覆盖、哪几层待建**，比含糊带过可信 |
| 成本侧叙事 | "别度量 token，度量结果"：cost per outcome（每成功业务结果的成本） | 你的"单位交付物成本"就是这个思路，命名上向 cost per outcome 靠拢 |

关键方法论（Hamel Husain / Shreya Shankar）：**先人工看 100 条真实会话做 error analysis，归纳出 5-6 个失败主题，再为每个主题写判据**——你的"高摩擦清单人工复核"就是在做这件事，可以继续品牌化：给它起名叫"失败模式库"，是后续 bench 和训练数据共同的源头。

### 目标 2：替用户着想的优化

业界挫败信号体系（可在你现有词表上升级）：
- **Frustration Index**（Agnost.ai）：重复改写提问 + 消息变短变冲 + 回复后立即放弃，合成用户级挫败分，按周追踪——比流失早数周预警
- **containment rate 的教训**（客服行业）：放弃/超时会污染"完成率"，需用 **24-48 小时重联校正**（放弃后两天内又就同一问题回来问 = 其实没解决）——你的完成率 43.1% 建议加这个校正口径再报
- **rage 信号的会话版**：同一意图短时间内反复重开会话、反复重试同一提示词

案例库运营（微软/Moderna 打法）：
- 微软 Adoption Playbook 第 10 步就是"公开庆祝成功案例"，配套 Scenario Library + Champion 机制（每 15-50 用户配 1 名 champion）
- Moderna：内部 prompt 大赛选 top 100 用户组成 Champions，周活论坛互换用例
- **对你的启示**：case_miner 挖出的 good case 经用户本人确认后，脱敏进"场景库"，每周发一封"本周最佳用法"——这同时就是用户证言的收集机制，一举两得

### 目标 3：训练数据与 bench（数据飞轮）

反馈信号 → 训练数据的业界映射（对应你的数据条件）：

| 你有的信号 | 业界等价物 | 产出 |
|---|---|---|
| 用户纠正（"不对/重来"） | 隐式偏好对（winder.ai 总结；PRELUDE 论文系统化做法） | **DPO 对**：纠正前回答=rejected，纠正后回答=chosen（training_data_builder.py 已实现） |
| 正向收尾/放弃 | thumbs up/down → KTO（Ethayarajh 2024：只需二元标签，不要成对数据，适合生产埋点） | KTO 数据（标注 desirable/undesirable 即可） |
| 首轮用户问题 + 任务类型 | OpenAI Cookbook 蒸馏配方（大模型打标 → 训小模型） | 意图分类/路由小模型训练集（intent_weak.jsonl，弱标签需人工精标） |
| bad/review 案例 | LangSmith/Braintrust "trace→dataset 一键晋升"（"见过一次的失败，变成每次都跑的测试"） | **内部 bench 题目**（bench_manager.py 已实现，bad/review 优先进 bench） |

闭环机制的两个关键经验：
1. **数据飞轮的核心是速度不是概念**（Karpathy 的 Tesla data engine；Arize+NeMo 的自动闭环）：手工标注永远落后于分布漂移。你的增量版 case_miner（mtime 追踪）就是自动化的第一步，建议挂到平台 crontab 每周跑。
2. **版本化是闭环的信用基础**（DVC 理念；Datasheets for Datasets）：每一版 bench/训练数据冻结，新模型分数才有可比性。脚本已内置版本目录；每版补一个 meta.json（已在 bench 中实现），写明"这批数据哪来的、怎么筛的"。

质量与合规红线（调研中的重要警告）：
- UltraFeedback 被 Argilla 发现有数千条 AI 标错的偏好标签——**偏好数据必须人工抽检**，所以脚本里 SFT 默认只收 human_* 标注的案例，heuristic 标注要显式 --include-heuristic 才放行
- 员工交互数据用于训练：以"合法利益"为基础而非"同意"（雇佣关系下同意不自由），训练前做 DPIA 式评估，PII 脱敏，**明确告知用途并留存审计记录**——不要复制大厂"点 thumbs 即授权全场会话"的暗黑模式
- 路由小模型的经济账：业界实践是便宜小模型分难度、低置信升级旗舰，**可省约 87% 推理成本**（监控 fallback 率 <15%）——这正好回应你的 token 成本治理线

## 二、闭环全景（建议贴在汇报最后一页）

```
平台日常使用
    │ 每周自动
    ▼
case_miner.py（增量挖掘 good/bad/review）
    │
    ├─→ good case ──人工确认──→ 场景库/周报（用户证言）+ SFT 数据
    ├─→ bad case ──归因──────→ 平台改进 backlog + DPO 负例
    ├─→ review 档 ──人工复核──→ 攻坚案例库（汇报叙事素材）
    │
    ├─→ training_data_builder.py → SFT / DPO / 意图弱标签 → 后训练 & 小模型
    │
    └─→ bench_manager.py build（bad/review 优先出题）
            │ 新模型引入时
            ▼
        run → score → compare → 准入评审（胜率>55% 且 bad 题不劣化 → 灰度）
            │
            └─→ 新模型上线 → 产生新会话 → 回到起点（版本全部可追溯）
```

## 三、落地顺序建议

1. 先跑 case_miner 一周攒 50+ 案例，人工复核 review 档（校准词表和标签规则）
2. 第二周：bad case 归因分类（平台缺陷/任务难/用法问题），启动 bench v1 出题
3. 第三周：用 bench v1 给当前在用模型打个基线分（没有基线，compare 无从谈起）
4. 第一个月：从 good case 出第一批 SFT 数据 + 第一批"本周最佳用法"周报
5. 新模型来了：跑 compare，产出准入评审材料——这是"内部 bench"价值的第一次兑现
