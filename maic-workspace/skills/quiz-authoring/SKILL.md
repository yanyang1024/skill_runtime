---
name: quiz-authoring
description: 测验场景（quiz）的出题 SOP。当需要根据 job card 生成 single/multiple/short_answer 三种题型的场景 JSON 时使用。包含题型契约、干扰项设计规则、难度分布与 short_answer 评分量规写法。
license: MIT
compatibility: opencode
metadata:
  audience: scene-builder
  workflow: course-production
---

# 测验场景出题 SOP

输入：一张 job card（scene_type=quiz，outline_item 里可能带 quizConfig 如 `{"count": 3, "types": ["single","multiple"]}`）。
产出：一个 `type: "quiz"` 的场景 JSON 写入 `output_path`，契约以 dsl/SPEC.md 第 4 节为准。
产出后必须运行 `python3 tools/course_validate.py --course <course_dir> --scene <scene_id>`，errors 清零才算完成。

## 三种题型 JSON 形

公共字段：每题必须有 `id`（场景内唯一，`q1`、`q2`…）、`type`、`question`、`analysis`、`points`。
`type` 与 `content.type` 均为 `"quiz"`（硬约束）。

### single（单选）

```json
{
  "id": "q1",
  "type": "single",
  "question": "题干",
  "options": [
    {"label": "选项内容", "value": "A"},
    {"label": "选项内容", "value": "B"},
    {"label": "选项内容", "value": "C"},
    {"label": "选项内容", "value": "D"}
  ],
  "answer": ["A"],
  "analysis": "为什么 A 对、其他选项错在哪",
  "points": 10
}
```

### multiple（多选）

两个及以上正确答案，其余字段同 single：

```json
{
  "id": "q2",
  "type": "multiple",
  "question": "题干（选出所有正确项）",
  "options": [
    {"label": "……", "value": "A"},
    {"label": "……", "value": "B"},
    {"label": "……", "value": "C"},
    {"label": "……", "value": "D"}
  ],
  "answer": ["A", "C"],
  "analysis": "为什么 A、C 正确，B、D 为什么不选",
  "points": 15
}
```

### short_answer（简答）

无 `options` / `answer`，必须有 `commentPrompt`：

```json
{
  "id": "q3",
  "type": "short_answer",
  "question": "需要书面作答的题干",
  "commentPrompt": "评分量规：(1) 要点 A —— 40% (2) 要点 B —— 30% (3) 表达清晰度 —— 30%",
  "analysis": "预生成的参考答案/参考评语：一份好答案应覆盖……",
  "points": 20
}
```

**本工作区无运行时 LLM 批改**：

- `commentPrompt` 是展示给学习者**自评**的评分量规，要写成可逐条打勾的清单（要点 + 权重），不是给 LLM 的指令。
- `analysis` 必须写成**预生成的参考评语/参考答案**，学习者提交后对照阅读；不要写"由 AI 根据回答给出评语"这类话。

## 设计规则

### 题干

- 清晰无歧义，聚焦本场景 keyPoints 对应的知识点。
- 需要公式时用纯文本描述，不用 LaTeX 语法。
- 遵守 job card 的 languageDirective。

### 干扰项（single/multiple）

- 各选项长度相近，避免"最长的是答案"。
- 干扰项要**看似合理但明确错误**——取材于常见误解（如把 `no-cache` 理解成"不缓存"）。
- 禁止"以上都对"/"以上都不对"。
- 正确答案位置随机分布，不要总在 A。
- `answer` 的值必须出现在 `options` 的 `value` 里（校验 ERROR）；站点本地按选项集合相等判满分。

### 难度分布

| 难度 | 特征 | 建议占比 |
|---|---|---|
| 易 | 直接回忆、概念直用 | ~40% |
| 中 | 需要理解和简单分析 | ~40% |
| 难 | 需要综合、评估或迁移 | ~20% |

`points` 按难度与复杂度区分（易 10 / 中 15 / 难 20 是可用基线）；quizConfig 给了 count/types 时遵循之。

### analysis 写法

- 每题必填，展示在判分之后。
- 说清正确答案为什么对，**以及**每个干扰项为什么错——解析是学习机会，不是一句"答案 A"。
