# maic-workspace — 文档 → 交互式课程网站：OpenCode 课程生产工作区

把 OpenMAIC（THU-MAIC/OpenMAIC）的「文档 → 结构化课程」生成管线抽离出来，
重构成一个**低依赖、纯离线**的 OpenCode workspace：LLM agent 把 md/html 等技术文档
变成一门由**自包含交互式 HTML 教学页**组成的课程，并编译成可直接打开的静态课程网站。

重心不是多模态（不生成视频/语音），而是**更丰富的交互式教学内容**：
教程页、参数模拟、结构图探索、可运行代码、小游戏化练习，穿插测验与 PBL 项目。

## 从原项目带走了什么

| 资产 | 在这里的形态 |
|---|---|
| `@openmaic/dsl` 课程数据契约 | `dsl/SPEC.md`（MAIC-Lite v0.2 profile）+ `tools/course_validate.py` |
| 两阶段生成管线（大纲 → 逐场景） | `agents/` 4 角色 + `tools/course_scaffold.py` 脚手架 |
| 交互 widget 的 prompt 精华（postMessage 桥、踩坑清单） | `skills/interactive-authoring/` |
| 大纲 / 测验 / PBL 的生成方法论 | `skills/course-planning` · `quiz-authoring` · `pbl-design` |
| json-repair / 文档解析 / 校验分级 | `tools/` 五个 stdlib 脚本 |

**刻意做减法**：slide 画布场景、语音/视频生成、白板、React 前端、LangGraph、
PostgreSQL、云 provider 接入——这些在原项目是产品躯体，在这里是赘肉。

## 依赖

- Python 3.8+（只用标准库）
- 可选：系统 `pdftotext`（解析 PDF 时用）
- 可选：现代浏览器（打开生成的课程网站）
- 不需要：Node.js、数据库、Docker、任何 API key、任何网络服务

## 目录

```
agents/       course-director(primary) / material-analyst / scene-builder / scene-verifier
skills/       course-planning / interactive-authoring / quiz-authoring / pbl-design
commands/     /new-course · /build-site
opencode.json skill 权限门控（provider 用你自己的全局配置）
dsl/SPEC.md   MAIC-Lite v0.2 数据契约（校验器的依据）
PROTOCOL.md   agent 间交接协议（job card / 回执 / 质检门）
tools/        course_validate.py · json_repair.py · course_scaffold.py ·
              extract_material.py · build_player.py
examples/     demo-course：示例课程（兼测试 fixture）
tests/        stdlib unittest 安全网
```

## 快速开始

```bash
# 1. 在 OpenCode 中把本目录作为 workspace，切到 course-director agent（或用 /new-course）
# 2. 告诉它："用 docs/xxx.md 这篇文档做一门入门课"
#    它会：提取材料 → 出大纲与你确认 → 并行生成每个交互场景 →
#         逐场景质检 → 装配并构建站点 → 交付 site/ 目录

# 手动体验流水线（不需要 LLM，验证工具链）：
python3 tools/course_validate.py --course examples/demo-course
python3 tools/build_player.py examples/demo-course          # 默认 --mode site
# 浏览器打开 examples/demo-course/site/index.html

# 跑测试：
python3 -m unittest discover tests -v
```

## 设计哲学（继承自 OpenMAIC，并更进了一步）

1. **合同先行**：DSL 规范 + 校验器是 agent 之间唯一的信任基础。
   subagent 交付以"校验器 ERROR=0 + verifier 质检通过"为完成定义，不以"看起来写完了"为准。
2. **上下文隔离即架构**：材料全文只进 material-analyst；场景细节只进各自的
   scene-builder；director 上下文里只有大纲和回执。N 个场景 = N 个并行隔离实例。
3. **检查者不修复**：scene-verifier 只检查不改文件，修复永远由 scene-builder 做。
4. **交接物唯一化**：agent 之间只交接文件路径 + JSON，不交接散文。
5. **离线纪律**：制品零外链（校验器计 ERROR）；交互 HTML 完全自包含；
   课程网站零 CDN，双击即可打开。
