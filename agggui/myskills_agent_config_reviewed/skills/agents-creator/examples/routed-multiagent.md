# 路由与独立验收

假设文本解析与图像理解需要不同模型，且用户要求独立验收。

| 角色 | mode | Skill | 工具要求 |
| --- | --- | --- | --- |
| doc-router | primary | 可内联短路由 | Task 精确允许三名子 Agent |
| doc-parser | subagent | doc-evidence | 读取指定文本、写指定产物 |
| vision-analyst | subagent | doc-evidence | 真实可用的图像输入/工具及相应模型 |
| parse-verifier | subagent | doc-evidence | 只读任务规则、待验产物与原始证据 |

router 的委托白名单示例：

```yaml
permission:
  question: allow
  task:
    '*': deny
    doc-parser: allow
    vision-analyst: allow
    parse-verifier: allow
```

三名子 Agent 各自设置 task: deny、question: deny；verifier 设置 edit: deny、bash: deny。doc-evidence 的 SKILL.md 应按角色导航到提取/验收参考，不能让 verifier 默认读生成者的自评。

合成任务：文本 T1 与图像 I1 分别提取证据，router 汇总成 draft.md，再新建验证任务，仅提供用户要求、原始材料引用、draft.md 和判断标准。verifier 回传 PASS/FAIL/BLOCKED 与证据，不修正文档。FAIL 交原执行者修复；重验仍保留边界。

图像能力不可用就报告该分支阻塞，不能靠命名 vision-analyst 得到视觉能力。同一方法可服务多个角色，职责与权限边界在 Agent 层定义。

多个子任务缺同一输入时由 router 合并一个问题；任务内部的输出路径等由 router 自行补齐。验证者缺证据时只回传缺口，不能直接 question 用户。
