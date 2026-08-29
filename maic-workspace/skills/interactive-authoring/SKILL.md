---
name: interactive-authoring
description: 交互式场景 HTML 的创作 SOP（tutorial/simulation/diagram/code/game 五种 widget）。当需要根据 job card 生成一个 interactive 场景的自包含 HTML 时使用。包含 widgetType 决策表、产出流程、离线红线与自检清单。
license: MIT
compatibility: opencode
metadata:
  audience: scene-builder
  workflow: course-production
---

# 交互场景创作 SOP

输入：一张 job card（含 outline_item、material_refs、languageDirective、output_path）。
产出：一个 `type: "interactive"` 的场景 JSON，`content.html` 为完整自包含 HTML。
渲染契约全文见 references/widget-contract.md；踩坑清单见 references/common-pitfalls.md。

## widgetType 选择决策表

job card 已给定 widgetType 时遵循之；需要自行判断时按下表：

| 内容特征 | widgetType | 结构要点 |
|---|---|---|
| 概念讲解、封面、小结、速查表 | `tutorial` | 图文分区排版 + 嵌入式小交互（折叠面板、步骤切换、即点即答） |
| 参数可调的过程现象 | `simulation` | 控制面板（滑块/按钮）+ canvas/SVG 可视化 + 明确状态机（idle/running/paused/ended） |
| 流程、结构、因果链 | `diagram` | SVG 节点图，内嵌 JSON 数据（nodes/edges/revealOrder），节点点击查看详情 |
| 编程概念、算法 | `code` | 编辑区 + 运行 + 输出 + 测试用例；只有 JS 可浏览器内执行，其他语言只演示 |
| 练习、游戏化巩固 | `game` | 玩家操控影响结果（拖拽/调参/限时判断），不是换皮选择题 |

## 产出流程

1. 通读 job card 与 material_refs，列出本场景要传达的 keyPoints。
2. **一次写完整个 HTML**，顺序：先结构（HTML 骨架 + 元素命名）→ 再样式（内联 CSS，针对 1280×720 逻辑视口）→ 最后交互（JS + postMessage 监听）。
3. 嵌 widget-config：`<script type="application/json" id="widget-config">` 内放结构化配置（见 references/widget-contract.md）。
4. 按下方自检清单逐项过一遍。
5. 组装场景 JSON（`type` 与 `content.type` 一致，均为 `"interactive"`），写入 job card 指定的 `output_path`。
6. **必须运行** `python3 tools/course_validate.py --course <course_dir> --scene <scene_id>`，ERROR 清零才算完成；回执中如实报告 errors/warnings。

## 离线红线（违反即校验 ERROR）

- **禁止任何 http(s) 外部资源**：CDN（cdn.jsdelivr/unpkg/cdnjs…）、外链字体、外链图片、网络请求（fetch/XHR/WebSocket）一律禁止。CSS/JS 全部内联。
- 数学公式用纯文本/Unicode/CSS 呈现，**不引入 KaTeX/MathJax**。
- **禁止 localStorage/cookie**：宿主 sandbox 无 `allow-same-origin`（null origin），状态全部保存在内存。
- 引用图片只允许 `assets/` 下的本地相对路径。

## 自检清单（产出前逐项确认）

- [ ] HTML 恰好一个 `<!DOCTYPE html>` 开头、一个 `</html>` 结尾，无重复内容
- [ ] 零 http(s) 外链、零网络请求、零 localStorage
- [ ] 布局针对 1280×720 逻辑视口，不依赖窗口实际尺寸
- [ ] 关键控件按命名约定给 id/class（`{变量名}-slider`、`{动作}-btn`、`#reset-btn` 等）
- [ ] 已嵌入 postMessage 监听（参考实现见 references/widget-contract.md）
- [ ] widget-config JSON 可解析
- [ ] reset 能把所有状态变量恢复到初始值
- [ ] 动画/反馈肉眼可见，不是只有数字在变
- [ ] `course_validate.py` 运行结果 errors == 0
