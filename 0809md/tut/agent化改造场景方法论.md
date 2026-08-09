# Agent 化改造的三个样例场景：方法论与实操清单

> 配套文档：《从 Chat API 到 Agent Runtime》（HTML 讲义 / PPT）
> 本文回答三个落地问题：
> ① 传统 API 如何在不破坏老消费者的前提下，变得更适合 Agent/大模型工作流？
> ② API 如何融入 Skill、融入 Agent（含错误设计、stdin/stdout 人机读取差异、持久化）？
> ③ WebUI 应用如何演进为 Agent 对话式应用（MCP 化 + Tool Search + SOP Skill 化）？

---

## 场景一：传统 API 梳理 / 改造方法论

### 核心原则：加一层，而不是改一层

老接口已经有真实消费者（前端、脚本、合作方），直接改返回格式 = 事故。
正确姿势是**新增一个 Agent-facing  façade 层**，老接口保持不变：

```text
老消费者 ──→ 传统 API（不变）
                ↑ 复用同一业务核心
Agent ──→ Agent Façade（新增）──┘
              · 语义化命名与描述
              · 结构化错误
              · 双视图输出
              · 粗粒度聚合
              · 幂等与审批
```

### 第一步：盘点与分级（Inventory）

把 API 拉成一张表，按两个轴分级：

| 维度 | 分级 | 改造优先级 |
|---|---|---|
| **读写风险** | 只读 / 可逆写 / 不可逆写（付款、删除、外发） | 只读先行，不可逆写最后且必须带审批 |
| **语义密度** | 一目了然（get_user）/ 需要领域知识（settle_acct_v2） | 语义越模糊，越需要重命名+描述 |

产出物：一张 API 清单，每行标注 `风险级 / 语义级 / 是否高频 / 返回体大小`。

### 第二步：Agent-Ready 差距评估清单

对每个候选接口过一遍清单，打分决定改造顺序：

- [ ] **名字能区分吗**：`query_order` 和 `query_order_detail` 同时存在时，模型选错的概率是多少？
- [ ] **参数自解释吗**：`type=3` 还是 `type="refund"`？枚举值是否写全？
- [ ] **错误可恢复吗**：失败时返回的是 `500` 还是 `{error_type, field, expected, retryable}`？
- [ ] **返回体能进上下文吗**：一次调用返回 200KB JSON？需要 summary + 分页 + handle。
- [ ] **有幂等键吗**：模型重试时会不会重复下单？
- [ ] **粒度合适吗**：完成"查用户最近订单并判断是否超时"要调 5 次接口？考虑聚合接口。

### 第三步：五个改造动作（按性价比排序）

**1. 错误结构化（性价比最高，一天能做）**

```json
// 改造前
{ "code": 500, "msg": "error" }

// 改造后：模型可以自我恢复
{
  "error_type": "invalid_argument",
  "field": "start_date",
  "expected": "YYYY-MM-DD and not earlier than today",
  "received": "2026/08/08",
  "retryable": true,
  "suggestion": "Convert the date format and retry"
}
```

错误分五类，分别对待：参数可修复（告诉怎么改）/ 临时错误（有限重试）/ 权限不足（请求授权）/ 状态失效（重建 handle）/ 永久失败（停止并说明）。

**2. 输出双视图**

```yaml
summary:    "共 47 条订单，其中 3 条已超时，最早超时单 #A1023"   # 给模型快速判断
structured: { overdue: [...], total: 47 }                        # 给程序组合消费
resources:  { list_cursor: "cur_8x2", full_export: "file_91m" }  # 大对象不进上下文
evidence:   { source: "orders_db", as_of: "2026-08-09T13:00Z" }  # 供验证
control:    { status: "completed", retryable: false }
```

**3. 粗粒度聚合接口**：把"调 5 次才能完成"的常见任务合成 1 个 façade 接口。
判断标准来自 PTC 原则：**步骤间只需要结构化字段传递、不需要新语义判断 → 聚合；需要逐步判断 → 保持分开。**

**4. 幂等与副作用声明**：写接口接受 `idempotency_key`；Schema 里声明 `side_effect: "creates_record" / "sends_email" / "charges_money"`，让 Harness 能自动识别需要审批的调用。

**5. 大返回体资源化**：列表接口默认返回 summary + cursor；原始数据通过 resource handle 按需拉取。模型上下文只放"工作集"。

### 样例：订单系统改造路线

| 阶段 | 动作 | Agent 体验变化 |
|---|---|---|
| 第 1 周 | 只读接口错误结构化 + 语义化命名 | 模型选错工具、瞎猜重试基本消失 |
| 第 2 周 | 高频场景聚合接口（`order_health_check`） | 单次任务调用数 7 → 2，Token 降 60% |
| 第 3 周 | 大列表接口 cursor 化 + 双视图 | 长任务不再爆上下文 |
| 第 4 周 | 写接口幂等键 + 审批点接入 | 开放低风险写操作给 Agent |

### 度量：别凭感觉

改造前后对比四个指标：**任务完成率、平均工具调用次数、无效重试率、总 Token 消耗**。评测时记录完整 Harness 配置（模型快照、工具列表、Schema 版本），否则无法归因。

---

## 场景二：API / 工具融入 Skill 与 Agent 的方法

### 2.1 融入的三层包装

```text
第 1 层 · 工具本身（Tool / MCP Server）
  → 单次调用正确、错误可恢复、输出双视图

第 2 层 · 组合方式（Skill）
  → 什么时候用、按什么顺序用、失败后怎么办

第 3 层 · 运行约束（Harness / Policy）
  → 谁能调、要不要审批、重试上限、状态怎么存
```

很多团队只做第 1 层，然后奇怪"为什么 Agent 还是用不好"——因为**怎么用的知识**（第 2 层）和**边界**（第 3 层）缺失。

### 2.2 stdin / stdout：人与 AI 的读取差异（CLI 工具尤其明显）

这是接入现有 CLI / 脚本时最容易翻车的地方。同一份输出，人和 AI 的需求几乎相反：

| 设计点 | 人类偏好 | AI（Agent）需要 |
|---|---|---|
| 格式 | 对齐表格、颜色高亮、进度条 | 稳定 JSON / 结构化文本，**禁止 ANSI 转义码** |
| 信息流向 | 全混在终端 | **数据走 stdout，诊断走 stderr**，退出码语义化 |
| 交互 | 交互式确认 `Are you sure? (y/n)` | 默认非交互；确认通过显式参数 `--yes` 或由审批层处理 |
| 截断 | "显示前 20 行..." | 明确告知总量与游标：`total: 1240, cursor: "..."` |
| 时间/数字 | 本地化格式（"3 天前"） | ISO 8601、Unix 时间戳、无千分位 |
| 空结果 | "No results" | 结构化空：`{"items": [], "total": 0}`，并说明是"无数据"还是"查询失败" |

实操做法：给 CLI 加 `--json`（机器视图）保留默认人类视图；Agent 侧只消费 `--json`。
没有源码的第三方 CLI：包一层 wrapper，把人类输出解析成结构化输出——但优先找官方 API。

### 2.3 持久化设计

接入 Agent 前必须回答四个问题：

1. **状态存哪**：会话状态（本次任务）→ Run/Task State；长期事实 → Durable Memory（经验证才写入）。别把中间推理当长期记忆。
2. **handle 谁负责**：Stateful Tool 返回的 handle，要明确 TTL、失效信号（`error_type: "handle_expired"`）和重建方式。
3. **重试会不会重复**：所有写操作幂等键；长任务提供 checkpoint，崩溃后能从检查点恢复而不是重来。
4. **产物归谁**：Agent 生成的文件/报告作为 Artifact 登记（ID、版本、所有者），后续任务按 ID 引用而不是重新生成。

### 2.4 Skill 化：把"老师傅经验"打包

当一个任务需要**多个工具 + 判断规则 + 兜底策略**时，就该写成 Skill 而不是指望模型现场发挥：

```yaml
# 示例：invoice-reconciliation/SKILL.yaml（示意）
trigger: 用户要求对账、核销发票、检查票账一致
boundary: 只读操作；发现差异时生成报告，不自动调账
steps:
  1. 用 query_invoices 拉取周期内发票（summary 视图）
  2. 用 query_payments 拉取回款记录
  3. 程序化 Join 比对（PTC：确定性规则，不进模型上下文）
  4. 差异 < 5 条 → 模型逐条语义判断；≥ 5 条 → 生成差异报告 Artifact
fallback: 任一接口 handle_expired → 重建后继续；权限不足 → 停止并申请授权
acceptance: 输出差异清单 + 每条差异的证据链（evidence 视图）
```

要点：**先暴露名称+描述，命中场景再加载全文**（渐进加载，与 Tool Search 同理）；Skill 里写清停止条件，避免 Agent 无限循环。

---

## 场景三：WebUI 应用 → Agent 对话式应用的迁移策略

### 3.1 最大的坑：模拟点击

不要做"让 Agent 操作浏览器点按钮"的方案作为主路径——脆弱（UI 改版即挂）、慢、无幂等、难审计。
正确方向是**把 UI 背后的业务能力接口化**：

```text
WebUI（人） ──→ 业务能力层 ──→ 数据/服务
                    ↑
MCP Tools（Agent）──┘   ← 同一层能力的两种消费者
```

### 3.2 四步迁移法

**第 1 步：能力提取（从页面到工具）**
把每个核心页面倒推出"这个页面到底在做什么业务动作"：

| WebUI 页面 | 用户实际操作 | 提取为 MCP Tool |
|---|---|---|
| 报销列表页 | 按状态筛选、看金额汇总 | `query_expenses(status, period)` → 双视图输出 |
| 报销填写页 | 填表单、传发票、提交 | `submit_expense(items[], attachments[])` → 幂等键 + 审批 |
| 制度查询页 | 搜索差旅标准 | `search_policy(keyword)` → summary + evidence |

注意粒度：一个页面可能拆成多个 Tool（查询/提交分开），也可能多个页面聚合成一个 Tool（向导式表单 → 一个结构化提交接口）。

**第 2 步：Tool Search 组织**
工具数量上来后（>15 个），按**用户意图**划 namespace，而不是按后端服务：

```text
namespace: expense     — 报销相关（query/submit/cancel）
namespace: policy      — 制度查询（只读，直接加载）
namespace: approval    — 审批流（低频 + 高风险，defer_loading）
```

高频只读工具直接加载；写操作和低频工具 `defer_loading`，模型需要时才加载完整 Schema。

**第 3 步：场景 SOP → Skill 化**
单个工具解决不了的完整场景，写成 Skill。例：差旅报销 SOP——

```text
触发："帮我报销上周上海出差"
步骤：查行程（calendar tool）→ 匹配制度标准（policy tool）
      → 生成报销单草稿（expense tool）→ 给用户确认（审批点）
      → 确认后提交（幂等键）→ 返回 Artifact（报销单号+凭证）
边界：单笔 > 5000 元必须人工审批；缺发票时停止并列出缺失项
```

**第 4 步：人机分工重新设计**
WebUI 不会消失，它的角色变了：

| 角色 | Agent 对话式 | WebUI |
|---|---|---|
| 信息收集、草拟、批量处理 | ✅ 主力 | 辅助 |
| 高风险确认、审批签字 | 发起请求 | ✅ 审批界面（保留） |
| 复杂数据可视化浏览 | 摘要+引用 | ✅ 主力 |
| 审计追溯 | 写 Trace | ✅ 查询入口 |

### 3.3 分阶段上线（风险控制）

```text
阶段 1 · 只读助手    查询/汇总/解释类场景，出错成本≈0，快速验证工具设计
阶段 2 · 草稿模式    Agent 生成草稿（报销单/工单），人确认后提交——跑通审批点
阶段 3 · 低风险直写  可逆、有幂等保障的写操作（改备注、加标签）
阶段 4 · 高风险开放  付款/删除/外发——保留强制审批 + 完整审计 Trace
```

每一阶段用场景二的度量指标验收，达标再进入下一阶段。

---

## 一页纸总结

1. **传统 API 改造**：不动老接口，加 Agent Façade；先做错误结构化和语义命名（性价比最高），再聚合、资源化、幂等化；用完成率/调用数/重试率/Token 四指标验收。
2. **融入 Agent**：三层包装（工具正确 → Skill 教用法 → Harness 管边界）；CLI 人机输出分流（`--json` + stdout/stderr 分离 + 非交互默认）；持久化四问（状态存哪、handle 谁管、重试是否安全、产物归谁）。
3. **WebUI 转型**：拒绝模拟点击，提取业务能力 MCP 化；意图导向 namespace + Tool Search；多工具场景 SOP 写成 Skill；WebUI 退到"审批 + 可视化 + 审计"角色；只读 → 草稿 → 低风险写 → 高风险审批，四阶段推进。
