---
name: session-signal
description: Agent 平台会话信号提取与评测（飞轮第一阶段：信号）。支持两类输入——标准化 session JSONL 或 OpenCode Markdown 会话导出——提取工具报错、同参反复报错、错后恢复线索、文件 read/write/edit、跨会话共享路径复用候选、skill/agent 接触、question 复盘入口、任务分布等信号与指标；并对"主 Agent 委托子 Agent/Skill/工具"的会话做契约审计（回执字段、交接配对、上游文档与派生物一致性、静态 Skill 检查）和校验器探针（验收器是否漏检目标）。用于：(1) 单会话或多会话的信号提取与指标构建；(2) 多用户、多部门会话的聚合分析与部门比较；(3) 给 skill/agent/tool 找错误热点与优化信号；(4) 评估 Agent 交接契约与 Skill 实际接触证据；(5) 从真实摩擦点整理评测题卡（bench card）。当用户提到会话分析、信号提取、会话指标、工具报错分析、skill/agent 使用情况、部门间对比、复用候选、交接审计、校验器验证、评测题卡时触发。
---

# session-signal：会话信号提取与评测

核心立场：**先提取可追溯观测，再生成有边界的候选，不升级为根因或验收。** 所有输出遵守五句式——发生了什么 / evidence_refs / 推断了什么 / 缺少什么 / 下一步怎样验证。

脚本只用 Python 标准库，无网络、无数据库。所有分析以会话 JSONL 为主数据源。

## 工作流程

### 1. 准备输入

两条入口，按手上的数据形态选：

- **平台 JSON 导出**（有结构化 tool_events）→ 标准化 session JSONL，见下。
- **OpenCode Markdown 会话导出**（本地跑出来的 session-*.md）→ 先解析：

```sh
python scripts/md_trace.py session-a.md session-b.md --out trace_run
```

产出 `events.jsonl`（含源文件 SHA-256+行号、task 子会话 ID、回执解析结果）、`messages.jsonl`、`manifest.json`。注意：Markdown 导出通常没有退出码/token/子会话轨迹——**有 Output 不补成 success**，这些字段保持 unknown。解析结果可直接接第 4 步的契约审计；若要进 session_signals.py，需自行把 events 映射为标准结构（event_id/ts 可能缺失）。

标准化 session JSONL，每行一个会话当前快照（或 `{"session": {...}}` 包装）。最小结构：

```json
{"tenant_id": "...", "session_id": "...", "user_id": "...", "dept": "...",
 "task_type": "...", "task_label_source": "human_v1",
 "coverage": {"tool_events_complete": false},
 "tool_events": [{"event_id": "原始调用ID", "ts": "2026-09-01T10:00:00+08:00",
   "name": "edit", "status": "completed",
   "args": {"filePath": "/abs/path", "oldString": "...", "newString": "..."}}]}
```

接线纪律（违反会产生假信号）：

- `event_id` 沿用平台原始调用 ID，不用导出行号冒充；开始/结束快照合并为一条最终事件；父/子会话投影只保留原始归属
- `ts` 用带时区 ISO 时间；`args` 为 JSON 对象
- 拿不到的字段（run_id/branch_id/阶段/工具版本/存储身份/断言元数据）**保持缺省，不推断**；脚本会如实降级证据强度
- 多模型混用时不要把会话主模型填给所有调用；只有明确 `model_scope=single_model` 才允许回退
- 存储身份只有确知部署约定时才填：`storage_scope=shared_persistent` + `storage_namespace=实际挂载ID` + `storage_source=manifest`；路径长得像 skills/ 不算证据
- 用户的原始会话解析器继续用，只借鉴 `scripts/session_signals.py` 里 `tool_part_to_event()` 的字段映射

每次分析带一行口径：**dataset_id、时间窗、取样用户、组织层级、统计单位**。不同导出范围的数字不拼成同一总体。

### 2. 跑信号提取（单会话 / 多会话 / 多用户 / 多部门共用）

```sh
python scripts/session_signals.py sessions.jsonl \
  --dataset-id <数据集标识> --out <输出目录> --window-seconds 300
```

`--out` 目录须不存在。单会话就是只有一行的 JSONL；多用户/多部门就是更多行，无需切换模式。

输出六份文件（全部为观测/候选，不是结论）：

| 文件 | 内容 | 不能解读为 |
|---|---|---|
| `session_file_events.jsonl` | read/write/edit 操作、路径、存储身份、payload_hash+hash_origin | 磁盘最终状态；hash 不冒充完整文件字节 |
| `shared_path_candidates.jsonl` | 已知共享存储下"先修改后跨会话读"的候选 | 已确认复用；content_match/business_adoption 保持 unknown |
| `session_candidates.jsonl` | 同工具错后窗口线索（后续成功/未见成功/窗口不完整）、同参反复报错、question 复盘入口、shell 可能写文件复盘入口 | 自愈率、人工介入率、追问有害 |
| `capability_contacts.jsonl` | skill 加载/agent 分派调用及状态 | 能力效果；失败只归给该次加载/分派，不平摊下游错误 |
| `tool_metric_rows.jsonl` | 会话×工具×期间×模型等分区的 recorded_tool_error 分子/分母 | 生产缺陷率（断言元数据缺失时无法区分预期负例） |
| `task_map.jsonl` | 部门×任务类型×标签来源的会话数与已知用户数 | 部门人数（格子用户数不可相加） |

先看 `manifest.json` 的 coverage_counts 确认字段覆盖，再决定哪些信号可信。

### 3. 部门比较（多部门会话）

```sh
python scripts/compare_departments.py <输出目录>/tool_metric_rows.jsonl \
  --dataset-id <同上> --tenant-id <租户> \
  --org-a <部门A> --org-b <部门B> --out <比较输出目录>
```

产出 `comparison.md` + `comparison.json` + `slices.jsonl`：原始率、共同切片下同权重调整率、共同调用覆盖、逐格差异。

解读红线：
- 只在双方都有足够调用的**共同切片**内比较；没有共同切片输出 N/A
- **相近不等于部门无关；不同不等于部门造成**——用三状态表述：部分部门集中 / 共同切片相近 / 覆盖不足混杂未解
- 调整率是观察性描述，不是因果检验；`--gap` 只是挑选人工复盘的示例阈值
- 跨月比较固定切片定义与权重版本；两两比较权重不能用于多部门排序

### 4. 契约审计与校验器探针（委托式会话）

当会话是"主 Agent 委托子 Agent/Skill/工具"结构时（典型输入是 md_trace.py 的 trace_run）：

```sh
# 契约审计：回执字段/格式、交接配对、上游文档与派生物一致性、引用可解析、静态 Skill 检查
python scripts/contract_audit.py --trace-dir trace_run \
  --root workspace=/path/to/workspace [--root course=/path/to/course ...] \
  --profile my_profile.json --out case_audit

# 校验器探针：验收器会不会漏检目标（用例含故障注入副本，由你准备）
python scripts/probe_validator.py --validator /path/to/validate.py \
  --cases probe_cases.jsonl --out validator_probe
```

- profile 模板：`assets/audit_profile.example.json`——回执必填字段/值域、角色配对、一致性字段映射、引用检查、复核目标**全部在 profile 里声明**，脚本不含业务死逻辑；迁移业务时只改 profile
- 产出 `checks.jsonl`（逐条契约检查，pass/fail/unknown 分列）、`handoffs.jsonl`、`skill_contacts.jsonl`、`review_requests.jsonl`（**不带旧裁判结论**的语义复核请求）、`summary.json`
- 探针用例是人工构造的故障模式，`expect` 是人工声明；**探针结果不是生产误判率**
- 方法细节与信号表：先读 **references/contract_audit.md**；语义复核规则读 **references/review_rubric.md**

### 5. 从信号到评测题卡

从 `session_candidates` / `shared_path_candidates` / `checks.jsonl` 里挑真实摩擦点（同参反复出错、缺参数、重复追问、校验漏检、交接不一致），复制 `assets/bench_card.template.json` 填题卡。规则：

- 保留原始来源、输入截止点、任务家族（source_group）、验收条件；缺目标或可核对答案就保持 draft
- 后续修正/成功答案只进验收资料，不进题面；同任务家族不放分散到调参集和未见考试
- 一次小实验只改一个 Skill/Prompt/工具配置，用旧/新同题对照验收；3–5 道题只够走通流程，不支持全平台泛化结论

详细信号定义、解读边界、汇报口径见 references：

- **references/signal_definitions.md** — 每个信号的可确定观测、推理边界、分母、优先验证的改动（写报告前必读）
- **references/guardrails.md** — 实测纠偏清单（观测层 12 条 + 契约审计/探针 9 条"不能这么说"）与向上汇报的安全句式
- **references/contract_audit.md** — 交接契约审计方法、Agent/Skill/Tool 分层评估信号表
- **references/review_rubric.md** — 语义复核规则（按任务选 rubric，逐条证据不给总分）
- **references/bench_card.md** — 题卡字段说明与"信号→评测→小改动"循环步骤

### 6. 验证脚本本身

```sh
python scripts/make_demo.py <虚构输出目录>
```

生成虚构会话并跑通提取 + 部门比较，含内置断言。所有数字为虚构。

## 红线

1. 输出全部带 `state=candidate`；没有人工核实前不写"已确认复用/自愈/浪费"
2. 字节 hash 不跨类型匹配（write=输入参数指纹，read=输出指纹，edit=片段指纹，三者从不交集）
3. 磁盘扫描是瞬时快照，不代表会话发生时状态；verified 类标记需时间戳限定，否则保持 unknown
4. 不据对话风格推断人员能力或绩效；部门只用于场景定位和切片
5. 合成题、真实回放题、重建题分列比例；100% 合成的对照结论不外推
6. 契约审计的 pass 只表示契约层面满足；格式偏离、业务效果、缺少执行证据是不同问题，不跨属性算总通过率
