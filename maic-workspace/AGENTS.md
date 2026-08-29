# AGENTS.md — maic-workspace 工作区铁律

> 适用于在本目录内工作的所有 AI agent（包括 OpenCode 的 primary/subagent 与任何人工召唤的助手）。
> 细粒度合同见 `PROTOCOL.md` 与 `dsl/SPEC.md`；本文件只列不可逾越的红线。

## 定位

把 md/html 等技术文档转化为**结构化、可交互、纯离线的课程网站**。
场景主体是自包含 HTML 教学页（interactive），辅以 quiz 与 pbl。
不做：语音/视频生成、多模态理解、实时课堂编排、持久化、多用户。

## 铁律

1. **离线纪律**：任何制品（场景 JSON、生成的 HTML、站点输出）禁止引用 http(s) 外部资源——
   图片、字体、JS/CSS 库、CDN 一律禁止。校验器对此计 ERROR。
2. **合同先行**：`dsl/SPEC.md` 是数据契约的唯一权威，`tools/course_validate.py` 是校验的唯一权威。
   改契约必须三处同步：SPEC、校验器、`tools/build_player.py` 渲染器。
3. **校验门**：场景交付以"校验器 ERROR=0 + scene-verifier verdict≠fail"为完成定义，
   不以"看起来写完了"为准。禁止假成功。
4. **检查者不修复**：scene-verifier 只检查不改文件；修复永远由 scene-builder 做。
5. **交接物唯一化**：agent 之间只交接文件路径 + 约定 schema 的 JSON，不交接散文。
6. **stdlib-only**：`tools/` 只用 Python 3.8+ 标准库，不得引入第三方依赖。
   确定性逻辑下沉到 tools 脚本；LLM 调用只发生在 agent 会话里，不写进脚本。
7. **最小权限**：subagent 只写自己被指派的路径；`stage.json` 只有 course-director 能改。

## 目录速查

```
dsl/SPEC.md      数据契约（v0.2）          PROTOCOL.md   多智能体交接协议
tools/           五个 stdlib CLI 脚本       agents/       4 个 OpenCode agent 定义
skills/          4 个生成方法 skill         commands/     斜杠命令
examples/        demo-course（兼测试 fixture）  tests/     unittest 安全网
```
