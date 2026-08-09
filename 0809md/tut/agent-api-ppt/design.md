# 视觉设计文档：从 Chat API 到 Agent Runtime

## 1. Profile 基线声明
- **Profile 选择**：`profiles/education.md`（企业培训/技术讲座分支）
- **选择理由**：本 PPT 是面向 AI 工程师的技术分享/培训材料，目标是"让人听懂、记住、能上手"，与企业技能培训场景高度吻合。
- **参考维度**：认知友好的信息密度（65-80%）、一页一知识点、标题即结论、图表作为理解工具（流程图/对比/阶梯图）、正误对比、清单式表达、投影可读性。
- **偏离说明**：视觉语言与已交付的配套 HTML 讲义保持同一品牌（暖纸底 + 深靛蓝 + 暖橙），形成"讲义 + 幻灯片"一致的系列感；不采用图片插图路线，全部视觉由形状/图表/表格构建（技术图解内容禁止用图片占位，本就应使用 shape 组合）。

## 2. 风格基线声明
- **风格锚点**：Kinfolk / Monocle 杂志的"暖纸 editorial"质感 + 瑞士国际主义的网格纪律。
- **参考维度**：暖纸底色与留白、大字距层级对比、细线分隔与小型色块标注；不参考其图片编辑手法（本套不用照片）。

## 3. 风格细节
### 色彩
- 总体倾向：稳定为基、局部提亮。封面/章节/结语用深海军夜色 `#26233F` 制造节奏；内容页用暖纸 `#F7F6F3`。
- 主色：深靛蓝 `#4A44C6`（与配套 HTML 讲义同族，深色系而非 AI 感浅紫渐变）；强调色：暖橙 `#E8863A`，仅用于关键数据与标注，克制使用。
- 语义色（教育 profile 允许 ≤4 个）：正确/推荐 `good #2E9E6B`，错误/风险 `bad #D5544F`。
- 辅助：墨色 `#23252D`、灰 `#5C5F6B`、细线 `#E3E0D8`、浅底 `#ECEAFA` / `#FCEBDD` / `#E3F4EC` / `#FBE9E8`。

### 字体
- 标题：`alimamashuheiti`（几何黑体，技术商业感）；正文：`MiSans`；代码/公式：`MiSans` 加字距或等宽感处理（用深色卡片承载）。
- 字号阶梯：封面主标 40-46px → 章节数字 110px（半透明装饰）/ 章节题 38px → 页标题 28-30px → 正文 16-18px（重内容页不低于 15px）→ 注释 12-14px。关键数字 40px+。

### 容器
- 以留白与字级差异分层为主；卡片用圆角矩形（roundRect 小圆角）+ 浅底色，无描边或 1px 细线；深色卡片承载代码/公式。
- 装饰：标题左侧小色条、页脚细线、章节页超大半透明数字。

### 图表/图解
- 阶梯图、分层架构图、循环流程图、对比双栏全部由 shape + connector + text 构建；结果对比用 chart（水平条形图）。
- 表格：深色表头 + 暖纸斑马纹，1px 细线边框。

## 4. 布局系统
- 画布 1280×720；页边距左右 70px；内容页固定元素：顶部 kicker（PART 编号）+ 页标题 + 标题下短色条，底部页脚（左： deck 名，右：页码），位置跨页一致。
- 正文区 y≈140-655，网格对齐；左右分栏底边对齐；顶-底布局横向居中。
- 封面：深色 Hero + 左侧大标题 + 数据芯片组；目录：左大标题右编号列表；章节页：深色 + 超大半透明章节数字 + 章节题 + 一句导引；结语页：深色 + 金句 + 参考资料双栏。

## 5. 样式使用规则
- `$kicker` 仅用于页眉小标签与封面 eyebrow；`$title` 用于内容页标题；`$body` 正文；`$small` 注释与页脚。
- `$primary` 用于强调文字、流程节点、图表主色；`$accent` 仅用于关键数字与警示标注；`$good/$bad` 仅用于正误对比。
- tableStyles.default 用于全部对比表。

## 6. 风险禁令（本次最易踩）
- 内容页禁止大面积深底（投影不可读）——深底仅限封面/章节/结语与小卡片。
- 禁止把流程图/架构图做成图片占位——必须 shape 构建。
- 左右分栏底边必须对齐；流程图横向占满内容宽度。
- 正文不低于 15px；表格/图表标签不低于 12px；kicker/页脚 12-14px。
- 单行文本框必须 wrap: false（标题、标签、数字、页码）。
- 橙红警示色仅小面积使用，避免整页警报感。

## 7. Theme 定义
```yaml
theme:
  colors:
    bg: "#F7F6F3"
    paper: "#FFFFFF"
    ink: "#23252D"
    soft: "#5C5F6B"
    line: "#E3E0D8"
    primary: "#4A44C6"
    primaryMid: "#6E67D8"
    primarySoft: "#ECEAFA"
    accent: "#E8863A"
    accentSoft: "#FCEBDD"
    good: "#2E9E6B"
    goodSoft: "#E3F4EC"
    bad: "#D5544F"
    badSoft: "#FBE9E8"
    night: "#26233F"
    nightSoft: "#3D3580"
  textStyles:
    kicker: {fontSize: 14, color: "$primary", fontFamily: "MiSans", letterSpacing: 3}
    title: {fontSize: 30, color: "$ink", fontFamily: "alimamashuheiti"}
    body: {fontSize: 17, color: "$ink", fontFamily: "MiSans", lineHeight: 1.5}
    small: {fontSize: 13, color: "$soft", fontFamily: "MiSans", lineHeight: 1.4}
  tableStyles:
    default:
      fontSize: 15
      fontFamily: "MiSans"
      headerFill: "$night"
      headerColor: "#FFFFFF"
      headerBold: true
      bodyFill: ["#FFFFFF", "#F4F2EC"]
      bodyColor: "$ink"
      border: {style: solid, width: 1, color: "$line"}
```
