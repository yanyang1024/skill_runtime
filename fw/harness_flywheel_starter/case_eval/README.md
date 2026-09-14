# 实际会话案例：Agent / Skill / Tools 契约评测

这是飞轮参考包 v1.2 的增量，基于本次三份真实 Markdown 会话和四个 ZIP。**不重建采集平台：从现有交接文件与回执提取证据，把发现的问题转成几道可复跑的题。**

先读 [分析与建议](../docs/actual_harness_cases.md)。主要入口如下，均只用 Python 3.9+ 标准库：

```sh
# 在整个参考包根目录运行；所有输出目录应是新目录
python3 case_eval/md_trace.py \
  /data/session-ses_f64b.md /data/session-ses_f64e.md /data/session-ses_f650.md \
  --out trace_run

# workspace = maic-workspace.zip 的解压根目录；course = interfaces-protocols.zip 的解压根目录
# 不必把课程复制进 workspace，course-key 显式声明历史逻辑路径映射
python3 case_eval/audit_maic.py \
  --trace-dir trace_run --workspace /data/maic-workspace \
  --course /data/interfaces-protocols --course-key courses/interfaces-protocols \
  --creator /data/agents-creator --out case_audit

# 可选：运行你已审阅的课程校验脚本，只在临时副本中制造错误
python3 case_eval/probe_validator.py \
  --validator /data/maic-workspace/tools/course_validate.py \
  --course /data/interfaces-protocols --out validator_probe
```

`--creator` 可省略。脚本没有联网、没有启动 Agent、没有执行会话中的命令，也不修改上传的配置或课程。最后一个命令会明确执行 `--validator` 指定的 Python 脚本；本次已检查所上传脚本的读文件校验逻辑。

| 文件 | 输出 / 用途 |
|---|---|
| `md_trace.py` | `events.jsonl`、`messages.jsonl`、manifest；保留源文件哈希和行号，提取 task 子会话 ID 与回执 |
| `audit_maic.py` | `checks.jsonl`、handoffs、Skill 接触、summary、两条不含旧 verdict 的语义复核请求 |
| `probe_validator.py` | 正常课程、未登记坏场景、坏场景直验、不存在的目标、缺失材料 5 个探针 |
| `benchmark_seeds.json` | 7 个评测起点，区分真实重建、故障注入、尚无运行证据的静态案例 |
| `review_rubric.md` | 内容覆盖、保真、交互/PBL 质量的独立复核规则 |
| `examples/` | 本次实际处理摘要及工具探针结果，不包含完整原始对话或输入材料 |

本次 Markdown 的 task 输出含 `<task id="…" state="completed">`，所以可以获得真实子会话指针；大多数工具调用没有结构化退出码/状态/token，因此保持 unknown。不能为了接旧统计脚本把所有有 Output 的事件补成 success。

`audit_maic.py` 是本样例的 profile，不是通用 Harness 打分器。移植到你的半导体业务时，主要替换 `REQUIRED` 回执字段、job/产物对应关系和 Skill 类型映射；继续使用相同的“交接—证据—验收—改动”骨架。

当前没有实现：通用 Markdown 解析、任意 YAML/权限完整解析、子会话采集、运行时隔离证明、浏览器行为测试、内容事实核查、LLM 自动判分。语义复核请求与评测种子没有被当成金标准。旧的部门比较和同题改动比较继续使用包根目录脚本。
