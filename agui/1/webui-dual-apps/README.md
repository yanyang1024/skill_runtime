# 两种 Web UI：表单增强与 Agent 目标工作台

这是可在本地直接运行的 FastAPI 示例项目。同一个“部门使用分析”任务，提供两套独立页面，共用数据和统计口径，方便比较交互，也方便把表单增强部分拆进已有应用。

| 页面 | 交互控制权 | AI 做什么 | 人做什么 |
| --- | --- | --- | --- |
| `/adapted`：表单增强 | 表单、校验、提交由人控制 | 从语言提议字段修改；解释已计算结果 | 核对并应用建议；提交；导出 |
| `/native`：目标工作台 | Agent 在有限工具范围内推进任务 | 读取范围、请求澄清、计算统计、形成报告草稿 | 确认条件；编辑报告；采纳、丢弃或要求重做 |

**两个页面都已经实现 Responses API 调用。** 未填 Key 时使用明确标注的演示规则；填入有效 Key 后，重启服务即切换到真实模型。演示规则不具备通用语言理解能力，适合先体验流程。

## 1. 启动

需要 Python 3.10+。无需 Node、前端构建步骤或 Docker。

macOS / Linux：

```bash
cd webui-dual-apps
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python run.py
```

Windows PowerShell（直接使用虚拟环境里的 Python，无需修改执行策略）：

```powershell
cd webui-dual-apps
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
.\.venv\Scripts\python.exe run.py
```

启动后打开：

- [A：表单增强](http://127.0.0.1:8000/adapted)
- [B：目标工作台](http://127.0.0.1:8000/native)
- [FastAPI 接口文档](http://127.0.0.1:8000/docs)

首次运行会在 `data/app.sqlite3` 创建本地数据库。浏览器会话保留任务列表；刷新可恢复任务。服务重启时，执行中的任务标记为“中断”，由用户点击继续，不会自动重放。

## 2. 接入真实 LLM

编辑项目根目录的 `.env`：

```dotenv
APP_MODE=auto
LLM_API_KEY=填写你的APIKey
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4.1-mini
```

保存并重启 `python run.py`。使用默认 OpenAI 地址和模型时，只需填写有效 Key；也支持已有的 `OPENAI_API_KEY` 环境变量。环境变量优先于 `.env`。

其他服务商：同时修改 `LLM_BASE_URL` 和 `LLM_MODEL`。Base URL 填 API 根目录，例如 `https://your-provider.example/v1`，程序会追加 `/responses`。远程地址使用 HTTPS，本机服务可用 HTTP。服务商需要实际支持：

- `POST /responses`，以及 `input` / `output` 消息结构；
- `text.format.type=json_schema` 的严格结构化输出，供表单版使用；
- 扁平的 `type=function` 工具定义、`function_call` / `function_call_output`，供 Agent 版使用；
- `store=false` 和 `parallel_tool_calls=false`。

只兼容 Chat Completions 的端点无法直接使用。默认模型是示例配置，可按服务商支持范围替换。Key 只由服务端读取，不进入网页、浏览器存储或前端请求。页面显示“AI 已配置”表示有配置，连通性以实际调用结果为准。

`APP_MODE=demo` 可强制使用演示模式，`APP_MODE=live` 可要求必须配置 Key。模型请求失败会显示错误，不会静默退回演示模式。`LLM_TIMEOUT_SECONDS` 默认 60 秒；`AGENT_MAX_ROUNDS` 默认每轮任务最多 8 次模型请求，另有总工具调用预算。

## 3. 五分钟体验两种交互

### A：在传统表单里增加 AI

1. 不使用 AI，直接点击“生成分析”，验证原有提交路径可独立使用。
2. 输入“看研发和工艺9月5日至10日的工具失败率”，生成字段建议。
3. 核对修改前后值，点击“应用到表单”；此时不会自动生成分析。
4. 点击“生成分析”，再点击“解释这份结果”。
5. 修改表单字段，观察结果仍对应上次提交范围；重新生成后才更新。

如果建议生成后你又改了字段，旧建议不能直接应用，需重新生成。这避免异步建议覆盖刚完成的人工修改。

### B：以任务和产物为中心

1. 输入“帮我看看各部门的使用情况，整理一份报告”，点击启动。
2. 在澄清卡确认指标、部门和日期，继续执行。
3. 查看真实工具执行记录、确定性统计和报告草稿；当前报告此时仍为空。
4. 点击“采纳为当前报告”，得到 v1，可编辑并导出。
5. 输入“建议收敛到两条，再生成一份草稿”，继续调整。

### 试验版本冲突

1. 草稿就绪后，进入“当前报告 → 编辑”，写入一条补充并保存。
2. 当前报告版本递增，原草稿仍基于旧版本，采纳按钮被禁用。
3. 点击“基于新版本重新提案”；新草稿需要人工核对，再采纳。

后端也用原子版本检查保护写入，绕过按钮调用接口仍会得到 `409`。演示模式会将现有报告片段按原文附入解读，供复核；它不模拟智能合并。真实模型会收到当前报告与版本上下文，但保留修改的质量仍需实测。

保存报告期间可以继续输入。服务器先保存提交时的内容，随后输入的内容保留为未保存编辑，不会被返回的结果或任务轮询覆盖。

### 试验取消

在执行期间点击“停止本轮执行”。应用取消本地异步任务，不再执行后续工具，也不会产生迟到草稿。已发给模型服务的请求无法保证撤回，可能仍产生费用。这个样例没有发邮件、发布或修改外部业务数据的工具。

## 4. 数据与代码入口

数据是固定的合成样例，覆盖 **2026-09-01 至 2026-09-14**，包括研发、工艺、设备三个部门。

| 指标 | 服务端口径 |
| --- | --- |
| 会话数 | 范围内 `sessions` 求和 |
| 活跃用户 | 范围内按 `user_id` 去重；不将每天活跃人数相加 |
| 工具失败率 | 失败调用总数 ÷ 全部调用总数；不平均每日百分比 |

工具失败率不等于用户任务失败率。这些样例数据不支持部门绩效或失败原因判断。

| 文件 | 用途 |
| --- | --- |
| `app/main.py` | FastAPI 页面与 REST 接口、浏览器会话、输入校验 |
| `app/responses.py` | 服务端 Responses HTTP 适配器；结构化输出与错误处理 |
| `app/runtime.py` | 真实工具循环、工具白名单、暂停/继续/取消、演示规则 |
| `app/analytics.py` | 固定样例数据、确定性统计、报告数值表格 |
| `app/store.py` | SQLite 任务、事件、报告、草稿与原子版本检查 |
| `static/adapted.*` | 表单增强界面 |
| `static/native.*` | 目标、澄清、执行记录、草稿与产物界面 |
| `docs/interaction-design.md` | 两种交互的设计判断、投入顺序与验证假设 |
| `docs/integration.md` | 接到已有 FastAPI 应用的改造位置和接口契约 |
| `docs/verification.md` | 已验证内容与尚未验证的边界 |

这个版本使用 SQLite 和单进程内的后台任务。接入真实企业平台时，需要复用平台身份与部门权限、替换数据读取函数，并将任务运行器接入已有持久任务队列。浏览器随机会话只用于本地样例任务隔离，不是企业账号或多租户认证。删除浏览器 Cookie 后，原任务不会自动关联到新会话。

## 5. 测试

后端与 Responses 协议测试不需要 Key，也不调用真实模型：

```bash
python -m unittest discover -s tests -v
```

可选的真实浏览器测试需要 Node 20+ 和 Playwright；不影响正常运行：

```bash
npm install --no-save playwright
npx playwright install chromium
# 在另一个终端保持 python run.py 运行；服务必须处于演示模式。
node tests/browser.cjs
```

浏览器测试使用独立浏览器会话，覆盖完整按钮操作、澄清、版本冲突、恢复与手机宽度布局，并生成 `docs/screenshots/` 中的截图。

## 6. Responses 官方契约

本项目按以下官方文档实现，没有将 Chat Completions 的 `response_format` 放进 Responses 请求：

- [Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)：结构化格式放在 `text.format`。
- [Function calling](https://developers.openai.com/api/docs/guides/function-calling)：使用 `call_id` 回传 `function_call_output`。
- [Reasoning models](https://developers.openai.com/api/docs/guides/reasoning)：保留全部输出项，包括可能出现的 reasoning 项，再追加工具结果或下一轮输入。
- [GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini)：示例默认模型。

真实 Key 与服务商连通性未在交付前测试；已有自动化测试验证的是请求结构、工具循环和应用状态行为。
