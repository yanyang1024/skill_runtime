---
description: 从文档生成一门交互式课程网站（完整管线：材料→大纲→场景→站点）
agent: course-director
---

从输入文档生成一门交互式课程网站：$ARGUMENTS

按 PROTOCOL.md 全流程执行：course_scaffold.py new 建课程目录 → 派 material-analyst
提取材料并产出 outline.json → 把大纲摘要给我确认 → course_scaffold.py jobs 生成
job cards → 每场景并行派 scene-builder → 每个交付派 scene-verifier 质检（fail 则带
feedback 重派，最多 3 次）→ course_scaffold.py assemble 刷新 stage.json →
build_player.py --mode site 构建站点。

最后只向我汇报：课程目录、站点路径、场景清单（id/type/title）、verifier 结论汇总、
WARNING 汇总。不要把场景内容贴进对话。
