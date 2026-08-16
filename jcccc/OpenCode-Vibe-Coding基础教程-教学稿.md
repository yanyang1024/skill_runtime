# 用 OpenCode 开始 Vibe Coding · 基础教程（教学稿）

> 最后更新：2026-08-17 | 适用版本：opencode v1.x（以 `opencode debug config` 实际输出为准）
> 难度：入门 | 预计耗时：60–90 分钟
> 素材来源：opencode.ai 官方文档与《OpenCode使用与配置指南（Linux）》调研文档

## 教程概览

本教程面向**有基本编程经验、但不熟悉 AI 编程 Agent** 的开发者，以 Linux 环境为例，带你从零跑通基于 opencode 的 Vibe Coding 工作流。学完后你能够：独立安装并验证 opencode；完成一次完整的"描述意图 → Agent 执行 → 审查回滚"会话；正确放置并验证 opencode.json 配置（模型 + 权限）；使用 /init、/compact 等内置命令与 AGENTS.md；理解 primary / subagent 机制并自定义一个子代理；区分 AGENTS.md、agent md、command md、SKILL.md 四种 Markdown；根据场景在 TUI / CLI / Web 三种交互形式中做选择并绕开已知坑。

## 1. 前置知识

**必须掌握**：
- 终端基本命令（cd、环境变量、管道）：所有操作都在终端完成（推荐资源：Linux Command Line Basics）
- Git 基础（init、commit、分支概念）：opencode 的 /undo 与项目识别都依赖 Git 仓库
- JSON 语法：opencode.json 是本教程的核心操作对象

**了解即可**：
- LLM API / provider 的概念：配置模型时涉及 provider_id/model_id 格式
- MCP（Model Context Protocol）：进阶章节会提到，基础流程不依赖

## 2. 环境搭建

**必须安装**：
- `opencode` v1.x | 本教程主角，终端 AI 编程 Agent
- `git` | /undo、项目根识别、快照功能依赖

**可选安装**：
- `Node.js >= 18` | 仅当你选择 npm 方式安装时需要

**安装（三选一）**：

```bash
# 方式一：官方安装脚本（推荐，Linux/macOS 通用）
curl -fsSL https://opencode.ai/install | bash

# 方式二：npm 全局安装
npm install -g opencode-ai

# 方式三：Homebrew（Linuxbrew 亦可）
brew install anomalyco/tap/opencode
```

**配置 provider 凭证**：

```bash
# 交互式选择 provider 并填入 API key（凭证存于 ~/.local/share/opencode/auth.json）
opencode auth login
```

**验证安装**：

```bash
opencode --version
# 预期输出：打印版本号，如 1.x.x

opencode auth list
# 预期输出：列出已登录的 provider
```

## 3. 核心步骤

> 项目根目录说明：下文 `my-project/` 指你的练习项目根目录，须为 Git 仓库（`git init` 即可）。

#### 步骤 1：启动第一个会话

**目标**：在 TUI 中与 Agent 完成一轮对话。

**操作**：

```bash
cd my-project
opencode
```

在输入框中输入：`给我快速总结一下这个代码库的结构`

**解释**：`opencode` 无参数启动时会同时拉起 TUI（客户端）和一个本地 HTTP server；TUI 只是客户端之一。

**验证**：Agent 读取文件后给出总结回复；底部状态栏可见当前 agent（build）与模型名。

#### 步骤 2：体验 plan / build 双模式

**目标**：理解"先规划、后动手"的安全工作流。

**操作**：按 **Tab** 切换到 plan 代理，输入：`帮我设计一个给 CLI 加 --verbose 参数的方案，不要改代码`；确认方案后再 Tab 切回 build 执行。

**解释**：plan 是受限 primary 代理，edit 和 bash 默认均为 ask；build 是默认全工具代理。

**验证**：plan 模式下任何写文件/跑命令动作都会先弹审批。

#### 步骤 3：/init 生成 AGENTS.md

**目标**：为项目建立长期记忆。

**操作**：在 TUI 中输入 `/init`，回答它提出的问题。

**解释**：/init 扫描仓库关键文件，生成或原地改进 AGENTS.md，内容聚焦构建/测试命令、架构、项目约定。

**验证**：项目根目录出现 AGENTS.md；`/new` 开新会话后 Agent 能直接说出项目的测试命令。

#### 步骤 4：配置全局 opencode.json

**目标**：建立个人默认模型与权限基线。

**操作**：创建 `~/.config/opencode/opencode.json`：

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "anthropic/claude-sonnet-4-5",
  "permission": {
    "edit": "ask",
    "bash": { "*": "ask", "git status*": "allow", "git push *": "deny" }
  }
}
```

**解释**：`$schema` 让编辑器自动补全；permission 三态 allow/ask/deny；同一工具多条规则**最后匹配生效**，故 `"*"` 兜底在前。

**验证**：运行 `opencode debug config`，确认输出中包含上述键值。

#### 步骤 5：配置项目级 opencode.json

**目标**：理解多层配置的合并与覆盖。

**操作**：在 `my-project/opencode.json` 中只写 `{ "model": "anthropic/claude-haiku-4-5" }`，重启会话。

**解释**：配置是**合并而非替换**——项目的 model 覆盖全局，全局的 permission 依然生效。

**验证**：`opencode debug config` 中 model 为 haiku，permission 仍为全局配置。

#### 步骤 6：写一个自定义命令

**目标**：把重复提示词固化成 `/` 命令。

**操作**：创建 `my-project/.opencode/commands/review.md`：

```markdown
---
description: Review recent changes
---
Recent git commits:
!`git log --oneline -10`
Review these changes and suggest improvements.
```

TUI 中输入 `/review`。

**解释**：`` !`cmd` `` 注入 shell 输出；`$ARGUMENTS`、`@文件` 亦可用于模板。

**验证**：命令执行后 Agent 基于最近 10 条 commit 给出 review。

#### 步骤 7：自定义一个只读 subagent

**目标**：创建一个按需调用的代码评审子代理。

**操作**：创建 `my-project/.opencode/agents/reviewer.md`：

```markdown
---
description: Reviews code for quality, use after code changes
mode: subagent
permission:
  edit: deny
  bash: ask
---
You are in code review mode. Report issues only, never modify files.
```

在会话中输入 `@reviewer 审查一下 src/ 最近的改动`。

**解释**：文件名即代理名；子代理权限独立配置，**不继承**父会话中点过的 always 批准。

**验证**：Agent 列表（`opencode agent list`）出现 reviewer；调用时只读分析、改文件被拒。

#### 步骤 8：创建一个按需加载的 Skill

**目标**：把场景化 SOP 做成 skill。

**操作**：创建 `my-project/.opencode/skills/git-release/SKILL.md`（frontmatter 只含 name/description，正文写发版步骤）。

**解释**：skill 不常驻上下文；Agent 在 skill 工具描述中看到 name+description，需要时才加载全文。

**验证**：让 Agent "帮我准备一次发版"，观察它调用 skill 工具加载 git-release。

#### 步骤 9：无头模式与 Web 模式

**目标**：学会 CI 与远程两种打开方式。

**操作**：

```bash
# 无头执行（脚本/CI 适用）
opencode run "Explain the use of context in Go"

# Web 模式（远程/手机访问；务必设密码）
OPENCODE_SERVER_PASSWORD=YOUR_STRONG_PASSWORD opencode web --hostname 0.0.0.0
```

**解释**：`YOUR_STRONG_PASSWORD` 替换为强密码；绑定 0.0.0.0 不设密码等于把能执行 shell 的 Agent 暴露给整个网络。

**验证**：run 直接输出结果；浏览器打开 web 地址需 basic auth 登录。

## 4. 常见报错与排查

**报错 1：配置改了但不生效**

原因：多层配置合并时被更高优先级层覆盖，或环境变量注入。

解决方案：运行 `opencode debug config` 查看合并结果；检查 `OPENCODE_CONFIG` / `OPENCODE_CONFIG_CONTENT` 环境变量。

验证修复：debug 输出中出现预期键值。

**报错 2：子代理反复弹权限审批**

原因：子代理不继承父代理配置，也不继承父会话中点过的 always 批准。

解决方案：在该 agent 的 frontmatter / agent 配置中显式写全所需 permission。

验证修复：子会话中同类操作不再弹窗。

**报错 3：TUI 里鼠标无法选中复制**

原因：TUI 默认捕获鼠标（`mouse: true`）。

解决方案：按住 Shift 再拖选；或在 tui.json 设 `"mouse": false` / 设 `OPENCODE_DISABLE_MOUSE=1`。

验证修复：终端原生选择恢复。

**报错 4：Web 页面白屏 / RangeError**

原因：Web 前端资源从 CDN 运行时拉取，可能出现本地版本与 CDN 前端不一致（上游 issue #10226）。

解决方案：升级 opencode 到最新版重试；必要时回退版本。

验证修复：页面正常加载。

**报错 5：Agent 读取 .env 被拒绝**

原因：read 权限默认 deny `*.env` / `*.env.*`。

解决方案：确有需要时在 permission.read 中显式放行（注意密钥泄漏风险）。

验证修复：`opencode debug config` 中可见放行规则。

**报错 6：模型列表里找不到新模型**

原因：models.dev 缓存过期。

解决方案：`opencode models --refresh`。

验证修复：`opencode models` 输出中出现目标模型。

## 5. 进阶拓展

**方向 1：MCP 工具集成** ｜ 难度：中级
通过 `mcp` 槽位或 `opencode mcp add` 接入外部工具（数据库、Jira、内部服务），让 Agent 能力超出本地文件与 shell。
推荐资源：opencode.ai/docs/mcp-servers（官方文档）

**方向 2：插件系统** ｜ 难度：中级
在 `.opencode/plugins/` 或 npm 包中编写插件，添加自定义工具、hook 与集成。
推荐资源：opencode.ai/docs/plugins（官方文档）

**方向 3：Server + SDK 程序化集成** ｜ 难度：高级
`opencode serve` 暴露 OpenAPI 3.1，可编程驱动会话、权限审批甚至 TUI 本身，IDE 插件即基于此实现。
推荐资源：opencode.ai/docs/server（官方文档）

**方向 4：GitHub Action 自动化** ｜ 难度：高级
`opencode github install` 在仓库中安装 GitHub agent，实现 issue/PR 自动处理。
推荐资源：opencode.ai/docs/github（官方文档）

**实战项目建议**：
1. 团队规则仓：为团队项目编写 AGENTS.md + 3 个自定义命令 + 1 个 review 子代理并提交 Git 共享。
2. 安全基线：设计一套 deny-by-default 的权限配置（含 `git push`、`rm` 禁令），用 `opencode debug config` 验证委派链路。
3. 发版助手：把团队发版 SOP 写成 skill，并在真实仓库演练一次发版。

**最佳实践提示**：
- 生产仓库务必是 Git 仓库并勤提交：/undo 只保护会话内改动，commit 才是最后防线。
- 不要把 API key 明文写进 opencode.json；用 `{env:VAR}` / `{file:path}` 或 auth login。
- web/serve 绑定 0.0.0.0 时必须设 `OPENCODE_SERVER_PASSWORD`。
- 权限配置遵循"显式优于继承"：子代理需要什么就写什么，不依赖任何继承行为。

## 6. Cheatsheet 速查表

### 环境信息

| 项目 | 命令/路径 |
|------|-----------|
| 安装 | `curl -fsSL https://opencode.ai/install \| bash` |
| 版本检查 | `opencode --version` |
| 登录 provider | `opencode auth login` |
| 全局配置 | `~/.config/opencode/opencode.json` |
| 项目配置 | `<项目根>/opencode.json` |
| TUI 配置 | `~/.config/opencode/tui.json` |
| 凭证文件 | `~/.local/share/opencode/auth.json` |
| 查看生效配置 | `opencode debug config` |

### 常用命令

| 操作 | 命令 | 说明 |
|------|------|------|
| 启动 TUI | `opencode` | 当前目录启动 |
| 无头执行 | `opencode run "提示词"` | 脚本/CI 适用 |
| Web 模式 | `opencode web` | 加 `OPENCODE_SERVER_PASSWORD` |
| 列出模型 | `opencode models --refresh` | 刷新缓存 |
| 列出代理 | `opencode agent list` | 含自定义 |
| 创建代理 | `opencode agent create` | 交互式 |
| 生成 AGENTS.md | `/init` | TUI 内 |
| 压缩上下文 | `/compact` | ctrl+x c |
| 撤销一轮 | `/undo` | ctrl+x u，需 Git 仓库 |
| 切换代理 | `Tab` | build ↔ plan |

### 常用代码片段

```json
// 最小全局配置
{
  "$schema": "https://opencode.ai/config.json",
  "model": "anthropic/claude-sonnet-4-5",
  "permission": { "edit": "ask", "bash": "ask" }
}
```

```yaml
# 只读子代理 frontmatter
---
description: Reviews code, use after changes
mode: subagent
permission:
  edit: deny
---
```

### 快速排错

| 症状 | 可能原因 | 快速修复 |
|------|----------|----------|
| 配置不生效 | 多层覆盖/env 注入 | `opencode debug config` |
| 子代理重复弹审批 | 不继承会话批准 | agent 内显式配 permission |
| TUI 无法复制 | 鼠标捕获 | Shift 拖选 / `mouse: false` |
| Web 白屏 | CDN 前端版本不一致 | 升级或回退版本 |
| 读 .env 被拒 | 默认 deny | permission.read 显式放行 |
| 找不到新模型 | 缓存过期 | `opencode models --refresh` |

## 附录

**术语表**

| 术语 | 解释 |
|------|------|
| Vibe Coding | 以自然语言意图为中心、AI Agent 负责执行的编程方式 |
| primary agent | 与用户直接对话的主代理（build/plan），Tab 切换 |
| subagent | 主代理经 Task 工具调用的专项代理（general/explore/scout） |
| AGENTS.md | 每个会话自动注入的项目级规则文件 |
| SKILL.md | 按需加载的场景化 SOP 定义文件 |
| permission | 权限三态配置：allow / ask / deny |
| doom_loop | 同一工具调用重复 3 次的安全闸门（默认 ask） |
| external_directory | 访问工作目录外路径的安全闸门（默认 ask） |

**参考链接**
- 官方文档：https://opencode.ai/docs/ （config / permissions / agents / rules / commands / skills / tui / cli / web / server）
- 仓库与 issue：https://github.com/anomalyco/opencode
