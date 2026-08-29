# MAIC-Lite DSL 规范 v0.2

> 从 OpenMAIC 的 `@openmaic/dsl` 抽离的**轻量 profile**，面向一个重心场景：
> **把 md/html 技术文档变成一座可离线打开的交互式课程网站。**
> 目标是：**LLM 生成得动、Python 标准库校验得了、静态站点构建器渲染得出。**
>
> v0.2 相对 v0.1 的变化：删除 `slide` 场景类型与 `speech` 动作（语音/视频等多模态不在本工作区范围）；
> `interactive` 升级为一等公民并补齐渲染契约（逻辑视口、sandbox、postMessage 桥、离线红线）；
> 新增 `outline.json` 的正式 schema。

一门课程 = 一个目录：

```
my-course/
├── stage.json            # 课程元信息 + 场景清单（唯一入口）
├── outline.json          # 大纲阶段的产出（见第 8 节；保留，便于单场景重生成）
├── scenes/
│   ├── s1.json           # 一个场景一个文件
│   ├── s2.json
│   └── ...
├── jobs/                 # 生成期的 job card（见 PROTOCOL.md），交付后可清理
├── materials/            # 生成期的材料摘录，交付后可清理
└── assets/               # 可选：本地图片等，场景里用相对路径引用
```

---

## 1. stage.json（Stage）

```json
{
  "dslVersion": "maic-lite/0.2",
  "id": "stage_demo",
  "name": "HTTP 缓存机制",
  "description": "一句话描述",
  "languageDirective": "全课用中文讲授，术语保留英文原文……",
  "style": "professional",
  "createdAt": 1756000000000,
  "updatedAt": 1756000000000,
  "scenes": ["scenes/s1.json", "scenes/s2.json"]
}
```

| 字段 | 必需 | 说明 |
|---|---|---|
| dslVersion | ✅ | 固定 `"maic-lite/0.2"` |
| id / name | ✅ | id 用 `stage_` 前缀 |
| languageDirective | ✅ | 教学语言指令（大纲阶段产出，见 course-planning skill） |
| scenes | ✅ | 场景文件相对路径，**顺序即站点导航顺序** |
| description / style / createdAt / updatedAt | ❌ | |

## 2. 场景公共字段（SceneCore）

```json
{
  "id": "s1",
  "stageId": "stage_demo",
  "type": "interactive",
  "title": "缓存头速览",
  "order": 1,
  "content": { },
  "actions": [ ]
}
```

- 场景类型只有三种：`quiz` / `interactive` / `pbl`。
- `type` 与 `content.type` **必须一致**——这是硬约束。
- `actions` 可选，导览动作序列（见第 7 节）。站点/播放器按序执行。

## 3. InteractiveContent（交互场景，一等公民）

```json
{
  "type": "interactive",
  "widgetType": "simulation",
  "description": "交互目的",
  "html": "<!DOCTYPE html>……完整自包含 HTML……"
}
```

- `widgetType`：
  - `tutorial` —— 交互式教程页：图文排版为主 + 嵌入式小交互（折叠面板、步骤切换、即点即答）。承担封面、讲解、小结等职能，是一门课里数量最多的类型。
  - `simulation` —— 参数可调的过程模拟（滑块/按钮驱动画布或动画）。
  - `diagram` —— 可探索的结构图/拓扑图（节点点击查看详情、平移缩放）。
  - `code` —— 可编辑运行的代码示例（浏览器内执行 JS；其他语言只演示不执行）。
  - `game` —— 小游戏化练习（拖拽配对、限时判断等）。
- `html` 必须是**完整 HTML 文档**（`<!DOCTYPE html>` 开头、`</html>` 结尾），且完全自包含：
  CSS/JS 全部内联，**禁止引用任何 http(s) 外部资源**（含 cdn.jsdelivr / unpkg / cdnjs 等 CDN、
  外链字体、外链图片）。数学公式用纯文本/Unicode/CSS 呈现，不引入 KaTeX/MathJax。
  引用本地图片只允许 `assets/` 相对路径。
- **逻辑视口**：页面针对 **1280×720** 逻辑视口创作，宿主（站点/播放器）用
  `iframe srcdoc` + CSS `transform: scale()` 缩放适配。不要写依赖窗口实际尺寸的不可缩放布局。
- **sandbox 边界**：宿主以 `sandbox="allow-scripts allow-forms allow-popups"` 渲染
  （**没有 allow-same-origin**，页面处于 null origin）。因此：localStorage/cookie 不可用，
  状态全部保存在内存；不要发起网络请求。
- **widget-config（可选）**：把结构化配置内嵌进 HTML，供工具链/宿主读取：

  ```html
  <script type="application/json" id="widget-config">
  {"type": "simulation", "variables": ["maxAge"], "presets": ["no-cache"]}
  </script>
  ```

- **元素命名约定**：关键控件用可预测的 id/class，供导览动作（spotlight/annotate）用 CSS
  选择器定位：`{变量名}-slider`、`{动作}-btn`、`{变量名}-display`、`#reset-btn`、
  `[data-step-id="step-N"]`、`#progress-display`。
- **postMessage 桥（推荐实现）**：widget 应监听宿主下发的导览消息
  `HIGHLIGHT_ELEMENT` / `ANNOTATE_ELEMENT` / `REVEAL_ELEMENT`，参考实现见
  `skills/interactive-authoring/references/widget-contract.md`。

## 4. QuizContent（测验场景）

```json
{
  "type": "quiz",
  "questions": [
    {
      "id": "q1",
      "type": "single",
      "question": "……",
      "options": [{"label": "……", "value": "A"}],
      "answer": ["A"],
      "analysis": "解析",
      "points": 10
    }
  ]
}
```

- `type`: `single` / `multiple` / `short_answer`
- single/multiple 必须有 `options` 和 `answer`；`answer` 的值必须出现在 options 的 value 里；
  由站点本地批改（选项集合相等即满分）。
- short_answer 无 options/answer，必须有 `commentPrompt`（评分量规，展示给学习者自评）；
  其 `analysis` 应写成**预生成的参考评语/参考答案**（本工作区不做运行时 LLM 批改）。
- 每题必须有 `analysis` 和 `points`。

## 5. PBLContent（项目式学习场景）

```json
{
  "type": "pbl",
  "projectTopic": "……",
  "projectDescription": "……",
  "targetSkills": ["技能1", "技能2"],
  "issues": [
    {"id": "i1", "title": "……", "description": "……", "deliverable": "……"}
  ]
}
```

- `targetSkills` 2-5 项；`issues` 2-5 项，每项有明确交付物（deliverable 必须可检查）。

## 6. 导览动作（Action，lite 子集）

| actionName | params | 说明 |
|---|---|---|
| `spotlight` | `{selector}` | 高亮交互页内某元素（CSS 选择器，对应命名约定） |
| `annotate` | `{selector, text}` | 在交互页内弹出批注气泡 |
| `wait` | `{ms}` | 停顿 |
| `next` | `{}` | 推进到下一动作/下一场景的显式标记 |

动作通过宿主 → iframe 的 postMessage 桥下发；widget 未实现桥时动作静默跳过，不算错误。

## 7. outline.json（大纲阶段的产出契约）

material-analyst 的产出，是 scene-builder 的输入依据。**输出必须是对象，绝不允许裸数组。**

```json
{
  "languageDirective": "全课用中文讲授，术语保留英文原文",
  "courseTitle": "HTTP 缓存机制（≤30 字）",
  "outlines": [
    {
      "id": "s1",
      "type": "interactive",
      "title": "缓存头速览",
      "description": "1-2 句教学目的",
      "keyPoints": ["要点1", "要点2", "要点3"],
      "order": 1,
      "widgetType": "tutorial",
      "widgetOutline": {"sections": ["是什么", "为什么", "速查表"]},
      "materialRefs": ["materials/ch1.md"]
    }
  ]
}
```

| 字段 | 必需 | 说明 |
|---|---|---|
| languageDirective / courseTitle | ✅ | courseTitle ≤ 30 字 |
| outlines[] | ✅ | 至少 1 项；id 全课唯一，order 为正整数且不重复 |
| outlines[].id / type / title / description / keyPoints / order | ✅ | type 为三种场景类型之一 |
| outlines[].widgetType / widgetOutline | interactive 必需 | widgetType 见第 3 节 |
| outlines[].quizConfig | quiz 可选 | 如 `{"count": 3, "types": ["single","multiple"]}` |
| outlines[].pblConfig | pbl 可选 | 如 `{"issueCount": 3}` |
| outlines[].materialRefs | ❌ | 摘录后的材料片段相对路径 |

场景配比纪律（见 course-planning skill）：interactive（含 tutorial）为课程主体；
quiz 每 3-5 个场景穿插一个；pbl 全课至多 1 个，放在末尾。

## 8. 校验分级

- **ERROR**：结构非法（缺必需字段、type 与 content 不符、answer 指向不存在的选项、场景文件缺失、
  **interactive HTML 引用 http(s) 外链**、widget-config JSON 解析失败、HTML 截断）
- **WARNING**：质量问题（缺 languageDirective、dslVersion 不符、actionName 不在白名单、
  HTML 中疑似未闭合标签等启发式提示）

`tools/course_validate.py` 是唯一权威校验器；**任何 agent 写出场景文件后必须运行它，ERROR 清零才算完成**。
