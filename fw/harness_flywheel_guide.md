# 用实际会话评估 Agent、Skill、Tools：从“调用了”走到“哪里值得改”

**你这组数据最适合用“交接契约 + 产物验收 + 小范围对照”评估 Harness。** 已有 job card、文件路径、结构化回执和 Python 校验器，不需要先建完整 run/step 平台，也不需要把所有会话交给大模型打总分。

这一版沿用前面的信号飞轮，增加 `case_eval/` 三个 Python 入口、语义复核规则和评测种子。完整参考包为 `harness_flywheel_starter.zip`，从 `case_eval/README.md` 进入。最短流程：`md_trace.py` 解析会话 → `audit_maic.py` 对照交接和产物 → `probe_validator.py` 检查验收器是否会漏检。

## 1. 先把这几份材料放回各自的任务阶段

| 材料 | 实际看到了什么 | 可评估范围 |
|---|---|---|
| session-ses_f650.md | 先生成 AGENTS.md；后显式加载 doc-reshaper，确认读者/范围/输出位置，制作教学 HTML | Skill 触发、参考读取、条件澄清、改写与交付线索 |
| session-ses_f64e.md | Course-Director 调度材料分析、14 个 builder、14 个 verifier，构建课程；后切换 Build 修描述并启动服务 | Agent 交接、回执、验收覆盖、阶段切换与后续修正 |
| session-ses_f64b.md | 分析课程文件关系，检查可迁移性，随后获用户要求修路径约定 | 环境定位、合同/示例修正，以及工具是否验证这些修正 |
| maic-workspace.zip | 4 个 Agent、4 个 Skill、PROTOCOL/DSL、5 个 Python 工具 | 静态契约与本地工具行为；不是历史实际加载版本的完整证明 |
| interfaces-protocols.zip | 14 个 job、14 个场景、站点及材料、大纲 | 当前产物快照与跨文件一致性 |
| input.zip | 三份技术手册及 README | 材料来源与保真评测输入；没有最初那份完整 HTML 文件 |
| agents-creator.zip | 单独的 Agent 创建助手与 Skill | 静态一致性和未来评测题；本次没有它的运行会话 |

三份会话共解析到 **171 个工具调用文本块，171 个 Input 均可解析为 JSON**。这是本次导出范围的计数，不是完整运行轨迹：f64b 为 53，f64e 为 89，f650 为 29。每份都有 3 个用户消息，但同一会话里任务和活动 Agent 会变化，不能用一个全局标签评价全部行为。

特别要避免：把 f64e 后段 **Build** 模式的修改，判成 Course-Director 越权；把 f650 的 doc-reshaper，套上 MAIC 工作区的规则；把这三个共享材料的会话当成三个独立业务成功样本。f64b 记录的后续合同修正与上传 ZIP 中的旧内容也不完全相同，历史诊断必须绑定当时的源版本。

## 2. 这次最有行动价值的发现

| 发现 | 证据与边界 | 建议先改什么 |
|---|---|---|
| **校验通过可能没有检查目标场景** | f64e 多个 builder 回执指出 stage.scenes 尚空，另用 `--file`；本次在副本中放入错误场景，`--course --scene` 仍返回 errors=0，`--file` 则拒绝 | 单场景交付先直验指定文件；校验报告增加实际目标和检查数量 |
| **大纲改了，job 没同步** | 最终 ZIP 中 s5、s12 的 outline.description 与 job.outline_item.description 不同 | 修改 outline 后重建受影响 job；或保留旧 job 但明确其版本与失效状态 |
| **29 个回执都能恢复出 JSON，但都不满足裸 JSON 契约** | 去掉 task 包装后仍有代码围栏或额外文字；最小字段检查均通过 | 若机器直接消费，做明确的回执归一化/结构化输出；格式问题不算业务失败 |
| **14 个场景有 builder/verifier 配对** | 主会话看到 14 个生成委托与 14 个检查委托；verifier 声称 12 pass、2 warn | 保留该正向编排证据；补子会话或校验报告指针，才能验证实际检查过程 |
| **两个 warn 找到了结构校验看不到的问题** | s5、s12 的描述承诺宽于实际出题范围；之后用户要求修正 | 把“目标—考查位置”映射加入 quiz-authoring 与 verifier rubric |
| **doc-reshaper 的方法接触可追溯** | 显式 skill 加载；保真检查/HTML 排版/模板参考有读取结果；初次 HTML 写入有相关附录字样 | 进一步抽少量主张查保真，区分“流程接触”与“方法有效” |
| **首次委托前主会话已读入大量材料** | f64e 第一次 task 前有 35 个工具事件，其中 read 23 次；工具输出约 238,553 字符 | 作为上下文精简候选，测试主 Agent 只读目录、合同摘要和抽样片段的方案 |

最后一项是**导出文本字符数**，不是 token、重读量或可节省成本。材料接触可能有合理目的，不能只凭长就判浪费。

job 描述不同也不说明已发布站点损坏：如果 job 本来用于保留历史生成输入，应该保留旧版本并标清。需要拦截的是把它继续当成“当前大纲对应的任务包”使用。本版一致性检查暴露字段差异，是否触发重建取决于你的版本约定。

两个关键来源定位：f64e 的 builder s5 回执从工具事件行 8049 开始，明确说明 `--course` 未遍历到场景；verifier s5/s12 的事件在 8558/8842 行。修订 outline 的两个 edit 在 9985/10001 行，随后调用 assemble/build，最终 ZIP 的 job 仍保留旧描述。脚本输出完整源文件 SHA-256 和行号，方便你回到证据。

### 校验器的小实验实际说明了什么

本次只对上传的 `course_validate.py` 做了 5 个临时副本探针：

| 探针 | 本次结果 | 应怎样解释 |
|---|---|---|
| 原始完整课程 | exit 0，errors=0 | 当前结构规则通过；未证明内容、视觉或交互全部正确 |
| stage.scenes 为空，磁盘上目标场景故意写坏，按 `--course --scene` 检查 | 仍 exit 0 | 没有检查到目标却返回 pass，确实是验收目标漏洞 |
| 同一个坏场景直接 `--file` | exit 1，errors=1 | 校验器能识别该结构错误，问题在目标选择而非所有校验失效 |
| 请求不存在的 scene id | 仍 exit 0 | 应有“目标不存在/检查对象为 0”的显式结果 |
| materialRefs 指向不存在的材料 | 仍 exit 0 | 当前结构校验未覆盖材料存在性；应由 job preflight 补上 |

这不是“工具误判率 60%”：样例是刻意挑选的故障模式，分母不是生产请求。材料引用检查也不必硬塞进 HTML 校验器；先让每个阶段的检查职责清楚。

几个 builder 已主动绕到 `--file`，所以不能反过来说“14 个场景都没被检查”。主会话回执不足以复算每个子会话的执行过程；原始完整课程在本次直跑中确实通过了该结构校验器。

## 3. Agent：主要评估交接和决策，不按 persona 名字打分

以**一次明确委托**为单位，优先保留以下信号：

| 信号 | 确定性部分 | 需要推理/额外证据的部分 |
|---|---|---|
| 任务包完整 | builder 有 job 路径；字段存在；路径可解析；类型/输出一致 | 材料是否足以完成目标、是否含多余上下文 |
| 回执可消费 | 能否解析、必需字段、status/verdict 值域、内部矛盾 | notes 是否如实、结果是否真的满足任务 |
| 交接覆盖 | 同一主会话同一 scene 有 builder 和 verifier；子会话 ID 可绑定 | 是否真正独立上下文、是否只读、是否做了所声称检查 |
| 修改传播 | outline、job、scene 的相关字段/版本一致 | 本次变更应该重建哪些派生物 |
| 失败/告警分流 | fail 后是否还被当 pass；warn 是否保留并汇总 | 警告应修目标、补产物还是改检查器 |
| 主上下文负担 | 首次委托前读取次数、导出字符量、回传长度 | 缩减后能否保留决策质量、降低实际 token/耗时 |

当前 task 包装里**确实有 child session id**，应先复用它；不必为了统一字段再发明 branch_id。下一步能低成本补的，是把这个 ID 与子会话导出关联起来。没有子轨迹时，`child_actions_observed=false`，不要填 0 次读写再推断子代理没有工作。

回执可以收敛成很小的机器契约：

```json
{
  "status": "done",
  "artifact_path": "courses/demo/scenes/s1.json",
  "artifact_sha256": "实际文件哈希",
  "validation_report": "reports/s1.check.json",
  "notes": []
}
```

`validation_report` 由校验工具或运行器生成，至少含 scope、requested_target、checked_targets、checked_count、artifact_sha256、validator_version、errors。Agent 回传报告路径；不要让它自己填写 errors=0 作为唯一证据。报告哈希/字段一致只解决可追溯性，实际执行证据仍最好来自运行器。

格式修复值得做，但没必要为去掉围栏增加一个大模型。先严格解析；只有一个明确 JSON 对象时可规则恢复并记录 `normalized=true`；多个候选、字段缺失或相互矛盾就退回。当前全部可恢复，说明格式适配比“29 次业务失败”更准确。

## 4. Skill：从“被加载”走到“改变了关键行为”

建议分三格展示：**接触到方法 → 在产物/过程里有对应证据 → 对照后确有收益。** 三格不相加为一个分数。

| Skill | 本次能确定的证据 | 最值得构造的评测 |
|---|---|---|
| doc-reshaper | skill 工具加载；必读参考文件读取；附录字样存在于初次 HTML 写入 | 从原文选数值、否定、限定、因果主张，看改写是否保留；另造删限定的负例 |
| course-planning | job/outline 字段与材料引用可检查 | 目标覆盖、路径基准、变更后 job 同步、只生成必要场景 |
| quiz-authoring | 两个 quiz 任务指向该 Skill；产物可读 | 逐个学习目标映射到题干/选项/解析，检测过度承诺与未考查内容 |
| interactive-authoring | 11 个 interactive job 指定了该 Skill；场景与 site 存在 | 控件、reset、消息桥在真实宿主中可运行；模拟结果不被包装为真实测量 |
| pbl-design | s14 的任务和产物可用 | 材料是否真可见、是否有真实决策、完成条件是否可判断 |
| agents-creator | 只有静态配置与方法文档 | 实际可加载性、单 primary 默认、产物权限/职责一致；本次运行效果 unknown |

MAIC 主会话里没有 `skill` 工具调用，不等于这些 Skill 未被用过。主 Agent 有 read 接触，job 指定了 skill_ref，子 Agent 被要求读取；但**被要求读取 ≠ 已观察到子 Agent 读取**。本版分别输出 `skill_contacts` 与 `skill_declared_for_scene_type`。

对语义评测，最小单位可以是一项承诺：

```text
criterion: “检验序列化知识”
expected_source: 冻结的 job.outline_item.description
observed_location: 题干 / 选项 / 解析旁注 / 未找到
result: covered / partial / missing / unknown
```

这比“quiz 质量 8 分”更容易驱动修改。`review_rubric.md` 已给出参考提示，`audit_maic.py` 会生成 s5/s12 两条复核请求，**不带旧 verifier 的结论**，避免新裁判照抄旧答案。

同样，保真附录存在不证明文本保真；原文保真也不证明原文本身事实正确。三份技术手册中的版本、价格和产品状态，本次没有逐条核查，不能直接沉淀成领域事实金标准。

### 单独那组 agents-creator 的静态提醒

上传目录是 `skills/agents-create/`，frontmatter 与调用名则是 `agents-creator`。当前 [OpenCode 官方 Skill 文档](https://opencode.ai/docs/skills/)要求 name 匹配包含 SKILL.md 的目录名。这是一个应先做加载探针的候选；内网分支如果允许别名，以实际加载行为为准。本次没有运行失败证据。

两套权限模板也应按版本核对：MAIC 的 builder/analyst 写 `edit: deny`、`write: allow`；creator 文档要求用 edit 统一控制写入。当前 [官方权限说明](https://opencode.ai/docs/permissions/)把 edit/write/patch 的修改权限归在 edit，并称旧 tools 布尔配置仍有兼容支持。因此 creator 文档中“tools 一定静默无效”的说法不宜作为跨版本金标准。

最小处理是在一个临时测试目录，通过**你实际运行的 OpenCode 分支**检查一次“允许的目标能否写、禁止的目标能否写、Skill 能否加载”。不要因为静态文本看起来严格就宣布权限已生效；也不要把宽松默认基线当成所有 Agent 的最佳配置。bash: allow 下的写入边界也需要实际验证。这里不要求先建完整权限系统。

## 5. Tools：同时测函数结果和“检查有没有用”

原生 bash/read/edit 负责访问；`course_validate.py`、`course_scaffold.py` 等是 bash 背后的实际能力。优先按**脚本/子命令/阶段/目标**定位问题，而不是给 bash 汇总一个失败率。

| 工具 | 简单、可证伪的评测 |
|---|---|
| course_validate | 指定目标真的被检查；坏例被拒；合法例被接受；报告与退出码一致 |
| course_scaffold jobs | 材料/Skill/输出路径基准一致；目标存在；从同一 outline 生成的字段一致 |
| course_scaffold assemble | 最終清单符合预期场景集合；不能因为只扫到已存在文件就悄悄少交场景 |
| extract_material | 摘录有来源；代码、表格、否定和限定未因解析丢失；不支持格式明确报告 |
| build_player | 站点包含应有场景；目标页可打开；错误不被构建成功消息掩盖 |

先改最小缺口：单场景生成后用 job 指定的 output_path 调 `--file`，同时核对 id/type/stageId；整课装配后再用 `--course`。给 `--scene` 分支增加“未找到指定对象则报错”，不要把 0 个被检查对象当成功。

启发性接线：

```python
# 伪代码：复用现有工具，新增报告字段。不是本包已经接入的运行器。
target = resolve_from_job(job, workspace_root)
assert target.exists() and target_is_the_assigned_scene(target, job)
result = run_argv([python, validator, "--file", str(target)])
save_check_report(target=target, checked_count=1,
                  artifact_sha256=hash_file(target), validator_sha256=hash_file(validator),
                  exit_code=result.returncode, summary=parse_last_json(result.stdout))
```

`| tail` 后的 shell 退出码可能属于后面的命令；会话 Markdown 又通常没有真实退出码。历史报告中保留“校验摘要被观察到”，不要据此补 exit_code=0。未来运行器直接用 argv/capture_output 保存实际退出码即可，不必写复杂命令文本解释器。

“grep 出现 http 就失败”也过粗：SVG namespace、教学文本、API 示例字符串不等于网络加载。静态检查应聚焦资源属性和实际调用位置；完整离线行为仍需浏览器验证。s13 明确用于离线教学的 mock 是合理产物，不该套用“所有 mock 都是假完成”的代码验收规则。

## 6. 评测集先做小而完整的三组

`case_eval/benchmark_seeds.json` 给了 7 个起点，先做前三项即可：

1. **工具契约题**：正常场景、坏场景、目标未登记/不存在、材料不存在。故障注入由程序造，期望明确。
2. **Agent 交接题**：纯 JSON/可恢复回执/缺字段/失败回执/判定矛盾；改 outline 后 job 同步；warn/fail 的实际后续动作。
3. **Skill 方法题**：s5/s12 目标覆盖；doc-reshaper 的限定保留；一个 interactive reset/关键控件任务。

别把所有题都算进一个总通过率。至少分开报：目标交接正确率、任务质量、裁判缺陷检出、资源消耗；每项同时列 unknown 和分母。人工确认的效用是“哪个缺口应改变哪个文件”，不是给 Agent 贴优秀或差的标签。

每次只改一个主要因素：

| 想评估什么 | 最小对照 | 需要保持一致 |
|---|---|---|
| Agent 编排 | 原 director vs 精简上下文/回执改版 | 相同任务、下游 Skill/工具、模型与预算 |
| Skill 增量 | 原 Skill vs 增加目标覆盖表的 Skill | 相同 job/材料、Agent、模型、工具；不可删除用户目标来换通过 |
| Tool 改进 | 原 validator vs 修目标检查的 validator | 相同正常/故障样例，观察新增检出和误拒 |

若比较 Skill 开/关，先看同一方法是否已重复写在 Agent、PROTOCOL 或 job prompt 里。**删掉 SKILL.md 但其他位置仍给了相同 SOP，不能据此判断 Skill 没有收益。** 分开报告“文件加载机制的增量”和“方法指令本身的增量”；一次只研究一个问题。

质量稳定后再看总 token、耗时、重试与人工补充。当前这三份 MD 不足以估计完整子代理消耗或并行加速，不要用主会话 header 的若干秒数相加代替任务耗时。

### 交互页面的最小验证步骤（本次未执行）

用现有宿主/播放器打开生成 site；在真实 iframe sandbox 中，而不是只开独立 HTML：记录初始状态 → 操作一个关键控件 → 确认有预期变化 → reset → 确认回到初始状态。同时记录浏览器异常、意外网络请求和关键内容是否被裁切。对 bridge，再发一条已声明消息检查效果。

只需先覆盖 s8（simulation）与 s13（code）各一个代表行为。不必起步就写全站浏览器测试。没有运行这一步，就标记 `interaction_result=unknown`；结构通过、含监听器、存在 reset 按钮都不能替代行为结果。

## 7. 让信号真正进入下一次改进

一条记录即可：`signal_id → 证据版本 → 修改文件/规则 → 冻结评测题 → 旧/新结果 → 是否启用/复查条件`。现有 `change_record.example.json` 和 `compare_change.py` 可以继续用，不需要另建数据库。

这组真实样例可先落成三条改进：

- `course_validate.py / --scene`：修“未检查目标也通过”，加 1 个正常、2 个异常回归题。
- `course-scaffold / job 更新流程`：大纲更改后重新生成相应 job，保留 old/new 目标版本。
- `quiz-authoring + verifier rubric`：增加“承诺→考查位置”表，并给检查者明确当前目标文件。先单独改其中一处做对照，再决定是否同步另一处。

一个局部问题可能同时碰到 Agent、Skill、Tool，但修复归属不必按三者平均分配。先改最能直接改变行为、最容易验证的一处。

你已有生成—验证隔离的设计方向。这组材料提醒的是：**隔离了角色，还要检查验证器的目标、输入和结论是否可信。** 一个把不存在场景判成 pass 的工具，会让独立 verifier 也获得错误的正反馈；先堵住这类信号错误，飞轮才值得自动化。

## 本轮交付与验证范围

本次分析了实际上传会话、Agent/Skill 主体契约、关键参考文档、输入输出关系与课程工具代码；脚本解析了三个实际 MD，对当前产物做一致性检查，并运行了上述 5 个工具探针。没有执行会话中记录的历史命令，没有重跑生成 Agent，没有修改上传的 Agent/Skill/工具，也没有启动服务。

`case_eval/examples/` 保存本次处理摘要；完整原始对话、材料和课程不重复打进参考包。代码中的路径/schema 是这组 MAIC 样例的启发性 profile，迁移到 recipe 分析、文档整理、工具开发等业务时替换任务包和验收条件即可。语义复核请求、浏览器步骤、权限/加载探针仍是待执行方案，不是本轮已验证结果。
