# Plan — OpenMAIC → OpenCode Workspace 抽离与重构

## 目标（v2，2026-08 重构后）

把 OpenMAIC 的「文档 → 结构化课程」生成管线抽离成一个 OpenCode workspace，
重心场景：**md/html 技术文档 → 可离线打开的交互式 HTML 课程网站**。
不依赖数据库、重型软件、网络服务；不做语音/视频等多模态生成。

## 抽离对象（已读源码确认）

| 源（OpenMAIC） | 抽取为 | 形态 |
|---|---|---|
| packages/@openmaic/dsl（stage/scene/action 类型） | MAIC-Lite DSL v0.2（删 slide/speech，强化 interactive 契约，补 outline.json schema） | dsl/SPEC.md + tools/course_validate.py |
| templates/requirements-to-outlines | course-planning skill（配比重加权：interactive 为主体） | skills/course-planning/ |
| templates/simulation-content 等 widget prompt（postMessage 桥、命名约定、踩坑清单） | interactive-authoring skill（含 references/widget-contract.md、common-pitfalls.md） | skills/interactive-authoring/ |
| templates/quiz-content | quiz-authoring skill（short_answer 改为预生成参考评语） | skills/quiz-authoring/ |
| prompts-pbl/planner-single-call | pbl-design skill（对齐 MAIC-Lite pbl 形） | skills/pbl-design/ |
| 结构化动作协议（删 speech，留 spotlight/annotate/wait/next） | 并入 SPEC 第 6 节 + 播放器导览执行器 | dsl + tools |
| generation-retry/json-repair 思路 | tools/json_repair.py（stdlib） | 脚本 |
| 文档解析（unpdf/pptxtojson 思路 + 新增 html 输入） | tools/extract_material.py | 脚本 |
| 两阶段管线（outline→scenes） | primary/sub agent 架构 + course_scaffold.py | agents/ + 脚本 |
| 导出/播放思路（lib/export） | tools/build_player.py：--mode site 多页静态站点（默认）/ --mode single 单文件 | 脚本 |

## 明确不抽（减法边界）

slide 画布元素 DSL 及其 prompt、`*-actions` prompt、白板、agent 分身、web 检索、
媒体/TTS 生成、模型路由、LangGraph director、持久化、多用户、quiz-grader（运行时 LLM 批改）。

## 依赖纪律

- 所有 Python 工具只用标准库（zipfile/re/json/html.parser）。
- PDF 解析：优先系统 pdftotext，否则提示用户转 txt/docx/md/html。
- 制品零外链零 CDN：交互 HTML 完全自包含，校验器对外链计 ERROR。

## 构建次序与完成状态

1. ✅ dsl/SPEC.md v0.2 + PROTOCOL.md（合同先行）
2. ✅ tools 五个脚本（validate/extract/scaffold/build_player 已对齐 v0.2）
3. ✅ skills 四个（course-planning / interactive-authoring / quiz-authoring / pbl-design）
4. ✅ agents 四个 + commands 两个 + opencode.json
5. ✅ examples/demo-course 示例课程 + tests/ unittest + 端到端自测

## 后续可选方向（未做，按需启动）

- outline.json 的全量字段校验（当前为轻量校验）
- 站点主题定制（style 字段 → 构建期 CSS 变量）
- quiz 结果在站内的本地记录（导出 JSON 文件，而非 localStorage——sandbox 限制）
