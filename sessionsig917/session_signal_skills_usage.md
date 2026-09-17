# 五个会话信号与 Harness 评测 Skill：使用说明

适用场景：在公司内网，复用已有会话采集/解析程序，逐步完成信号观测、问题诊断、评测集整理、改动对照和经验筛选。先按需使用，不要求每批会话跑完整流程。

## 导航

1. 包内文件与运行方式
2. 五分钟离线试跑
3. 五个 Skill 分别怎么用
4. 阶段之间如何交接
5. 选一个真实问题跑通
6. 常见问题与当前边界

## 1. 包内文件与运行方式

| 路径 | 用途 |
|---|---|
| README.md | 阅读入口 |
| session_signal_skills_usage.md | 本说明：命令、输入输出、调用示例 |
| session_signal_skills_design.md | 前一版设计依据、代码修正和证据边界 |
| session_signal_practical_advice.md | 结合你的多轮实践给出的取舍和实验建议 |
| skills/session-observe/ | 会话观测 |
| skills/harness-diagnose/ | Harness 问题诊断 |
| skills/eval-curate/ | 评测集整理 |
| skills/harness-compare/ | 改动对照与 Judge |
| skills/experience-screen/ | 经验候选筛选 |
| MANIFEST.json | 包内文件清单与内容 SHA-256，便于核对版本 |

每个 Skill 都保留 SKILL.md、scripts、references、assets 和 agents 元数据。包中的五份 Skill 来自上一轮已保存版本；本轮增加外部使用说明与建议，不改变其行为。

两种使用方式：

- **让 Agent 使用**：把所需 Skill 子目录放进你平台实际扫描的 Skill 目录，保留 SKILL.md 与相对目录。安装位置以公司部署配置为准；例如只有在平台已支持项目级 `.opencode/skills/` 时，才复制到那里。也可以先让 Agent 直接读取指定 SKILL.md，按其中步骤处理。
- **直接调用脚本**：不安装 Skill，也可以执行以下 Python 命令。示例命令均从解压后的包根目录运行；绝对路径按内网环境改写。

五个 Skill 是五套操作指南，不等于要建立五个常驻 Agent。日常可由同一个分析 Agent 按阶段加载；生成修复方案与最终评判采用隔离上下文。`agents/openai.yaml` 是界面元数据，不是 OpenCode 的业务 Agent 配置。

依赖只有 Python 标准库。建议 Python 3.11 或更新版本；本次演示环境为 Python 3.12。示例使用 Bash 路径写法，无 Docker、数据库服务或 pip 安装要求。只有 Judge 的显式执行需要内网模型端点；校验器探针会执行你指定的程序。

## 2. 五分钟离线试跑

先用虚构数据熟悉输出：

```sh
python3 skills/session-observe/scripts/make_demo.py work/demo-001
python3 skills/harness-compare/scripts/judge_v1.py \
  skills/harness-compare/assets/judge_jobs.example.jsonl \
  --model OFFLINE_EXAMPLE --out work/judge-requests-001.jsonl
```

第一条生成虚构会话、文件/能力候选、部门比较、标签审计与边界卡。第二条只生成待发 Judge 请求，不联网、不产生模型判断。

先打开 `work/demo-001/signals/manifest.json`、`shared_path_candidates.jsonl`、`session_candidates.jsonl`，再看 `work/judge-requests-001.jsonl`。观察 unknown、证据引用和输入缺口的保留方式。它们验证流程形态，不能用于价值汇报。

输出目录/文件需要新名称，复跑换成 demo-002、judge-requests-002，避免覆盖和混淆旧结果。

## 3. 五个 Skill 分别怎么用

### 3.1 session-observe：先确定看到了什么

**给 Agent 的调用示例：**

> 使用 session-observe 分析这批会话。先报告字段覆盖，再列工具、Skill、Agent 和文件信号。保留普通随机样本及异常定向样本，分别记录采样目的；输出少量可回到原文的诊断候选。部门用于切片，阶段未知时不要猜成开发或生产。

有两种入口，不能直接混用：

| 输入 | 命令入口 | 输出含义 |
|---|---|---|
| 与已提供样例相同格式的 OpenCode Markdown | md_trace.py | 导出中的工具事件、消息与覆盖；缺状态保持未知 |
| 你适配后的标准 session JSONL | session_signals.py | 文件接触、能力接触、序列候选、指标行与任务分布 |

```sh
python3 skills/session-observe/scripts/md_trace.py \
  /data/session-a.md /data/session-b.md --out work/trace-001

python3 skills/session-observe/scripts/session_signals.py \
  /data/sessions.jsonl --dataset-id study-001 --out work/signals-001
```

标准 JSONL 每行一个会话。下面仅展示字段形态，不是真实平台记录：

```json
{"tenant_id":"tenant-demo","session_id":"s1","dept":"DEPT_A","user_id":"u1","task_type":"unknown","coverage":{"tool_events_complete":false},"tool_events":[{"event_id":"s1:call1","ts":"2026-09-01T09:00:00+08:00","name":"read","status":"unknown","args":{"filePath":"/workspace/spec.md"}}]}
```

适配时优先映射原始调用 ID、时间、工具名称及 state.input/output/error/status。`tool_part_to_event` 是适配示意，不是通用平台连接器。先合并同一调用的开始/结束快照；父子会话投影不要重复计数。若原始 ID 只在会话内唯一，可用 session_id 与原 ID 组成键，并另存原 ID。

缺字段不补成 0/成功/完整。共享文件候选要求已确认的租户、storage_namespace、storage_scope 与来源；仅凭看起来相同的路径不会生成确认复用。

主要输出：

| 文件 | 看什么 |
|---|---|
| manifest.json | 会话与调用覆盖、哪些字段缺失 |
| capability_contacts.jsonl | Skill 加载尝试、Agent 委派及记录状态 |
| session_file_events.jsonl | read/write/edit 接触、payload hash 的来源 |
| shared_path_candidates.jsonl | 已知共享存储中的跨会话写后读候选 |
| session_candidates.jsonl | question、疑似 shell 写入、错误后的同工具调用等候选 |
| tool_metric_rows.jsonl | 分母明确的调用指标行，供部门比较 |
| task_map.jsonl | 已有任务标签的分布，不自动创造可信标签 |

MD 入口的 `events.jsonl` 不是标准 session JSONL，不要直接交给 session_signals。它可以直接给 harness-diagnose 的契约审计使用。

可选：对部门标签做口径映射时，用 `label_audit.py` 与 `assets/label_adapter.example.json`；它需要会话摘要，不是原始工具事件。比较部门时可用：

```sh
python3 skills/session-observe/scripts/compare_departments.py \
  work/signals-001/tool_metric_rows.jsonl \
  --dataset-id study-001 --tenant-id tenant-demo \
  --org-a DEPT_A --org-b DEPT_B \
  --by period task_type model tool phase origin tool_version \
  --out work/dept-001
```

所有维度都 unknown 时，即便被放进同一桶，也不代表控制住了这些因素；此时只读描述性输出。字段稀疏可以减少分层，但要同时声明失去哪些可比条件。

### 3.2 harness-diagnose：把热点变成具体待改位置

**给 Agent 的调用示例：**

> 使用 harness-diagnose 复盘候选 P001。结合原会话、相关 Agent/Skill 文件和产物快照，区分事实、原因假设和其他解释。优先定位一个函数、参数、交接模板或规则；输出一个小改动、一个正常反例，以及如何验证。不把当前快照当作历史加载版本。

先参考 `assets/audit_profile.example.json` 写自己的 profile：角色名、回执字段、字段映射、材料根目录与必要验收都由你配置。示例中的课程角色不能直接作为其他业务的默认值。

```sh
python3 skills/harness-diagnose/scripts/contract_audit.py \
  --trace-dir work/trace-001 \
  --root workspace=/data/workspace \
  --root course=/data/course \
  --profile /data/audit_profile.json --out work/audit-001
```

输出 `checks.jsonl`、`handoffs.jsonl`、`skill_contacts.jsonl`、`review_requests.jsonl` 和 summary。它们是契约检查与复核材料，不是 Harness 总分。

需要检查校验器自身时，先读 `references/probes.md`，在隔离副本准备正常、缺目标、错误目标等用例，再运行：

```sh
python3 skills/harness-diagnose/scripts/probe_validator.py \
  --validator /data/reviewed_validator.py \
  --cases /data/probes.jsonl --out work/probes-001
```

探针按本版协议读取单行 JSON 报告与退出码；你现有校验器协议不同就改适配器。它不是通用沙箱，不执行从日志里自动挖出的任意命令。

最后由分析 Agent/人工整理 `diagnosis.json`：问题 ID、证据、原目标、事实、原因假设、替代解释、修改位置、一个小改动、反例和待验证项。脚本不自动证明根因。

### 3.3 eval-curate：把可解释的案例变成可复跑题

**给 Agent 的调用示例：**

> 使用 eval-curate 整理这些已复核案例。保留初始输入截止点、附件版本、验收要求和材料家族；缺输入或人工确认的留 draft。同一材料的衍生题不得跨用途；输出类型覆盖缺口，不为凑比例拆家族。

先参考 `assets/case.example.json` 制作每行一题的 `/data/reviewed_cases.jsonl`。该模板默认 draft、reviewer_verified=false，是待填写模板；直接运行只会产生草稿，不能靠改一个布尔字段制造金标。

```sh
python3 skills/eval-curate/scripts/build_eval_sets.py \
  /data/reviewed_cases.jsonl --out work/eval-001 \
  --ratios 0.6 0.2 0.2 --seed 17
```

主要输出：`drafts.jsonl`、`diagnostic.jsonl`、`selection.inputs/private.jsonl`、`holdout.inputs/private.jsonl`、manifest。真实文件名分别如 `selection.inputs.jsonl` 和 `selection.private.jsonl`。

- diagnostic 给修复者分析；selection 用于候选筛选；holdout 用于最后独立验证。
- source_group 需反映共同任务/材料/派生资产，脚本不自动发现所有语义重复。
- 更新时 `--previous-manifest work/eval-001/manifest.json` 保留旧家族分配。
- 少量家族可用 `--assign /data/group_assignment.json` 明确分配，例如 `{"family-a":"diagnostic","family-b":"holdout"}`；允许某用途暂时为空并报告。
- public/private 分文件不提供访问控制；运行器需要真正限制修复 Agent 的访问范围。

### 3.4 harness-compare：先约定验收，再比较版本

**给 Agent 的调用示例：**

> 使用 harness-compare 对照同一批冻结任务的新旧版本。先核对输入、模型、环境、实际加载版本和尝试次数，再运行规则检查；仅对规则覆盖不了的承诺调用 Judge。逐题列改善、退步和未知，报告缺少哪些运行或校准证据。

先复用公司现有 Agent 运行器产生 baseline/candidate。该 Skill 不负责重放完整 Agent；v1 文本调用不能替代有工具、状态与产物的真实执行。

参考 `assets/plan.example.json` 冻结题目、重复数和必要条件；参考 `references/judge_io.md` 组装 runs.jsonl。示例计划不是可直接放行的生产配置。

Judge 有 outcome / coverage / fidelity / process 四个模板。先选最需要的一项，使用 `assets/judge_jobs.example.jsonl` 的结构：goal、criterion、evidence、artifacts，以及 case_id/job_id/dimension/mode/repeat_id。

```sh
# 模板检查：只生成请求
python3 skills/harness-compare/scripts/judge_v1.py \
  /data/judge_jobs.jsonl --model YOUR_JUDGE --out work/judge-dry-001.jsonl

# 内网实际执行：由你设置端点；需要鉴权时在环境中注入 JUDGE_API_KEY
export JUDGE_BASE_URL='https://your-internal-endpoint/v1'
python3 skills/harness-compare/scripts/judge_v1.py \
  /data/judge_jobs.jsonl --model YOUR_JUDGE --execute --out work/judge-results-001.jsonl

# 用独立人工标签校准 Judge；不把 gold 文件发给 Judge
python3 skills/harness-compare/scripts/calibrate_judge.py \
  /data/gold.jsonl /data/meta_judge_results.jsonl --out work/calibration-001.json

# 运行器结果与计划已经整理好之后再汇总门控
python3 skills/harness-compare/scripts/compare_runs.py \
  /data/runs.jsonl --plan /data/plan.json --out work/gate-001.json
```

接口不支持某参数时显式选择 `--omit-temperature` 或 `--token-field max_completion_tokens`；支持结构化输出时可选 `--json-mode object` / `schema`。默认 none 仍有本地结构校验。超预算不静默截断。

重要交接：Judge 输出的 `decision` 要映射为运行记录中 `judges[dimension].result`；带上 status 与 judge_config_hash。校准报告的 `groups` 需按维度/配置指纹核对后放入 plan 的 judge_calibration。二者目前不是自动 join，详见 judge_io.md。A/B winner 不能映射成绝对 pass。

`compare_runs.py` 当前针对**固定模型的 Harness 对照**：模型/环境/输入必须相同，加载的 Harness 版本不同且有证据。换模型实验需要另定对照计划，不能伪造相同 model_id 来通过检查。

规则足够时，可在真实计划中将 judge_dimensions 设为空数组；仍需有效 required_checks。必要语义验收不能为了放行而删除。eligible_for_review 只表示本轮必要条件满足，不证明普遍增益或授权上线。

### 3.5 experience-screen：把结论变成有条件的候选经验

**给 Agent 的调用示例：**

> 使用 experience-screen 检查这批经验候选。核对内容来源、适用条件、验证与反例；区分具体案例和通用规则，列出冲突及复查条件。只输出候选，不修改现有 Agent、Skill 或长期记忆。

参考 `assets/experience.example.json` 制作候选 JSONL。`content_origin_splits` 表示经验内容从哪里来；`validation_refs` 表示哪些评测验证了它，二者不要混用。

```sh
python3 skills/experience-screen/scripts/screen_experience.py \
  /data/experience_candidates.jsonl --out work/experience-review-001.jsonl
```

输出 candidate_playbook / candidate_case_memory / counterexample_archive / conflict_review / needs_review / restricted_evaluation_only。所有输出 active=false；包含 selection/holdout 题目答案的内容不复制进普通经验文件。

一次失败可留为反例；一次成功不能自动变成全局操作指南。human_verified、verified_effect 必须来自已有记录，脚本只能检查声明字段。

## 4. 阶段之间如何交接

| 从哪里到哪里 | 当前需要做的整理 |
|---|---|
| 原始平台 JSON → observe | 用自己的 adapter 映射标准 session JSONL；不要重写平台采集器 |
| observe → diagnose | 选少量问题链，补原始证据、适用配置和快照；MD trace 可直接审计 |
| diagnose → curate | 整理初始输入、验收、材料家族，并复核可复跑性 |
| curate → compare | 公司运行器执行两组任务；组装规则报告、Judge jobs 与 runs |
| compare → screen | 人工/分析 Agent 提炼有条件的经验，引用验证结果 |
| screen → 工程实施 | 沿公司已有修改、评审、发布与回滚流程处理 |

这是一套可组合的参考组件，尚不是全自动流水线。最值得你补的连接代码，是围绕自己已有 JSON 格式的薄适配与关联；无需先增加服务和数据库。

## 5. 选一个真实问题跑通

建议先选“校验器未检查到目标但报告通过”：

1. observe 定位可疑会话；diagnose 找到具体校验器调用和目标。
2. 确认程序实际行为；构造正常、缺失、未索引目标几个独立夹具。
3. curate 记录来源与预期；修复者已看到的题属于诊断/回归材料。
4. 在允许修改的范围内修一处实现；无权限时，交付失败复现、建议补丁位置和验收用例。
5. compare 检查旧/新校验器结果、正常任务是否退化；这个问题可能完全不需要 LLM Judge。
6. screen 保存适用版本、缺目标处理约定与复查触发。

有了这一条闭环，再试材料保真或 Agent 交接等语义问题。无需先精读满 500 条才能开始。

## 6. 常见问题与当前边界

| 现象 | 应如何理解/处理 |
|---|---|
| MD 有很多 tool call，错误率却未知 | 导出缺 runtime 状态；补原始 JSON，不按输出关键词冒充调用状态 |
| 复用候选为 0 | 核对命名空间、时间、采集范围；不能直接说没有复用 |
| Skill load 多、invoke 少 | 纯说明型 Skill 不要求独立 invoke；先确定其使用契约 |
| 后面出现一次成功调用 | 未必恢复了前面同一问题；缺关联时保持序列候选 |
| 部门比较共同范围很小 | 输出覆盖和描述性分布，优先看部门内可行动热点 |
| 缺少持续人工复核资源 | 缩小语义自动判断范围，保留待复核；优先覆盖明确程序断言 |
| 校准有高 kappa | 还要看有效覆盖、类别分布、错误放行、哨兵和稳定性 |
| 新版全部通过 | 只对本批题与已冻结环境成立；通过不自动成为金标或生产配置 |
| 想开始小模型训练 | 先稳定标签与评测；错误分类/路由等窄任务更容易验证 |

本包不包含内网密钥和完整业务数据。既有三份真实会话的解析结果、边界夹具和本地 mock 只验证示例代码；真实业务收益与 Judge 可信度需要你在内网确认。
