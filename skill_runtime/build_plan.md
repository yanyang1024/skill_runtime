# Skill Growth Studio v0.1 应用构建计划

> 依据 `ori_need.txt` 与 `plan.txt` 整理，面向第一版可运行的本地化 Skill 生命周期管理应用。
> 测试 Skill 来源：`reference_skill/tech-doc-didactic-rewriter/`。

---

## 1. 版本目标与边界

### 1.1 目标
构建一个完全本地化的 **CLI + Web UI 双入口** 应用，围绕四个动词实现 Skill 生命周期闭环：

- **Observe**：从会话/工具/脚本日志中提取 Runtime Trace、Runtime Replay Card 与生长机会。
- **Grow**：默认 `--dry-run` 生成克制可审的 Growth Proposal；一键确认后 `--live` 执行，先快照、再修改、后自动 Quality Gate。
- **Rehearse**：在隔离临时目录中启动 preview OpenCode server，让“导演”体验并记录反馈。
- **Stabilize**：把排练通过的 preview 提升为 stable，生成 release 包、changelog 与 rollback 点。

### 1.2 边界
- 第一版 **CLI 与 Web UI 同步建设**；Web UI 至少包含 skill 内容预览、多 OpenCode 会话同屏显示、一键确认与导演反馈。
- API 端点流仅支持**读操作**（写操作仅允许 dry-run / sandbox / mock）。
- 第一版 LLM 只接入本地 SGLang 的 OpenAI v1 兼容接口。
- 所有写操作遵循：**先快照 → 只归档不删除 → 自动 Quality Gate**。

---

## 2. 技术栈

| 层级 | 选型 | 说明 |
|---|---|---|
| 运行时 | Node.js 20+ | 现有 `package.json` 已初始化 |
| 模块 | ESM | `@opencode-ai/*` 为 ESM，顶层改为 `"type": "module"` 或主要源码用 `.mjs` |
| 语言 | TypeScript 5+ | 添加 `tsconfig.json`，源码放在 `app/` |
| Schema / 类型 | Zod | 所有持久化结构先定义 schema 再生成类型 |
| 函数式编排 | Effect（可选） | 核心编排用 `effect`，简单脚本用 `try/catch` |
| 子进程 | `cross-spawn` | 已安装，调用 tar / bwrap / opencode server |
| YAML/JSON | `yaml` | 已安装 |
| 快照打包 | `tar` (npm) 或系统 `tar` | 生成 `.Grow_backups/<skill>/<UTC>.tar.gz` |
| Web UI 后端 | Express | 静态资源、REST API、SSE、反向代理 |
| Web UI 前端 | 原生 ES Modules + `marked` | 不引入 React/Vue，减少构建步骤；所有资源本地 |
| 反向代理 | `http-proxy-middleware` | 解决 OpenCode Web iframe 嵌入限制（兜底方案） |
| 测试 | Node 内置 test runner + `assert` | 不引入额外重型测试框架 |
| Python | `py312_skill` 虚拟环境 | 预留给日志解析 / trace 规范化脚本，第一版以 Node 为主 |

---

## 3. 项目目录结构（与 `plan.txt` 对齐）

```
skill_runtime/
├── app/
│   ├── cli/                    # skill-growth 命令入口
│   ├── server/                 # 控制平面 Web 服务器（Express + REST + SSE）
│   │   ├── index.ts            # 服务入口
│   │   ├── routes/             # API 路由
│   │   └── sessionManager.ts   # OpenCode server 进程管理
│   ├── ui/                     # 前端静态资源
│   │   ├── index.html
│   │   ├── app.js              # SPA 路由与状态
│   │   ├── components/         # 可复用组件（session-grid, markdown-viewer, diff-view）
│   │   └── styles.css
│   ├── workers/                # 四个阶段的具体执行器
│   │   ├── observe/
│   │   ├── grow/
│   │   ├── rehearse/
│   │   └── stabilize/
│   └── shared/                 # schema、fs-utils、llm client、snapshot/archive 工具
├── skills/
│   └── tech-doc-didactic-rewriter/   # 从 reference_skill 复制/链接的测试 skill
│       ├── stable/
│       ├── previews/
│       ├── releases/
│       └── .archive/
├── traces/
│   └── tech-doc-didactic-rewriter/
├── growth_runs/
│   └── tech-doc-didactic-rewriter/
├── experiments/
│   └── tech-doc-didactic-rewriter/
├── api_docs/
│   └── tech-doc-didactic-rewriter/
├── .Grow_backups/
│   └── tech-doc-didactic-rewriter/
├── configs/
│   ├── model-providers/
│   ├── bwrap-profiles/
│   ├── opencode-templates/
│   └── quality-gates/
├── scripts/                    # Python 辅助脚本（预留）
├── tests/
├── package.json
├── tsconfig.json
└── build_plan.md
```

---

## 4. Phase 划分与交付物

### Phase 0：项目脚手架（CLI + Web UI 双入口）

**任务**：
1. 修改 `package.json`：`"type": "module"`，添加 `build`、`dev`、`test`、`start` 脚本。
2. 安装开发依赖：`typescript`、`@types/node`、`tsx`（用于直接运行 `.ts` CLI/Server）。
3. 安装运行依赖：`zod`、`yaml`、`tar`、`marked`、`express`（Web UI 后端）、`http-proxy-middleware`（iframe 反向代理兜底）。
4. 添加 `tsconfig.json`（ESM、strict、输出到 `dist/`）。
5. 创建目录结构，新增 `app/ui/`（前端静态资源）。
6. 把 `reference_skill/tech-doc-didactic-rewriter/` 复制到 `skills/tech-doc-didactic-rewriter/stable/` 作为测试基线。
7. 添加 `configs/model-providers/sglang.yaml` 模板。

**交付物**：可执行 `npm run build` 与 `npm run dev`（启动控制平面 Web 服务）。

**验收**：
- `npm test` 跑通健康检查。
- 访问 `http://localhost:3000` 能看到应用壳（Top Bar + Sidebar + Main Workspace）。

---

### Phase 1：核心数据结构定义（不动任何 skill 文件）

**任务**：
1. 用 Zod 定义以下 schema 并导出 TypeScript 类型：
   - `RuntimeTrace`
   - `RuntimeReplayCard`
   - `GrowthOpportunities`
   - `DryRunPlan`
   - `GrowthProposal`
   - `ArchiveManifest`
   - `SnapshotManifest`
   - `EndpointManifest`
   - `DirectorNotes`
   - `QualityReport`
2. 为每个结构定义 YAML/JSON 序列化与反序列化函数。
3. 编写模板示例到 `configs/quality-gates/` 与 `configs/opencode-templates/`。

**交付物**：`app/shared/schemas/` 下全部类型与校验函数。

**验收**：对每个 schema 提供正向/反向单元测试；非法结构会被 Zod 拒绝。

---

### Phase 2：Observe + Grow dry-run 后端 + Web UI 骨架

**任务**：
1. **日志解析器**：读取 `traces/<skill>/raw_sessions/` 下的日志（第一版可先用 eval prompt 模拟 session log），提取原始用户语句。
2. **Trace Normalizer**、**Replay Card Builder**、**Growth Opportunity Miner**、**Dry-run Planner**、**Growth Proposal Writer**。
3. **CLI 命令**：
   - `skill-growth observe --skill tech-doc-didactic-rewriter --session latest`
   - `skill-growth grow --skill tech-doc-didactic-rewriter --trace latest --dry-run`
4. **Web UI 骨架**：
   - Top Bar（skill 选择器、全局状态）。
   - Left Sidebar（skill 文件树、traces、runs、experiments）。
   - Main Workspace 标签系统。
5. **Skill Preview 页面**：
   - 文件树 API `/api/skills/:id/tree`。
   - Markdown 渲染（`marked`）与 frontmatter 卡片。
   - stable vs preview diff 视图。

**交付物**：
- `growth_runs/<skill>/run-XXXX/{runtime-trace.json,replay-card.md,growth-opportunities.yaml,dry-run-plan.yaml,growth-proposal.md}`。
- Web UI 可浏览 skill 文件与 diff。

**验收**：
- `--dry-run` 不改动 `skills/<skill>/stable/`。
- 在浏览器中能看到 `SKILL.md` 渲染结果与 stable/preview 差异。

---

### Phase 3：Web UI 控制平面 + Session Manager

**任务**：
1. 后端 Session Manager：
   - 扫描空闲端口。
   - 在 `experiments/<skill>/rehearse-XXXX/` 创建隔离 workspace。
   - 启动 `opencode serve` 子进程（独立 cwd + `OPENCODE_CONFIG_CONTENT`）。
   - 维护 `sessions` 状态表（id / port / url / configDir / status）。
2. REST API：
   - `POST /api/sessions`、
   - `GET /api/sessions`、
   - `DELETE /api/sessions/:id`、
   - `GET /api/sessions/:id/view/*`（反向代理，兜底 iframe 嵌入）。
3. SSE `/api/events`：推送 worker 状态与 OpenCode server 事件。
4. Web UI Session Grid：
   - 1×1 / 1×2 / 2×2 布局切换。
   - 每个 panel 为 iframe（直接 URL 或代理路径）。
   - panel header 显示角色标签、运行状态、关闭/刷新。

**交付物**：
- 可独立启动多个 OpenCode server。
- 浏览器同屏显示多个隔离 OpenCode 会话。

**验收**：
- 启动 2 个不同 skill 版本的会话，它们在 UI 中同时显示且互不干扰。
- 停止按钮能终止对应子进程，端口释放。

---

### Phase 4：Grow live + 快照 / 归档 / Quality Gate

**任务**：
1. **Snapshot Manager**：`--live` 前把整个 `skills/<skill>/` 目录打包到 `.Grow_backups/<skill>/<UTC>.tar.gz`，生成 `snapshot_manifest.yaml`。
2. **Archive Manager**：`archive_file` 实现为 `move` 到 `.archive/<UTC>/`，生成 `archive_manifest.yaml`；禁止 `fs.unlink`。
3. **File Applicator**：按 plan 把改动先写入 `previews/preview-XXXX/`，不直接覆盖 stable。
4. **Quality Gate Runner**：批量 edit 后自动运行检查（skill / 一致性 / API / 工具 / 归档 / 体验）。
5. **CLI 命令**：
   - `skill-growth grow --skill tech-doc-didactic-rewriter --proposal latest --live`
   - `skill-growth quality --skill tech-doc-didactic-rewriter --preview latest`
6. **Web UI 集成**：
   - Grow 标签展示 proposal / dry-run plan / archive plan / API report。
   - “一键确认 live run”按钮，带二次确认弹窗。
   - live run 进度条（快照 → 应用 → 归档 → Quality Gate → preview）。

**交付物**：快照 tar.gz、preview skill 包、quality-report.md、archive manifest。

**验收**：
- `--live` 前必须存在快照文件。
- 删除操作全部转为 archive。
- UI 中一键确认后能看到实时进度与最终 quality report。
- Quality Gate 失败自动回滚。

---

### Phase 5：API 端点生命周期（读操作优先）

**任务**：
1. **API Doc Normalizer**：解析 `api_docs/<skill>/raw/`，输出 `normalized/latest.yaml`。
2. **Endpoint Diff**、**Endpoint Manifest Curator**（状态：discovered → candidate → verified → active）。
3. **Basic Tests Generator**：existence / auth / schema / minimal input / error handling。
4. **API Test Runner**：测试通过后状态变为 `active`。
5. **Tool Wrapper Proposal**。
6. **CLI 命令**：
   - `skill-growth api-scan ...`
   - `skill-growth api-test ...`
7. **Web UI 集成**：
   - API Docs 标签展示 raw / normalized / endpoint 状态。
   - endpoint 卡片显示测试列表与通过状态。

**交付物**：`api_docs/<skill>/normalized/`、`endpoint_tests/`、`endpoint_manifest.yaml`、api-endpoint-report.md。

**验收**：读端点测试可运行；未通过测试的端点不会被 SKILL.md 引用。

---

### Phase 6：Rehearse + 导演反馈 UI

**任务**：
1. **Temp Workspace Manager**、**Preview Skill Builder**、**OpenCode Server Launcher**（独立 cwd + config；开发阶段暂不用 bwrap）。
2. **Eval Scenarios 集成**：读取 `skills/<skill>/stable/evals/evals.json`，在 Session Grid 旁展示 prompt 列表；支持“一键为每个 eval 启动会话”。
3. **Director Feedback Collector**：
   - 每个 session panel 底部快速标签：更自然 / 太啰嗦 / 问太多 / 流程对 / 工具用错 / 可以稳定化 / 需要小改 / 丢弃。
   - 文本 note 输入框。
   - 保存到 `experiments/<skill>/rehearse-XXXX/director-notes.yaml`。
4. **CLI 命令**：
   - `skill-growth rehearse --skill tech-doc-didactic-rewriter --preview latest`

**交付物**：`experiments/<skill>/rehearse-XXXX/{workspace/,runtime.env,rehearse-report.md,director-notes.yaml}`。

**验收**：
- 临时目录与 stable runtime 隔离。
- UI 中可一键启动多个 eval 会话并同屏观察。
- director notes 可被 Stabilize 读取。

---

### Phase 7：Stabilize（沉淀固化）

**任务**：
1. 用户选择 `promote / revise / discard`。
2. **Promote Manager**：快照 → 最终 Quality Gate → preview 合并到 stable → 旧 stable 进 releases → 过时文件归档。
3. **Release Packager**、**Changelog Generator**、**Rollback Manager**。
4. **CLI 命令**：
   - `skill-growth stabilize --skill tech-doc-didactic-rewriter --preview latest --promote`
   - `skill-growth restore --snapshot snapshot-XXXX`
5. **Web UI 集成**：
   - Stabilize 标签展示 release diff、可编辑 changelog、quality report。
   - Promote / Revise / Discard 按钮。
   - 快照列表与一键回滚。

**交付物**：新版本 stable、release 包、changelog、archive manifest、snapshot manifest。

**验收**：
- promote 前存在最终快照与 Quality Gate 通过报告。
- 旧 stable 完整保留在 releases。
- restore 后 skill 目录与快照时一致。

---

## 5. 测试策略

| 层级 | 方式 | 覆盖点 |
|---|---|---|
| 单元测试 | Node test runner | schema 校验、快照/归档工具、Quality Gate 单条规则 |
| 集成测试 | 临时目录 + reference_skill | `observe → grow --dry-run → grow --live → quality` 全流程 |
| 隔离测试 | bwrap + 独立 OPENCODE_CONFIG_DIR | Rehearse 不污染 stable |
| 回归测试 | snapshot restore | 任意快照恢复后目录 diff 为空 |
| UI 测试 | Playwright 或手动 + 内置 test | Skill Preview 渲染、Session Grid 启动/停止、一键确认流程 |
| 端到端 | eval prompt 模拟 session | 用 `reference_skill/evals/evals.json` 中的 prompt 作为 session 输入，验证 Observe 能生成合理 replay card |

---

## 6. 风险与依赖

| 风险 | 缓解 |
|---|---|
| `opencode` CLI 在本环境未安装 | 已确认全局 `opencode` 可用；如版本差异导致问题，改用 `npx @opencode-ai/opencode-ai` |
| OpenCode Web 禁止 iframe 嵌入 | 优先直接 iframe；若失败，用后端反向代理剥离 `X-Frame-Options`；再失败则外链 |
| 多端口冲突 | Session Manager 自动扫描空闲端口（如 9000-9999） |
| `bwrap` 需要 root / 命名空间支持 | 开发阶段先用普通临时目录 + 独立 `OPENCODE_CONFIG_DIR` 模拟；bwrap 作为可配置增强 |
| SGLang API 地址与密钥未知 | 配置化：`configs/model-providers/sglang.yaml`，默认 `http://localhost:8000/v1` |
| ESM / CommonJS 混用 | 顶层改为 ESM，CLI 与 server 入口用 `.ts` 经 `tsx` 运行；与 `@opencode-ai/*` 动态 `import()` 兜底 |

---

## 7. 下一步

1. 请确认本计划是否符合预期，尤其是：
   - Web UI 技术栈（Express 后端 + 原生 ES Modules 前端 + `marked`）是否接受？
   - 是否接受第一版 API 端点仅支持读操作？
   - 是否希望把 `package.json` 改为 ESM（`"type": "module"`）？
2. 确认后，我将按 **Phase 0 → Phase 1 → Phase 2 …** 的顺序逐步实施，每阶段完成后给出验收结果。
