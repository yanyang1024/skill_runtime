# 配置与目标环境

新建、修改 frontmatter 或排查加载问题时读取。本文件集中维护配置约定；其他模板不重复权限基线。

## 环境与路径

先检查目标项目的配置和版本。上游标准项目级 agent 目录是 `.opencode/agents/`，skill 目录是 `.opencode/skills/<name>/`；全局对应 `~/.config/opencode/agents/` 与 `~/.config/opencode/skills/`。本分发包的顶层 `agents/` 与 `skills/` 是交付结构；直接用于标准项目时放到 `.opencode/` 下。内部平台若有自定义加载目录，遵循已确认的项目约定。

Skill 的目录名、SKILL.md 的 `name`、agent 的调用名称和权限白名单应一致。使用实际可发现的 skill，不凭路径猜测已安装。

## 字段选择

- `description`：简述职责和适用场景，需要时写关键边界，不塞入 SOP。
- `mode`：本 skill 主要生成 `primary` 或 `subagent`，根据交互入口和调用关系判断；不是按任务重量判断。
- `permission`：新产物统一使用此键配置能力。普通动作使用 `allow / ask / deny`；支持模式匹配的权限可用映射。
- `model`、`variant`、`temperature`、`top_p`：只有实际需要且目标模型支持时配置；不默认锁死模型或温度。低温不等于确定性保证。
- `hidden`、`steps` 等其他字段：仅在目标版本支持且任务需要时添加。

不要把这里当作跨版本的穷举 schema。上游将旧 `tools` 配置标记为 deprecated 并保留兼容；内部 fork 的行为需以代码或实测为准。不要宣称它在所有版本里都静默无效。未知键、权限合并和命令解析同样不能凭经验保证。

## 权限选择

优先保留已确认的平台基线，并按职责配置差异。平台基线在项目配置集中维护时，不在每份 agent 重复抄写；需要独立分发时才在产物中显式展开。

| 职责 | 建议 |
| --- | --- |
| 不派单的执行者 | 显式 `task: deny` |
| 协作调度者 | task 默认 deny，仅允许真实目标 subagent |
| 审查者 | `edit: deny`；bash 按实际检查需求限制，不能通过任意 shell 绕过只读职责 |
| 文件生成者 | 在目标版本支持范围内限定可写路径，并按需要提供命令权限 |
| subagent | 通常 `question: deny`；缺信息回传 BLOCKED，由上游补充 |
| primary | 按交互需要开放 question；todowrite 可按任务需要启用 |

Skill 白名单示例：

```yaml
permission:
  task: deny
  skill:
    "*": deny
    "agents-creator": allow
    "skill-creator": allow
```

对于支持模式的规则，上游采用最后匹配规则生效，因此宽规则在前、窄规则在后。文件工具的写入控制使用 `edit`，不要用 `write` 替代。新增自定义工具的权限键需核对目标运行时。

本包创建助手保留原有读写、bash 和 external_directory 配置及 webfetch 禁用，避免未经目标环境验证改变其工作能力；显式禁用 task；skill 白名单仅允许两个随包 creator。这不是所有生成 agent 必须继承的权限基线。内网禁用网页访问是部署策略，不是 agent 的通用性质。

`rm* / pkill* / kill*` 只能拦截部分命令形式。即使禁用了 edit，开放任意 bash 仍可能写文件。需要真实隔离时使用受限工具、路径控制或沙盒；不要以正文禁令宣称已获得运行时隔离。

## 同名 skill 与示例

本包的 skill-creator 是面向 OpenCode 的适配版，不能因为同名就覆盖目标环境已有版本。先比较触发与交接契约；复用现有实现时保留稳定调用名。仅补必要白名单，不自动扩大权限。

分发包顶层 `examples/<scenario>/` 保存可复制源文件，不放在已激活的 `agents/` 或 `skills/` 内；skill 内的 examples 仅保存按需索引。按标准加载目录安装时，这些参考源文件不会作为业务 agent／skill 自动注册。需要启用某例时，将该例自己的 agents、skills、input 合并到测试项目 `.opencode/`，并核对权限。内部平台若扫描整个目录树，应排除参考 examples 或将它们留在分发包外的文档目录。

## 依据

- Agent 配置：https://opencode.ai/docs/agents/
- Skill 发现：https://opencode.ai/docs/skills/
- 权限：https://opencode.ai/docs/permissions/

上游文档核对日期：2026-09-20。上述链接供核查，不要求内网执行时联网；内部 fork 应补充适用版本及本地验证证据。
