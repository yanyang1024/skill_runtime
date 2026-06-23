# Stabilize-Release Review Server 常用语句库

角色：发布前语义检查。
约束：不修改 stable 文件。

## 发布审查
请检查当前 preview skill、quality-review.md、director-review.md 和 iteration-review.md，判断这一版是否可以稳定化。请生成 release-review.md、changelog-draft.md 和 remaining-work.md。不要修改 stable 文件。

## 确认完成度
确认文件的最新状态。请检查当前 preview skill 是否已经完成本轮目标，如果仍有明显遗漏，请列出必须修复项；如果可以发布，请生成稳定化建议。

## 稳定化条件检查
请确认本轮 preview skill 是否满足稳定化条件：文件一致、无过时引用、API 端点状态正确、工具说明完整、导演反馈已处理。若可以发布，请生成 release notes；若不可以，请列出阻塞项。
