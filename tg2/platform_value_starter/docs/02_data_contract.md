# 数据接入：只改一个适配器，别猜不存在的字段

先用你已有的导出工具产出统一 `sessions.jsonl`，每行一个会话。台账、报告与案例都消费这一份文件。`adapt_exports.py` 是参考适配器，只支持文中列出的形状；不是所有版本 OpenCode 导出的通用解析器。

## 1. 最小记录

```json
{
  "tenant_id": "tenant_demo",
  "session_id": "ses_demo",
  "user_id": "user_demo",
  "dept": "演示工艺部门",
  "title": "整理一组实验条件",
  "start_at": "2026-08-01T09:00:00+08:00",
  "end_at": "2026-08-01T09:15:00+08:00",
  "messages": [
    {"role": "user", "text": "比较两组条件并整理差异", "ts": "2026-08-01T09:00:00+08:00"},
    {"role": "assistant", "text": "此处为导出的实际答复", "ts": "2026-08-01T09:15:00+08:00"}
  ],
  "stats": {"input_tokens": 10000, "output_tokens": 800, "usage_scope": "session_exclusive"},
  "requests": [],
  "tool_events": [],
  "artifact_events": [],
  "coverage": {"messages_complete": true, "requests_complete": false, "artifact_events_complete": false}
}
```

这只是虚构的字段示例。`tenant_id/session_id` 必须是稳定来源 ID；其余数据拿不到就保留缺失/null。不要写 0 代表没有采集。ID 的 SHA-256 用于去重，不意味着匿名化；员工号等低熵值简单散列后仍可能被识别。

| 字段 | 单位/语义 | 缺失时的处理 |
|---|---|---|
| `start_at/end_at/messages[].ts` | 含时区 ISO 时间；适配器也支持明确的毫秒时间戳字段 | 不从聊天正文随便找日期；缺起始时间不进新建会话分母 |
| `user_id`、`dept` | 导出时明确的用户/组织来源；组织有变更时优先用事件期快照 | unknown；不从目录名推 HR 身份 |
| `stats.input_tokens/output_tokens` | API 实测会话累计 usage；需确认重复上下文、输出/推理 token 的供应商语义 | 不以文本字符数补值 |
| `usage_scope=session_exclusive` | 汇总只含本会话自己的请求，排除被另算的子会话 | 未确认排他性时保持 unknown，不自动记入时间窗 token |
| `coverage` | 由导出器确认是否完整采集 | 默认为不完整，不能把“有一些日志”写成 true |
| `tool_events` | 结构化真实工具事件 | 不把代码块当工具调用 |
| `artifact_events` | 已有资产 ID 与版本的实际成功/失败事件 | 文本提及路径只能放候选，不填成已验证事件 |

只有 Markdown 时能做：角色/轮次检查、候选问题与用户复核。不能恢复：真实累计 token、缓存成本、缺失的工具结果、文件是否实际产生、人工投入时间。小文件最终确实存在也不代表由本会话生成或被业务采用；有文件快照/哈希后再追加证据。

## 2. 按清单解析已有文件

`import_manifest.jsonl` 中每行明确指定一个文件及其身份；相对路径相对 manifest 所在目录。

```json
{"path":"exports/one_session.md","format":"md","tenant_id":"t1","session_id":"s1","user_id":"u1","dept":"部门A"}
{"path":"exports/two_sessions.jsonl","format":"jsonl_sessions","tenant_id":"t1"}
```

```sh
python3 scripts/adapt_exports.py import_manifest.jsonl --out normalized/sessions.jsonl
```

支持的 Markdown 标题包括 `## User`、`## Assistant`、`## Assistant (模型信息)`。会避开 fenced code 中的角色标题。你们若有 `**User**`、特殊 emoji、嵌套工具 JSON、parts/info 包装等，应在适配器里显式增加解析并用脱敏样本核对。未识别的文件会进入 `.rejected.jsonl`，进程返回 2，避免定时任务拿错误数据继续出报告。

现有汇总 JSON 的兼容映射：

```text
stats.tokens_input / stats.token_input -> stats.input_tokens
stats.tokens_output / stats.token_output -> stats.output_tokens
session.start_ms 或 start_ms -> start_at
session.end_ms 或 end_ms -> end_at
session.id -> session_id
```

`runs[].stages` 可以保留作结构化活动标签，但当前实现不把它映射成业务价值。`n_w_files/write_files` 也不会自动提升为验收交付物。

**注意 JSONL 粒度**：每行一个 message 与每行一个 session 是两种格式。前者先按真实 session ID 聚合，不能把 message 当作 session。不要同时把一份原始文件和它的 Markdown 副本以不同 ID 导入。

## 3. 请求层数据是后续最值得补的字段

```json
{
  "request_id": "stable_gateway_request_id",
  "ts": "2026-08-01T09:02:00+08:00",
  "model": "internal-model-revision",
  "input_tokens": 12000,
  "output_tokens": 400,
  "cache_read_tokens": 9000
}
```

放入 `requests`。ID 对同租户内网关请求唯一；父/子 agent 投影出的同一次请求必须共用这个 ID。脚本会去重，重复 ID 的记录不一致时停止。

当前报告优先按请求时间归属 token；没有请求事件时，仅计完整落在窗口内且声明 `session_exclusive` 的会话汇总。跨月长会话的总 token 不全塞进创建月份。部分请求日志只作为已观测 token 和，不能与完整日志月份直接比较。

必须额外确认缓存字段是否已包含于 input_tokens。不能将 cache_read 再加一次到 total，也不能用输入 token 的一套单价代表所有模型。核心脚本暂不估价；`costs.json` 单独来自你们的成本台账。

建议内网导出伪代码：

```python
# 在你的现有导出脚本内适配。下列 API 是接口示意，不是已有可调用函数。
for tenant in authorized_tenants:
    for session in export_sessions(tenant, updated_after=cursor):
        record = map_session_fields(session)
        record["requests"] = deduplicate_by_gateway_id(export_usage(session.id))
        record["coverage"] = describe_export_coverage(session)
        emit_jsonl(record)
# 游标只在导出完整、写入成功后推进；定期回拉最近几天处理迟到事件。
```

不要同时把所有历史 snapshot 追加到输入。对同一 tenant/session，导入器接收该批次一个最新版本；跨次内容更新作为新 revision 保存。

## 3.1 按用户全量拉取（实测可用，优先使用）

实证结论（2026-09，见 docs/06_field_notes.md）：平台会话 API 支持按用户全量拉取全部历史（如 `/api/sessions?user=&date=&mode=active`，用 200/404 判别存活），实测 2999/2999 用户可拉、单次全量探测约 7.6 秒。因此接入策略从「等静态导出」改为「按用户增量游标全量拉取」：

```python
# 伪代码，接口名以你们平台实际为准
for user in list_authorized_users():           # 全量用户名单，不按活跃度预过滤
    for session in export_sessions(user, updated_after=cursor.get(user)):
        emit_jsonl(map_session_fields(session))
    cursor[user] = last_successful_watermark   # 只在写入成功后推进
# 404/空列表是“该用户无会话”，不是错误；拉取失败单独重试，不用空数据覆盖历史
```

全量可拉意味着两件事：第一，「活跃渗透率」的分母（授权名单）和分子（有时间戳的用户消息）都能拿真值，不再需要近似；第二，抽样复核可以从全平台分层抽样，不再受样例包偏差影响。

## 4. 资产读取证据

```json
{"event_id":"ev1","artifact_id":"asset_registry/123","version":"sha256:abc","op":"write","success":true,"ts":"2026-08-01T10:00:00+08:00"}
```

`artifact_id` 来自平台文件/产物系统；沙箱绝对路径相同并不证明是同一资产。若没有 ID，可以在导出侧维护“租户 + 资产来源 + 文件内容哈希”的映射，但要区分同内容的公共模板与真正的复制来源。文件内容相同是身份候选，实际 lineage 更有力。

当前实现只关联同租户、同资产版本、其他会话、写入之后发生的成功 read，输出证据边。它不估计“全平台复用率”，也不把读取称为“投入业务”。7/30 天指标要等资产已拥有完整 7/30 天观察窗口，再看后续读取/采用；没有记录不代表资产已死亡。

`op` 还支持 `"upload"`：产物在之后的会话里被**作为附件/输入上传**。这是比 read 更强的复用信号（用户主动把旧产物带进新任务），`reuse_signals.py` 会把它与 read 分开统计，并区分**同用户复用**（自己的文件自己接着用）与**跨用户复用**（产物被他人采用——这才是平台级资产证据）。只有 artifact_id/内容哈希能稳定对齐时才统计；basename 相同不作数。

## 4.1 技能与工具来源字段（组织×可靠性分析的前提）

```json
{"skills_used": ["etch-data", "recipe-diff"], "purpose": "tool_use",
 "tool_events": [{"event_id":"t1","name":"fab_query","origin":"custom","status":"error","error_kind":"timeout","ts":"..."}]}
```

| 字段 | 语义 | 缺失处理 |
|---|---|---|
| `skills_used` | 本会话实际调用过的 skill/agent 名（会话级去重列表） | 缺省 `[]`，不从标题猜 |
| `tool_events[].name` / `origin` | 工具名；`builtin`=平台原生，`custom`=某部门自建，`unknown` 未区分 | 默认 unknown，**不把 unknown 计入任何一方** |
| `purpose` | `tool_dev`=本会话是在测试/打磨自建工具；`tool_use`=正常业务使用 | 默认 unknown；只能从明确证据（如会话在工具的测试 workspace）打标，不靠猜测 |

这三个字段是「工具失败率按部门公平比较」的前提：开发部门的测试会话（tool_dev + custom）必须与生产性使用分开报，否则打磨工具的天然试错会被误读为平台质量问题。

## 5. 平台 CSV 与身份映射怎样继续使用

保留你已经工作的 `lookup_emp` 接口，在内网导出时做一次缓存 join。不要为了“业务映射”先建 HR 数据工程。

```python
import csv

# 字段名在这里改成你们 CSV 的真实列名；不可把累计对话数当作本月活跃。
with open("platform_users.csv", encoding="utf-8-sig", newline="") as f:
    user_index = {}
    for row in csv.DictReader(f):
        key = (row["租户ID"], row["用户ID"])
        if key in user_index:
            raise ValueError("用户映射一对多，请先处理重复快照")
        user_index[key] = {"dept": row.get("组织") or None,
                           "lifetime_conversations": int(row["累计对话数"])}
# normalized_session['dept'] = user_index.get((tenant_id,user_id), {}).get('dept')
```

累计次数可以做使用强度分层；本期活跃使用 message 日期；资格人数取同窗口授权名单。内部职位/项目拿不到就不填；技术负责人不替用户认定业务收益。

要做真留存，至少有用户可靠首次使用日期、后续主动使用事件、明确观察截止日。历史导出不完整时叫“首次观测 cohort”，不可叫真实新用户；未走完整观察周的 cohort 留空。少量新 cohort 的 W4=0 很可能是右删失，不是用户离开。

## 6. 人工确认与持续导入

```sh
python3 scripts/value_loop.py --db state/evidence.db ingest normalized/sessions.jsonl
python3 scripts/value_loop.py --db state/evidence.db queue --out review/2026w36
# 复制少量 review_template 行，填写后保存为 reviews_filled.jsonl
python3 scripts/value_loop.py --db state/evidence.db review reviews_filled.jsonl
python3 scripts/value_loop.py --db state/evidence.db report \
  --start '2026-08-01T00:00:00+08:00' --end '2026-09-01T00:00:00+08:00' \
  --out reports/2026-08
```

每个 review 带 `source_revision`，会话变化后旧确认不直接继承。更正确认用新的 `review_id`，保留审计历史。案例导出始终是当前全量快照，不只包含最近新增。

同一业务事项的时间估计应该覆盖整个事项，不能每个 session 都填写完整节省时长再求和。报告在当前新建会话 cohort 内按 `(tenant_id, work_item_id)` 选最新确认；它不是按业务事项完成日期计量的项目台账。跨期项目 ROI 请另按工作事项/完成时间做一次汇总，不能把每月报告累加成总收益。

SQLite 方案适用于离线批处理单写者。本包不做企业鉴权或数据删除工作流。输入缺失不会自动删除历史数据；若有授权撤回/保留期要求，应在导出和发布数据前用明确排除名单重建获准语料与派生版本。不要把这个离线脚本作为多租户用户直接查询全库的服务。
