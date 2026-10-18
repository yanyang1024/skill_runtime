# 路由与交接检查样例

以下是设计层检查，不能替代真实 runtime 测试。

| 请求/材料 | 应采用的路线 | 检查重点 |
| --- | --- | --- |
| 只分析一份短 Skill | 当前主体画像 | 不强制派 worker、不加载创建器 |
| 20 份材料独立且 Task 可用 | 分批独立画像→主主体综合 | 唯一输出路径、紧凑回传、无跨对象污染 |
| 已有有效画像，只生成入口 | 复核所需接口→agents-creator | 不重跑全库；用实际 name 配白名单 |
| 创建时缺可复用方法 | agents-creator 阶段暂停→skill-creator→续接装配 | 同主体续接；不重新设计全部路线 |
| 只允许 B，缺 A 产物 | B 阻塞，列输入缺口 | 不扩选 A |
| A 是知识指南，B 是输出规范 | 检查适用范围后同主体组合 | 不强造 A 输出文件→B 输入文件 |
| A/B 对最终输出格式冲突 | 按用户目标限定阶段或澄清 | 不采用“后加载优先” |
| 全选 A/B 同能力 | 保留两项状态/隔离对照 | 不静默去重 |
| A→B→A 为产物依赖 | 检查种子、阶段化或阻塞 | 不无限执行 |
| agents-creator 借 skill-creator 补方法后返回 | 一次阶段续接 | 不误报为递归依赖环 |
| 生成与验收要求独立 | 独立验证上下文+限定输入 | 不能把画像 worker 或自检冒充验收 |

## 扩展检查入口

同名/重叠/无需 Skill、合并与资源迁移、引用文件变更、中途改目标、通用问答干扰、基础设施错误等案例见 [scenarios.json](../evals/scenarios.json)。这些是构造的设计案例，未运行；完整对照设计见 [composition-validation.md](composition-validation.md)。


## 使用与提问场景

处理含糊请求或 worker 缺口前读 [interaction.md](interaction.md)。进一步检查：没有 CSV 仍可生成配置；只说整合 Agent 不物理合并 Skill；缺委托 ID/路径由 primary 补齐；需要固化的业务口径冲突由 primary 提问；多 worker 同问题合并；创建时“不执行业务”不泄漏成业务 Agent 的永久禁令。新增案例与本轮验证状态见 [usage-cases.json](../evals/usage-cases.json)。
