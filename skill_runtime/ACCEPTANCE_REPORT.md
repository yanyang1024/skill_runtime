# Skill Growth Studio v0.1 验收报告

> 构建完成时间：2026-06-22
> 测试 Skill：`reference_skill/tech-doc-didactic-rewriter`

---

## 1. 项目结构

```
skill_runtime/
├── app/
│   ├── cli/                 # skill-growth CLI 入口
│   ├── server/              # Express 控制平面（REST + SSE + 反向代理）
│   ├── ui/                  # 原生 ES Modules 前端
│   ├── workers/             # observe / grow / quality / api / stabilize
│   └── shared/              # Zod schemas、路径、快照/归档工具
├── skills/tech-doc-didactic-rewriter/stable/
├── traces/、growth_runs/、experiments/、api_docs/
├── .Grow_backups/
├── configs/
├── tests/
├── package.json / tsconfig.json / pnpm-lock.yaml
├── build_plan.md / web_ui_design.md
└── ACCEPTANCE_REPORT.md
```

---

## 2. 已完成功能对照表

| 目标 | 状态 | 关键文件 |
|---|---|---|
| 项目脚手架、TypeScript、依赖 | ✅ | `package.json`, `tsconfig.json` |
| 核心数据结构（Zod schemas） | ✅ | `app/shared/schemas/index.ts` |
| Observe：从 eval prompt 生成 Runtime Trace / Replay Card / Growth Opportunities | ✅ | `app/workers/observe/index.ts` |
| Grow dry-run：生成 Dry-run Plan / Growth Proposal，不改 stable | ✅ | `app/workers/grow/dryRun.ts` |
| Web UI：Skill 文件树 + Markdown 渲染 + Diff 标签 | ✅ | `app/ui/components/skillPreview.js` |
| Session Manager：启动/停止隔离 OpenCode server | ✅ | `app/server/sessionManager.ts` |
| Web UI：多 OpenCode 会话同屏（1×1 / 1×2 / 2×2） | ✅ | `app/ui/components/rehearse.js` |
| Grow live：快照 → 应用 preview → 归档 → Quality Gate | ✅ | `app/workers/grow/live.ts` |
| Quality Gate：frontmatter / references / 正向引导 / 归档安全 | ✅ | `app/workers/quality/index.ts` |
| API 端点生命周期：scan / test / manifest / 本地 mock | ✅ | `app/workers/api/scan.ts`, `app/workers/api/test.ts` |
| Rehearse：导演反馈标签 + notes 保存 | ✅ | `app/ui/components/rehearse.js`, `/api/sessions/:id/notes` |
| Stabilize：promote preview 到 stable / 生成 release / changelog | ✅ | `app/workers/stabilize/promote.ts` |
| Rollback：从快照恢复 skill 目录 | ✅ | `app/workers/stabilize/rollback.ts` |
| 单元 + 集成测试 | ✅ | `tests/schemas.test.ts`, `tests/integration.test.ts` |

---

## 3. 运行方式

### 安装依赖

```bash
pnpm install
```

### 启动 Web UI

```bash
pnpm dev
# 或
pnpm cli server
```

打开 http://localhost:3000 即可看到控制台。

### CLI（当前主要封装 server）

```bash
pnpm cli
```

### 运行测试

```bash
pnpm test
pnpm build
```

---

## 4. 测试结果

```
▶ integration: skill lifecycle
  ✔ runs observe and creates a trace
  ✔ runs grow dry-run and creates a plan
  ✔ runs grow live and produces a passing preview
  ✔ promotes preview to stable and creates a release
  ✔ rolls back to a previous snapshot
▶ schemas
  ✔ validates a minimal RuntimeTrace
  ✔ rejects a RuntimeTrace missing required fields
  ✔ validates a dry-run plan
  ✔ validates snapshot and archive manifests
  ✔ validates endpoint manifest
  ✔ validates quality report
ℹ tests 11
ℹ pass 11
ℹ fail 0
```

`pnpm build` 也通过 TypeScript 严格检查。

---

## 5. 手动验证记录

- 浏览器访问 `http://localhost:3000` 可浏览 `SKILL.md` 渲染、stable/preview 文件树。
- Rehearse 页面可启动多个 `opencode serve` 实例，同屏 iframe 显示，停止后无孤儿进程。
- `/api/skills/tech-doc-didactic-rewriter/grow/live` 会先生成 `.Grow_backups` 快照，再生成 preview，Quality Gate 通过。
- `/api/skills/tech-doc-didactic-rewriter/stabilize/promote` 会把旧 stable 移入 `releases/v0.1.0`，并把 preview 提升为 stable。
- `/api/skills/tech-doc-didactic-rewriter/rollback` 可从快照恢复。
- API scan/test 在本地 mock endpoint 上通过 existence + schema 测试。

---

## 6. 已知限制与后续建议

1. **LLM 接入**：当前 Observe/Grow 使用基于 eval prompt 的确定性模板生成 Trace/Proposal。建议后续接入本地 SGLang（配置已就绪：`configs/model-providers/sglang.yaml`），让 Replay Card 和 Growth Proposal 真正由模型整理。
2. **bwrap 隔离**：Rehearse 当前通过独立 cwd + `OPENCODE_CONFIG_CONTENT` 实现隔离，bwrap profile 已预留但未强制启用。
3. **API 写操作**：第一版仅支持读操作端点；写操作仍按 plan 要求仅允许 dry-run / sandbox / mock。
4. **前端状态**：当前为无框架原生 JS，适合第一版；后续可迁移到 React/Vue 以支持更复杂的实时协作。
5. **日志解析**：`traces/raw_sessions/` 的解析当前用 eval prompt 模拟，后续可接入真实 OpenCode session log。
6. **Quality Gate**：已实现基础检查，后续可按 `configs/quality-gates/default.yaml` 扩展更多规则。

---

## 7. 核心设计原则落实情况

- ✅ 不在分析中间停顿提问：Observe 直接输出全量分析。
- ✅ Growth Proposal 后一键确认：Web UI 提供 prominent 确认按钮。
- ✅ Grow 默认 dry-run：后端 `/grow/dry-run` 只读产物；`/grow/live` 才写文件。
- ✅ 动手前先打快照：每次 live run / promote 前自动调用 `createSkillSnapshot`。
- ✅ 永不删除，只归档：archive 操作使用 `fs.rename` 到 `.archive/<UTC>/`。
- ✅ 批量 edit 后自动 Quality Gate：`runGrowLive` 最后一步运行 `runQualityGate`。
- ✅ 新 API 端点先测试再入 skill：endpoint manifest 状态 candidate → verified → active。
