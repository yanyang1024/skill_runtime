# 用 OpenCode 开始 Vibe Coding · 基础教程（教学稿）

> 最后更新：2026-09-01 | 适用版本：opencode v1.x（以 `opencode debug config` 实际输出为准）
> 难度：入门 | 预计耗时：90–120 分钟
> 素材来源：opencode.ai 官方文档与《OpenCode使用与配置指南（Linux）》调研文档

## 教程概览

本教程面向**有基本编程经验、但不熟悉 AI 编程 Agent** 的开发者，以 Linux 环境为例，带你从零跑通基于 opencode 的 Vibe Coding 工作流。学完后你能够：独立安装并验证 opencode；熟练使用 plan / build 双模式完成一次"先规划、后执行、可回滚"的改动；掌握 /init、/compact、/undo 等基础命令并用 AGENTS.md 建立项目记忆；正确放置并验证 opencode.json 配置（模型 + 权限）；拿到一个 xlsx / pdf 文件时，知道怎么让 AI 分析、怎么验证结果；把跑通过的可复用场景沉淀为 skill，确保下次一键复用；区分 AGENTS.md、agent md、command md、SKILL.md 四种 Markdown。

## 1. 前置知识

**必须掌握**：
- 终端基本命令（cd、环境变量、管道）：所有操作都在终端完成（推荐资源：Linux Command Line Basics）
- Git 基础（init、commit、分支概念）：opencode 的 /undo 与项目识别都依赖 Git 仓库
- JSON 语法：opencode.json 是本教程的核心操作对象

**了解即可**：
- LLM API / provider 的概念：配置模型时涉及 provider_id/model_id 格式
- 多模态模型（VLM）的概念：文件分析章节会用到"让模型看图"的能力
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

#### 步骤 2：上手 plan / build 双模式（本教程最重要的工作流）

**目标**：养成"先规划、后动手"的肌肉记忆——这是 vibe coding 不翻车的基础。

**背景**：opencode 内置两个 primary 代理，按 **Tab** 切换：

- **build**：默认代理，拥有全部工具，直接改代码、跑命令；
- **plan**：只读规划代理，edit 和 bash 默认均为 ask（需审批），适合让它先出方案。

**操作**：

1. 按 Tab 切到 plan（状态栏 agent 名变化），输入：
   `帮我设计一个给 CLI 加 --verbose 参数的方案，不要改代码`
2. 阅读它给出的方案：涉及哪些文件、改动点、风险。不满意就追问，直到方案可执行。
3. 按 Tab 切回 build，输入：`按刚才的方案执行`。
4. 执行后检查 diff（`git diff`），不满意就 `/undo` 回滚，回 plan 修正方案再来。

**解释**：plan 的价值不只是"安全"，更是**把模糊需求逼成具体方案**——方案阶段改一句话的成本，远低于代码改完再返工。真实工作建议：凡是改动超过一个文件的任务，都先 plan 后 build。

**验证**：plan 模式下任何写文件/跑命令动作都会先弹审批；切回 build 后改动按方案落地，`git diff` 可见。

#### 步骤 3：/init 生成 AGENTS.md，建立项目记忆

**目标**：让 Agent 每次开会话都"认识"这个项目。

**操作**：在 TUI 中输入 `/init`，回答它提出的问题。

**解释**：/init 扫描仓库关键文件，生成或原地改进 AGENTS.md。典型内容包括：

- 构建 / 测试 / 运行命令（如 `make test`、`pytest tests/`）
- 目录结构与架构说明
- 项目约定（代码风格、日志规范、提交规范）

AGENTS.md 在**每个会话启动时自动注入**上下文，是"项目级长期记忆"。它生成后不是终点：发现 Agent 反复犯同一个错（比如用错测试命令），就把正确写法补进 AGENTS.md——**把纠正沉淀为规则**，越用越聪明。

**验证**：项目根目录出现 AGENTS.md；`/new` 开新会话后直接问"这个项目的测试命令是什么"，Agent 能不看代码就答出来。

#### 步骤 4：常用基础命令上手

**目标**：掌握日常会话管理四件套。

**操作与解释**：

| 命令 | 作用 | 什么时候用 |
|------|------|-----------|
| `/init` | 生成/改进 AGENTS.md | 新项目第一次打开时 |
| `/new` | 开新会话 | 换任务时（旧上下文会干扰新任务） |
| `/session` | 会话列表，切换/恢复历史会话 | 找回之前聊到一半的工作 |
| `/compact` | 压缩当前会话上下文（ctrl+x c） | 长会话变慢、接近上下文上限时 |
| `/undo` | 回滚上一轮改动（ctrl+x u） | Agent 改错了，立即撤回（需 Git 仓库） |
| `/share` | 生成会话分享链接 | 让同事复现你的操作过程 |

**练习**：连续做三个小动作——`git init` 一个空目录并 `/init`；让 Agent 建两个文件后 `/undo` 观察回滚；`/session` 切回上一个会话。

**验证**：每个命令的执行结果与上表描述一致。

#### 步骤 5：配置全局 opencode.json

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

#### 步骤 6：配置项目级 opencode.json

**目标**：理解多层配置的合并与覆盖。

**操作**：在 `my-project/opencode.json` 中只写 `{ "model": "anthropic/claude-haiku-4-5" }`，重启会话。

**解释**：配置是**合并而非替换**——项目的 model 覆盖全局，全局的 permission 依然生效。

**验证**：`opencode debug config` 中 model 为 haiku，permission 仍为全局配置。

#### 步骤 7：写一个自定义命令

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

#### 步骤 8：自定义一个只读 subagent

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

#### 步骤 9：拿到一个文件（xlsx / pdf），如何分析、如何验证

**目标**：掌握"文件进、结论出、结果可证"的标准流程——这是数据处理类 vibe coding 的基本功。

**操作（以一份陌生的 xlsx / pdf 为例）**：

1. **先看结构，再提问题**。不要让 AI 直接"分析这份文件"，先让它摸清文件长什么样：

```text
"写一个脚本读取 report.xlsx：列出所有 sheet 名、每个 sheet 的列名和行数，
不要改动文件本身"
"解析 report.pdf 的结构：页数、每页是文本还是扫描图片、有没有表格"
```

2. **选解析路线**。根据结构选择工具：
   - xlsx：脚本直接读（pandas / openpyxl），精确、可校验；
   - 有文本层的 pdf：脚本提取文本与表格；
   - **扫描件 / 大量图表的 pdf：走多模态**——用 MinerU 等解析方案把 PDF 转成结构化中间格式（markdown + 图片），图表和版式复杂的页面交给 VLM（视觉语言模型）"看图"理解，再把结果合并。

3. **提出分析问题**，让 AI 基于解析结果回答，并要求它**附上证据**（哪一页、哪一行、哪个 sheet）。

4. **验证结果**，三条至少做两条：
   - 数字核对：总数、合计与原文/原表是否一致；
   - 抽样比对：随机挑 3–5 处，人眼对照原文件；
   - 脚本校验：让 AI 写校验脚本（如"每页数字是否都进入了结果表"），不靠肉眼。

**解释**：核心原则是**"解析靠工具，理解靠模型，结论靠校验"**。AI 直接"读"文件可能漏、可能幻觉；解析成中间格式后，漏没漏可以写成脚本检查。多模态（VLM）补的是脚本读不到的部分：扫描图像、图表、复杂版式。

**验证**：分析结论中的每个关键数字，都能在原文件中定位到出处。

#### 步骤 10：把可复用场景沉淀为 Skill

**目标**：跑一次成功的流程，变成以后每次都自动执行的 SOP。

**什么时候值得做 skill**：一个流程你已经做过 2 次以上、步骤基本固定（比如"EDA 脚本报错的三步排查"、"周报数据的固定格式转换"）。

**操作**：

1. 先正常用对话把流程跑通，记下哪些提示词/步骤是每次都一样的；
2. 创建 `my-project/.opencode/skills/<场景名>/SKILL.md`：

```markdown
---
name: weekly-report
description: 生成周报数据表，use when 用户提供本周原始数据文件（xlsx/csv）
---

# 周报生成 SOP
1. 先用脚本读取输入文件结构（sheet、列名、行数），输出给用户确认
2. 按以下固定 format 转换：……（写清列名、日期格式、缺失值约定）
3. 执行转换脚本，输出 result.csv
4. 运行校验：行数一致 + 关键合计一致，输出校验报告
5. 校验失败时停止并报告，不要自行"修复"数据
```

3. 验证触发：开新会话，说"帮我生成本周周报"，观察 Agent 是否调用 skill 工具加载该 SKILL.md；不触发就改 description——**触发条件写在 description 里**（如 use when …），这是命中率的关键。

**解释**：skill 不常驻上下文；Agent 在工具描述中只看到 name + description，需要时才加载全文。与 AGENTS.md 的分工：AGENTS.md 管"这个项目永远适用的规则"，SKILL.md 管"某类场景的标准流程"。

**验证**：新会话中场景描述一出现，Agent 自动按 SOP 执行，无需你重复交代步骤。

#### 步骤 11：无头模式与 Web 模式

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

**报错 7：AI 分析文件的结果对不上原文件**

原因：AI 直接"读"文件产生幻觉或遗漏，没有经过结构化解析与校验。

解决方案：回到步骤 9 的流程——先解析成中间格式（表格 / markdown），结论必须附出处，再用校验脚本核对数字。

验证修复：校验脚本输出全部通过，抽样比对一致。

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

### 实战 Example

> 以下两个 example 给出流程骨架与提示词，具体代码请替换为你们实际的实现（占位处已标注）。

**Example 1：代码场景 —— build 写功能，test 做验收**

适用：给已有项目加功能 / 改 bug，要求"改完必须过测试"。

流程：

```text
1. plan：  "我要给项目加 <功能描述>。先读相关代码，给出实现方案：
            涉及文件、改动点、需要新增/修改的测试用例，不要改代码"
2. 确认方案后切 build：
           "按方案实现，并补上对应测试"
3. 验收：   "跑全量测试。有失败就分析失败原因，只改一处再跑"
4. 收尾：   git diff 人工过目 → 满意后 commit；不满意 /undo 回 plan 重来
```

关键代码占位：

```bash
# 【占位：替换为你的实际构建/测试命令，例如】
# make build && make test
# pytest tests/ -x
```

要点：验收标准是"测试通过"而不是"代码看起来对"；测试就是 build 和 test 场景里的"校验脚本"。

**Example 2：文件处理场景 —— VLM + MinerU 解析管线**

适用：扫描件 / 图文混排 PDF / 复杂报表等脚本难以直接提取的文件，要求结构化输出且不漏内容。

流程：

```text
1. 解析：   用 MinerU 把 PDF 转成结构化中间格式（markdown + 抽出的图片）
2. 理解：   文本部分脚本处理；图表/扫描页裁出来交给 VLM 读图，
            输出统一的结构化字段（json）
3. 合成：   数字信息 → csv/xlsx；图文内容 → html/md
4. 校验：   分页 loop 回查——每页的关键信息（数字、表格行）
            是否都进入了输出文件，输出缺失清单
```

关键代码占位：

```bash
# 【占位：替换为你的 MinerU 调用命令/脚本，例如】
# mineru -p report.pdf -o ./parsed/

# 【占位：替换为你的 VLM 调用脚本，例如】
# python vlm_read.py --img ./parsed/images/p12_fig1.png --prompt "提取图中所有数字与图例"
```

要点：MinerU 负责"把版式变成结构"，VLM 负责"看懂图"，校验脚本负责"证明没漏"；三者都跑通后，把整条管线沉淀为 skill（见步骤 10），下次同类文件直接复用。

**最佳实践提示**：
- 生产仓库务必是 Git 仓库并勤提交：/undo 只保护会话内改动，commit 才是最后防线。
- 不要把 API key 明文写进 opencode.json；用 `{env:VAR}` / `{file:path}` 或 auth login。
- web/serve 绑定 0.0.0.0 时必须设 `OPENCODE_SERVER_PASSWORD`。
- 权限配置遵循"显式优于继承"：子代理需要什么就写什么，不依赖任何继承行为。
- 文件处理任务牢记"解析靠工具，理解靠模型，结论靠校验"。

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
| 自定义命令 | `.opencode/commands/<名字>.md` |
| 自定义代理 | `.opencode/agents/<名字>.md` |
| 自定义 skill | `.opencode/skills/<名字>/SKILL.md` |

### 常用命令

| 操作 | 命令 | 说明 |
|------|------|------|
| 启动 TUI | `opencode` | 当前目录启动 |
| 无头执行 | `opencode run "提示词"` | 脚本/CI 适用 |
| Web 模式 | `opencode web` | 加 `OPENCODE_SERVER_PASSWORD` |
| 列出模型 | `opencode models --refresh` | 刷新缓存 |
| 列出代理 | `opencode agent list` | 含自定义 |
| 创建代理 | `opencode agent create` | 交互式 |
| 生成 AGENTS.md | `/init` | 新项目第一件事 |
| 新建会话 | `/new` | 换任务时用 |
| 会话列表 | `/session` | 找回历史会话 |
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

```markdown
# Skill 骨架（触发条件写在 description 里）
---
name: my-sop
description: 一句话说清做什么，use when <触发场景>
---
1. 步骤一
2. 步骤二
3. 校验并输出报告
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
| 分析结果对不上原文件 | 直接"读"文件产生幻觉 | 解析成中间格式 + 校验脚本 |
| skill 不触发 | description 没写触发条件 | 补 use when … 描述 |

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
| VLM | 视觉语言模型，可"看懂"图片、扫描页与图表 |
| MinerU | PDF 结构化解析工具，把 PDF 转成 markdown + 图片等中间格式 |

**参考链接**
- 官方文档：https://opencode.ai/docs/ （config / permissions / agents / rules / commands / skills / tui / cli / web / server）
- 仓库与 issue：https://github.com/anomalyco/opencode
- 场景实战篇（PPT 生成、EDA 排错、A→B 脚本、数据处理）：见《OpenCode-Vibe-Coding场景实战-教学稿》
