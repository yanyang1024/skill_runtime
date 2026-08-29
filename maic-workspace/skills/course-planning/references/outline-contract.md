# outline.json 输出契约

material-analyst 的产出，是 scene-builder 的输入依据。字段定义以 dsl/SPEC.md 第 7 节为准。

**输出必须是对象，绝不允许裸数组。** 顶层恰好三个键：`languageDirective`、`courseTitle`、`outlines`。

## 顶层字段

| 字段 | 类型 | 必需 | 说明 |
|---|---|---|---|
| languageDirective | string | ✅ | 2-5 句教学语言指令（教学语言、术语处理、跨语言情况） |
| courseTitle | string | ✅ | ≤ 30 字，名词短语，教学语言书写，无引号/编号/emoji/教师身份 |
| outlines | array | ✅ | 至少 1 项，顺序即站点导航顺序 |

## outlines[] 字段

| 字段 | 类型 | 必需 | 说明 |
|---|---|---|---|
| id | string | ✅ | 全课唯一，建议 `s1`、`s2`… |
| type | string | ✅ | `interactive` / `quiz` / `pbl` 三选一（本工作区无 slide） |
| title | string | ✅ | 场景标题，简洁中立，不含教师身份 |
| description | string | ✅ | 1-2 句教学目的 |
| keyPoints | string[] | ✅ | 3-5 条核心要点 |
| order | number | ✅ | 正整数，从 1 开始，不重复 |
| widgetType | string | interactive 必需 | `tutorial` / `simulation` / `diagram` / `code` / `game` |
| widgetOutline | object | interactive 必需 | widget 级结构提示（如 `{"sections": [...]}`、`{"concept": ..., "keyVariables": [...]}`） |
| quizConfig | object | quiz 可选 | 如 `{"count": 3, "types": ["single", "multiple"]}` |
| pblConfig | object | pbl 可选 | 如 `{"issueCount": 3}` |
| materialRefs | string[] | ❌ | 摘录后的材料片段相对路径（如 `materials/ch1.md`） |

## 完整示例

```json
{
  "languageDirective": "全课用中文讲授，术语保留英文原文（如 Cache-Control、ETag），首次出现时给出中文解释。",
  "courseTitle": "HTTP 缓存机制",
  "outlines": [
    {
      "id": "s1",
      "type": "interactive",
      "title": "缓存头速览",
      "description": "建立对 HTTP 缓存体系的整体认识，知道有哪些缓存头和它们的分工。",
      "keyPoints": ["缓存解决什么问题", "强缓存与协商缓存的区别", "常见缓存头速查表"],
      "order": 1,
      "widgetType": "tutorial",
      "widgetOutline": {"sections": ["是什么", "为什么", "速查表"]},
      "materialRefs": ["materials/ch1.md"]
    },
    {
      "id": "s2",
      "type": "interactive",
      "title": "max-age 模拟实验",
      "description": "通过调节 max-age 观察强缓存命中与过期的过程。",
      "keyPoints": ["max-age 的作用", "过期后回源", "刷新行为差异"],
      "order": 2,
      "widgetType": "simulation",
      "widgetOutline": {"concept": "强缓存", "keyVariables": ["maxAge"]},
      "materialRefs": ["materials/ch2.md"]
    },
    {
      "id": "s3",
      "type": "quiz",
      "title": "缓存知识检验",
      "description": "检验对强缓存与协商缓存核心概念的理解。",
      "keyPoints": ["Cache-Control 语义", "ETag 协商流程"],
      "order": 3,
      "quizConfig": {"count": 3, "types": ["single", "multiple"]}
    },
    {
      "id": "s4",
      "type": "pbl",
      "title": "为一个静态站点设计缓存策略",
      "description": "综合运用缓存知识，为真实场景设计可交付的缓存配置方案。",
      "keyPoints": ["资源分类", "策略选型", "方案验证"],
      "order": 4,
      "pblConfig": {"issueCount": 3}
    }
  ]
}
```

## 配比红线（自检用）

- interactive（含 tutorial）为课程主体；无 slide。
- quiz 每 3-5 个场景穿插一个。
- pbl 全课至多 1 个，放在末尾。
- 每个 interactive 场景缺 `widgetType` 或 `widgetOutline` 即为非法。
