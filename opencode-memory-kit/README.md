# opencode-memory-kit

给 opencode 的一套极简长期记忆方案：**纯 markdown 文件 + grep，零依赖、零向量库、零 MCP**。
全部通过 opencode 原生槽位实现（skills / agents / commands / plugin / AGENTS.md），可整体拷进任意项目或全局配置。

## 架构：四条原则的落点

| 原则 | 实现 | 槽位 |
|---|---|---|
| 文件打底 | `.opencode/memory/`：`MEMORY.md` 索引 + `topics/` 主题 + `log/` 日记 | 普通文件，可 git |
| 启动注入索引 | AGENTS.md 一行指令（可靠）+ 可选插件硬注入（experimental） | `AGENTS.md` / `.opencode/plugin/` |
| 按需检索细节 | memory skill 教 agent 的 grep 纪律 | `.opencode/skills/memory/` |
| 后台巩固（dream） | `dreamer` 子代理 + `/dream` 命令（手动或 CI/cron 触发） | `.opencode/agents/` + `.opencode/commands/` |

## 安装

```bash
# 项目级：拷到项目根目录
cp -r .opencode /path/to/your/project/
cat AGENTS.snippet.md >> /path/to/your/project/AGENTS.md

# 全局级（所有项目生效）：改拷到 ~/.config/opencode/
```

然后重启 opencode，输入 `/dream` 或 `@dreamer` 应能被识别。

## 日常使用

- **agent 自动记忆**：memory skill 会在"用户表达偏好 / 做了关键决策 / 踩了坑"时自动触发，把一行事实追加到当天 `log/`。
- **手动速记**：`/remember 数据库迁移必须用 goose 不能用 gormigrate`
- **巩固**：隔几天（或 log 超过 ~500 行）跑 `/dream`，dreamer 子代理会把日志提炼进 topics、去重、剪枝索引、归档旧日志，并输出一份 dream 报告。
- **检索**：agent 按 skill 纪律先查 `MEMORY.md` 索引，再 `grep -rni` 深入细节文件。

## 诚实的局限（与商业方案的差距）

1. **没有真后台**：opencode 没有闲时钩子，dream 是显式触发的。可用 cron/CI 定时 `opencode run --agent dreamer` 弥补。
2. **插件注入有坑**：`experimental.chat.system.transform` 在部分版本会静默丢弃修改（见 README 引用），所以 AGENTS.md 是主路径，插件只是增强。
3. **grep 的边界**：单项目几千行记忆内 grep 完全够用；跨项目、上万条语义模糊查询时，才需要考虑向量方案（那时再上 memsearch/hindsight 之类插件也不迟）。
4. **记忆不带强引用就会退化**：kit 强制每条索引带来源指针（`来源: log/2026-XX-XX.md`），这是从 Codex 社区"uncited memory is an assertion"的批评里学来的。

## 文件清单

```
.opencode/
├── memory/
│   ├── MEMORY.md          # 索引：只放一行式指针，<200 行
│   ├── topics/            # 主题细节文件（dream 产出，agent 按需 grep）
│   └── log/               # 日记：YYYY-MM-DD.md，原始记录，不摘要
├── skills/memory/SKILL.md # 读写纪律 + grep 检索方法
├── agents/dreamer.md      # 巩固子代理
├── commands/dream.md      # /dream 触发巩固
├── commands/remember.md   # /remember 快速记录
└── plugin/memory-inject.js # 可选：会话开始注入 MEMORY.md
```
