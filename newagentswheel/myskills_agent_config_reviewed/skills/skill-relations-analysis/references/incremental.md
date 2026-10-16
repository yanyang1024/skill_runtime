# 增量分析、失效与续接

先确定哪些事实还有效，再决定重做多少工作。读取整个库并重新画像不是每次更新的默认操作。

## 失效依据

| 变化 | 优先重查 | 通常可保留 |
| --- | --- | --- |
| name/description/触发边界 | 发现索引、候选选择、调用名、白名单 | 未受影响的内部方法证据 |
| 输入输出/单位/前提/完成条件 | 相关关系边、输入绑定、下游验收 | 无关画像与独立支路 |
| 工具/模型/权限/写入对象 | 可行性、资源冲突、主体边界、并发方案 | 无关能力分类 |
| references/scripts/assets | 所引用行为与受影响场景 | 经证实不受影响的公共契约 |
| 用户目标、授权集合、输入快照改变 | 本次选择与执行计划、结果有效性 | 未变来源的材料画像 |
| 新增/删除 Skill | 候选覆盖、重名、替代、引用它的计划 | 其他 Skill 的取证事实 |

指纹变化是重查信号，不自动证明语义发生变化；指纹不变也不能证明外部 API、数据、模型或权限仍有效。来源未提供可靠版本时标 unknown，并针对关键接口重查。

## 来源与依赖记录

画像继续使用 schema_version: 2；可在 extensions 增加 lifecycle：source_ref、bundle_fingerprint、read_files、unread_files、external_dependencies、reviewed_at、validated_environment。不要凭空补时间或版本。

场景计划记录 uses：skill_id + version/fingerprint + 相关 claim/文件，以及 input_snapshot、goal_revision、permission_assumptions。变更后沿“事实→关系→场景→Agent”的引用定位潜在影响，只重查有关部分；依赖索引不完整时扩大检查并说明原因，不保证精确最小集。

本包提供可选纯 Python 工具 [inventory.py](../scripts/inventory.py)：只枚举直接子目录，计算包内文件内容指纹并比较前次清单；不执行任何被扫描内容。由有权限的操作者运行，分析 Agent 未开放 bash 时采用人工来源记录，不自动扩权。

```bash
python3 <分析Skill目录>/scripts/inventory.py <Skills集合目录> > /tmp/inventory-current.json
python3 <分析Skill目录>/scripts/inventory.py <Skills集合目录> --previous /tmp/inventory-current.json > /tmp/inventory-next.json
```

工具输出是文件变化候选，不是语义分析、画像或安全认证。符号链接默认不跟随并列为未覆盖；读取错误标不完整，不允许据此复用画像。输出文件放集合外，避免清单影响自身指纹。

## 中途变更与恢复

记录用户目标、已完成步骤、有效产物引用、输入版本和剩余阻塞。改变目标时取消尚未执行的无关步骤；已产生外部动作不能靠重规划撤销。恢复前检查产物及依赖有效性，不因旧状态为 completed 就跳过验证。

设计可以给步骤状态 planned / ready / running / succeeded / failed / blocked / skipped / cancelled。进入 ready 要满足条件和必需输入，succeeded 要有产物验收证据。仅静态分析保持 planned；不填写虚构运行事件。若接入平台，状态落盘、幂等、取消和调度由 runtime 提供。
