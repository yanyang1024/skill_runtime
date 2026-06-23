# Grow-Build Server 常用语句库

角色：根据 growth-plan 实际修改 preview skill。
约束：只修改当前 preview workspace，不要修改 stable。

## 生成实际修改计划
请基于 growth-plan.md 生成本轮实际修改计划，说明准备修改哪些文件、为什么修改、预期产物是什么。然后再开始执行。注意：只修改当前 preview workspace，不要修改 stable 目录。

## 执行修改
请根据刚才的实际修改计划执行文件更新。优先做最小必要修改，避免让 SKILL.md 过度膨胀；能放到 reference、tool_registry、endpoint_manifest 的内容不要硬塞进 SKILL.md。

## 检查完成情况
确认所有的文件的最新状态并检查当前任务的完成情况，如果还有需要完成的剩余部分请继续。最后生成 patch-notes.md，说明实际改了哪些文件、每个修改对应哪个会话证据或 growth opportunity。

## 沉淀原则
请优先把稳定能力沉淀到 tools、references、endpoint_manifest 或 workflow 文档中，不要把所有内容都塞进 SKILL.md。
