# Skill Growth Studio v0.3

> 基于 Headless OpenCode Runtime 的本地 Skill 生命周期导演台。
>
> 核心哲学：**OpenCode 是 headless agent runtime，Backend 是 Gateway + 隔离层，Frontend 是自建 ChatPage，人类导演做体验判断。**

---

## 1. 项目简介

Skill Growth Studio 帮助你以“导演”的视角管理一个 Skill 的完整生命周期，围绕四个动词：

| 动词 | 阶段 | 说明 |
|---|---|---|
| **Observe（观察）** | `observe-log-review` / `observe-api-scan` | 复盘会话日志、扫描 API 文档变化，生成 replay-card 与增长机会 |
| **Grow（生长）** | `grow-plan` / `grow-build` / `grow-quality-review` | 生成增长计划，在隔离 preview workspace 中修改 Skill，再经过质量 review |
| **Rehearse（排练）** | `rehearse-preview` / `rehearse-iteration` | 导演体验 Skill，写 director-review，基于反馈迭代 |
| **Stabilize（稳定化）** | `stabilize-release` | 发布前 review，promote preview 到 stable，保留快照与回滚点 |

每个阶段启动一个独立的 **headless `opencode serve`** 进程（不使用 OpenCode Web UI），在自建的 **React ChatPage** 中与 OpenCode 交互。

### v0.3 核心特性

- **Headless Runtime**：所有 stage 使用 `opencode serve`（不暴露 Web UI），Backend 通过 HTTP API 驱动
- **自建 ChatPage**：React 19 + Vite 6 SPA，支持 Markdown 渲染、reasoning 块折叠、tool call 展示、permission/question 交互
- **SSE 归一化**：Backend 将 OpenCode 原始 SSE 事件转换为统一的 `ChatSSEEvent` 协议
- **`x-opencode-directory` 注入**：所有 OpenCode 请求自动注入 workspace 隔离 header
- **bwrap 沙箱**：默认启用 bubblewrap 进程级文件系统隔离
- **四层路径防护**：应用层校验 + header 注入 + bwrap 隔离 + symlink 安全解析
- **快照/归档**：写前自动快照，永不删除只归档，完整回滚支持

---

## 2. 系统要求与部署

### 2.1 环境要求

| 依赖 | 版本/说明 |
|---|---|
| Node.js | >= 20 |
| pnpm | 项目使用 `pnpm-lock.yaml` |
| OpenCode CLI | 可选；实际启动 stage runtime 时需要 `opencode serve` |
| bwrap | 可选；bubblewrap 沙箱隔离，默认启用，可通过 `STAGE_USE_BWRAP=0` 关闭 |
| 模型服务 | 至少一个 OpenAI v1 兼容的 chat/completions 端点 |

> 如果只想体验 UI、状态机、Prompt Recommender 等确定性层功能，可以不安装 `opencode` CLI 和 `bwrap`。

### 2.2 安装

```bash
cd skill_runtime
pnpm install
pnpm build
```

### 2.3 启动方式

```bash
# 开发模式（后端 tsx watch + 前端 Vite dev server）
pnpm dev
# 后端: http://localhost:3000
# 前端 dev server: http://localhost:5173（代理 /api 到 3000）

# 生产模式
pnpm build
pnpm start

# 指定端口
SKILL_GROWTH_PORT=8080 pnpm dev

# CLI
pnpm cli server    # 启动 Web 服务
pnpm cli           # 查看帮助
```

---

## 3. 快速开始

### 3.1 打开导演台

1. 安装依赖并启动：`pnpm install && pnpm dev`
2. 浏览器打开 `http://localhost:3000`
3. 顶部选择要生长的 Skill（默认已有 `tech-doc-didactic-rewriter` 示例）
4. 点击“创建 Run”

### 3.2 运行一个阶段

1. 左侧 **Stage Navigator** 选择一个阶段，例如 `observe-log-review`
2. 点击 **启动 Stage**：
   - 构建 workspace（创建 `opencode.json`、复制 skill 快照、准备 input/）
   - 分配空闲端口（从 9500 起递增）
   - 构建 bwrap 命令（如启用）或使用直接 `opencode serve` 命令
   - 启动 `opencode serve` 子进程
   - 等待健康检查通过（`/global/health`、`/provider`、`/config`）
3. ChatPage 中直接发送 prompt 与 OpenCode 对话：
   - 消息以 Markdown 渲染，reasoning 块可折叠
   - Tool call / permission / question 均以卡片形式展示
   - 流式输出实时更新
4. 右侧 **Prompt Assistant** 可自动生成推荐输入，可编辑后发送到 ChatPage
5. 底部 **Artifact Panel** 展示 `output/` 目录下的产物，支持实时刷新

### 3.3 修改 preview skill

对于 `grow-build` / `rehearse-iteration` 等会修改 preview 的阶段：

- 阶段启动前自动对当前 preview 打快照（`.Grow_backups/preview/...`）
- OpenCode 在 `workspace/work/` 中修改文件
- 点击 **停止 Stage** 或 **提交到 Preview**，`work/` 产物会同步回 `skills/<skill>/previews/<preview>/`

### 3.4 API 扫描与测试

1. 启动 `observe-api-scan` stage
2. OpenCode 在 `output/api-tests/` 下生成测试脚本（`.py` / `.sh` / `.js`）
3. 调用 `POST /api/runs/:run/stage/observe-api-scan/run-api-tests`
4. 应用执行脚本并生成 `output/machine-test-result.json`

### 3.5 发布与回滚

```bash
# promote preview -> stable
curl -X POST http://localhost:3000/api/skills/<skill-id>/promote \
  -H "Content-Type: application/json" \
  -d '{"previewId":"<preview-id>","runId":"<run-id>"}'

# rollback 到指定 snapshot
curl -X POST http://localhost:3000/api/skills/<skill-id>/rollback \
  -H "Content-Type: application/json" \
  -d '{"snapshotId":"<snapshot-id>"}'
```

---

## 4. 配置详解

### 4.1 配置层级

```
环境变量
  ↓
app/workspace_builder/opencodeConfig.ts   （应用代码内置默认）
  ↓ 合并
custom.yaml / SKILL_GROWTH_PROVIDERS_CONFIG
  ↓ 生成
runs/<run>/<stage>/workspace/opencode.json
```

每个 stage 的 `opencode.json` 独立生成，互不影响。

### 4.2 环境变量

| 变量 | 说明 | 默认值 |
|---|---|---|
| `SKILL_GROWTH_PORT` | 应用监听端口 | `3000` |
| `SKILL_GROWTH_DEFAULT_MODEL` | OpenCode 默认模型 | `local-v1/glm4:9b` |
| `SKILL_GROWTH_SMALL_MODEL` | OpenCode 轻量模型 | `local-v1/glm4:9b` |
| `SKILL_GROWTH_LOCAL_V1_URL` | 本地 local-v1 provider 端点 | `http://172.24.16.1:11434/v1` |
| `SKILL_GROWTH_PROVIDERS_CONFIG` | 自定义 provider YAML/JSON 路径 | `configs/model-providers/custom.yaml` |
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥；设置后注入 `deepseek` provider | - |
| `OPENCODE_SERVER_USERNAME` | Stage runtime 的 Basic Auth 用户名 | `opencode` |
| `OPENCODE_SERVER_PASSWORD` | Stage runtime 的 Basic Auth 密码 | `skillgrowth` |
| `STAGE_USE_BWRAP` | 设置为 `0` 禁用 bubblewrap 隔离 | 默认启用 |
| `SKILL_GROWTH_RECOMMENDER_URL` | Prompt Recommender 端点 | `http://172.24.16.1:11434/v1` |
| `SKILL_GROWTH_RECOMMENDER_API_KEY` | Prompt Recommender API Key | `local` |
| `SKILL_GROWTH_RECOMMENDER_MODEL` | Prompt Recommender 模型 | `glm4:9b` |

复制 `.env.example` 为 `.env` 可快速配置：

```bash
cp .env.example .env
source .env
pnpm dev
```

### 4.3 接入自定义模型

Skill Growth Studio 通过 OpenAI v1 兼容接口接入模型。只需：

1. 在 provider 配置文件里声明模型
2. 把默认模型指向它

示例：接入 vLLM 部署的 `qwen:max`

编辑 `configs/model-providers/custom.yaml`：

```yaml
provider:
  vllm:
    npm: "@ai-sdk/openai-compatible"
    name: "vLLM Local"
    options:
      baseURL: "http://localhost:8000/v1"
      apiKey: "local"
    models:
      "qwen:max":
        name: "Qwen Max"
        tools: true
        capabilities:
          input: ["text"]
          output: ["text"]
        limit:
          context: 32768
          output: 8192
```

启动：

```bash
SKILL_GROWTH_DEFAULT_MODEL=vllm/qwen:max \
SKILL_GROWTH_SMALL_MODEL=vllm/qwen:max \
pnpm dev
```

关键规则：

- `provider.<id>.options.baseURL` **必须以 `/v1` 结尾**
- `provider.<id>.models` 必须显式列出所有可用模型 ID
- 根级 `model` 字段必须写成 `<provider-id>/<model-id>`
- `tools: true` 表示模型支持函数调用

### 4.4 权限配置

每个 stage 的 `opencode.json` 默认权限：

```json
{
  "permission": {
    "edit": "ask",
    "bash": {
      "*": "ask",
      "ls *": "allow",
      "cat *": "allow",
      "grep *": "allow",
      "python *": "ask",
      "rm *": "deny",
      "git push *": "deny"
    }
  },
  "agent": {
    "build": { "permission": { "edit": "allow", "bash": { "ls *": "allow", "cat *": "allow", "python *": "ask", "rm *": "deny" } } },
    "iteration": { "permission": { "edit": "allow", "bash": { "ls *": "allow", "cat *": "allow", "python *": "ask", "rm *": "deny" } } }
  }
}
```

- `allow`：直接执行
- `ask`：暂停等待人类确认（显示为 ChatPage 中的 PermissionCard）
- `deny`：拒绝执行

如需调整，修改 `app/workspace_builder/opencodeConfig.ts`。

---

## 5. 目录结构

```
skill_runtime/
├── app/
│   ├── cli/                     # skill-growth CLI 入口
│   ├── server/                  # Express 控制平面
│   │   ├── index.ts             # 服务入口
│   │   ├── stageRuntimeManager.ts   # opencode serve 生命周期管理
│   │   ├── artifactWatcher.ts       # stage output 目录变化监听
│   │   ├── routes/
│   │   │   ├── skills.ts        # /api/skills/*
│   │   │   ├── runs.ts          # /api/runs/*
│   │   │   ├── stages.ts        # /api/runs/:run/stage/:stage/*
│   │   │   ├── chat.ts          # /api/runs/:run/stage/:stage/chat/*
│   │   │   ├── artifacts.ts     # /api/runs/:run/stage/:stage/artifact/*
│   │   │   └── events.ts        # /api/events SSE 状态流
│   │   ├── middleware/validateParams.ts
│   │   └── stageRuntimeManager.ts   # opencode serve 生命周期管理
│   ├── orchestration/           # 阶段状态机 + run 编排
│   │   ├── stageContracts.ts    # 8 个 StageRuntimeContract
│   │   ├── stateMachine.ts      # RunState / StageState YAML 持久化
│   │   ├── runLifecycle.ts      # run / attempt 生命周期
│   │   └── stageTransitions.ts  # 推荐流转规则
│   ├── workspace_builder/       # 构造各 stage 的 OpenCode workspace
│   │   ├── builder.ts           # 目录结构与文件复制
│   │   ├── opencodeConfig.ts    # opencode.json 生成
│   │   ├── stageInputs.ts       # input/ 目录准备
│   │   └── bwrap.ts             # bwrap 命令构建
│   ├── opencode_client/         # OpenCode Gateway 底层实现
│   │   ├── index.ts             # createOpencodeSessionClient
│   │   └── sse.ts               # SSE 消费与归一化
│   ├── api_test_runner/         # 确定性 API 测试执行体
│   ├── prompt_recommender/      # v1 LLM 推荐输入语句
│   ├── snapshot_manager/        # 快照、归档、恢复
│   ├── log_collector/           # 日志收集
│   ├── web/                     # v0.3 React ChatPage SPA
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   └── src/
│   │       ├── App.tsx          # 导演台外壳
│   │       ├── pages/ChatPage.tsx
│   │       ├── components/      # StageNavigator 等 11 个组件（含 ErrorBoundary）
│   │       ├── hooks/           # useChatSession / useSSE
│   │       ├── services/        # api / chatApi
│   │       └── types/           # ChatMessage / ChatSSEEvent
│   ├── ui/                      # v0.2 旧版原生 ES Modules SPA（已废弃）
│   ├── workers/                 # v0.1 旧版执行器（保留兼容）
│   └── shared/                  # schema（Zod）、工具函数
├── skills/<skill-id>/
│   ├── stable/                  # 只读稳定版
│   ├── previews/<preview-id>/   # 可写 preview
│   ├── releases/                # 旧 stable 归档
│   └── .archive/                # 废弃文件归档（永不删除）
├── runs/<run-id>/               # 一次完整生长 run
│   └── <stage>/attempts/attempt-NNN/
│       ├── workspace/           # opencode.json + input/output/work
│       ├── server.json
│       └── stage-state.yaml
├── prompt_library/              # 各阶段常用语句库
├── configs/
│   ├── model-providers/         # local-v1 / custom / sglang
│   ├── bwrap-profiles/          # stage.profile / mounts.yaml
│   ├── opencode-templates/      # skill / stage opencode.json 模板
│   └── quality-gates/           # Quality Gate 检查清单
├── .Grow_backups/               # 快照 tar.gz + manifest
│   ├── stable/<skill>/<UTC>.tar.gz
│   └── preview/<skill>/<preview>/<UTC>.tar.gz
├── scripts/                     # 辅助脚本
├── tests/                       # 8 个测试文件（80 用例）
├── docs/                        # 技术文档
│   ├── ARCHITECTURE.md          # 系统架构文档
│   └── opencode-integration.md  # OpenCode 集成指南
├── package.json
├── tsconfig.json
└── pnpm-lock.yaml
```

---

## 6. API 速查

### 6.1 应用控制平面

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 |
| GET | `/api/events` | 全局 SSE 事件流（status / artifact_changed） |
| POST | `/api/runs` | 创建 run |
| GET | `/api/runs` | 列出所有 run |
| GET | `/api/runs/:runId` | 获取 run 状态 |
| POST | `/api/runs/:run/stage/:stage/start` | 启动 stage runtime |
| POST | `/api/runs/:run/stage/:stage/stop` | 停止 stage runtime |
| POST | `/api/runs/:run/stage/:stage/retry` | 重跑 stage（新 attempt） |
| POST | `/api/runs/:run/stage/:stage/commit` | 把 work/ 提交到 preview |
| GET | `/api/runs/:run/stage/:stage/state?attempt=` | 获取 stage 状态 |
| POST | `/api/runs/:run/stage/:stage/recommend-prompt` | Prompt Recommender |
| POST | `/api/runs/:run/stage/:stage/director-review` | 保存导演反馈 |
| POST | `/api/runs/:run/stage/:stage/run-api-tests` | 执行 API 测试脚本 |
| GET | `/api/runs/:run/stage/:stage/artifacts` | 列出产物 |
| GET | `/api/runs/:run/stage/:stage/artifact/:name` | 读取产物 |
| GET | `/api/skills/:skillId/tree` | Skill 文件树 |
| GET | `/api/skills/:skillId/file/*` | 读取 Skill 文件 |
| GET | `/api/skills/:skillId/runs` | 列出 skill 相关 run |
| POST | `/api/skills/:skillId/promote` | preview → stable |
| POST | `/api/skills/:skillId/rollback` | 从快照恢复 |

### 6.2 Chat API

所有路径前缀：`/api/runs/:run/stage/:stage/chat`

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/session` | 创建 OpenCode session |
| GET | `/session/:sessionId` | 获取 session 状态 |
| DELETE | `/session/:sessionId` | 删除 session |
| POST | `/session/:sessionId/abort` | abort session |
| POST | `/session/:sessionId/message` | 发送 prompt（异步） |
| GET | `/session/:sessionId/message?limit=` | 拉取历史消息 |
| POST | `/session/:sessionId/question/:questionId` | 回复 question |
| POST | `/session/:sessionId/permission/:permissionId` | 允许/拒绝权限 |
| GET | `/events?session_id=` | SSE 流（归一化 ChatSSEEvent） |

### 6.3 OpenCode Runtime 端点（直接访问）

```bash
# 健康检查
curl -u opencode:skillgrowth http://127.0.0.1:<port>/global/health

# 创建会话
curl -u opencode:skillgrowth -X POST http://127.0.0.1:<port>/session \
  -H "Content-Type: application/json" -d '{"title":"test"}'

# 发送消息
curl -u opencode:skillgrowth -X POST http://127.0.0.1:<port>/session/<id>/message \
  -H "Content-Type: application/json" \
  -d '{"parts":[{"type":"text","text":"hello"}]}'
```

---

## 7. 测试

```bash
# 全部测试
pnpm test
# 等价于：tsx --test tests/**/*.test.ts

# 带 DeepSeek 测试（当前环境若可达）
DEEPSEEK_API_KEY=sk-xxxxxx pnpm test
```

测试覆盖（8 个文件，80 个用例，1 个 skip）：

| 文件 | 覆盖点 | 测试数 |
|---|---|---|
| `tests/schemas.test.ts` | Zod schema 校验，v0.2/v0.3 新增类型 | 14 |
| `tests/integration.test.ts` | v0.1 生命周期集成测试 | 5 |
| `tests/v02-lifecycle.test.ts` | run / stage 状态机 | 2 |
| `tests/port-function.test.ts` | 模型端点、OpenCode serve、应用 API | 13 |
| `tests/security.test.ts` | 标识符校验、路径穿越、symlink 逃逸 | 15 |
| `tests/chat-api.test.ts` | x-opencode-directory 注入、SSE 解析与归一化 | 15 |
| `tests/bwrap.test.ts` | bwrap 命令生成、按域挂载 | 10 |
| `tests/artifact-watcher.test.ts` | ArtifactWatcher 文件监听 | 2 |

---

## 8. 安全与注意事项

1. **不要直接 `rm` skill 文件**：所有“删除”通过 `archiveFiles` 转为归档
2. **写操作前必须快照**：preview 写前 `createPreviewSnapshot`，stable 写前 `createStableSnapshot`
3. **不要把 API key 写入仓库**：使用 `.env` 或环境变量注入
4. **生产环境必须设置 `OPENCODE_SERVER_PASSWORD`**
5. **bwrap 默认启用**：可通过 `STAGE_USE_BWRAP=0` 关闭
6. **四层路径防护**：参数校验 → `x-opencode-directory` header 注入 → bwrap 隔离 → `safeResolve` symlink 校验

---

## 9. 故障排查

| 现象 | 可能原因 | 解决 |
|---|---|---|
| `pnpm test` 中 deepseek 测试 skip | 当前环境无法连接 `api.deepseek.com` | 可忽略或换用本地模型 |
| 启动 stage 后服务未就绪 | `opencode` CLI 未安装或模型服务不可达 | 检查 `which opencode` 与模型端点连通性 |
| Prompt Recommender 返回很慢 | glm4:9b 服务未启动 | 检查 `http://172.24.16.1:11434/v1` |
| `commit` 后 preview 没变 | work/ 没有文件或 stage 不是 preview-writable | 确认 `grow-build` / `rehearse-iteration` 阶段 |
| 应用端口冲突 | 3000 被占用 | 设置 `SKILL_GROWTH_PORT=8080` |
| bwrap 启动失败 | bwrap 未安装或权限不足 | 安装 `bubblewrap` 或设置 `STAGE_USE_BWRAP=0` |

---

## 10. 文档索引

| 文档 | 用途 |
|---|---|
| `AGENTS.md` | AI 编程 Agent 指南（面向 AI 助手的项目背景） |
| `API_GUIDE.md` | 完整 API 参考（含 ChatSSEEvent 协议） |
| `docs/ARCHITECTURE.md` | 系统架构、组件深潜、数据流、安全模型 |
| `docs/opencode-integration.md` | OpenCode serve 集成详解 |
| `web_ui_design.md` | v0.1/v0.2 旧版 UI 设计方案（已废弃） |
| `build_plan.md` | v0.1/v0.2 构建计划（历史档案） |
| `ACCEPTANCE_REPORT.md` | v0.3 验收报告 |
