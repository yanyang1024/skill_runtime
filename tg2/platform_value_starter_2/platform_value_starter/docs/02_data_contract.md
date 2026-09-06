# 数据接入：复用已有导出，只补有用的事件与审计

以你已经跑通的用户级接口与会话解析为主。`pull_sessions.py` 是游标型接口的参考与审计示例，`adapt_exports.py` 是显式格式映射；二者不假装兼容所有 OpenCode 版本。规范结果为每行一个 session 的 JSONL。

## 1. 用户级拉取的最小审计

`examples/pull_config.example.json` 里的响应字段只是占位，必须对照真实 API。`date/mode=active` 查询不能未经检查被命名为全部历史。用户入口 HTTP 200、分页完成、详情完整、工具/usage 完整分别判断。

```sh
# users.jsonl：每行 {"tenant_id":"t1","user_id":"u1"}
# PLATFORM_API_TOKEN 在公司环境注入，不写入文件。
python3 scripts/pull_sessions.py --users users.jsonl \
  --config pull_config.json --out raw/snapshot_001
```

审计包括：预期用户数、HTTP 200 页数、schema 合格页数、游标是否结束、total 是否一致、重复项、缺详情字段数、过滤条件、出错类型。游标循环、总量变化或冲突重复会留下未完成状态。空 API 结果在合法分页/总量契约下可以代表这个查询没有记录；这不同于 manifest 声称“一份会话导出”却提供空 `[]`。

`query_complete=true` 仅在**你配置的查询范围与游标契约**内成立；没有 total 时只确认已走到终止游标。字段存在不代表消息/工具历史完整。分页中的稳定快照由实际接口保证；参考代码发现明显 total/内容变化就标记重拉，但无法排除静默变更。`raw_session_records.jsonl` 包含 `raw_session`，先用已有解析器映射再 ingest，不能直接当规范会话。

推荐继续用已工作的拉取器，把 `collect_user` 中的审计字段接进去。若真实 API 是 offset/page，按官方内网契约改分页函数，不凭样例猜游标。成功导出且持久写入后才推进更新时间水位；回拉近期窗口处理迟到事件，周期性对账。

如果详情有可靠 owner 字段，配置 `owner_path` 核对返回者与查询用户，避免参数被忽略却所有探针都 HTTP 200。只有查询参数时，输出称 `queried_user_id`，不直接认定会话所有者。共享会话或代理执行要按真实身份语义调整该检查，再做组织归因。

## 2. 规范会话

```json
{
  "tenant_id":"t1", "session_id":"s1", "user_id":"u1",
  "org_section":"演示研发", "dept":"演示研发", "title":"比较两组参数",
  "start_at":"2026-08-01T09:00:00+08:00", "end_at":"2026-08-01T09:10:00+08:00",
  "messages":[{"role":"user","text":"比较两组参数","ts":"2026-08-01T09:00:00+08:00"}],
  "stats":{}, "requests":[], "tool_events":[], "capability_events":[], "artifact_events":[],
  "coverage":{"messages_complete":true,"requests_complete":false,"artifact_events_complete":false,"capability_events_complete":false}
}
```

身份和 session ID 使用真实稳定来源，不按文件 basename 生成。缺失数值用 null/省略，不填 0；时间必须带时区。组织优先事件期快照，只有当前组织时注明快照口径。统计优先 `org_section`，兼容 `dept`；目前没有组织变更历史还原功能。

同一 `(tenant_id,session_id)` 在一次输入只能出现一个最新版本；重复导入幂等，内容变化生成新 revision，原确认不直接继承。台账保留未在本次增量中出现的旧会话。

### 文件适配

```json
{"path":"exports/session.md","format":"md","tenant_id":"t1","session_id":"s1","user_id":"u1","org_section":"演示研发"}
{"path":"exports/sessions.jsonl","format":"jsonl_sessions","tenant_id":"t1"}
```

```sh
python3 scripts/adapt_exports.py import_manifest.jsonl --out normalized/sessions.jsonl
```

支持有明确角色标题的 Markdown、JSON 对象/数组、每行一个 session 的 JSONL；不递归扫描产出文件。代码块中的角色标题不拆消息。坏文件进入 `.rejected.jsonl` 并以状态 2 退出；合格记录仍写出，由你明确处理 rejected 后继续。`summary={"diffs":[]}` 作为 `summary_metadata` 保留，不转成对话；空导出与只有标题的索引条目拒绝作为详情。

兼容映射：`stats.tokens_input/token_input → input_tokens`，`stats.tokens_output/token_output → output_tokens`，`session.start_ms/end_ms → start_at/end_at`。你们的 parts/info、工具嵌套、stage 格式需显式扩展。Markdown 字符数不能补实测 token；最终文件存在也不证明本会话产出。

## 3. 请求：使用你已可达的 request 数据

```json
{"request_id":"req-001","ts":"2026-08-01T09:02:00+08:00","model":"internal-revision","input_tokens":12000,"output_tokens":400,"cache_read_tokens":9000}
```

放入 `requests`。同租户网关请求唯一；父/子 agent 投影共用 ID，只计一次。相同 ID、不同请求内容会报错；跨组织重复投影不能确定归属时记 unknown，usage 总量保留。输出 `usage_ledger.jsonl` 带来源 case 列表。

请求时间归属窗口。没有请求时，仅计整个会话时间都落在窗口内、且明确 `usage_scope=session_exclusive` 的汇总；这意味着不再包含被别处另算的子请求。部分请求日志只报观测下界，不能混为完整成本。

核对缓存是否已经包含在 input_tokens，推理 token 是否包含在 output_tokens。不要重复相加；真实重复上下文保留，重复请求投影去除。独立财务成本仍用 `costs.json`，不按一个 token 单价给所有自建模型估价。

## 4. 工具：最值得补的两个标签

```json
{
  "event_id":"tool-001", "name":"bash", "tool_id":"native/bash", "tool_version":"runtime-v3",
  "status":"error", "ts":"2026-08-01T09:03:00+08:00",
  "tool_origin":"native", "origin_source":"registry",
  "usage_phase":"development", "phase_source":"manifest",
  "underlying_target":"my_parser.py", "error_kind":"invalid_input",
  "capability":{"kind":"skill","id":"demo-parser","version":"v2"},
  "expected_error":true, "expectation_source":"test_definition", "assertion_passed":true
}
```

`status`：success/error/cancelled/unknown。`tool_origin`：native/custom/unknown。`usage_phase`：development/acceptance/production/unknown。可靠元数据来源接受 runtime/registry/manifest/human；其它来源不直接进入确定分类。阶段不能由部门名推定，自定义也不自动等于开发。

预期错误必须有测试定义且断言通过才从剩余错误中剔除。`assertion_passed=false` 独立记录。`capability` 必须是直接调用链绑定，不能把某会话加载的所有 skill 复制到每个工具事件。未绑定的工具记 unbound。

工具错误类型建议少量枚举：input_validation、permission、timeout、unavailable、schema_mismatch、business_empty、assertion、unknown；具体命名可沿用现有系统。状态报错不自动说明最终任务失败，参数错也不一定是工具实现缺陷。

## 5. skill / agent 事件与目录

```json
{"event_id":"cap-001","kind":"skill","capability_id":"demo-parser","version":"v2","action":"invoke","success":true,"event_source":"runtime","ts":"2026-08-01T09:03:00+08:00"}
```

`kind` 是 skill/agent，`action` 为 load/invoke/mention；只有 runtime 事件进入确定的加载/调用计数。日志只见 SKILL.md 被读取时记录 load；不要自行升级为 invoke。文本文字提及记 mention。成功是该事件的结果，不代表业务成功。

目录每行一个版本：

```json
{"tenant_id":"t1","kind":"skill","capability_id":"demo-parser","version":"v2","category":"日志解析","provider_org":"演示研发","published_at":"2026-07-01T00:00:00+08:00","visibility_source":"registry","visible_to_orgs":["演示工艺"]}
```

可选 `retired_at`；可见范围应是适用于报告窗口的快照。脚本不还原窗口内复杂权限变更。没有可靠可见范围不计算“可见未使用”候选；有目录也不自动说明调用日志完整。

## 6. 文件产物：写出、上传、读取分别保留

```json
{"event_id":"write-1","artifact_id":"asset/123","version":"v1","op":"write","success":true,"ts":"2026-08-01T10:00:00+08:00"}
{"event_id":"upload-2","artifact_id":"attachment/456","version":"v1","op":"upload","source_artifact_id":"asset/123","source_version":"v1","lineage_source":"runtime","success":true,"ts":"2026-08-02T10:00:00+08:00"}
```

也可提供 `sha256`、`sha256_source=file_bytes`、`size_bytes>0`，作为同字节候选。SHA 必须是实际文件字节的 64 位十六进制哈希，不是路径/文字描述的哈希。空文件不作为内容复用候选。原始输出/后续附件应来自明确清单，避免递归把 workspace 所有文件认定为产物。

```sh
# file_manifest.jsonl：每行包含 path 与用于回填的 event_id/tenant_id/session_id
python3 scripts/resource_diagnostics.py hash-files file_manifest.jsonl --out file_hashes.jsonl
```

该命令只读文件并返回哈希，不自动回填数据库。导出侧按 tenant/session/event_id 把哈希加入相应 artifact_event，再 ingest 新 revision。路径相对 manifest；没有稳定资产 ID 时哈希仍只是候选来源关系。跨版本编辑后 hash 会变，需可靠 lineage 才能继续关联。

## 7. 运行和证据标签

```sh
python3 scripts/value_loop.py --db state/evidence.db ingest normalized/sessions.jsonl
python3 scripts/value_loop.py --db state/evidence.db queue --out evidence/current
python3 scripts/resource_diagnostics.py report --cases evidence/current/cases.jsonl \
  --catalog capability_catalog.jsonl --start '2026-08-01T00:00:00+08:00' \
  --end '2026-09-01T00:00:00+08:00' --out reports/resources_001
```

自动评估若写入 review 流，使用 `reviewer_id=AUTO:heuristic-v1`、`label_source=heuristic`，并提供原有 review 必填字段；`outcome/adoption` 即使有候选值，也只存在 `auto_assessment`，不进人工采用分子。人工记录显式 human。业务采用、技术真值与训练许可是不同事实。

题集的 `label_source` 为 human / heuristic / model / programmatic_gold / unknown。程序 golden 需要 `validator_ref` 与 approved，并把实际验证器/固定材料一同版本化；字段本身只是你的证据声明，脚本不能验证一个随便填写的引用真的正确。详见 [03_benchmark_training.md](03_benchmark_training.md)。

SQLite 是单写者离线分析文件，不是面向租户用户的全库查询服务。保留公司已有导出访问与用途范围；哈希只是去重键，不等于员工信息匿名化。台账不会因输入缺失自动删除历史；数据范围调整需显式排除并重建派生版本。
