# PROTOCOL.md — Workspace 多智能体交接协议

> 本文件是 workspace 内所有 agent 的**共同合同**。任何 agent 开始工作前必须已读本文件与 `dsl/SPEC.md`。
> 核心原则（继承自 OpenMAIC 的哲学）：**通过显式、可校验的制品交接，而不是对话里的叙述。**

## 0. 角色总览

| Agent | 模式 | 职责 | 交接物 |
|---|---|---|---|
| `course-director` | primary | 需求澄清、调度、质检门禁、汇总交付 | job card（下行）/ 验收报告（上行） |
| `material-analyst` | subagent | 材料 → outline.json | `outline.json` 文件路径 + 回执 |
| `scene-builder` | subagent | 一个 job card → 一个场景文件 | 场景文件路径 + 校验结果 |
| `scene-verifier` | subagent | 质检已交付场景（**只检查，不修复**） | verdict JSON |

## 1. 全流程（director 视角）

```
scaffold new → material-analyst 产出 outline.json → 大纲给用户确认
→ 按 outline 生成 job cards → 并行派 scene-builder（每场景一个实例）
→ 每个场景交付后派 scene-verifier 质检 → 全部通过
→ scaffold assemble 刷新 stage.json → build_player 构建站点 → 交付用户
```

## 2. 下行：Job Card（director → subagent）

一张 job card 是一个 JSON 文件，写在课程目录的 `jobs/` 下。subagent 的输入**只有**：
job card 内容 + card 里列出的 reference 文件。不得假设主对话里的任何上下文。

```json
{
  "task": "build-scene",
  "course_dir": "courses/demo",
  "scene_id": "s3",
  "scene_type": "interactive",
  "title": "强缓存与协商缓存",
  "outline_item": {
    "description": "1-2 句教学目的",
    "keyPoints": ["要点1", "要点2", "要点3"],
    "widgetType": "simulation",
    "widgetOutline": {}
  },
  "languageDirective": "全课中文，术语保留英文",
  "skill_ref": "skills/interactive-authoring",
  "material_refs": ["courses/demo/materials/ch2.md"],
  "output_path": "courses/demo/scenes/s3.json"
}
```

规则：
- `outline_item` 里只带与该场景类型相关的配置字段（quiz→quizConfig，interactive→widgetType/widgetOutline，pbl→pblConfig），字段定义见 `dsl/SPEC.md` 第 7 节。
- `material_refs` 是**摘录后的**片段文件，不是原始材料全文（全文在 material-analyst 阶段就已被消化成大纲）。
- `skill_ref` 指向该场景类型对应的 skill 目录（`skills/quiz-authoring` / `skills/interactive-authoring` / `skills/pbl-design`）；subagent 必须先读其 SKILL.md。

## 3. 上行：交付回执（subagent → director）

scene-builder / material-analyst 的最后一条消息**只允许**是如下 JSON（不写散文）：

```json
{
  "status": "done",
  "scene_path": "courses/demo/scenes/s3.json",
  "validation": {"errors": 0, "warnings": 2},
  "notes": "warning 的一句话说明（可选）"
}
```

- `status`: `done` / `failed`。failed 时给出 `notes` 说明卡在哪。
- `validation` 必须来自**实际运行** `python3 tools/course_validate.py --course <course_dir> --scene <scene_id>` 的输出，不得编造。
- errors > 0 的交付视为未完成，director 应原样退回并要求修复。

## 4. 质检门：scene-verifier（检查者/修复者分离）

scene-builder 自检通过后，director **必须**再派 scene-verifier 质检该场景：

```json
{
  "verdict": "pass | warn | fail",
  "checks": {
    "validator": "pass",
    "offline": "pass",
    "viewport": "warn: 未见针对 1280x720 的布局",
    "bridge": "pass",
    "completeness": "pass"
  },
  "issues": ["……"],
  "advice": "给 director 的一句话修复建议"
}
```

- 任何一项 fail ⇒ verdict 不得为 pass；verdict==fail 时 director 把 `issues + advice` 塞进 job card 的
  `feedback` 字段重派 scene-builder 修复。
- **scene-verifier 禁止修改任何文件，禁止修复后自行宣布通过**——修复是 scene-builder 的事。
- verdict==warn 可以放行，但 director 要在最终验收报告里汇总。

## 5. 校验门（Gate）

```
写文件 → json_repair（若输出直接来自模型原文）→ course_validate → errors==0 ? 通过 : 修复重试（≤3 次）
```

- director 验收时的依据是校验器输出 + verifier verdict + 文件存在性，不读场景内容本身（保持上下文干净）。
- WARNING 不清零，但 director 应在最终验收报告里汇总。

## 6. 并行与隔离

- 每个场景一个 scene-builder 实例，可并行派发；实例之间**禁止**互相读写对方的 scene 文件。
- 所有实例共享的只读文件：`dsl/SPEC.md`、本协议、skills、material_refs。
- 所有实例共享的可写文件：只有自己的 `output_path`。`stage.json` 只能由 director 更新。

## 7. 失败与重试

- 单场景失败（校验不过或 verifier 判 fail）：director 用同一 job card 加 `feedback` 字段重派，
  最多 3 次；仍失败则在大纲中标记 `status: "failed"` 继续其余场景，最终向用户报告。
- 大纲级失败（材料读不出/需求无法落地）：material-analyst 返回 `failed`，director 回到用户澄清。

## 8. 离线纪律

- 任何 agent 不得在制品中引用 http(s) 外链资源（图片、字体、JS/CSS 库、CDN）。
  需要图片时引用 `assets/` 下已存在的本地文件，或用内联 SVG/CSS 绘制。
- 校验器把 interactive HTML 里的外链计为 **ERROR**（v0.2 起），不是 WARNING。
