---
name: course-planning
description: 把用户材料与需求转化为 outline.json 的大纲生成 SOP。当需要从 md/html 技术文档等材料规划课程结构、生成大纲文件时使用。包含语言推断规则、courseTitle 规则、场景类型配比与严格输出契约。
license: MIT
compatibility: opencode
metadata:
  audience: material-analyst
  workflow: course-production
---

# 课程大纲生成 SOP

输入：用户材料摘录（materials/ 下的片段）+ 需求说明。产出：课程目录下的 `outline.json`。
完整字段契约见 references/outline-contract.md（以 dsl/SPEC.md 第 7 节为准），本文件是**决策规则**。

## 语言推断（按顺序套用）

1. **显式语言要求优先**：用户说"用英文讲"就直接遵循。
2. **默认：需求语言 = 教学语言**。用户用什么语言写需求，课就用什么语言讲。
3. **外语学习例外**："我想学日语" → 用用户的母语（中文）教，目标语作为学习材料；仅当用户是高级学习者（专八 / JLPT N1 级）且要求沉浸式时才用目标语讲授。
4. **材料语言不覆盖需求语言**：英文技术文档 + 中文需求 → 全课中文讲授，文档内容翻译/转述。
5. **代理请求**：家长/老师代他人写需求时，按**学习者**的语境判断教学语言。

推断结果写进 `languageDirective`（2-5 句指令：教学语言、术语处理、跨语言情况）。

### 术语处理默认规则

- 编程语言 / 产品名（Python、Docker）：保留英文原文。
- 有标准译名的学术术语：用教学语言译名。
- 新兴技术术语（AI/ML 类）：中英双语并列。
- 用户对术语有明确要求时，以用户要求为准。

## courseTitle 规则

- **≤ 30 字**，硬上限，超了就压缩。
- 用推断出的教学语言书写。
- 是名词短语（如"HTTP 缓存机制"），不是句子、不是问题。
- 不得包含：引号、编号、开头 emoji、教师姓名/身份、"课程"/"Course"字样。
- 需求本身已经是干练标题时可复用（修剪到上限内）；长 prompt 则提炼本质。

## 场景类型决策与配比（本工作区只有三种场景类型，无 slide）

主体是 **interactive**，五种 widgetType 分工：

| 内容特征 | widgetType | 说明 |
|---|---|---|
| 概念讲解 / 封面 / 小结 / 速查表 | `tutorial` | 图文排版 + 嵌入式小交互，数量最多，承担上游 slide 的全部职能 |
| 参数可调的过程现象（滑块驱动画布/动画） | `simulation` | 物理/协议/算法过程模拟 |
| 流程、结构、因果链 | `diagram` | 节点点击查看详情、可平移缩放 |
| 编程概念、算法 | `code` | 浏览器内可编辑运行 JS；其他语言只演示不执行 |
| 练习、游戏化巩固 | `game` | 拖拽配对、限时判断等 |

配比纪律：

- `quiz` 每 3-5 个场景穿插一个（quizConfig 可选，如 `{"count": 3, "types": ["single","multiple"]}`）。
- `pbl` 全课至多 1 个，放在末尾，只用于真正需要多步骤项目工作的主题（pblConfig 如 `{"issueCount": 3}`）。
- 其余全部 interactive；一门课至少 1 个场景。
- `id` 全课唯一（`s1`、`s2`…），`order` 为正整数且不重复，顺序即站点导航顺序。
- 每个 interactive 场景必须有 `widgetType` + `widgetOutline`；`keyPoints` 3-5 条要点。
- 标题与 keyPoints 保持中立、聚焦主题，不出现教师姓名/身份。

## 输出契约（硬性，最常翻车处）

1. 输出必须是**一个 JSON 对象**，含且仅含三个顶层键：`languageDirective`、`courseTitle`、`outlines`。
2. **绝不允许裸数组**——顶层是对象不是数组，这是最高频错误。
3. `languageDirective` 与 `courseTitle` 即使看似显然也**不得省略**。
4. 不包裹任何散文、markdown 或代码围栏。
5. 若输出直接来自模型原文，先过 `python3 tools/json_repair.py` 再写入文件。

产出后自检：对照 references/outline-contract.md 的字段表逐项核对；信息不全时按合理默认假设直接产出，不要反问。
