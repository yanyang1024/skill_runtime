# 路由、执行与独立验收

补全原包提到的 doc-router、doc-parser、vision-analyst、parse-verifier 角色形态。以下为新编写的完整参考，不包含原内部 MinerU 实现，也不虚构它的脚本、模型或端点。

将本例源目录的 `agents/`、`skills/`、`input/` 合并到一个测试项目的 `.opencode/` 下。四个 agent 共用一个 doc-evidence skill，但只读取对应模式的参考。所有示例角色仅开放列明的只读工具、skill；只有 router 能调用白名单 subagent。

文本分支只需运行时能够读取纯文本。视觉分支及其验收要求目标环境支持实际图像输入；本例不锁定私有模型、不包含图片素材，没有该能力时应返回 BLOCKED。上下文是否隔离仍需目标运行时确认。

## 源文件

文件内容仅在链接目标维护；本页只说明设计与验收。原包没有提供内部实例原文，这些文件是教学实现。

| 文件 | 内容 |
| --- | --- |
| `agents/doc-router.md` | [打开源文件](../../../examples/routed-multiagent/agents/doc-router.md) |
| `agents/doc-parser.md` | [打开源文件](../../../examples/routed-multiagent/agents/doc-parser.md) |
| `agents/vision-analyst.md` | [打开源文件](../../../examples/routed-multiagent/agents/vision-analyst.md) |
| `agents/parse-verifier.md` | [打开源文件](../../../examples/routed-multiagent/agents/parse-verifier.md) |
| `skills/doc-evidence/SKILL.md` | [打开源文件](../../../examples/routed-multiagent/skills/doc-evidence/SKILL.md) |
| `skills/doc-evidence/references/contract.md` | [打开源文件](../../../examples/routed-multiagent/skills/doc-evidence/references/contract.md) |
| `skills/doc-evidence/references/coordinate.md` | [打开源文件](../../../examples/routed-multiagent/skills/doc-evidence/references/coordinate.md) |
| `skills/doc-evidence/references/extract.md` | [打开源文件](../../../examples/routed-multiagent/skills/doc-evidence/references/extract.md) |
| `skills/doc-evidence/references/verify.md` | [打开源文件](../../../examples/routed-multiagent/skills/doc-evidence/references/verify.md) |
| `input/doc-demo.md` | [打开源文件](../../../examples/routed-multiagent/input/doc-demo.md) |

## 手工验收任务

- 文本任务：“提取 .opencode/input/doc-demo.md 的计划目标、实测结果与未完成项，并独立核对。”应区分 20% 计划与 8% 实测，不把跨环境复测描述为已完成。
- 失败任务：直接向验证者提供候选“本轮实测降低 20%”及原始材料。应 FAIL 并指出矛盾，不修复候选后自行通过。
- 阻塞任务：提供不可读取的图片路径或让无图像能力的验证者核对图片结论。应 BLOCKED，不从文件名猜内容。
- 联合任务：文本通过而图片阻塞时，主 agent 只能报告部分完成。
