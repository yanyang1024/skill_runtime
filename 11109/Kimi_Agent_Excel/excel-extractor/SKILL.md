---
name: excel-extractor
description: 保真解析和提取非结构化、人工排版的 Excel .xlsx/.xlsm，尤其适用于一个工作表含多个人工表格、合并单元格、背景色/字号等业务语义、隐藏行列、公式及大量嵌入图片的场景。生成原始文件证据、OOXML 元数据、单元格 JSONL、完整样式表、图片及锚点、多表候选区域和 Agent 紧凑 Markdown 视图；可选调用 OpenAI 兼容 v1 视觉接口理解图片、用 LibreOffice 渲染 PDF/PNG，并校验产物完整性。用户要求“无损解析 Excel”“读取复杂排班表”“提取 Excel 图片和颜色”“让 Agent 读取非结构化工作簿”“Excel 转 JSON/RAG”时使用。不要用于保证原文件无损写回、公式重算或把启发式多表边界宣称为确定事实。
---

# Excel Extractor

## 核心纪律

- 把原始工作簿视为事实源；不要只交付 Markdown、CSV 或 DataFrame。
- 不修改源文件。缓存公式值不是新计算结果；本技能不重算公式。
- 将区域检测结果称为 `candidate`，除非来自正式 Excel Table 定义。
- 将视觉模型结果称为模型生成证据；保留原图并标注不确定性。
- 将 `orphan_media` 称为“字节已保留、位置未解析”，不要声称已恢复所有图片位置。
- 请求的可选步骤失败时报告失败；不要把未渲染、未视觉识别或未校验包装成完整成功。

## 标准流程

安装依赖后，用单个入口完成提取、区域检测、Agent 视图和校验：

```bash
python3 -m pip install -r /path/to/excel-extractor/scripts/requirements.txt
python3 /path/to/excel-extractor/scripts/extract_all.py \
  input.xlsx /path/to/run-0001 --include-ooxml
```

从以下入口开始读取，不要一次加载整个工作簿：

```text
/path/to/run-0001/agent/overview.md
```

按需增加步骤：

```bash
# 额外生成 LibreOffice PDF；不要求保存或覆盖源 XLSX
python3 /path/to/excel-extractor/scripts/render_excel.py \
  /path/to/run-0001 --format pdf

# 重新校验源 hash、单元格计数、样式引用、OOXML CRC 和图片 hash
python3 /path/to/excel-extractor/scripts/verify_run.py \
  /path/to/run-0001 --output /path/to/run-0001/verification.json
```

## 分步复用

需要嵌入自己的管线时分别调用：

```bash
python3 scripts/extract_excel.py input.xlsx run-0001 --include-ooxml
python3 scripts/detect_regions.py run-0001
python3 scripts/build_agent_bundle.py run-0001 --max-cells 1000
python3 scripts/verify_run.py run-0001
```

- 只需单元格与样式时读取 `workbook.json`、`sheets/*.jsonl`、`styles.json`。
- 只需图片时读取 `assets.json` 和 `assets/`；先筛选 sheet、锚点和 hash。
- 只需多表候选时读取 `regions.json`，再按区域过滤 JSONL。
- 大文件省略 `--include-ooxml`；源文件和 `package.json` 仍会保留完整对账信息。
- 重复业务模板优先在下游使用固定区域契约；不要用通用检测替代关键字段验收。

## 可选视觉理解

参考 `assets/vision.env.example`，通过环境变量配置内部 OpenAI 兼容接口：

```bash
export EXCEL_VISION_BASE_URL="https://your-internal-host/v1"
export EXCEL_VISION_API_KEY="填入你的 key"
export EXCEL_VISION_MODEL="你的视觉模型名"

python3 /path/to/excel-extractor/scripts/vision_describe.py \
  /path/to/run-0001 --all
```

只处理选定图片时重复使用 `--asset-id img-0001 --asset-id img-0003`。接口支持 JSON mode 时才添加 `--json-mode`。也可以在一键入口中添加 `--vision`；密钥不得写入 SKILL、命令参数、产物 JSON 或日志。

视觉完成后重新生成 Agent 视图，使区域文件包含视觉结果索引：

```bash
python3 /path/to/excel-extractor/scripts/build_agent_bundle.py /path/to/run-0001
```

## Agent 消费顺序

1. 阅读 `manifest.json` 和 `agent/overview.md`，先检查警告、sheet 数量和图片计数。
2. 选择目标 sheet/region，读取对应 `agent/regions/*.md`。
3. 需要精确值、公式或样式时回读 JSONL 和 `styles.json`，不要依赖紧凑视图补全被截断内容。
4. 需要图片时读取原始 `assets/` 文件及锚点；需要视觉语义时再读取 `vision/*.json`。
5. 结论中保留 `Sheet!Cell` 或 `asset_id` 溯源。区域边界、OCR 和图片语义不确定时显式说明。
6. 交付前运行 `verify_run.py`；校验失败不得称为保真提取成功。

## 参考文档

- 输出字段、目录和程序化读取方式：见 [references/contracts.md](references/contracts.md)。
- 支持边界、常见陷阱和保真验收：见 [references/fidelity.md](references/fidelity.md)。
