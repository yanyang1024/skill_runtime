# AGENTS.md

## 这个目录是什么

RSI（递归自我改进）Agent 的中文调研工作区，**不是可构建的软件项目**：无 git、无 CI、无 build/test/lint 命令。产物是分析报告，素材是论文与开源仓库源码快照。默认用中文写作与回答。

## 素材地图（`ref_paper/`）

`papers/` 有 5 份一手素材：SICA、HGM、RRSI 三篇论文 + Weng 博客 + 腾讯《Agent 自进化飞轮》。

- 3 篇论文各有 `*.pdf` 和 `MinerU_markdown_<名称>_<hash>.md` 两份。**检索/引用文本用 MinerU md，数字、公式、表格以 PDF 为准**——MinerU 是 OCR 产物，正文有拼写错误（如 "eficient"），插图只是 cdn-mineru 链接占位，内容可能失真。
- `Agentrsi.md`：腾讯技术工程 2026-08-26 公众号文章，由 PDF 转换；多数配图未渲染，只留 🖼️ 文字描述。
- Weng 博客只有 HTML 快照 `Weng_harness_blog_2026-07-04.html`，无 md 版本。

`repos/{sica,hgm,rrsi}/` 是三个仓库的**只读源码快照，无 `.git`**，报告里的 commit hash 无法在本地核对。不要在这里安装或运行它们。

## `report_sum.md` 的状态（重要）

- 核心分析报告（调研日期 2026-09-24），只覆盖 4 份素材，**尚未包含 `Agentrsi.md`**（第 5 份）。
- 报告混合了两类证据：论文原文，以及论文之外的调查结论（GitHub issue、攻击论文 arXiv 2609.17817、HN/Scholar 数据）。引用时区分"论文结论"与"调查报告结论"。
- star/issue/引用等数字是 2026-09-24 的一次性快照，沿用前先核实；附录"存档清单"已过时（`scholar_*.csv` 实际不存在）。
- 结论速记：SICA=开山但代码冻结、有安全缺陷；HGM=理论最优（MPM/CMP）但复现贵；RRSI=工程最完整、最防过拟合；Weng=领域词汇表/地图。组合建议见报告第 5 节。

## 读源码的入口

- `repos/rrsi`（工程最完整）：先看 README 的 "Method to code" 表，把论文机制映射到 `rrsi/selection.py`、`propose.py`、`critic.py`、`history.py`；核心测试 `tests/test_core.py`。
- `repos/sica`（最小骨架）：`base_agent/agent.py`、`runner.py`、`sandbox/`；Docker/Makefile 方式运行。
- `repos/hgm`：`hgm.py`、`tree.py`、`self_improve_step.py`，与 DGM 同构的遗产代码。

## 安全

三个仓库都会执行模型生成的不可信代码（HGM README 有明确警告；SICA 已被第三方用基准投毒攻击）。不要在本机直接运行其 runner。
