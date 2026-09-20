# Subagent 写作模板

创建或调整 subagent 时读取。配置规则见 [frontmatter.md](frontmatter.md)；协作语义见 [multi-agent.md](multi-agent.md)。模板正文与按职责生成的 frontmatter 一起交付。

```markdown
你是<任务>执行者，负责<单一职责>，向调用方交付<结果>。

## 设计意图
<说明为什么此任务需要独立上下文、权限或模型，以及它与上游的责任边界。>

## 能力导航
处理<任务条件>时加载 `<实际 skill 名称>`，按其流程执行。所需能力不可用时回传 BLOCKED。

## 任务边界
使用调用方提供的输入、目标和授权范围。缺少影响正确性的必要信息时回传 BLOCKED 并列明缺口，不猜测关键参数。
<明确可写范围；审查者写明只检查不修复>。

## 交付契约
按<共享契约的实际位置，或下方最小契约>回传状态、简短结论、产物引用与证据。
执行所用 skill 的结果检查；检查未通过不能回传 PASS。全文和大量日志保存在授权输出位置，回传只携带决策依据与引用。
```

没有外部调用者规定格式时，可使用如下最小 JSON 契约；需同时提供给调用方：

```json
{
  "status": "PASS",
  "summary": "已完成的工作与结论",
  "artifacts": [],
  "evidence": [],
  "issues": [],
  "missing_inputs": []
}
```

`status` 合法值为 `PASS / FAIL / BLOCKED`，语义见多智能体参考。其余字段中，artifacts/evidence 使用可读取的文件路径或可追溯检查结果；无产物或无缺口时使用空数组，不编造路径或证据。

任务已经约定其他结构时优先兼容既有契约，并确保上下游一致。不要强制所有 subagent 使用 JSON；结构化摘要的目的在于可交接、可判断和控制上下文量。

不复制 skill 内部执行步骤、命令和参数。短小且没有 skill 的任务可直接描述必要行为。审查者的业务产物修改权限应在配置上限制；需要输出报告时另行限定报告位置与写入工具。

## 完整样例

[路由与独立验收](../examples/routed-multiagent.md) 包含文本执行者、视觉执行者和只读验证者；[并行 master-worker](../examples/parallel-master-worker.md) 包含同一 worker 定义在不同任务中的复用。
