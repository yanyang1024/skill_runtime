---
name: agents-creator
description: 根据用户意图创建 OpenCode agent 文档（agents/*.md）。当用户想新建、设计、调整一个 primary agent 或 subagent，或描述"我需要一个负责……的 agent / 帮我配一个做……的助手"时使用本 skill。涵盖 frontmatter 字段配置（mode / permission / model / temperature）、primary 路由型与 subagent 执行型两种写作范式、任务契约与回传契约设计。
---

# OpenCode Agent 创建指南

你的职责：把用户的模糊意图落成一份符合 OpenCode 项目约定的 agent markdown 文档，
写入目标项目的 `agents/` 目录。

## 工作流程

1. **捕获意图**：搞清楚这个 agent 要解决什么问题、输入是什么、产出是什么、
   允许碰哪些资源（文件、网络、命令）。意图不清时先问，别急着写。
2. **判定 mode**：primary 还是 subagent（见下）。判错 mode 是最常见的错误，
   先判定再动笔。
3. **读取对应参考文件**：
   - frontmatter 字段说明 → `references/frontmatter.md`
   - primary 模板 → `references/primary-agent.md`
   - subagent 模板 → `references/subagent.md`
4. **撰写文档**：frontmatter + 正文，风格见下文"写作规范"。
5. **自检**：对照文末清单逐项检查，通过后写入文件并告知用户路径。

## mode 判定

| 特征 | primary | subagent |
|------|---------|----------|
| 直接与用户交互 | 是 | 否 |
| 职责 | 分类、路由、编排、汇总结论 | 单一明确的执行任务 |
| 上下文 | 主会话，保持轻量 | 隔离子会话，可以装重活 |
| 产出 | 给用户的最终答复 | 给上游 agent 的结构化摘要 |
| 典型权限 | `permission.task` 白名单派单 | 收敛 edit/write，放开执行所需 |

判不准时的经验法则：**这个 agent 干的活会不会产生大量中间产物、弄脏主会话？**
会 → subagent。它的价值在于协调其他 agent 吗？是 → primary。
一个系统通常是 1 个 primary + N 个 subagent，各管一段。

## 写作规范

- 正文用中文祈使句，开头一句定位：「你是……」。
- 写给模型看的指令要解释**为什么**，而不是堆砌 ALWAYS / NEVER。
  模型理解动机后能处理规则没覆盖到的情况。
- 内容要具体可执行：写「分流依据不确定时，加载 skill: xxx 查询规则表」，
  不写「遇到困难要灵活处理」。
- **primary 必备三节**：分流规则（什么输入派给谁）、任务契约（派单时必须带什么）、
  回传契约（只接受什么格式的回传）。
- **subagent 必备三节**：执行流程（编号步骤）、回传格式（JSON 代码块，只允许这个）、
  红线（防编造、防假成功、防越权）。
- 回传契约的核心目的：防止几百行中间产物倒灌进主会话。
  subagent 只回结构化摘要，细节留在输出目录里按需读取。

## 自检清单

- [ ] description 一行说清职责**和边界**（它不做什么也写进去）
- [ ] mode 与正文一致：primary 有分流规则，subagent 有回传格式 JSON
- [ ] 权限最小化：subagent 默认 `edit: deny`、`write: deny`，确有需要再放开
- [ ] temperature：执行/质检类 0~0.2；需要发散的任务才调高
- [ ] subagent 有防编造 / 防假成功红线（如「解析失败禁止报告成功」）
- [ ] 全文、大段中间产物禁止出现在回传格式里
- [ ] 涉及外部 skill / 脚本时，写明加载方式和绝对路径约定
