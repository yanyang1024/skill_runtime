import type { Snapshot } from '@/types/memory'

const preferenceContent = `# 个人工作与输出偏好

## 输出结构
- 默认先给结论，再列关键依据与风险。
- 研究报告采用「摘要—证据—判断—下一步」四段式。
- 数据保留一位小数，金额统一使用人民币万元。

## 文件习惯
- 周报使用 Markdown，表格优先于长段落。
- 对外材料避免内部项目代号。

## 约束
- 未经确认，不把单次行为沉淀为长期偏好。
`

const researchContent = `# 行业研究简报 Skill · 输出约定

> 由「行业研究简报」Skill 生成并经人工确认。

## 固定结构
1. 核心结论（不超过 120 字）
2. 关键数据与来源日期
3. 产业链变化
4. 风险与反证
5. 待验证问题

## 引用偏好
- 优先官方统计与公司公告。
- 所有数字旁保留时间范围。
- 事实与推断分段呈现。
`

const meetingContent = `# 会议纪要 · 个人模板

## 会议信息
- 主题 / 日期 / 参会人

## 决策
- 已确认事项加粗，并标注负责人。

## 行动项
| 事项 | 负责人 | 截止时间 |
| --- | --- | --- |

## 悬而未决
- 保留分歧，不替参会者补写结论。
`

export const initialSnapshot: Snapshot = {
  files: [
    {
      id: 'mem-001', title: '个人工作与输出偏好', fileName: 'preferences.md', type: 'preference',
      updatedAt: '2026-11-08 09:42', size: '2.8 KB', status: 'active',
      tags: ['长期偏好', '人工确认', '高复用'], summary: '跨任务生效的结构、格式与表达约束。',
      content: preferenceContent, source: '手动维护 + 推荐采纳', usageCount: 46, lastUsedAt: '12 分钟前',
    },
    {
      id: 'mem-002', title: '行业研究简报输出约定', fileName: 'research-brief.output.md', type: 'skill', skillName: '行业研究简报',
      updatedAt: '2026-11-07 18:20', size: '4.1 KB', status: 'active',
      tags: ['Skill 生成', '研究', '引用规范'], summary: '行业研究简报的固定结构、证据和引用要求。',
      content: researchContent, source: 'Skill 生成后编辑', usageCount: 31, lastUsedAt: '昨天 18:20',
    },
    {
      id: 'mem-003', title: '会议纪要个人模板', fileName: 'meeting-notes.template.md', type: 'skill', skillName: '会议纪要',
      updatedAt: '2026-11-06 16:05', size: '1.9 KB', status: 'active',
      tags: ['Skill 生成', '模板', '协作'], summary: '决策、行动项与分歧的纪要组织方式。',
      content: meetingContent, source: 'Skill 生成', usageCount: 18, lastUsedAt: '2 天前',
    },
    {
      id: 'mem-004', title: '周报写作样例', fileName: 'weekly-report.example.md', type: 'document',
      updatedAt: '2026-11-04 11:30', size: '6.7 KB', status: 'active',
      tags: ['样例', '周报'], summary: '经人工标记为高质量样例的个人周报。',
      content: '# 本周进展\n\n## 关键结果\n- Memory 推荐确认率提升至 72%。\n- 完成治理视角原型。\n\n## 下周计划\n- 接入 SSO 与审计接口。\n', source: '用户上传', usageCount: 12, lastUsedAt: '4 天前',
    },
    {
      id: 'mem-005', title: '表格分析口径', fileName: 'data-analysis.rules.md', type: 'skill', skillName: '表格分析',
      updatedAt: '2026-10-29 14:12', size: '3.5 KB', status: 'conflict',
      tags: ['Skill 生成', '数据口径', '待复核'], summary: '指标计算口径，与近期财务分析偏好存在一处冲突。',
      content: '# 表格分析口径\n\n- 缺失值默认保留并单独计数。\n- 同比增长率使用百分比，保留两位小数。\n- 异常值不自动剔除，需说明处理依据。\n', source: 'Skill 生成后编辑', usageCount: 24, lastUsedAt: '6 天前',
    },
    {
      id: 'mem-006', title: '汇报语言风格', fileName: 'tone.executive.md', type: 'preference',
      updatedAt: '2026-10-21 10:08', size: '1.2 KB', status: 'stale',
      tags: ['表达', '60 天未确认'], summary: '面向管理层的简洁表达偏好，建议近期复核。',
      content: '# 汇报语言风格\n\n- 首段直接回答“所以呢”。\n- 每页只保留一个核心判断。\n- 避免堆砌修饰词。\n', source: '推荐采纳', usageCount: 9, lastUsedAt: '18 天前',
    },
  ],
  versions: [
    { id: 'v-108', fileId: 'mem-001', version: 8, createdAt: '2026-11-08 09:42', author: '林澈', action: '推荐采纳', note: '采纳“事实与推断分段”偏好', content: preferenceContent },
    { id: 'v-107', fileId: 'mem-001', version: 7, createdAt: '2026-11-05 17:16', author: '林澈', action: '手动编辑', note: '补充内部代号约束', content: preferenceContent.replace('- 对外材料避免内部项目代号。\n', '') },
    { id: 'v-106', fileId: 'mem-002', version: 5, createdAt: '2026-11-07 18:20', author: '林澈', action: '手动编辑', note: '增加待验证问题章节', content: researchContent },
    { id: 'v-105', fileId: 'mem-002', version: 4, createdAt: '2026-10-30 15:02', author: 'RSI 推荐器', action: '推荐采纳', note: '沉淀来源日期偏好', content: researchContent.replace('5. 待验证问题\n', '') },
    { id: 'v-104', fileId: 'mem-003', version: 3, createdAt: '2026-11-06 16:05', author: '林澈', action: '手动编辑', note: '增加悬而未决部分', content: meetingContent },
    { id: 'v-103', fileId: 'mem-005', version: 4, createdAt: '2026-10-29 14:12', author: '管理者 · 周砚', action: '管理者迭代', note: '统一异常值处理说明', content: '# 表格分析口径\n\n- 缺失值默认保留并单独计数。\n- 同比增长率使用百分比，保留两位小数。\n- 异常值不自动剔除，需说明处理依据。\n' },
    { id: 'v-102', fileId: 'mem-001', version: 6, createdAt: '2026-10-26 09:18', author: '林澈', action: '版本回滚', note: '恢复研究报告四段式结构', content: preferenceContent.replace('- 对外材料避免内部项目代号。\n', '').replace('- 未经确认，不把单次行为沉淀为长期偏好。\n', '') },
    { id: 'v-101', fileId: 'mem-004', version: 1, createdAt: '2026-11-04 11:30', author: '林澈', action: '创建', note: '上传高质量周报样例', content: '# 本周进展\n\n## 关键结果\n- Memory 推荐确认率提升至 72%。\n- 完成治理视角原型。\n\n## 下周计划\n- 接入 SSO 与审计接口。\n' },
  ],
  recommendations: [
    { id: 'rec-01', title: '研究报告先呈现反证与风险', kind: '偏好沉淀', confidence: 93, status: 'pending', createdAt: '今天 09:36', reason: '最近 5 次行业研究中，你 4 次将风险段落前置，并保留与原判断相反证据。', evidence: ['11 月 8 日 · 存储行业简报：手动移动“风险与反证”至摘要之后', '11 月 6 日 · 机器人产业研究：新增“不支持当前判断的证据”', '11 月 4 日 · 云计算周报：要求后续版本先讲不确定性'], suggestedContent: '## 研究表达补充\n- 核心结论后优先呈现反证与风险，再展开支持性证据。', targetFileId: 'mem-001', sourceEvents: 7 },
    { id: 'rec-02', title: '表格导出默认保留口径说明', kind: '文件习惯', confidence: 88, status: 'pending', createdAt: '今天 08:52', reason: '近 7 天生成的 6 个分析文件中，均手动补充了指标口径与数据截止时间。', evidence: ['6 / 6 个 XLSX 文件包含“口径说明”工作表', '4 次追问数据截止时间', '2 次将口径说明移至首页'], suggestedContent: '## 表格文件\n- 导出分析表格时默认附“指标口径”和“数据截止时间”。', targetFileId: 'mem-001', sourceEvents: 9 },
    { id: 'rec-03', title: '会议纪要行动项增加优先级', kind: '用法学习', confidence: 81, status: 'pending', createdAt: '昨天 19:14', reason: 'Skill 使用轨迹显示，你在连续 3 次纪要中为行动项增加 P0/P1 标记。', evidence: ['3 次连续编辑具有相同模式', 'P0 均对应 24 小时内需完成事项', '未观察到删除该字段的行为'], suggestedContent: '| 优先级 | 事项 | 负责人 | 截止时间 |\n| --- | --- | --- | --- |\n\n- P0：24 小时内；P1：本周内。', targetFileId: 'mem-003', sourceEvents: 5 },
    { id: 'rec-04', title: '减少对外材料中的英文缩写', kind: '偏好沉淀', confidence: 68, status: 'pending', createdAt: '昨天 14:20', reason: '近期 3 次编辑出现缩写展开，但样本仍较少，建议确认后再长期生效。', evidence: ['将 SaaS 改为“软件服务”', '将 POC 改为“概念验证”', '一次保留 RSI 未修改'], suggestedContent: '## 对外表达\n- 首次出现的英文缩写补充中文全称；内部术语除外。', targetFileId: 'mem-001', sourceEvents: 3 },
    { id: 'rec-05', title: '周报保留“未完成及原因”', kind: '用法学习', confidence: 86, status: 'accepted', createdAt: '11 月 5 日', reason: '连续 4 期周报均保留该部分。', evidence: ['4 期周报样例'], suggestedContent: '- 周报固定保留“未完成及原因”。', targetFileId: 'mem-004', sourceEvents: 4 },
    { id: 'rec-06', title: '所有回答控制在 300 字内', kind: '偏好沉淀', confidence: 54, status: 'dismissed', createdAt: '11 月 3 日', reason: '仅由一次短回答任务触发，不应泛化。', evidence: ['单次会话'], suggestedContent: '- 所有回答不超过 300 字。', targetFileId: 'mem-001', sourceEvents: 1 },
  ],
  users: [
    { id: 'u_1027', name: '林澈', department: '平台产品部', role: '产品经理', memoryCount: 28, health: 86, lastActive: '刚刚', preferences: ['结论先行', 'Markdown', '风险前置'], memoryContent: preferenceContent, memoryVersion: 8 },
    { id: 'u_1088', name: '周砚', department: '智能体平台部', role: '平台管理者', memoryCount: 34, health: 92, lastActive: '8 分钟前', preferences: ['证据引用', '行动项', '版本审计'], memoryContent: '# 周砚的记忆\n\n- 平台评审先列风险与审计证据。\n', memoryVersion: 12 },
    { id: 'u_1132', name: '陈屿', department: '行业研究部', role: '研究分析师', memoryCount: 41, health: 78, lastActive: '26 分钟前', preferences: ['数据日期', '反证', '产业链'], memoryContent: '# 陈屿的记忆\n\n- 所有行业数据注明统计区间。\n', memoryVersion: 15 },
    { id: 'u_1219', name: '孟遥', department: '销售运营部', role: '运营经理', memoryCount: 19, health: 69, lastActive: '1 小时前', preferences: ['表格优先', '客户分层', '行动项'], memoryContent: '# 孟遥的记忆\n\n- 客户复盘按分层与下一步行动组织。\n', memoryVersion: 6 },
    { id: 'u_1306', name: '许澄', department: '财务部', role: '财务分析师', memoryCount: 37, health: 88, lastActive: '昨天 18:40', preferences: ['口径说明', '同比分析', '两位小数'], memoryContent: '# 许澄的记忆\n\n- 财务指标保留口径说明与同比变化。\n', memoryVersion: 11 },
    { id: 'u_1420', name: '唐叙', department: '法务合规部', role: '合规专员', memoryCount: 23, health: 81, lastActive: '昨天 16:12', preferences: ['条文引用', '保守表述', '复核'], memoryContent: '# 唐叙的记忆\n\n- 法规结论必须引用生效版本与条款。\n', memoryVersion: 7 },
  ],
  patterns: [
    { id: 'cp-01', title: '结论先行，证据随后', category: '内容偏好', adoption: 76, users: 184, trend: 8, reason: '高频出现在研究、周报和管理层汇报中；采纳后平均编辑轮次下降。', sample: '先给结论，再列 3 条关键依据；不确定项单独标记。', conflicts: 4 },
    { id: 'cp-02', title: '数字附统计区间与来源', category: '输出格式', adoption: 68, users: 165, trend: 12, reason: '近期数据问答与研究报告使用增加，主要由财务和研究团队带动。', sample: '所有关键数字保留时间范围、单位与来源日期。', conflicts: 2 },
    { id: 'cp-03', title: '行动项包含负责人和期限', category: '工作流程', adoption: 61, users: 148, trend: 5, reason: '会议纪要与项目复盘中稳定出现，跨部门共性最强。', sample: '行动项使用表格：事项 / 负责人 / 截止时间 / 状态。', conflicts: 1 },
    { id: 'cp-04', title: '事实与推断分开表达', category: '内容偏好', adoption: 47, users: 114, trend: 16, reason: 'RSI 从人工修改轨迹中学习，近两周在投研和合规场景增长明显。', sample: '已知事实、分析推断、待验证假设分节呈现。', conflicts: 6 },
    { id: 'cp-05', title: '导出文件附指标口径', category: '工具用法', adoption: 39, users: 95, trend: 9, reason: '表格 Skill 的高频二次编辑集中在口径说明，具备模板化价值。', sample: 'XLSX 首页附数据截止时间、指标定义和缺失值处理。', conflicts: 3 },
  ],
  logs: [
    { id: 'log-01', time: '2026-11-08 09:42:18', actor: '林澈', action: '采纳推荐', target: 'preferences.md · v8', result: '成功', detail: 'rec-05 写入个人偏好；来源事件 4 条' },
    { id: 'log-02', time: '2026-11-08 09:15:03', actor: 'RSI 推荐器', action: '生成推荐', target: 'rec-01', result: '待复核', detail: '置信度 93%；等待用户确认' },
    { id: 'log-03', time: '2026-11-07 18:20:44', actor: '林澈', action: '编辑记忆', target: 'research-brief.output.md · v5', result: '成功', detail: '新增“待验证问题”章节' },
    { id: 'log-04', time: '2026-11-07 16:02:10', actor: '周砚', action: '迭代用户记忆', target: 'u_1132 · v15', result: '成功', detail: '统一数据来源标注方式；已通知用户' },
    { id: 'log-05', time: '2026-11-07 11:38:29', actor: '治理策略', action: '发现冲突', target: 'data-analysis.rules.md', result: '待复核', detail: '小数位数偏好与财务共性口径不一致' },
    { id: 'log-06', time: '2026-11-06 16:05:37', actor: '林澈', action: '编辑记忆', target: 'meeting-notes.template.md · v3', result: '成功', detail: '保留分歧与未决事项' },
    { id: 'log-07', time: '2026-11-05 10:24:51', actor: '林澈', action: '忽略推荐', target: 'rec-06', result: '已忽略', detail: '原因：单次行为，不应沉淀' },
    { id: 'log-08', time: '2026-11-04 11:30:05', actor: '林澈', action: '创建记忆', target: 'weekly-report.example.md · v1', result: '成功', detail: '用户上传并标记为高质量样例' },
  ],
}
