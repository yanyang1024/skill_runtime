# 契约审计：从"调用了"走到"哪里值得改"

适用于已有"主 Agent 委托子 Agent/Skill/工具"结构的会话（Markdown 导出经 md_trace.py 解析后）。
核心方法：**交接契约 + 产物验收 + 小范围对照**，不打总分。

## 使用

```sh
python scripts/md_trace.py session-*.md --out trace_run
python scripts/contract_audit.py --trace-dir trace_run \
  --root workspace=/path/to/workspace --root course=/path/to/course \
  --profile my_profile.json --out case_audit
```

profile 模板见 `assets/audit_profile.example.json`；所有业务约定都在 profile 里声明，脚本无业务死逻辑。

## Agent：评估交接和决策，不按 persona 名字打分

以**一次明确委托**为单位，优先保留这些信号：

| 信号 | 确定性部分 | 需要推理/额外证据的部分 |
|---|---|---|
| 任务包完整 | 有 job/输入路径；字段存在；路径可解析 | 材料是否足以完成目标、是否含多余上下文 |
| 回执可消费 | 能否解析、必需字段、status/verdict 值域、内部矛盾 | notes 是否如实、结果是否真的满足任务 |
| 交接覆盖 | 同一主会话同一对象有 builder 和 verifier；子会话 ID 可绑定 | 是否真正独立上下文、是否只读、是否做了所声称检查 |
| 修改传播 | 上游文档与派生物的相关字段/版本一致 | 本次变更应该重建哪些派生物 |
| 失败/告警分流 | fail 后是否还被当 pass；warn 是否保留并汇总 | 警告应修目标、补产物还是改检查器 |
| 主上下文负担 | 首次委托前读取次数、导出字符量 | 缩减后能否保留决策质量、降低实际 token/耗时 |

纪律：

- task 包装里的 child session id 先复用，不必另发明 branch_id；没有子轨迹时 `child_actions_observed=false`，不要填 0 次读写再推断子代理没工作
- 回执最小机器契约：status / artifact_path / artifact_sha256 / validation_report / notes；validation_report 由校验工具生成（含 scope、requested_target、checked_targets、checked_count、artifact_sha256、validator_version、errors），**不要让 Agent 自己填 errors=0 当唯一证据**
- 格式修复用规则：严格解析失败时，只有一个明确 JSON 对象才可恢复并记 `normalized=true`；多候选/缺字段/矛盾就退回。不为此引入大模型
- 导出文本字符数不是 token、重读量或可节省成本；材料接触可能有合理目的，不能只凭长判浪费

## Skill：三格展示，不相加

**接触到方法 → 产物/过程里有对应证据 → 对照后确有收益。** 三格不相加为一个分数。

- 主会话没有 skill 工具调用 ≠ 这些 Skill 未被用；job 指定了 skill_ref ≠ 子 Agent 已读取。**被要求读取 ≠ 已观察到读取**
- 比较 Skill 开/关前，先看同一方法是否已重复写在 Agent、PROTOCOL 或 job prompt 里——删掉 SKILL.md 但其他位置仍给了相同 SOP，不能据此判断 Skill 无收益。分开报"文件加载机制的增量"和"方法指令本身的增量"
- 附录字样存在不证明内容保真；原文保真也不证明原文事实正确
- Skill 目录名与 frontmatter name 不一致时，先做加载探针再下结论；权限模板的字面写法不证明实际收口（以实际运行的分支探针为准）

## Tools：同时测函数结果和"检查有没有用"

- 按**脚本/子命令/阶段/目标**定位问题，不给 bash 汇总一个失败率
- 校验器必须回答：指定目标真的被检查了吗？**0 个被检查对象不能算成功**；目标不存在要显式报错
- 历史报告里"校验摘要被观察到"不补 exit_code=0——管道尾部命令的退出码不属于校验器；未来运行器直接 argv/capture_output 保存
- 静态检查聚焦资源属性和实际调用位置；"文本含 http"不等于网络加载；符合教学目的的 mock 不是假完成

## 语义评测的最小单位：一项承诺

```text
criterion: "检验序列化知识"
expected_source: 冻结的任务卡字段
observed_location: 题干 / 选项 / 解析旁注 / 未找到
result: covered / partial / missing / unknown
```

比"质量 8 分"更容易驱动修改。复核请求**不带旧裁判的 verdict**，避免新裁判照抄旧答案。
