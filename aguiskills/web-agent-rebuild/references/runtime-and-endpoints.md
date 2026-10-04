# 执行模型与推理端点

## 先复用用户已有实现

读取实际代码、依赖和端点说明，明确协议、认证、模型标识、超时、结构化输出/工具/流式能力。保留用户已有 model、base URL 和协议，不能把所有 v1 服务都当成 Responses。

| 能力 | 接入方式 |
| --- | --- |
| 已有 Agent runtime | 适配其任务创建、状态/事件、继续、取消和产物；复用会话、工具、隔离与权限 |
| Responses API | 保留 output 项，使用 function_call / function_call_output；结构化格式用 text.format |
| Chat Completions | 使用其 messages / tool_calls / tool_call_id 和适用的结构化输出格式，单独适配 |
| 文本推理且没有工具能力 | 明确有限固定编排，校验结构化提取；不宣称动态工具 Agent 已接通 |
| 暂无可达端点 | 明确标记 demo/stub；保留相同的业务能力契约，列出真实接入点 |

解析响应前逐层检查容器与字段类型，识别所用协议的失败、拒绝和截断状态（如 Responses 的 status 或 Chat Completions 的 finish_reason）。部分输出只能明确标记为部分结果，不能静默当作完整成功。

Key 由服务端环境/平台凭据注入；不写进前端、URL、错误正文或日志。配置齐全只代表“已配置”；健康探测、真实请求与模型质量分别判断。重试范围需有上限，写入工具不能盲目重试。

## Responses 适配核对点

```text
POST <base_url>/responses
model: 用户配置的模型
instructions: 当前角色与工具使用约定
input: 本地维护的会话项
store: false                     # 或遵从用户已有的会话存储方案
text.format: {type: json_schema, name: ..., schema: ..., strict: true}
tools: [{type: function, name: ..., description: ..., parameters: ..., strict: true}]
parallel_tool_calls: false       # 简单实现可顺序执行
```

按本次调用需要选择结构化输出或工具，不盲目同时开启所有选项。严格对象声明 `additionalProperties:false`，将所需属性全部列入 required，用 nullable 表达允许为空的字段。

无服务端会话存储且所选模型需要推理状态时，按供应商文档请求并回传其支持的加密状态（OpenAI 对应 `include: ["reasoning.encrypted_content"]`）；不要假定 `store:false` 会自动返回可恢复状态。

每轮保留完整 `response.output`，包括 message/phase、function_call 和可能存在的 reasoning/加密状态；按返回的 `call_id` 追加字符串序列化的 `function_call_output`。仅拼接 output_text 会断开工具上下文。校验未完成、拒绝、非 JSON、结构错误与工具参数，不能将它们计为成功。

对暂停/取消保存完整已完成轮次；不能在恢复输入中留有未配对的工具调用。模型与工具调用都设置预算；未知工具、伪造资源 ID、无权范围在服务端拒绝。

## Flask 与 FastAPI 分别实现生命周期

**Flask**：短调用可用同步 view；长任务复用现有 worker，或为明确的单进程样例实现有容量上限的应用级执行器与持久状态。不要在普通 Flask async view 中用 `asyncio.create_task()` 假装任务会在响应后继续运行。将身份、任务参数和范围显式传入 worker；不要跨线程依赖 request/g，也不要因 debug reloader 启动两个 worker。

**FastAPI**：I/O 可用 async 客户端；同步阻塞工具放入适合的执行器。短小后台工作可用 BackgroundTasks，但不要当成持久队列。单进程原型可管理 asyncio 任务句柄并持久化状态；不能直接多 worker 部署后仍假定内存句柄共享。关闭时取消/回收任务，重启时标记 interrupted 或执行已定义的恢复协议。

两者都要区分“请求取消”“停止后续步骤”“撤销已完成动作”。线程中的阻塞调用或远端请求可能仍继续；返回前再次检查 run_id/取消标记，避免迟到写入。外部不可逆操作使用明确的幂等与补偿策略；不能承诺取消可以撤回所有副作用。

CPU/模型重计算或需跨进程可靠执行时接平台现有任务设施。不要因为示例出现 Celery 就默认新增 Redis、Docker 或一整套基础设施。

## 官方参考与更新

实现时以用户锁定版本和供应商当前官方说明复核参数，离线时保留待验证声明：

- https://flask.palletsprojects.com/en/stable/async-await/
- https://fastapi.tiangolo.com/tutorial/background-tasks/
- https://developers.openai.com/api/docs/guides/function-calling
- https://developers.openai.com/api/docs/guides/structured-outputs
- https://developers.openai.com/api/docs/guides/reasoning

以上为实现入口，不是声称所有兼容供应商均支持这些参数。不要把协议模拟通过写成真实模型已验证。
