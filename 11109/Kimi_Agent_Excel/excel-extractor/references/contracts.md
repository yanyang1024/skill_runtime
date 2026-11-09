# 输出契约与复用接口

## 目录

```text
run/
├── source.xlsx|source.xlsm  # 原字节副本
├── manifest.json           # 状态、hash、计数、警告和能力边界
├── workbook.json           # sheet、合并、正式表格、行列尺寸、定义名称
├── styles.json             # 被引用 style_id 的字体/填充/边框/对齐
├── assets.json             # 图片 placement、原 media part、锚点和 hash
├── assets/                 # 内容寻址的原始图片字节
├── package.json            # OOXML part、大小和 CRC
├── ooxml/                  # 仅 --include-ooxml 时生成
├── sheets/*.cells.jsonl    # 每个已实例化单元格一条记录
├── regions.json            # detect_regions.py 生成
├── renders/                # 可选 PDF/PNG
├── vision/                 # 可选模型结果
├── agent/overview.md       # Agent 入口
├── agent/regions/*.md      # 有界稀疏视图
└── verification.json       # verify_run.py 生成
```

## 单元格记录

每行字段：

- `cell`、`row`、`column`：A1 坐标与数值坐标。
- `value`：普通字面值，或公式上次保存的缓存结果；日期转为 ISO 字符串。
- `formula`：公式文本；普通单元格为 `null`。
- `value_status`：`literal`、`cached` 或 `missing_cache`。不得把 `cached` 当作本次重算。
- `data_type`、`style_id`、`number_format`：openpyxl 原始类型和样式引用。
- `merged_range`、`rich_text`、`hidden`：版面状态。
- `hyperlink`、`comment`：存在时保留。

`worksheet._cells` 中的已实例化单元格都会被记录，因此无值但有样式的单元格也可能存在。脚本不会为了遍历而扩展到整个声明 used range。

## 样式记录

`styles.json` 以 `style_id` 为键，保存：

- 字体名称、字号、粗体、斜体、删除线、上下标、颜色。
- 填充 pattern、前景色和背景色。
- 四向及对角边框、对齐、换行、旋转、缩进、数字格式和保护状态。

颜色同时保留 `rgb/indexed/theme/tint` 原始描述和 `resolved_argb`。`resolution` 为 `theme_tint_approximation` 时只用于显示摘要，关键业务判断应同时保留原始 theme/tint。

## 图片记录

`assets.json.placements[]`：

- `status=mapped`：从 worksheet drawing relationship 找到了图片及 drawing 锚点。
- `status=orphan_media`：从 `xl/media/` 保留了字节，但未确认 worksheet 位置。
- `anchor.kind`：`twoCellAnchor`、`oneCellAnchor` 或 `absoluteAnchor`。
- `from_cell/to_cell`：由零基 OOXML row/col 转为 A1；`rowOff/colOff` 仍保留 EMU 偏移。
- `file`、`sha256`、`media_part`、`drawing_part`：用于字节与关系对账。
- 同一媒体被多处引用时，可有多个 placement 指向同一内容寻址文件。

`absoluteAnchor` 没有单元格锚点不代表失败；它本身是一种合法定位方式。

## 区域记录

`kind=excel_table` 来自正式 OOXML Table，`confidence=declared`。`kind=heuristic_candidate` 来自完全空白行列递归切分，包含非空和有样式空单元格。

`score/confidence` 只用于排序，不是经过校准的概率。常见误差包括：相邻表格没有完整空白分隔线、标题或脚注被并入、跨区块样式导致连通。

## 程序化读取示例

```python
import json
from pathlib import Path

run = Path("run-0001")
workbook = json.loads((run / "workbook.json").read_text(encoding="utf-8"))
styles = json.loads((run / "styles.json").read_text(encoding="utf-8"))["styles"]

sheet = workbook["sheets"][0]
with (run / sheet["cells_file"]).open(encoding="utf-8") as handle:
    for line in handle:
        cell = json.loads(line)
        if cell["value"] is not None:
            style = styles[str(cell["style_id"])]
            print(sheet["name"], cell["cell"], cell["value"], style["fill"])
```

## 进程返回

所有命令向 stdout 输出 JSON 摘要。输入、依赖、网络或校验失败时返回非零退出码。`extract_all.py` 将失败步骤写入 `pipeline.json`；已产生的 run 目录用于诊断，但不代表全流程成功。
