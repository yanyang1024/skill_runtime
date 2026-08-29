# frontmatter 字段说明

agent markdown 文档的 YAML frontmatter 决定 OpenCode 如何加载和约束这个 agent。

## 字段一览

### description（必填）

一行说清职责**和边界**。它是调度方（用户或 primary agent）决定
"要不要用这个 agent"的唯一依据，所以要把"它不做什么"也写进去。

```yaml
# 好：职责 + 上下文隔离 + 回传方式，边界清楚
description: MinerU 文档解析专家——在独立上下文中执行解析管线，只回传结构化摘要

# 差：没说边界，调度方不知道它会不会把全文贴回来
description: 文档解析助手
```

### mode（必填）

```yaml
mode: primary    # 与用户直接交互、路由派单
mode: subagent   # 隔离上下文执行单一任务，被 primary 派单
```

### model（可选）

```yaml
model: vllm/qwen3.6-27b
```

只在需要与全局默认不同的模型时指定。典型场景：primary 路由器用便宜模型，
重活 subagent 用强模型。不写则继承全局配置。

### temperature（可选）

- 执行类 / 质检类 / 解析类：`0` ~ `0.2`，要的是确定性
- 路由分类：`0.1` 左右
- 写作、头脑风暴等发散任务才调高

### permission（可选）

权限最小化：默认收紧，确有需要再逐项放开。

primary agent 的典型配置——用 task 白名单控制能派单给谁：

```yaml
permission:
  task:
    "*": deny
    "doc-parser": allow
    "vision-analyst": allow
```

subagent 的典型配置——执行类放开 bash，默认禁改文件：

```yaml
permission:
  bash: allow
  edit: deny
  write: deny
```

注意：如果 subagent 的职责就是生成文件（如写报告），write 要 allow，
但应在正文红线里限定可写范围（如"禁止修改输出目录以外的任何文件"）。

### tools（可选）

```yaml
tools:
  edit: false
```

直接禁用某个工具，比 permission 更硬。只禁确信用不到的工具。

## 完整示例

primary（路由器）：

```yaml
---
description: 多模态任务路由器——判断输入类型并分流到对应专家管线，不亲自解析文档全文
mode: primary
model: vllm/qwen3.6-27b
temperature: 0.1
permission:
  task:
    "*": deny
    "doc-parser": allow
    "vision-analyst": allow
---
```

subagent（执行器）：

```yaml
---
description: MinerU 文档解析专家——在独立上下文中执行解析管线，只回传结构化摘要
mode: subagent
temperature: 0
permission:
  bash: allow
  edit: deny
  write: deny
tools:
  edit: false
---
```
