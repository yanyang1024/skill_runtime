# 产出格式：report.md 与 analysis.yaml

结论引用统一写作 `[profile:<skill_id>#<claim_id>]`，便于回溯。

## report.md 结构

固定以下九节（内容按实际裁剪，节名保持）：

```markdown
# Skill 关系分析报告

## 1. 分析范围与执行情况
来源、数量、覆盖（完成/失败/阻塞/未回传）、输出位置。

## 2. Skill 总览
表格：skill_id | 一句话职责 | 主要场景 | 状态。

## 3. 关系图谱
Mermaid 图 + 边清单表（边类型、confidence、依据引用）。

## 4. 共性分析
簇清单：名称、成员、共享不变量、变体、证据引用。

## 5. 差异分析
独有条目与同模式不同实现对照。

## 6. 抽象逻辑层
模式目录（处理/分析）+ 数据角色映射表。

## 7. 场景依赖链
时序链 / DAG 描述，标注确证与推断。

## 8. 缺口与待确认
阻塞项、ambiguous 边、材料缺口。

## 9. 证据索引
各画像文件路径与关键 claim_id 对照。
```

## Mermaid 约定

- 节点 id 用 skill_id；展示名可加中文标签。
- 两张图：skill 关系图（边按类型区分——实线 = explicit，虚线 = inferred，点线 = ambiguous）；数源-skill 二部图（数源按数据角色分组标注）。
- 十几到几十个节点可读性可控；边过密时按边类型或场景族拆图，并说明拆分方式。

## analysis.yaml 结构

```yaml
meta:
  source_root: ...
  output_root: ...
  enumeration_rule: ...
  plan_count: 0        # 与 plan.yaml 一致
  pass_count: 0
  fail_count: 0
  blocked_count: 0
  missing_count: 0
  generated_at: ...
skills:
  - {id, path, status, profile, purpose, scenarios}
data_roles:
  - role: 原始输入
    description: ...
    members:
      - {skill: ..., source: ..., note: ...}
edges:
  skill_skill:
    - {from, to, type, confidence, reason, evidence}
  source_skill:
    - {source_role, source, skill, relation: consumes | produces | references, confidence, evidence}
  source_source:
    - {a, b, relation: same_origin | derived | coupled | other, confidence, evidence}
clusters:
  - {id, name, basis: data_role | processing | analysis | scenario, members, shared, variations, evidence}
patterns:
  - id: ...
    kind: processing | analysis
    name: ...
    abstraction: ...
    input_roles: [...]
    logic: ...
    trigger: ...
    implementations:
      - {skill: ..., concrete: ..., deviation: ...}
    evidence: ...
chains:
  - {id, steps: [skill...], description, confidence}
gaps:
  - {type, subject, description, needed}
```

字段可以新增；删除或改名必须两端同步。写完后读回核对 YAML 结构、键完整性与引用可回溯性。
