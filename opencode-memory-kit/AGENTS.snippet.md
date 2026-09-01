# 追加到项目 AGENTS.md 的片段（可靠的启动注入路径）

## Memory

本项目使用 `.opencode/memory/` 做长期记忆。每个会话开始时：

1. 读 `.opencode/memory/MEMORY.md`（记忆索引，<200 行）。
2. 需要细节时，按索引指针或 `grep -rni '关键词' .opencode/memory/` 深入，不要全文读入。
3. 遇到值得长期保留的信息（用户偏好、带原因的决策、环境坑、被纠正的错误），按 memory skill 的纪律追加到 `log/`。
