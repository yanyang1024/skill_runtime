# Agent 与 Skill 创建包 · v3

同一个创建助手按需加载 `agents-creator` 与 `skill-creator`。Agent 保留稳定职责、选择单／多主体的设计意图与能力导航；skill 维护具体流程、契约和检查方法。

## 安装与升级

- 将顶层 `agents/`、`skills/` 合并到标准 OpenCode 项目 `.opencode/`。主入口是 `agents-create-assistant`，两个核心 skill 的名称与目录一致。
- 需要完整示例时，将顶层 `examples/` 也保留在同一层级，或从分发包按需读取。它是参考目录；启用某例的方法见 [示例说明](examples/README.md)。内部平台按实际加载目录处理。
- 从最初包升级时，避免同时启用旧 `agents-create` 和新 `agents-creator`。已有同名文件先比较再合并。
- 随包 `skill-creator` 是 OpenCode 适配版；目标环境已有同名实现时，核对契约并选择复用，不自动覆盖。
- 核心创建助手只允许这两个 creator skill，仍为 `task: deny`；可以设计多 agent 文档，自身不运行这些业务子任务。没有自动安装或全局配置修改。

## 本轮改动

1. 将 v2 长文中的代码块拆为真正可复制的示例文件。每份 agent、skill 与契约只维护一份，指南只保存链接、设计理由与验收任务。
2. 增加“联合创建”完整示例，展示 agents-creator 设计、skill-creator 编写方法、再续接 agent 装配；最终业务产物不依赖两个 creator。
3. 强化 agent 的设计选择：方法／工具不足优先复用能力；隔离、独立验收和并行收益明确时才增加主体；设计原则不能自行扩大运行权限。
4. 细化加载导航，单独修改 skill 内部方法时不重写 agent。其他技能仍是条件扩展，不增加默认依赖。

## 完整示例

| 场景 | 包内目录 | 角色与方法 |
| --- | --- | --- |
| 单主体方法复用 | examples/single-primary | 1 primary + 1 skill |
| 路由与独立验收 | examples/routed-multiagent | 1 primary + 3 subagent + 1 skill |
| 独立任务并行 | examples/parallel-master-worker | 1 primary + 1 worker + 1 skill |
| 联合创建产物 | examples/agent-with-skill | 1 primary + 1 skill |

按需入口：[examples 索引](skills/agents-creator/examples/index.md)。这些是按原包角色形态补写的教学例子，不是原内部工程源码；不提供虚构的 MinerU 后端。视觉分支需要实际图像能力，数据与数值规则均为明确标注的合成示例。

## 验证范围

本轮核对 YAML、名称、引用、白名单和各例依赖，并将四例分别复制到独立测试项目检查其文件依赖不指向创建器，再检查 ZIP 完整性。v2 已做过一次独立上下文的 agent + skill 创建演练；本轮未重复模型效果评测。

内部 OpenCode 的实际发现、权限合并、独立会话与业务工具未在此运行验证。配置依据见 [frontmatter 参考](skills/agents-creator/references/frontmatter.md)。
