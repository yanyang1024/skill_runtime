# Skill Growth Studio v0.2 验收报告

> 构建完成时间：2026-06-23
> 测试 Skill：`reference_skill/tech-doc-didactic-rewriter`

---

## 1. 项目结构

```
skill_runtime/
├── app/
│   ├── cli/                 # skill-growth CLI 入口
│   ├── server/              # Express 控制平面（REST + SSE + OpenCode Web UI 反向代理）
│   │   ├── errorHandler.ts  # 统一错误处理
│   │   ├── utils/skillLock.ts # per-skill 并发锁
│   │   ├── stageRuntimeManager.ts # 多 stage opencode web runtime 管理
│   │   └── routes/
│   │       ├── skills.ts
│   │       ├── runs.ts
│   │       ├── stages.ts
│   │       ├── artifacts.ts
│   │       └── events.ts
│   ├── orchestration/       # 阶段状态机 + run 编排
│   │   ├── stageContracts.ts
│   │   ├── stateMachine.ts
│   │   ├── runLifecycle.ts
│   │   └── stageTransitions.ts
│   ├── workspace_builder/   # 构造每个 stage 的 OpenCode workspace
│   │   ├── builder.ts
│   │   ├── opencodeConfig.ts
│   │   ├── stageInputs.ts
│   │   └── bwrap.ts
│   ├── api_test_runner/     # API 测试脚本执行
│   ├── prompt_recommender/  # 本地 v1 LLM 推荐输入语句
│   ├── ui/                  # 多屏导演台 SPA
│   │   ├── index.html
│   │   ├── app.js
│   │   ├── styles.css
│   │   └── services/api.js
│   ├── workers/             # 旧版四个阶段执行器（保留兼容）
│   └── shared/              # Zod schemas、路径、快照/归档工具
├── skills/tech-doc-didactic-rewriter/stable/
├── runs/<run_id>/           # 一次完整生长 run
├── prompt_library/          # 8 个阶段常用语句库
├── traces/、growth_runs/、experiments/、api_docs/
├── .Grow_backups/
├── configs/
├── tests/
├── package.json / tsconfig.json / pnpm-lock.yaml
└── README.md / AGENTS.md / build_plan.md / web_ui_design.md
```

---

## 2. 已完成功能对照表

| 目标 | 状态 | 关键文件 |
|---|---|---|
| 项目脚手架、TypeScript、依赖 | ✅ | `package.json`, `tsconfig.json` |
| 核心数据结构（Zod schemas，含 v0.2 扩展） | ✅ | `app/shared/schemas/index.ts` |
| 多 OpenCode Web Runtime stage 基础设施 | ✅ | `app/server/stageRuntimeManager.ts`, `app/workspace_builder/` |
| 8 类 stage 的 workspace 与 contract | ✅ | `app/orchestration/stageContracts.ts` |
| Run / Stage 状态机持久化 | ✅ | `app/orchestration/stateMachine.ts`, `app/orchestration/runLifecycle.ts` |
| Prompt Recommender（本地 v1 LLM） | ✅ | `app/prompt_recommender/` |
| 多屏导演台 Web UI | ✅ | `app/ui/app.js`, `app/ui/styles.css` |
| Stage 启动多层 readiness 校验 | ✅ | `app/server/stageRuntimeManager.ts` |
| 异步消息 + SSE 流式监听 | ✅ | `app/server/routes/stages.ts` |
| reasoning / content 流式产物分离 | ✅ | `app/server/routes/stages.ts` |
| Stage 停止时取消 SSE reader | ✅ | `app/server/routes/stages.ts`, `app/server/stageRuntimeManager.ts` |
| 文件附件消息支持 | ✅ | `app/server/routes/stages.ts` |
| API 测试脚本执行 | ✅ | `app/api_test_runner/runner.ts` |
| 旧版 Observe / Grow / Stabilize 兼容 | ✅ | `app/workers/` |
| promote / rollback 安全归档 | ✅ | `app/server/routes/skills.ts`, `app/snapshot_manager/` |
| 单元 + 集成 + v0.2 集成测试 | ✅ | `tests/*.test.ts` |

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
pnpm start
```

打开 http://localhost:3000 即可看到导演台。

### CLI

```bash
pnpm cli server
pnpm cli
```

### 运行测试与构建

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
▶ model endpoints
  ✔ glm4:9b responds
  ✔ qwen3.5:9b responds
  - deepseek-v4-pro responds (SKIP)
▶ opencode server
  ✔ /global/health is healthy
  ✔ can create a session
  ✔ can get session details
  ✔ can send an async prompt
▶ skill-growth app api
  ✔ /api/health returns ok
  ✔ can create a run
  ✔ can get run state
  ✔ recommend-prompt returns structured suggestion
  ✔ can commit work/ to preview
  ✔ can run api-tests and produce machine-test-result.json
▶ schemas
  ✔ validates a minimal RuntimeTrace
  ✔ rejects a RuntimeTrace missing required fields
  ✔ validates a dry-run plan
  ✔ validates snapshot and archive manifests
  ✔ validates endpoint manifest
  ✔ validates quality report
  ✔ validates new v0.2 schemas
▶ v0.2 run / stage lifecycle
  ✔ creates a run and persists run-state.yaml
  ✔ creates stage state on start endpoint request (without opencode)
ℹ tests 27
ℹ suites 6
ℹ pass 26
ℹ fail 0
ℹ cancelled 0
ℹ skipped 1
```

`pnpm build` 通过 TypeScript 严格检查。

---

## 5. 手动验证记录

- 浏览器访问 `http://localhost:3000` 可看到导演台：顶部 Skill / Run 选择、左侧 Stage Navigator、中间 OpenCode Web 打开区、右侧 Prompt Assistant、底部 Artifacts 轮询。
- 启动 `observe-log-review` stage 后，应用会校验 `/global/health`、`/provider`、`/config` 三层 readiness，然后返回带 `auth_token` 的 `open_url_with_auth`。
- 点击“打开 OpenCode Web”会在新标签页打开 OpenCode Web，无需手动 Basic Auth。
- 通过“发送到 OpenCode”提交异步 prompt，SSE `/event` 被监听；原始事件写入 `output/session-stream.md`，reasoning 与 content 文本分别追加到 `output/session-stream-reasoning.md` 与 `output/session-stream-content.md`。
- 停止 Stage 时，SSE reader 会被显式 cancel，不会产生孤儿 reader。
- `grow-build` / `rehearse-iteration` 停止或提交时，`workspace/work/` 产物会同步回 preview skill，且被删除的文件会归档到 `.archive/`。
- `/api/skills/tech-doc-didactic-rewriter/promote` 会先做 stable 快照，再把旧 stable 归档到 releases 与 `.archive/`，最后把 preview 提升为 stable。
- `/api/skills/tech-doc-didactic-rewriter/rollback` 可从快照恢复，并先归档当前 skill 目录。

---

## 6. 已知限制与后续建议

1. **LLM 接入**：Observe/Grow 的 workers 仍使用基于 eval prompt 的确定性模板。后续可把旧版 workers 也迁移到 OpenCode Web Runtime 模式，让 replay card 与 growth plan 由模型整理。
2. **bwrap 隔离**：`bwrap` 配置文件已预留，默认未强制启用；后续可在 `stageRuntimeManager.ts` 中包装 bwrap。
3. **前端框架**：当前为原生 JS，适合 v0.2；后续可按需迁移到 React/Vue 以支持更复杂的实时协作。
4. **日志解析**：`traces/raw_sessions/` 的解析当前用 eval prompt 模拟，未接入真实 OpenCode session log。
5. **API 写操作**：仅支持读操作端点；写操作仍按设计仅允许 dry-run / sandbox / mock。
6. **CLI 命令**：`cli/index.ts` 当前主要封装 `server` 子命令，后续可补齐 `run`、`stage`、`promote`、`rollback` 等 CLI 入口。
7. **OpenCode Web 反向代理**：默认关闭，需 `STAGE_ENABLE_PROXY=1` 启用；当前推荐直接使用 `auth_token` URL。

---

## 7. 核心设计原则落实情况

- ✅ 不在分析中间停顿提问：Observe 直接输出全量分析。
- ✅ 确定性层搭舞台、灵活层在舞台里工作、人类导演做判断。
- ✅ 每个 stage 都有独立 workspace、opencode.json、端口与输入/输出目录。
- ✅ Stage 写操作前先对 preview / stable 打快照。
- ✅ 永不删除，只归档：删除操作统一转换为 `archiveFiles` 移动到 `.archive/<UTC>/`。
- ✅ 异步消息 + SSE 流式监听不阻塞 HTTP 请求。
- ✅ 新 API 端点先测试再入 skill：endpoint manifest 状态 candidate → verified → active。
