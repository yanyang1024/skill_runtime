# 任务包、回传与画像契约

主 agent 与 worker 在动手前都读本文件；字段变化必须双方同步。

## 任务包（主 agent → worker）

每个任务只对应一个 skill：

| 字段 | 说明 |
| --- | --- |
| task_id | 本次分析内唯一，如 `T-01` |
| skill_id | skill 唯一标识（默认取目录名；重名时由主 agent 加来源前缀消歧） |
| skill_path | skill 目录绝对路径；worker 只在此目录内读取材料 |
| output_profile | worker 必须写入的画像文件绝对路径（默认 `<输出根>/profiles/<skill_id>.yaml`） |
| materials_policy | 默认：枚举材料、先读 SKILL.md，再按本次目标读取相关引用/脚本；记录已读与未读覆盖 |
| batch_context | 本批计划数量与本任务序号；仅用于说明，不携带其他 skill 的结论 |

任务包必须自包含：不得依赖运行时自动继承主会话；仅使用委托中明确提供的输入与引用。内部 fork 是否附带上下文需单独验证。

## 回传（worker → 主 agent）

紧凑 JSON：

```json
{
  "status": "PASS | FAIL | BLOCKED",
  "task_id": "T-01",
  "skill_id": "example-skill",
  "summary": "一句话画像结论",
  "profile_path": "<画像文件实际路径>",
  "relationship_signals": [
    {"type": "depends_on | produces_for | shares_source | scenario_hint",
     "target": "目标 skill 名或数源描述",
     "confidence": "explicit | inferred",
     "reason": "依据简述"}
  ],
  "issues": [],
  "missing_inputs": []
}
```

- 回传前核对 `task_id`、`skill_id` 与本次任务一致；不一致由主 agent 按错配核实，不纳入正常完成。
- `summary`、`relationship_signals`、`issues` 保持简短；全文与证据在画像文件中，不回传大段材料。
- 状态语义：`PASS` 画像完成且写回检查通过；`FAIL` 已执行但画像不满足 schema 或检查未过；`BLOCKED` 无法定位/读取定义文件等，未产出有效画像。

## 画像 schema（worker 写入，YAML）

核心字段固定；skill 特有的补充维度放入 `extensions`。`abstract` 写数据无关的描述，`concrete` 写具体实现（含具体数据名、参数），二者都必填。

```yaml
skill_id: example-skill
location: <skill 目录路径>
status: PASS            # 与回传一致；材料有缺但分析完成时为 PASS + gaps
purpose: 一句话职责
triggers: [触发场景/适用条件]
scenarios: [业务场景]
data_side:
  sources:              # 数据来源清单
    - name: 具体名称
      kind: 文件 | 接口 | 数据库 | 人工输入 | 模型产物 | 其他 | 未知
      format: 格式（未知可省略）
      origin: 外部数源 | 其他skill产出 | 配置 | 未知
      abstract: 数据无关的角色化描述   # 例：外部原始记录
      evidence: <claim_id 或 文件#定位>
  processing:           # 数据处理逻辑
    - id: P1
      action: 获取 | 清洗 | 转换 | 聚合 | 校验 | 映射 | 其他
      abstract: 数据无关的过程描述
      concrete: 具体实现
      evidence: ...
  outputs:
    - name: ...
      kind: ...
      role: 中间产物 | 最终交付 | 判定结果 | 其他
      consumers: [已知使用方；未知写"未知"]
      evidence: ...
analysis_side:
  methods:              # 分析逻辑
    - id: A1
      family: 规则匹配 | 阈值判断 | 统计汇总 | 对比校验 | 模型推断 | 聚合归纳 | 其他
      abstract: 数据无关的方法描述
      concrete: 具体规则/参数/实现
      evidence: ...
  decisions: [产出结论/判定的形态]
dependencies:
  on_skills: [{target, relation: 显式引用 | 间接依赖 | 同源关系, confidence, reason, evidence}]
  on_sources: [{name, relation: 读取 | 生成 | 引用, evidence}]
  on_tools_models: [{name, purpose, evidence}]
constraints_assumptions: [前提、限制、假设]
gaps: [材料缺口或无法判定的项]
evidence_index:
  - claim_id: E1
    file: <材料相对路径>
    locator: 行号/章节/符号
    observation: 该证据支持什么
extensions: {}          # 可选：skill 特有维度
```

## 输出目录结构（约定）

```
<输出根>/
├── plan.yaml                 # 主 agent 派单前写出：来源、枚举规则、计划清单
├── profiles/<skill_id>.yaml  # 每个 worker 一个，互不冲突
├── analysis.yaml             # 主 agent 汇总的结构化结果
└── report.md                 # 主 agent 的最终报告（含 Mermaid）
```

输出根由使用者指定；未指定按 SKILL.md 的唯一运行目录约定。画像路径以经核对的任务包/回传为准。写入失败交主 Agent 调整，worker 不自行选择替代路径。

## 文件与证据定位

证据 `locator` 使用材料内稳定定位：行号（`L12-18`）、章节标题、代码符号名；跨文件写 `文件:L行`。无法定位时标"未定位"，不编造。

## 兼容扩展：编排接口画像

既有核心字段不变。在 extensions.orchestration 内按材料提取以下字段；未知标 unknown，所有重要接口附 evidence：

```yaml
orchestration:
  capabilities: []
  inputs: [] # 每项：name, required, semantic_role, format, fields, object_key, unit, time_scope, granularity, freshness, evidence
  outputs: [] # 每项：name, semantic_role, format, fields, object_key, unit, time_scope, granularity, quality_checks, evidence
  prerequisites: [] # 每项：target/input, kind(required/optional/conditional), condition, evidence
  side_effects: unknown # 已知时列出读写对象与操作；缺材料不写 none
  resources: [] # 必需工具、模型、授权与运行约束
  alternatives: []
  exclusions: []
```

worker 仅提取本份材料的接口，不判定其他 skill 是否真正匹配；主 agent 负责跨画像核对。新增字段为空时写 gaps，旧画像缺扩展时可针对本份材料补提取，不全量重做。

## 画像 v2 兼容补充

核心字段保留，新增 `schema_version: 2`；旧画像可用，但组合所需扩展缺失时只补相应字段。分析 ID 与实际 frontmatter name 分开：`skill_id` 用于证据消歧，`extensions.runtime_name` 为真实加载名，不能把来源前缀 ID 直接写入 skill 白名单。同名多来源必须确认目标运行时发现的是哪一份。

记录 extensions.materials：已读文件、未读文件及原因、来源版本/可取得的指纹；不能凭路径相同断言画像仍有效。画像中运行状态与建议分开，不将材料声称的行为标为已验证。

画像均提取 extensions.skill_behavior（见 skill-semantics.md）。`extensions.orchestration` 的输入输出允许语义型契约；格式、单位等不适用字段可标 not_applicable，unknown 列入 gaps，不靠填充完整 schema 编造细节。

任务包可新增 `analysis_goal`、`required_dimensions`、`method_root`；method_root 仅供定位已授权的分析方法，不扩大被分析对象范围。output_profile 必须位于允许输出根，输出根不得落在被分析 Skill 内。主 Agent 按任务唯一标识分配路径，验证回传路径归属后读取，不直接信任任意路径。

## 缺口与提问候选（兼容扩展）

旧回传的 missing_inputs 继续有效。可添加 clarification_requests 数组，每项包含 id、topic、needed、affects、evidence；有合理选项时增加 options 和 suggested_default，没有依据则省略。topic 可为 delegation / material / business_decision / environment / scope。它是发给调用方的缺口记录，不是直接发送给用户的问题。

例如：`{"id":"Q-1","topic":"business_decision","needed":"确认两个材料中冲突的合格阈值口径","affects":["生成可执行的合格判定规则"],"evidence":["rules.md#阈值","SKILL.md#判定"]}`。如本次仅画像，仍可 PASS 并同时记录双方证据与此缺口；如委托要求确定判定口径而材料无法确定，则相关目标 BLOCKED。

primary 先补委托/读材料/判断是否可延后，再决定 question。问题答复按影响范围合并入现有事实，不要求重跑无关画像。不得把同一业务输入缺失复制成多个用户问题。
