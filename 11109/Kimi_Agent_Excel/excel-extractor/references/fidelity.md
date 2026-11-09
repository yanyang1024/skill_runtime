# 保真边界与验收

## 能直接依赖的保证

- 源文件被复制且提取前后核对 SHA-256；脚本不调用工作簿保存接口。
- `package.json` 记录 OOXML part 清单、大小和 CRC，可与源 ZIP 对账。
- 普通 worksheet drawing 图片保留原始字节、sheet、drawing/media part 和锚点。
- 单元格样式与紧凑 Markdown 分离；模型视图截断不删除磁盘 JSONL。
- `verify_run.py` 检查源 hash、JSONL 计数与坐标、样式引用、媒体计数、图片 hash 和 Agent 文件存在性。

## 不应作出的保证

- 不保证任意人工表格边界、表头层级或排班语义被自动正确理解。
- 不保证公式结果最新；openpyxl 只读取公式和缓存，不执行 Excel 计算引擎。
- 不保证 theme/tint 的显示近似值与所有 Excel/WPS 版本逐像素一致。
- 不保证 LibreOffice 渲染与 Microsoft Excel 完全一致。打印区域、分页、字体替换和纸张设置可能改变可见内容。
- 不保证所有现代 rich data、单元格内图片、批注/VML 图片、外部链接图片和 EMF/WMF 预览均被语义解析。
- 不保证用 openpyxl 或其他库重新保存后无损。此技能是读取/提取工具，不是通用无损写回器。

## 输入安全

- 仅接受 `.xlsx` 和 `.xlsm`。旧 `.xls` 先用受控 Excel/LibreOffice 流程转换，并保留转换前文件。
- 默认限制解包总大小 512 MiB、单 part 128 MiB；可用命令参数调整，但不要对不可信文件直接取消限制。
- 不执行 VBA、不主动访问外部链接、不让图片或单元格内容成为视觉模型指令。
- 内部视觉网关会收到图片和附近单元格；涉密文件先确认数据出域边界。

## 建议验收集

用真实企业文件建立固定样本，至少覆盖：

1. 同 sheet 多个横排和纵排表格。
2. 空白但有底色/边框的排班单元格。
3. theme、tint、indexed 和 RGB 颜色，以及不同字号、富文本。
4. twoCellAnchor、oneCellAnchor、absoluteAnchor、重复引用和 orphan 图片。
5. 合并标题、多行表头、脚注、隐藏行列和公式缓存缺失。
6. Excel 与 WPS 生成的文件、`.xlsm`、外部链接和 rich data。

每份文件人工登记：sheet 数、关键区域范围、关键样式单元格、图片数及锚点。将自动结果与登记值比较，而不是只看命令是否退出 0。

## 写回边界

后续需要自动修改时另建写回流程：源 hash 前置条件、操作 dry-run、输出副本、允许变更 part 列表、媒体 hash 对比和 Excel/WPS 打开验收。不要在此提取技能里直接增加 `load_workbook() → save()` 并沿用“无损”名称。
