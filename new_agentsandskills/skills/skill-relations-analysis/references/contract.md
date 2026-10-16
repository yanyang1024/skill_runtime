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
| materials_policy | 默认：读取 skill_path 下全部材料，`SKILL.md` 必读；大脚本、二进制按需 |
| batch_context | 本批计划数量与本任务序号；仅用于说明，不携带其他 skill 的结论 |

任务包必须自包含：worker 不继承主会话上下文，不得假设能看到其他任务的输入或结果。

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

输出根由使用者指定；未指定时主 agent 先询问，无法询问时使用 `<当前工作目录>/skill-relations-output/` 并明确说明。画像读取以回传中的 `profile_path` 实际值为准，不以假设路径为准。若运行时无法写入 `profiles/` 子目录，worker 改写到输出根下平铺的 `profile-<skill_id>.yaml` 并在回传中说明实际路径。

## 文件与证据定位

证据 `locator` 使用材料内稳定定位：行号（`L12-18`）、章节标题、代码符号名；跨文件写 `文件:L行`。无法定位时标"未定位"，不编造。
