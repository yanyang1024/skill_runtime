# 可复制示例

这里保存每个示例的唯一源文件。各例均自带所需业务 agent、skill 和输入，不依赖创建助手；安装核心创建包时不会自动启用这些业务能力。

| 目录 | Agent | 设计与验收指南 |
| --- | --- | --- |
| single-primary | beol-primary-dev | [单 primary](../skills/agents-creator/examples/single-primary.md) |
| routed-multiagent | doc-router、doc-parser、vision-analyst、parse-verifier | [路由与验收](../skills/agents-creator/examples/routed-multiagent.md) |
| parallel-master-worker | lot-master、lot-worker | [并行 worker](../skills/agents-creator/examples/parallel-master-worker.md) |
| agent-with-skill | release-reviewer | [联合创建](../skills/agents-creator/examples/agent-with-skill.md) |

选择一例，将该目录的 `agents/`、`skills/`、`input/` 合并到测试项目的 `.opencode/` 下。然后使用目标 OpenCode 已有的 agent 选择方式运行指南中的任务；本包不提供假定版本的 CLI 命令。

已有同名文件时先比较再合并，保留用户定制内容。只复制业务源目录即可，运行时不需要本说明或创建器。标准加载路径下，保留在 `.opencode/examples/` 的参考材料不会自动启用；内部平台若扫描整个目录树，应排除 examples 或把参考目录放在加载范围之外。

所有数据均为合成教学输入。运行时发现、权限和实际模型能力需在目标环境验证。
