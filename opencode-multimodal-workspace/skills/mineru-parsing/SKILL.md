---
name: mineru-parsing
description: 基于 MinerU 的文档解析管线。当需要将 PDF/DOCX/PPTX/XLSX/扫描件转换为结构化 Markdown 时使用。包含后端选择规则、统一执行入口、输出契约与质量自检标准。
license: MIT
compatibility: opencode
metadata:
  audience: doc-parser
  workflow: document-parsing
---

# MinerU 文档解析管线

## 后端选择

| 输入特征 | 后端 | 说明 |
|---|---|---|
| 数字文本、简单版式 | `pipeline` | CPU 可跑，速度快 |
| 公式 / 复杂表格 / 扫描件 / 手写 | `vlm` | 需 GPU 或远程 API |
| 不确定 | 先用 `pdftotext` 抽前 3 页，文本量 < 50 字/页视为扫描件 |

MinerU 输出规则：公式 → LaTeX，表格 → HTML，按人类阅读顺序重排，
自动去除页眉页脚，支持跨页表格合并。

## 执行

统一入口（禁止手写 mineru 命令）：

```bash
python .opencode/skills/mineru-parsing/scripts/parse_doc.py \
  <输入文件> --out <输出目录> --backend auto
```

脚本负责：SHA256 缓存（同文件秒回）、输出归一化、manifest 生成、自检。
`--no-cache` 可绕过缓存；`--timeout` 默认 600 秒。

## 输出契约

每个输出目录必须包含：
- `content.md`：结构化正文
- `manifest.json`：页数、块统计、后端、耗时、状态
- `images/`：提取的图片（content.md 中以相对路径引用）

契约细节见 references/output-contract.md，执行后必须逐项自检。

## 质量红线

- manifest 缺失或页数对不上 → 视为失败，上报而非隐瞒
- content.md < 100 字节 → 视为失败（脚本会强制 exit 1）
- 禁止假装解析成功
