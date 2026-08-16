# OpenCode 使用与配置指南（Linux）

> 本文基于 opencode.ai 官方文档（config / rules / permissions / agents / commands / skills / tui / cli / web / server）及 anomalyco/opencode 仓库相关 issue 整理，检索时间 2026-08。权限继承与 TUI 鼠标行为在版本间变动较快，落地前请以实际安装版本的 `opencode debug config` 输出和 changelog 为准。

**目录**

1. [opencode.json 配置](#一opencodejson-配置)
2. [项目级基础命令与 AGENTS.md](#二项目级基础命令与-agentsmd)
3. [Primary / Subagent 机制](#三primary--subagent-机制)
4. [概念区分：AGENTS.md / agent md / command md / SKILL.md](#四概念区分agentsmd--agent-md--command-md--skillmd)
5. [交互形式：TUI / CLI / Web](#五交互形式tui--cli--web)

---

## 一、opencode.json 配置

### 1.1 配置文件位置与优先级

opencode 的配置是**多层合并（merge），不是替换**：不冲突的键各层都保留，冲突的键后加载的覆盖先加载的。加载顺序如下（越靠后优先级越高）[^3^]：

| 顺序 | 来源 | 说明 |
|---|---|---|
| 1 | 远程配置 `.well-known/opencode` | 组织级默认 |
| 2 | **全局配置 `~/.config/opencode/opencode.json`** | 个人偏好 |
| 3 | `OPENCODE_CONFIG` 环境变量 | 指定自定义配置文件 |
| 4 | **项目配置：项目根目录的 `opencode.json`** | 启动时从当前目录向上追溯到最近的 Git 根目录查找；可安全提交进 Git 与团队共享 |
| 5 | `.opencode/` 目录 | agents、commands、plugins |
| 6 | `OPENCODE_CONFIG_CONTENT` 环境变量 | 内联 JSON 配置 |
| 7 | 托管配置（Linux：`/etc/opencode/`） | 需 root 写入，用户无法覆盖 |
| 8 | macOS MDM 配置 | 最高优先级，Linux 不涉及 |

补充：

- TUI 外观单独用 `tui.json`（全局 `~/.config/opencode/tui.json` 或项目根，可用 `OPENCODE_TUI_CONFIG` 指定路径），schema 为 `https://opencode.ai/tui.json`[^15^]。
- `opencode.json` 的 schema 为 `https://opencode.ai/config.json`，配上 `$schema` 字段后编辑器可校验和自动补全；两种文件均支持 JSON 和 JSONC（带注释）[^3^]。
- 还可用 `OPENCODE_CONFIG_DIR` 指定一个自定义配置目录，按 `.opencode/` 相同结构存放 agents、commands、plugins，加载在全局配置之后，可覆盖其设置[^3^]。

### 1.2 模型配置

- 顶层 `model`（格式 `provider_id/model_id`）、`small_model`（标题生成等轻量任务用的便宜模型，不配则自动选 provider 内更便宜的模型，否则回落到主模型）、`provider`（自定义 provider、baseURL、apiKey、`timeout`/`chunkTimeout`/`setCacheKey` 等选项）[^3^][^4^]。
- 模型实际选择优先级：`--model`/`-m` 命令行参数 > 配置里的 `model` > 上次使用的模型 > 内部默认[^4^]。
- 可给每个 agent 单独配 `model`（覆盖全局），还可配 `variants`（同一模型的 high/low 推理档）[^4^][^1^]。
- API key 推荐用 `/connect` 或 `opencode auth login` 存入 `~/.local/share/opencode/auth.json`；配置文件中可用 `{env:VAR}` / `{file:path}` 变量替换，避免明文密钥[^3^][^16^]。
- `disabled_providers` / `enabled_providers` 可做 provider 黑/白名单；同时出现时 `disabled_providers` 优先[^3^]。

### 1.3 权限配置

顶层 `permission` 槽位，三种动作：`allow` / `ask` / `deny`。支持 `*` 通配符和对象语法做细粒度规则；**同一工具的多条规则按"最后匹配生效"**，惯例是 `"*"` 兜底规则写前面、具体规则写后面[^8^]：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "*": "ask",
    "bash": {
      "*": "ask",
      "git *": "allow",
      "git push *": "deny",
      "rm *": "deny"
    },
    "edit": "allow"
  }
}
```

可用的权限键（按工具名 + 两个安全闸门）[^8^]：

| 键 | 匹配对象 |
|---|---|
| `read` | 文件路径（`*.env` 默认 deny） |
| `edit` | 所有文件修改（涵盖 edit / write / patch） |
| `glob` | glob 模式 |
| `grep` | 搜索正则 |
| `bash` | 解析后的 shell 命令 |
| `task` | 子代理类型 |
| `skill` | skill 名 |
| `lsp` | LSP 查询（当前不可细分） |
| `question` | 执行中向用户提问 |
| `webfetch` | URL |
| `websearch` | 搜索词 |
| `external_directory` | 工作目录之外的路径（安全闸门） |
| `doom_loop` | 同一工具调用重复 3 次（安全闸门） |

默认值：大部分 `allow`；`doom_loop` 与 `external_directory` 默认 `ask`；`read` 默认 allow 但 `*.env` / `*.env.*` 默认 deny（`*.env.example` 除外）。可用 `--auto` 启动自动批准模式（显式 `deny` 仍强制执行）[^8^]。

通配符规则：`*` 匹配任意数量字符，`?` 匹配单字符，其余字面匹配；模式开头可用 `~` 或 `$HOME` 指代家目录（常用于 `external_directory`）[^8^]。

权限可**按 agent 覆盖**：agent 的 permission 与全局合并，agent 规则优先[^8^][^1^]。

审批弹窗的三个选项：`once`（仅此一次）、`always`（本次会话内对建议的匹配模式放行）、`reject`（拒绝）。`always` 只在当前会话有效，不写入配置文件[^8^]。

### 1.4 其他主要配置槽位 [^3^]

| 槽位 | 作用 |
|---|---|
| `agent` | 自定义/覆盖代理（见第三节） |
| `command` | 自定义斜杠命令 |
| `mcp` | MCP server |
| `plugin` | npm 插件；本地插件放 `.opencode/plugins/` |
| `instructions` | 额外指令文件（路径 / glob / 远程 URL），与 AGENTS.md 合并 |
| `tools` | 开关工具（v1.1.1 起已废弃并入 permission，仍兼容） |
| `formatter` / `lsp` | 格式化器 / LSP server |
| `server` | `serve`/`web` 的 port、hostname、mDNS、CORS |
| `compaction` | 上下文压缩：`auto` / `prune` / `reserved` |
| `snapshot` | 文件改动快照（撤销能力），大仓库可关闭 |
| `watcher` | 文件监听忽略模式 |
| `share` | `manual` / `auto` / `disabled` |
| `autoupdate` | `true` / `false` / `"notify"` |
| `shell` | 交互终端与工具调用使用的 shell |
| `default_agent` | 默认 agent（必须是 primary，否则回落 build 并告警） |
| `subagent_depth` | 子代理嵌套深度，默认 1 |
| `experimental.policies` | 组织策略，如禁用某 provider |
| `attachment.image` | 图片附件尺寸/大小限制 |

### 1.5 如何确认当前生效的是哪份配置

- 最直接：**`opencode debug config`**，输出合并后的最终生效配置（官方验证托管配置时也用此命令）[^3^]。
- 起了 server 后也可请求 `GET /config` 查看当前配置[^19^]。
- 注意"生效"是合并结果：某键没生效，常见原因是被更高优先级的层覆盖，或 `OPENCODE_CONFIG` / `OPENCODE_CONFIG_CONTENT` 环境变量在你不知情时注入了配置。

### 1.6 不同路径配置的权限冲突会怎样

- **键级冲突**：项目 `opencode.json` 覆盖全局；二者都不能覆盖 `/etc/opencode/` 托管配置[^3^]。
- **权限规则冲突**：合并后是规则列表拼接 + 最后匹配生效，因此全局写的 `bash *: deny` 可能被项目配置中靠后的 `bash *: allow` 放行——反之亦然。排查时用 `opencode debug config` 查看合并后的规则顺序[^8^]。
- 已知坑：session 中点 `always` 的批准只在当前会话有效，不写入配置文件；且子代理会话不继承这些会话级批准（见 3.4）[^8^][^20^]。

---

## 二、项目级基础命令与 AGENTS.md

### 2.1 内置斜杠命令

TUI 中输入 `/` 触发，多数有 `ctrl+x` 前缀快捷键（leader key）[^15^][^6^]：

| 命令 | 作用 | 快捷键 |
|---|---|---|
| `/init` | 引导式生成/更新 `AGENTS.md` | — |
| `/new`（`/clear`） | 新会话 | `ctrl+x n` |
| `/sessions`（`/resume`、`/continue`） | 列出/切换历史会话 | `ctrl+x l` |
| `/compact`（`/summarize`） | 压缩当前会话上下文，回收 token | `ctrl+x c` |
| `/models` | 选择模型 | `ctrl+x m` |
| `/connect` | 添加 provider / API key | — |
| `/themes` | 切换主题 | `ctrl+x t` |
| `/undo` / `/redo` | 撤销/重做最近一轮（含文件改动，**要求项目是 Git 仓库**） | `ctrl+x u` / `ctrl+x r` |
| `/share` / `/unshare` | 分享会话链接 / 取消分享 | — |
| `/export` | 导出会话为 Markdown 并用 `$EDITOR` 打开 | `ctrl+x x` |
| `/editor` | 用外部编辑器编写消息（`$EDITOR`） | `ctrl+x e` |
| `/details` | 开关工具执行详情 | — |
| `/thinking` | 开关推理块显示 | — |
| `/help` / `/exit`（`/quit`、`/q`） | 帮助 / 退出 | — / `ctrl+x q` |

### 2.2 /init 与 AGENTS.md

`/init` 的行为：扫描仓库关键文件，代码库回答不了时会问几个针对性问题，然后生成或**原地改进**（不盲目覆盖已有内容）`AGENTS.md`[^14^]。内容聚焦：

- 构建 / lint / 测试命令及执行顺序、关键验证步骤
- 文件名看不出来的架构与仓库结构
- 项目特定约定、环境配置怪癖、运维坑
- 对已有 Cursor / Copilot 规则的引用

也可以完全手写 `AGENTS.md`，示例结构：项目概述 → 目录结构 → 代码规范 → 构建测试命令 → 团队约定[^14^]。

### 2.3 自定义命令

在 `.opencode/commands/`（项目）或 `~/.config/opencode/commands/`（全局）放 md 文件，**文件名即命令名**[^13^]：

```markdown
---
description: Run tests with coverage
agent: build
model: anthropic/claude-3-5-sonnet-20241022
---
Run the full test suite with coverage report and show any failures.
```

模板支持的特殊语法[^13^]：

- `$ARGUMENTS`（全部参数）与 `$1` `$2` `$3`（位置参数）
- `` !`shell命令` ``：注入命令输出（在项目根目录执行）
- `@文件路径`：注入文件内容

frontmatter 选项：`template`（JSON 方式时必填）、`description`、`agent`（指定执行代理）、`subtask`（强制作为子代理运行，不污染主上下文）、`model`。同名自定义命令会覆盖内置命令[^13^]。

---

## 三、Primary / Subagent 机制

### 3.1 内置代理 [^1^]

| 代理 | mode | 说明 |
|---|---|---|
| **build** | primary | 默认主代理，全工具开放 |
| **plan** | primary | 受限的规划/分析代理，edit 和 bash 默认均为 `ask` |
| **general** | subagent | 通用多步任务，全工具（除 todo），可并行跑多个 |
| **explore** | subagent | 快速只读，探索代码库，不能改文件 |
| **scout** | subagent | 只读，外部文档/依赖源码研究（克隆到托管缓存交叉比对） |
| compaction / title / summary | primary（隐藏） | 系统代理，自动运行，UI 不可选 |

> 现在的文档已无独立的 "mode" 概念页：plan / build 就是 primary agent，"模式"通过 agent 的 `mode` 字段（`primary` / `subagent` / `all`，默认 `all`）表达[^1^]。

### 3.2 使用方式

- primary 之间用 **Tab**（或 `switch_agent` 键位）循环切换[^1^]。
- subagent 两种触发方式：
  1. **主代理根据其 `description` 自动判断后通过 Task 工具调用**——所以 description 写得准确非常关键；
  2. 消息中 `@explore` 手动提及[^1^][^5^]。
- 子代理会开子会话，用 `Leader+→` / `Leader+←` 在父子会话间循环导航[^1^]。
- 嵌套深度由 `subagent_depth` 控制，默认 1（主代理能调子代理，子代理不能再调）；设为 0 禁止一切子代理调用[^3^]。
- `permission.task` 可精确控制某代理能调哪些子代理（glob 匹配）；设为 `deny` 时该子代理会从 Task 工具描述中整体移除，模型不会尝试调用[^1^]。

### 3.3 自定义 primary / subagent

**方式一：JSON**，配置中的 `agent` 槽位[^1^]：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "agent": {
    "code-reviewer": {
      "description": "Reviews code for best practices and potential issues",
      "mode": "subagent",
      "model": "anthropic/claude-sonnet-4-20250514",
      "prompt": "You are a code reviewer. Focus on security, performance, and maintainability.",
      "tools": { "write": false, "edit": false }
    }
  }
}
```

**方式二：Markdown**，放 `~/.config/opencode/agents/`（全局）或 `.opencode/agents/`（项目），**文件名即代理名**，正文即系统提示词[^1^]：

```markdown
---
description: Reviews code for quality and best practices
mode: subagent
model: anthropic/claude-sonnet-4-20250514
temperature: 0.1
permission:
  edit: deny
  bash:
    "*": ask
    "git diff": allow
---
You are in code review mode. Focus on: ...
```

frontmatter 支持的字段：`description`（必填）、`mode`、`model`、`temperature`、`top_p`、`steps`（最大迭代步数，达到后强制输出总结）、`prompt`（外部提示词文件，支持 `{file:...}`）、`tools`、`permission`、`hidden`（从 `@` 补全隐藏，Task 工具仍可调用）、`color`、`disable`；其余自定义字段会作为模型选项直接透传给 provider[^1^]。

**方式三：交互式创建**，`opencode agent create` 会依次询问保存位置（全局/项目）、用途描述、工具权限，最后生成 md 文件[^1^][^16^]。

### 3.4 子代理权限继承的注意点

"subagent 权限不继承 primary" 的说法需要修正——实际情况更微妙，这块正是上游 bug 重灾区：

- **设计上**：子代理使用自己配置的权限（与全局合并，自身规则优先），**不继承**触发它的 primary 的 allow/ask 配置，也**不继承**父会话中点过的 `always` 批准——常见现象是父会话批过的操作，子代理里又弹一遍审批[^1^][^20^]。
- **自 v1.14.46 起**：为修复"plan 模式只读限制被子代理绕过"的安全漏洞，父代理的 **deny 规则会作为上限继承给子代理**（`deriveSubagentSessionPermission`）[^23^]。
- **已知回归**：
  - 继承的父级 deny 拼在规则列表之后，因"最后匹配生效"会**盖掉子代理自己配置的 allow**，导致"controller 委派 executor"类工作流瘫痪（issue #26700、#26747）[^23^][^26^]；
  - 嵌套子代理时父代理名未持久化，会导致更深层代理丢失继承限制（#30610）[^21^]；
  - `external_directory` 的 allow 可能在子会话中被覆盖丢失（#30527）[^20^]。

**实践建议**：

1. 不依赖任何继承行为——子代理需要什么权限就在它自己的 frontmatter / `agent` 配置里**显式写全**；
2. 使用 deny-by-default 风格时，重点验证委派链路；
3. 用 `opencode debug config` 检查合并结果，必要时升降级验证是否为版本回归。

---

## 四、概念区分：AGENTS.md / agent md / command md / SKILL.md

| 概念 | 位置 | 加载方式 | 用途 |
|---|---|---|---|
| **AGENTS.md** | 项目根；全局 `~/.config/opencode/AGENTS.md` | **每个会话自动全文注入上下文** | 项目长期记忆：构建/测试命令、架构、约定；`/init` 生成[^14^] |
| **agent 定义 md** | `.opencode/agents/`、`~/.config/opencode/agents/` | 注册为一个可选/可调的代理，正文是其系统提示词 | 定义"谁来干活"：模型、权限、工具、模式[^1^] |
| **command md** | `.opencode/commands/`、`~/.config/opencode/commands/` | 输入 `/名字` 时作为提示词模板发送 | 可复用的"一句话任务"[^13^] |
| **SKILL.md** | `.opencode/skills/<name>/`、`.claude/skills/<name>/`、`.agents/skills/<name>/` 及对应全局目录（共 6 处） | **按需加载**：agent 在 skill 工具描述中看到 name + description，需要时才调 `skill({name})` 载入全文 | 特定场景的 SOP（发版流程、PR 审查规范等），不常驻上下文、省 token[^17^] |

### 4.1 AGENTS.md 查找与优先级

启动时按以下顺序查找规则文件[^14^]：

1. 从当前目录向上找本地 `AGENTS.md` / `CLAUDE.md`
2. 全局 `~/.config/opencode/AGENTS.md`
3. `~/.claude/CLAUDE.md`（Claude Code 兼容）

每类第一个命中生效：`AGENTS.md` 优先于 `CLAUDE.md`，`~/.config/opencode/AGENTS.md` 优先于 `~/.claude/CLAUDE.md`。Claude Code 兼容可用环境变量关闭：`OPENCODE_DISABLE_CLAUDE_CODE=1`（全部）、`OPENCODE_DISABLE_CLAUDE_CODE_PROMPT=1`（仅提示词）、`OPENCODE_DISABLE_CLAUDE_CODE_SKILLS=1`（仅 skills）[^14^][^16^]。

`opencode.json` 的 `instructions` 槽位可追加任意规则文件（路径、glob、远程 URL，远程拉取 5 秒超时），与 AGENTS.md **合并**注入[^14^]。

### 4.2 SKILL.md 规范

- frontmatter 只认 5 个字段：`name`（必填）、`description`（必填，1–1024 字符）、`license`、`compatibility`、`metadata`（string→string map）；未知字段忽略[^17^]。
- `name` 要求：1–64 字符、小写字母数字 + 单连字符分隔、不以 `-` 开头结尾、不含连续 `--`、**必须与所在目录同名**（等价正则 `^[a-z0-9]+(-[a-z0-9]+)*$`）[^17^]。
- 发现机制：项目路径从当前目录向上走到 git worktree，沿途加载 `.opencode/skills/`、`.claude/skills/`、`.agents/skills/`；全局目录同样加载；**各位置 skill 名必须唯一**[^17^]。
- 权限控制：`permission.skill` 按通配符控制（`allow` 直接加载 / `deny` 对 agent 隐藏并拒绝 / `ask` 先询问）；可按 agent 覆盖；agent 里 `tools: { skill: false }` 可整体禁用 skill 工具[^17^]。
- 排查：skill 不显示时检查——文件名是否全大写 `SKILL.md`、frontmatter 是否含 `name` + `description`、名字是否跨位置重复、是否被 `deny` 隐藏[^17^]。

### 4.3 一句话总结分工

- **AGENTS.md**：告诉 agent "这个项目是什么样"（常驻上下文）
- **agent md**：定义"以什么身份、模型、权限干活"
- **command md**：可复用的任务模板（用户主动触发）
- **SKILL.md**：按需取用的场景化 SOP（模型按 description 自主判断加载）

---

## 五、交互形式：TUI / CLI / Web

opencode 的架构是 **server + 多客户端**：运行 `opencode` 时实际同时启动了 TUI（客户端）和一个 HTTP server，因此 web、桌面端、IDE 插件、`opencode attach` 都能连同一个后端[^19^]。

### 5.1 TUI（`opencode`）

最常用、功能最全的交互形式：斜杠命令、`@` 文件模糊引用、`!` 开头执行 shell 命令、主题、自定义键位、桌面通知（`attention`）等[^15^]。

**已知问题（GitHub issue 确认）——鼠标捕获导致无法原生选择/复制**：TUI 默认捕获鼠标（`mouse: true`），在 iTerm2、Windows Terminal、VS Code 集成终端中，选择复制会失效或行为异常[^24^][^25^][^27^][^31^]。缓解办法：

- 按住 **Shift** 再拖选，绕过 TUI 使用终端原生选择（最通用）[^29^]；
- `tui.json` 中设 `"mouse": false`，或设环境变量 `OPENCODE_DISABLE_MOUSE=1`，恢复终端原生选择/滚动[^15^][^16^]；
- 设 `OPENCODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT` 关闭"选中即复制"[^16^]；
- VS Code 终端选择卡死时，点击一条历史消息再按 Esc 可释放鼠标捕获[^27^]；
- ssh / tmux 嵌套场景下 OSC52 剪贴板可能无法写入本机剪贴板[^31^][^29^]。

另有个别版本出现过**中文字符不渲染**（鼠标选中才显示）的回归，遇到先升降级验证[^44^]。

### 5.2 CLI / 无头模式（`opencode run` / `serve` / `attach`）

- `opencode run "..."`：非交互执行，适合脚本和 CI；`--format json` 输出原始事件流；`--continue` / `--session` 续会话；`--attach` 连接已运行的 server 以避免每次 MCP 冷启动[^16^]。
- `opencode serve`：纯 HTTP server，暴露 OpenAPI 3.1 接口（`/doc` 查看），可通过 `/tui/*` 端点编程驱动 TUI——IDE 插件即基于此实现[^19^]。
- 好处：可自动化、可集成；坏处：无交互审批界面时需依赖 `--auto` 或预先配好权限，否则容易卡在权限请求上[^16^][^8^]。
- 常用配套命令：`opencode auth login/list/logout`（凭证）、`opencode models`（列出可用模型，`--refresh` 刷新缓存）、`opencode session list/delete`、`opencode stats`（token 与成本统计）、`opencode export/import`、`opencode agent list/create`、`opencode upgrade`、`opencode uninstall`[^16^]。

### 5.3 Web（`opencode web`）

启动 server 并自动打开浏览器；`--hostname 0.0.0.0` 可暴露到局域网供手机等设备访问，支持 mDNS 发现与 `OPENCODE_SERVER_PASSWORD` basic auth[^18^]。

**已知问题**：

- **前端资源从 Cloudflare R2 CDN 运行时拉取，不内嵌在二进制中**——曾出现本地已升级但 CDN 仍下发旧版前端，导致页面白屏 / `RangeError: Maximum call stack size exceeded`（issue #10226）。web 页面渲染异常时先核对前端 bundle 版本，不一定是本地配置问题[^40^]。
- 绑定 `0.0.0.0` 而不设密码，等于把能执行 shell 的 agent 暴露给整个网络，**务必设置 `OPENCODE_SERVER_PASSWORD`**（用户名默认 `opencode`，可用 `OPENCODE_SERVER_USERNAME` 修改）[^18^][^19^]。
- 局域网多实例时用不同的 `--mdns-domain` 区分[^18^]。

### 5.4 选型建议

| 场景 | 推荐形式 |
|---|---|
| 本地日常开发 | TUI（复制粘贴问题用 Shift 或关鼠标解决） |
| CI / 脚本自动化 | `opencode run --format json` |
| 远程服务器 / 手机访问 | `opencode web`（务必加密码） |
| IDE 深度集成 | `opencode serve` + IDE 插件 |

---

## 参考资料

[^1^]: [OpenCode Docs — Agents](https://opencode.ai/docs/agents/)
[^3^]: [OpenCode Docs — Config](https://opencode.ai/docs/config/)
[^4^]: [OpenCode Docs — Models](https://opencode.ai/docs/models/)
[^5^]: [OpenCode Docs — Agents (subagent invocation)](https://opencode.ai/docs/agents/)
[^6^]: [OpenCode Docs — TUI / Primer](https://opencode.ai/docs/tui/)
[^8^]: [OpenCode Docs — Permissions](https://opencode.ai/docs/permissions/)
[^13^]: [OpenCode Docs — Commands](https://opencode.ai/docs/commands/)
[^14^]: [OpenCode Docs — Rules (AGENTS.md)](https://opencode.ai/docs/rules/)
[^15^]: [OpenCode Docs — TUI](https://opencode.ai/docs/tui/)
[^16^]: [OpenCode Docs — CLI](https://opencode.ai/docs/cli/)
[^17^]: [OpenCode Docs — Agent Skills](https://opencode.ai/docs/skills/)
[^18^]: [OpenCode Docs — Web](https://opencode.ai/docs/web/)
[^19^]: [OpenCode Docs — Server](https://opencode.ai/docs/server/)
[^20^]: [anomalyco/opencode — issue #30527：子会话 external_directory allow 被覆盖丢失](https://github.com/anomalyco/opencode/issues/30527)
[^21^]: [anomalyco/opencode — issue #30610：嵌套子代理丢失继承的权限限制](https://github.com/anomalyco/opencode/issues/30610)
[^23^]: [anomalyco/opencode — v1.14.46 起父级 deny 规则继承给子代理（deriveSubagentSessionPermission）及回归 #26700](https://github.com/anomalyco/opencode/issues/26700)
[^24^]: [anomalyco/opencode — issue：TUI 鼠标捕获导致无法选择复制](https://github.com/anomalyco/opencode/issues)
[^25^]: [anomalyco/opencode — issue：Windows Terminal 复制异常](https://github.com/anomalyco/opencode/issues)
[^26^]: [anomalyco/opencode — issue #26747：继承的 deny 覆盖子代理自身 allow](https://github.com/anomalyco/opencode/issues/26747)
[^27^]: [anomalyco/opencode — issue：VS Code 集成终端选择卡死](https://github.com/anomalyco/opencode/issues)
[^29^]: [anomalyco/opencode — issue：Shift+选择绕过鼠标捕获 / OSC52 剪贴板](https://github.com/anomalyco/opencode/issues)
[^31^]: [anomalyco/opencode — issue：tmux/ssh 嵌套下剪贴板失效](https://github.com/anomalyco/opencode/issues)
[^40^]: [anomalyco/opencode — issue #10226：web 前端 CDN 版本不一致导致白屏](https://github.com/anomalyco/opencode/issues/10226)
[^44^]: [anomalyco/opencode — issue：TUI 中文字符不渲染回归](https://github.com/anomalyco/opencode/issues)
