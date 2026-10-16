# 示例导航

先选一种设计，再只读取需要的角色或契约。原包只提到了外部实例的路径；这些是根据其形态补写的教学实现，不宣称还原内部项目。

| 设计需求 | 指南 | 对应内容 |
| --- | --- | --- |
| 单主体按需使用方法 | [single-primary.md](single-primary.md) | BEOL primary + 方法 skill |
| 路由和独立验收 | [routed-multiagent.md](routed-multiagent.md) | router + 文本／视觉 subagent + verifier |
| 隔离独立任务并按资源并行 | [parallel-master-worker.md](parallel-master-worker.md) | lot master + 复用 worker |
| 同时创建 agent 与配套 skill | [agent-with-skill.md](agent-with-skill.md) | 两个 creator 的交接 + 独立业务产物 |

完整可复制文件在分发包顶层 [examples](../../../examples/README.md)。这些文件与已激活的 agent／skill 目录分开，避免把业务示例自动混入创建助手的可用能力；说明页不再复制它们的全文。

完整安装可把分发包的 examples 与 agents、skills 同级保留。仅安装核心 skill 时，外部示例源目录可能不存在；这不阻塞正常创建，仍可使用 skill 自带模板。不为读取示例而自动安装业务 agent。

部署某例时，把其 agents、skills、input 合并到目标测试项目 `.opencode/`；依据任务替换业务规则并核对可用工具。数值均来自标明的合成输入，视觉能力缺失时如实报告阻塞。
