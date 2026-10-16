# 分析、创建与补方法的续接

合成请求：“基于现有发布检查 Skill 形成业务 Agent；缺少的通用记录规范可以补齐。”

当前主体依次采用方法：

| 阶段 | 方法 | 进入条件 | 交接 |
| --- | --- | --- | --- |
| 画像与关系 | skill-relations-analysis | 不清楚现有能力 | 有证据的能力清单 |
| 生态方案 | 同一分析 Skill 的生态参考 | 需要组合 | 场景路线、主体建议、design-brief |
| 装配 | agents-creator | 已有充分设计事实 | Agent 草稿、明确方法缺口 |
| 补方法 | skill-creator | 授权且缺口值得复用 | 实际名称、入口、资源、接口与检查结果 |
| 续接装配 | 已加载 agents-creator | 缺口已补或明确阻塞 | 最终文件及未验证项 |

这些阶段默认同一 Agent 执行，没有 creator 子 Agent 的通信。需要三份方法时当前主体的 skill 白名单应包含三者；Task 白名单与此无关。

交接例：“目标是检查发布记录；现有 release-check 可判断，缺少可复用摘要格式；输出根 work/generated；允许补 release-summary；只读输入，仅写产物；完成条件为必要字段与证据齐全。”

skill-creator 完成后，当前主体回到装配阶段核对 release-summary 的真实名称和要求。最终业务 Agent 仅需 release-check 与 release-summary，不依赖上述三个创建/分析 Skill。若 release-summary 只是两句稳定格式要求，可直接写入业务 Agent，不为每个小规则创建 Skill。
