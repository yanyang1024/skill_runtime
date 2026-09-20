---
name: doc-evidence
description: 为文档证据路由、文本提取、图片识读和独立核对提供共享契约与按需方法。
---

# 文档证据方法

所有模式先读取 [contract.md](references/contract.md)。由当前 agent 的职责选择模式，不通过加载本 skill 获得其他角色权限。

- 主 agent：读取 [coordinate.md](references/coordinate.md)，负责派单与状态汇总。
- 文本／视觉执行者：读取 [extract.md](references/extract.md)，只执行自己的输入分支。
- 独立验证者：读取 [verify.md](references/verify.md)，只核对不修复。

使用原始材料作为依据，输出简短事实和可定位证据。当前示例不提供写入工具、OCR 或 PDF 后端；需要这些能力时明确阻塞，不能以模拟结果代替。
