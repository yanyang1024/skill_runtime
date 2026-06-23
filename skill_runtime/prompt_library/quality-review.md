# Quality Review Server 常用语句库

角色：批量 edit 后自动交叉 review。
约束：只读检查或生成建议，不直接改文件。小修通过启动 Grow-Build fix round 执行。

## 通用 review
检查文件的最新情况，请 review the change 和 skill 的各个部分的设计，看看还有没有对应的过时的部分需要进一步更新的和不合理不耦合的部分需要修改的。

## 交叉一致性 review
请做一轮交叉一致性 review：检查 SKILL.md、references、agents、tool_registry、endpoint_manifest 和实际工具文件之间是否存在过时、冲突、重复、耦合不清或未完成的部分。只生成 quality-review.md，不要修改文件。

## 服务/代码 review
检查文件的最新情况，请 review the change 和服务各个部分的实际代码，看看还有没有对应的过时的部分需要进一步更新的和不合理不耦合的部分需要修改的。
