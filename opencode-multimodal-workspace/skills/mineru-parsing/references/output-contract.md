# MinerU 解析输出契约

## 目录结构

```
<output_dir>/
├── content.md      # 结构化正文（公式 LaTeX、表格 HTML、图片相对路径引用）
├── manifest.json   # 解析元数据（见下）
└── images/         # 提取的图片文件
```

## manifest.json 字段

| 字段 | 类型 | 说明 |
|---|---|---|
| status | string | `success` / `failed` |
| source | string | 源文件绝对路径 |
| backend | string | `pipeline` / `vlm` / `auto` |
| output_dir | string | 输出目录绝对路径 |
| content_md | string | content.md 绝对路径 |
| pages | int \| null | 页数（非 PDF 为 null） |
| blocks | object | `{"table": n, "formula": n, "image": n}` |
| images | list | 提取出的图片文件名 |
| elapsed | float | 耗时（秒） |
| cache_hit | bool | 是否命中缓存 |
| warnings | list | 质量警告（如页数无法统计） |

## 质检红线（parse-verifier 按此执行）

1. manifest.json 必须存在且 status 合法
2. content.md 必须存在且 > 100 字节
3. manifest.pages 与源文件实际页数一致（PDF）
4. content.md 中引用的 images/ 路径全部真实存在
5. 抽样核对：关键数字 / 标题与源文件一致
6. 乱码检测：替换字符比例 < 1%
