# 接入已有 FastAPI Web 表单与扩展 Agent 工作台

## 最小改造路线

已有应用不必一次整体重构。优先提取现有业务函数，再增加语言入口；两套 UI 应复用同一个业务函数和校验模型。

### A：接在现有表单旁

1. 将现有字段转成 `FormValues` / `Selection`。枚举值、日期约束和必填校验仍放在服务端。
2. 在 `FormPatch` 中声明 AI 可以建议的字段。未要求修改的字段使用 `null`，不以猜测补齐。
3. 从 `suggest()` 中移植 Responses 请求和候选字段合并校验。提示词包含当前字段和允许的范围。
4. 前端将建议显示为差异；绑定发起时的表单修订号。应用建议后仍使用原有提交按钮。
5. 保留原有报错、手工填写与统计接口。AI 解释仅引用服务器重新计算的结果。

不要把模型给出的 JSON 当成一次已经授权的业务提交。这个样例中，语言产生的是候选字段，不会调用分析或写入业务对象。

### B：把业务函数注册成工具

1. 替换 `describe_dataset()` 的范围信息，让范围来自用户可访问的数据。
2. 替换 `analyze()` 的数据源，实现确定性业务计算。先按平台身份过滤数据，再把结果交给模型。
3. 在 `tools_contract()` 注册必要的函数，使用严格参数 Schema。
4. 在 `dispatch()` 中用同一个 Pydantic 模型校验参数，然后调用业务函数。
5. 将高风险写入拆成提案与提交：模型只形成提案，提交接口独立校验权限、版本和适用条件。

本例的工具只有四个：

| 工具 | 输入 | 返回 | 是否暂停 |
| --- | --- | --- | --- |
| `describe_dataset` | 空对象 | 数据范围、口径、局限 | 否 |
| `analyze_usage` | metric、departments、date_from、date_to | 本轮 stats_id 与服务器统计 | 否 |
| `request_clarification` | question、fields | 等待用户；前端使用固定条件卡 | 是 |
| `propose_report` | stats_id、title、summary、recommendations | 待审核草稿 | 是 |

`stats_id` 只接受本轮真实工具结果的标识，不能由模型编造或引用别的任务。报告数值表格由服务器构造；模型提供的叙述仍可能出错，需要核对。

## Responses 请求位置

公共适配器：`app/responses.py`。程序使用 HTTPX 直接调用，无需绑定某个模型 SDK。

表单的严格 JSON 输出：

```json
{
  "model": "gpt-4.1-mini",
  "store": false,
  "instructions": "填写助手约定",
  "input": [{"role": "user", "content": "当前字段和用户要求"}],
  "text": {
    "format": {
      "type": "json_schema",
      "name": "FormPatch",
      "strict": true,
      "schema": {"type": "object", "properties": {}, "required": [], "additionalProperties": false}
    }
  }
}
```

上面是请求外层示意。实际 Schema 从完整的 Pydantic 模型生成，严格对象的每个属性都列为 required；不修改的字段通过 nullable 值表达。

Agent 的函数工具是扁平结构：

```json
{
  "type": "function",
  "name": "describe_dataset",
  "description": "读取数据范围",
  "parameters": {"type": "object", "properties": {}, "required": [], "additionalProperties": false},
  "strict": true
}
```

工具结果按同一个 `call_id` 追加到 `input`：

```json
{
  "type": "function_call_output",
  "call_id": "由模型响应提供的call_id",
  "output": "{\"ok\":true,\"data\":{}}"
}
```

执行器先保留整个 `response.output`，再追加工具结果。模型输出的 message、function_call 以及可能出现的 reasoning 项都保留；界面不展示内部推理内容。

## 前后端契约

| 方法与路径 | 行为 |
| --- | --- |
| `GET /api/config` | 返回演示/真实配置状态、数据范围；不返回 Key 或 API 地址 |
| `POST /api/adapted/suggest` | 接收 instruction 与 current，返回 changes 和 explanation |
| `POST /api/adapted/analyze` | 接收字段，返回确定性统计 |
| `POST /api/adapted/explain` | 重新计算后生成解释与 Markdown |
| `POST /api/adapted/export` | 导出服务器计算的分析结果 |
| `POST /api/native/tasks` | 创建目标，立即返回任务，后台执行 |
| `GET /api/native/tasks/{id}` | 读取状态、事件、当前报告和草稿 |
| `POST …/{id}/message` | 继续任务或要求重做；澄清状态必须提供 selection |
| `POST …/{id}/cancel` | 停止本地后续执行 |
| `POST …/{id}/artifact` | 人工保存，必须提供 expected_version |
| `POST …/{id}/accept` | 采纳 draft_id，必须与当前报告版本匹配 |
| `POST …/{id}/discard` | 丢弃候选，保留当前报告 |
| `GET …/{id}/export` | 导出已经保存的当前报告 |

错误响应统一为 `{"error":{"code":"…","message":"…"}}`。输入校验附带字段信息，状态冲突为 `409`，模型服务错误为 `502`。模型返回正文不直接转发给浏览器。

## 企业平台需要替换的三个接缝

**身份与范围。** 示例用随机 HttpOnly Cookie 区分浏览器任务。在已有平台里应换成平台用户/租户身份，查询与所有写入都按身份校验，不允许模型指定 owner 或扩大部门范围。

**任务持久执行。** 示例通过 SQLite 保存状态，单进程 `asyncio.Task` 执行。不要直接启用多个 Uvicorn worker 作为扩容方案。应替换为平台已有的任务队列，并为每轮运行保留唯一 run_id、取消标识与幂等写入。

**产物存储。** 示例每个任务只有一份当前 Markdown 报告，保留当前版本号，未实现完整版本历史。平台已有文档服务时，将 `save_artifact()` 与 `accept()` 的原子版本检查落到该服务，事件日志不能充当完整报告版本库。

## 为什么没有动态生成任意 UI

当前固定的条件卡、统计表和报告草稿足以表示任务中的关键状态。模型选择这些组件对应的语义动作，组件本身由应用代码渲染。以后增加图表选择或其他条件卡时，先增加有限类型和 Schema，保留输入校验、渲染转义和权限检查，再验证是否确实减少完成任务的成本。
