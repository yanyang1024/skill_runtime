# 最简使用：一份输入、一个命令、按目标看结果

如果只参考一条路径，就用本页。其它脚本都是下钻工具，不必一起上线。

## 1. 准备一份规范会话文件

`sessions.jsonl` 每行一个会话。第一轮只保证这些字段可靠：

```json
{"tenant_id":"t1","session_id":"s1","user_id":"u1","org_section":"部门A","start_at":"2026-08-01T09:00:00+08:00","end_at":"2026-08-01T09:10:00+08:00","messages":[],"requests":[],"tool_events":[],"capability_events":[],"artifact_events":[],"coverage":{}}
```

优先接入你已具备的请求 token、组织和 skill/agent 使用。暂时没有的字段留空，并在 `coverage` 里保持 false/缺失；不要用 0 伪装为完整数据。

工具事件只额外补两个字段最划算：`usage_phase=development/acceptance/production/unknown` 与 `tool_origin=native/custom/unknown`。无法可靠判断时填 unknown，不能根据部门名猜。

## 2. 跑一个命令

```sh
CAPABILITY_CATALOG=/path/capability_catalog.jsonl \
  sh run_weekly.sh /path/sessions.jsonl /path/analysis_state \
  '2026-08-01T00:00:00+08:00' '2026-09-01T00:00:00+08:00'
```

目录不是必需；没有就省略 `CAPABILITY_CATALOG=...`。脚本只做离线分析，不调用模型、不训练、不通知用户，也不修改平台工具。

## 3. 按目标看结果

| 输出 | 用途 |
|---|---|
| `tasks/task_atlas.md` | 本轮重点：组织 × 主任务分布与选题候选；配合 07_task_atlas_and_bench.md 阅读 |
| `brief/action_board.md` | 汇报和行动入口：本期事实、最多几项候选、不能说什么 |
| `resources/resource_diagnostics.md` | 下钻组织 × 阶段 × 工具/skill/agent、产物关联 |
| `report/usage_ledger.jsonl` | token 数字被追问时逐请求核对 |

不要一开始读所有 JSONL。只有看板中的某项要继续排查时，再打开对应明细。

已有分类结果时增加环境变量 `TASK_LABELS=/path/task_labels.jsonl`；已有持久分集注册表时增加 `SPLIT_REGISTRY=/path/split_registry.json`。未提供标签则读取案例现有 task_type，其余为 unknown，不会凭空自动分类。

## 4. 每期只做两个决定

1. 选一个高影响、可复现的问题：核对分母和阶段，冻结一条回归题；没有修改权限也能作为模型/提示比较题。
2. 选一个能力或产物案例：确认是加载、调用、上传、读取还是业务采用，不把这些状态混在一起。

路由实验在下游任务上比较原提示、通用提示、关键词提示和 TF-IDF 提示。分类 F1 只用来描述路由；真正选择策略看任务通过、退步、token 与耗时。如果简单提示没有增量，停止，不开训练。

## 5. 领导追问时按这个顺序回答

- 钱用在哪里：观测请求、token、组织/模型，附覆盖和对账差异。
- 平台建设做了什么：哪些 skill/agent 被实际调用，哪些产物进入后续会话。
- 具体改善了什么：一项固定任务的改动前后结果。
- 还不知道什么：未确认的业务采用、工时、项目周期和良率影响。

这套方式允许没有持续人工复核：自动数据照常更新，业务价值未知保持未知。有一次用户/业务回执时再补到对应案例，不反推全平台成功率。
