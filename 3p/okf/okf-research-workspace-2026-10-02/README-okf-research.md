# OKF 研究工作空间

核对日期：2026-10-02。

先读 [深度分析](okf-analysis-2026-10-02.md)。第 12—20 节重点讨论 Agent Runtime、知识检索、目录化加载、持久化、审核和计算核验；前半部分保留版本、近期更新和 Wren 对照。

## 内容与来源

- `okf-source/`：GoogleCloudPlatform/open-knowledge-format 在 `ad30107c31c06aec8a7d5636e0d1058118604e6f` 的全部 132 个已跟踪文件。文件逐一与 Git blob SHA 校验一致。此为文件快照，不含 `.git` 历史。
- 上游版权和许可见 `okf-source/LICENSE.md`；原有版权头保持原样。分析与本地探针不是上游项目提供的正式文档或工具。
- `shared-dialogue.md`：用户提供分享链接中的对话提取文本。
- `analysis-data/research-evidence.json`：主线提交、相关历史、Issue 和来源证据。
- `analysis-data/connector-okf.ts`：另一个仓库 knowledge-catalog 在 `62883ea36d63ca7cd7178f1381060d7b2617cd6f` 的 OKF 适配器摘存，非独立 OKF 仓库的一部分。来源路径 `toolbox/mdcode/demo/okf/okf.ts`，以文件内容与研究证据记录为准。
- `analysis-data/source-manifest.json`：上游文件清单、Git blob SHA、SHA-256 和匹配结果。
- `analysis-data/reproduce-probes.py`：本研究编写的可复跑局部行为探针。
- `analysis-data/reproduced-probes.json`：本次重新执行的结果；根目录两份 probes JSON 为首次分析时的观测。

## 本地复查

在已安装 Python 3.11+ 与 PyYAML 的环境中执行：

```bash
python analysis-data/reproduce-probes.py
```

该脚本只调用局部纯本地逻辑，不连接 BigQuery 或模型服务。观察结果中的通过仅指示例函数返回通过，不能解读为生产合规或业务正确性证明。真实运行参考 Agent 需按上游 README 安装依赖并配置云访问；本次未执行云端工作流，也未运行完整 pytest 套件。

所有自定义目录、审核记录、检索伪代码、运行信封和生产门控建议，都在报告中明确区分于 OKF v0.2 的正式要求。报告中的 GitHub 源码链接固定到提交，Issue 链接用于记录讨论，状态可能在未来变化。
