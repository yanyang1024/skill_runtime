# 一个 worker 定义，多份独立任务

假设十个 lot 的输入互不依赖，且有足够材料让隔离分析值得成本。

master 的关键配置：

```yaml
---
description: 协调独立批次分析并汇总
mode: primary
permission:
  '*': deny
  question: allow
  read: allow
  edit: allow
  task:
    '*': deny
    lot-worker: allow
---
```

worker 的关键配置：

```yaml
---
description: 分析一份授权批次材料并回传结果
mode: subagent
permission:
  '*': deny
  read: allow
  edit: allow
  task: deny
  question: deny
  skill:
    '*': deny
    lot-review: allow
---
```

lot-review 是目标环境必须另行提供的方法，本示例不宣称已安装。master 给每次任务指定 task_id、输入路径、规则版本、输出路径及验收条件；worker 按自己的输入加载 lot-review，仅写该任务路径，回传状态、摘要、证据及产物引用。

合成派单：T1→input/L1.md→output/T1.md；T2→input/L2.md→output/T2.md。运行时允许才并发，否则分批。master 校验回传后汇总；T1 失败不阻止独立 T2，最终覆盖不得漏项。正文路径约定仍需运行时权限/沙盒配合，独立会话不自动隔离文件系统。
