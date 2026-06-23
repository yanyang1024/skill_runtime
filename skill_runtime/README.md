# Skill Growth Studio v0.2

> 基于多 OpenCode Web Runtime 的本地 Skill 生命周期导演台。
>
> 核心哲学：**确定性代码搭舞台，OpenCode runtime 在舞台里工作，人类导演做体验判断。**

---

## 1. 项目简介

Skill Growth Studio 帮助你以“导演”的视角管理一个 Skill 的完整生命周期：

- **Observe**：复盘会话日志、扫描 API 文档变化，生成 replay-card 与增长机会。
- **Grow**：基于观察生成增长计划，在隔离的 preview workspace 中修改 Skill，再经过质量 review。
- **Rehearse**：启动 Rehearse-Preview 体验 Skill，写 director-review，再进入 Rehearse-Iteration 迭代。
- **Stabilize**：发布前 review，promote preview 到 stable，并保留快照与回滚点。

每个阶段都是一个独立的 OpenCode Web Runtime，拥有独立的 workspace、配置、输入/输出目录和端口。

---

## 2. 系统要求与部署

### 2.1 环境要求

| 依赖 | 版本/说明 |
|---|---|
| Node.js | >= 20 |
| pnpm | 项目使用 `pnpm-lock.yaml` |
| OpenCode CLI | 可选；实际启动 stage runtime 时需要（`opencode web`） |
| 模型服务 | 至少一个 OpenAI v1 兼容的 chat/completions 端点 |

> 如果你只想体验 UI、状态机、Prompt Recommender 等确定性层功能，可以不安装 `opencode` CLI；但任何需要真正启动 OpenCode runtime 的阶段都会失败。

### 2.2 安装

```bash
# 1. 进入项目目录
cd skill_runtime

# 2. 安装依赖
pnpm install

# 3. 构建 TypeScript
pnpm build
```

### 2.3 启动方式

```bash
# 开发模式（tsx watch，自动重载）
pnpm dev
# 默认监听 http://localhost:3000

# 生产模式（使用 dist/ 产物）
pnpm build
pnpm start

# 指定端口
SKILL_GROWTH_PORT=8080 pnpm dev
```

启动后访问 `http://localhost:3000` 打开导演台 Web UI。

---

## 3. 快速开始

### 3.1 打开导演台

1. 启动应用：`pnpm dev`
2. 浏览器打开 `http://localhost:3000`
3. 顶部选择要生长的 Skill（默认已有 `tech-doc-didactic-rewriter` 示例）
4. 点击“创建 Run”

### 3.2 运行一个阶段

1. 左侧 **Stage Navigator** 选择一个阶段，例如 `observe-log-review`
2. 点击 **启动 Stage**：应用会构建 workspace、生成 `opencode.json`、分配端口并启动 `opencode web`；启动后还会校验 `GET /provider` 与 `GET /config`，确保模型配置生效
3. 点击 **打开 OpenCode Web**：在新标签页打开带 `auth_token` 的 OpenCode Web URL（无需手动输入 Basic Auth）
4. 右侧 **Prompt Assistant** 会自动生成推荐输入；可编辑后点击“发送到 OpenCode”
5. `发送到 OpenCode` 使用异步 `prompt_async` + `GET /event` SSE 流式监听 + 轮询 `GET /session/:id`，不会阻塞 HTTP 请求；原始事件写入 `output/session-stream.md`，`reasoning` 与 `content` 文本分别追加到 `output/session-stream-reasoning.md` 与 `output/session-stream-content.md`
6. 底部 **Artifacts** 会自动轮询并展示 `output/` 下生成的 Markdown 产物；流式产物可直接查看 thinking / content 分离内容

### 3.3 发送文件附件

`POST /api/runs/:run/stage/:stage/message` 支持 OpenCode 标准文件 part：

```json
{
  "parts": [
    { "type": "text", "text": "请 review 这段代码" },
    {
      "type": "file",
      "mime": "text/x-python",
      "url": "file:///absolute/path/inside/workspace/sample.py"
    }
  ]
}
```

- 必须提供 `mime` 和 `url`；`url` 使用 `file://` 协议。
- 文件路径必须位于当前 stage workspace 内，应用会拒绝越界路径。

### 3.4 修改 preview skill

对于 `grow-build` / `rehearse-iteration` 这类会修改 preview 的阶段：

- 阶段启动前会自动对当前 preview 打快照（`.Grow_backups/preview/...`）
- OpenCode 在 `workspace/work/` 中修改文件
- 点击 **停止 Stage** 或 **提交到 Preview**，`work/` 产物会同步回 `skills/<skill>/previews/<preview>/`

### 3.5 API 扫描与测试

1. 启动 `observe-api-scan` stage
2. 让 OpenCode 在 `output/api-tests/` 下生成测试脚本（`.py` / `.sh` / `.js`）
3. 点击调用或请求 `POST /api/runs/:run/stage/observe-api-scan/run-api-tests`
4. 应用会执行脚本并生成 `output/machine-test-result.json`
5. 再让 OpenCode 读取该结果生成 `api-test-report.md` 与 `api-skill-growth-plan.md`

### 3.6 发布与回滚

```bash
# promote preview -> stable（会先做 stable 快照，再把 old stable 归档到 releases 与 .archive/）
curl -X POST http://localhost:3000/api/skills/<skill-id>/promote \
  -H "Content-Type: application/json" \
  -d '{"previewId":"<preview-id>","runId":"<run-id>"}'

# rollback 到指定 snapshot（会先归档当前 stable/previews/releases）
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

每个 stage 的 `opencode.json` 都是独立生成的，修改不会影响其他 stage。

### 4.2 环境变量

| 变量 | 说明 | 默认值 |
|---|---|---|
| `SKILL_GROWTH_PORT` | 应用监听端口 | `3000` |
| `SKILL_GROWTH_DEFAULT_MODEL` | OpenCode 默认模型 | `local-v1/glm4:9b` |
| `SKILL_GROWTH_SMALL_MODEL` | OpenCode 轻量模型 | `local-v1/glm4:9b` |
| `SKILL_GROWTH_LOCAL_V1_URL` | 本地 local-v1 provider 端点 | `http://172.24.16.1:11434/v1` |
| `SKILL_GROWTH_PROVIDERS_CONFIG` | 自定义 provider YAML/JSON 路径 | `configs/model-providers/custom.yaml` |
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥；设置后注入 `deepseek` provider | - |
| `OPENCODE_SERVER_USERNAME` | 每个 stage OpenCode runtime 的 Basic Auth 用户名 | `opencode` |
| `OPENCODE_SERVER_PASSWORD` | 每个 stage OpenCode runtime 的 Basic Auth 密码 | `skillgrowth` |
| `STAGE_USE_BWRAP` | 设置为 `1` 启用 bubblewrap 隔离 | 默认关闭 |
| `STAGE_ENABLE_PROXY` | 设置为 `1` 启用实验性 OpenCode UI 反向代理 | 默认关闭 |

复制 `.env.example` 为 `.env` 即可快速配置：

```bash
cp .env.example .env
# 编辑 .env
pnpm dev
```

> `.env` 文件不会被应用自动加载。请使用 `source .env` 导出变量，或在启动命令前内联指定，例如 `DEEPSEEK_API_KEY=xxx pnpm dev`。

### 4.3 接入自定义模型（vLLM / OpenAI / Ollama 等）

Skill Growth Studio 通过 OpenAI v1 兼容接口接入模型。你要做的只有两件事：

1. **在 provider 配置文件里声明模型**
2. **把默认模型指向它**

#### 示例：接入 vLLM 部署的 `qwen:max`

编辑 `configs/model-providers/custom.yaml`：

```yaml
provider:
  vllm:
    npm: "@ai-sdk/openai-compatible"
    name: "vLLM Local"
    options:
      baseURL: "http://localhost:8000/v1"
      apiKey: "local"          # vLLM 通常无需鉴权，可随便填
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

然后指定默认模型：

```bash
SKILL_GROWTH_DEFAULT_MODEL=vllm/qwen:max \
SKILL_GROWTH_SMALL_MODEL=vllm/qwen:max \
pnpm dev
```

#### 示例：接入 OpenAI 官方 API

```yaml
provider:
  openai:
    npm: "@ai-sdk/openai-compatible"
    name: "OpenAI"
    options:
      baseURL: "https://api.openai.com/v1"
      apiKey: "${OPENAI_API_KEY}"   # 通过环境变量注入
    models:
      "gpt-4o":
        name: "GPT-4o"
        tools: true
        capabilities:
          input: ["text"]
          output: ["text"]
        limit:
          context: 128000
          output: 16384
```

启动：

```bash
OPENAI_API_KEY=sk-xxxxxx \
SKILL_GROWTH_DEFAULT_MODEL=openai/gpt-4o \
pnpm dev
```

#### 示例：接入 Ollama（已默认支持类似方式）

如果你本地 Ollama 监听在 `http://localhost:11434/v1`，可以直接把 `local-v1` 的 `baseURL` 覆盖掉：

```yaml
provider:
  local-v1:
    npm: "@ai-sdk/openai-compatible"
    name: "Ollama"
    options:
      baseURL: "http://localhost:11434/v1"
      apiKey: "local"
    models:
      "llama3.1:8b":
        name: "Llama 3.1 8B"
        tools: true
        capabilities:
          input: ["text"]
          output: ["text"]
        limit:
          context: 131072
          output: 8192
```

```bash
SKILL_GROWTH_DEFAULT_MODEL=local-v1/llama3.1:8b pnpm dev
```

#### 关键规则

- `provider.<id>.options.baseURL` **必须以 `/v1` 结尾**。
- `provider.<id>.models` 必须显式列出所有可用模型 ID，OpenCode 不会自动拉取模型列表。
- 根级 `model` 字段必须写成 `<provider-id>/<model-id>`。
- `tools: true` 表示模型支持函数调用；如果模型不支持，设为 `false`，否则 OpenCode 可能报错。

### 4.4 Prompt Recommender 的模型配置

Prompt Recommender 默认调用 `http://172.24.16.1:11434/v1/chat/completions`，模型 `glm4:9b`。可通过环境变量覆盖，无需修改代码：

| 变量 | 说明 | 默认值 |
|---|---|---|
| `SKILL_GROWTH_RECOMMENDER_URL` | chat/completions 端点 | `http://172.24.16.1:11434/v1` |
| `SKILL_GROWTH_RECOMMENDER_API_KEY` | API Key | `local` |
| `SKILL_GROWTH_RECOMMENDER_MODEL` | 模型 ID | `glm4:9b` |

Prompt Recommender 与 OpenCode runtime 可以使用不同的模型服务。

### 4.5 权限与安全配置

每个 stage 的 `opencode.json` 默认包含：

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
    "build": { "permission": { "edit": "allow", ... } },
    "iteration": { "permission": { "edit": "allow", ... } }
  }
}
```

- `ask`：暂停等待人类确认
- `allow`：直接执行
- `deny`：拒绝执行

如需调整，修改 `app/workspace_builder/opencodeConfig.ts`。

---

## 5. 目录结构

```
skill_runtime/
├── app/
│   ├── server/              # Express 控制平面
│   ├── orchestration/       # Stage Runtime Contract、状态机
│   ├── workspace_builder/   # 构造每个 stage 的 OpenCode workspace
│   ├── api_test_runner/     # 确定性 API 测试执行
│   ├── prompt_recommender/  # Prompt Recommender
│   ├── snapshot_manager/    # 快照、归档、回滚
│   ├── log_collector/       # 日志收集
│   ├── ui/                  # 导演台 SPA
│   ├── cli/                 # CLI 入口
│   ├── workers/             # 旧版 v0.1 workers（兼容）
│   └── shared/              # schema、工具函数
├── skills/<skill-id>/
│   ├── stable/              # 只读稳定版
│   ├── previews/<preview-id>/  # 可写 preview
│   ├── releases/            # 旧 stable 归档
│   └── .archive/            # 废弃文件归档
├── runs/<run-id>/           # 一次完整生长 run
├── prompt_library/          # 各阶段常用语句库
├── configs/model-providers/ # provider 配置模板
├── .Grow_backups/           # 快照 tar.gz
├── tests/                   # 测试
└── dist/                    # TypeScript 构建输出
```

每个 stage workspace 内部：

```
runs/<run-id>/<stage>/attempts/attempt-001/
├── workspace/
│   ├── opencode.json
│   ├── .opencode/skills/<skill-id>/
│   ├── input/
│   ├── output/
│   └── work/
├── server.json
└── stage-state.yaml
```

---

## 6. API 速查

### 6.1 应用控制平面

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 |
| POST | `/api/runs` | 创建 run |
| GET | `/api/runs/:runId` | 获取 run 状态 |
| POST | `/api/runs/:run/stage/:stage/start` | 启动 stage runtime |
| POST | `/api/runs/:run/stage/:stage/stop` | 停止 stage runtime |
| POST | `/api/runs/:run/stage/:stage/retry` | 重跑 stage（新 attempt） |
| POST | `/api/runs/:run/stage/:stage/commit` | 把 work/ 提交到 preview |
| POST | `/api/runs/:run/stage/:stage/message` | 异步发送消息到 OpenCode runtime，自动监听 SSE `/event`；写入 `session-stream.md`、`session-stream-reasoning.md`、`session-stream-content.md`；支持 `file` part 附件 |
| POST | `/api/runs/:run/stage/:stage/recommend-prompt` | Prompt Recommender |
| POST | `/api/runs/:run/stage/:stage/director-review` | 保存导演反馈 |
| POST | `/api/runs/:run/stage/:stage/run-api-tests` | 执行 API 测试脚本 |
| GET | `/api/runs/:run/stage/:stage/artifacts` | 列出产物 |
| GET | `/api/runs/:run/stage/:stage/artifact/:name` | 读取产物 |
| GET/POST | `/api/runs/:run/stage/:stage/view/*` | 实验性反向代理 OpenCode Web UI；需 `STAGE_ENABLE_PROXY=1` |
| GET | `/api/skills/:skillId/tree` | Skill 文件树 |
| GET | `/api/skills/:skillId/file/*` | 读取 Skill 文件 |
| POST | `/api/skills/:skillId/promote` | preview -> stable |
| POST | `/api/skills/:skillId/rollback` | 从快照恢复 |

### 6.2 OpenCode Runtime 端点

Stage runtime 启动后，原生 OpenCode 端点可用，例如：

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

# 带 DeepSeek 测试（当前环境若可达）
DEEPSEEK_API_KEY=sk-xxxxxx pnpm test
```

测试分组：

- `tests/schemas.test.ts`：Zod schema 校验
- `tests/integration.test.ts`：旧版 v0.1 生命周期集成测试
- `tests/v02-lifecycle.test.ts`：v0.2 run/stage 状态机测试
- `tests/port-function.test.ts`：模型端点、OpenCode server 端点、应用 API 端口功能测试

---

## 8. 安全与注意事项

1. **不要直接 `rm` skill 文件**：所有“删除”应通过 `archiveFiles` 转为归档。
2. **写操作前必须快照**：preview 写前 `createPreviewSnapshot`，stable 写前 `createStableSnapshot`。
3. **不要把 API key 写入仓库**：使用 `.env` 或环境变量注入；`configs/model-providers/custom.yaml` 中可用 `${ENV_NAME}` 占位。
4. **生产环境必须设置 `OPENCODE_SERVER_PASSWORD`**，避免 OpenCode runtime 无认证暴露。
5. **bwrap 隔离**：默认关闭，可通过 `STAGE_USE_BWRAP=1` 开启，提供文件系统级双层隔离。

---

## 9. 故障排查

| 现象 | 可能原因 | 解决 |
|---|---|---|
| `pnpm test` 中 deepseek 测试 skip | 当前环境无法连接 `api.deepseek.com` | 属于网络限制，可忽略；或换用本地模型 |
| 启动 stage 后无法打开 OpenCode Web | `opencode` CLI 未安装或模型服务不可达 | 检查 `which opencode` 与模型端点连通性 |
| Prompt Recommender 返回很慢或失败 | glm4:9b 服务未启动或不可达 | 检查 `http://172.24.16.1:11434/v1`；或修改 `app/prompt_recommender/client.ts` |
| `commit` 后 preview 没变 | work/ 没有文件或 stage 不是 preview-writable | 确认 `grow-build` / `rehearse-iteration` 阶段，且 OpenCode 改的是 `workspace/work/` |
| 应用端口冲突 | 3000 被占用 | 设置 `SKILL_GROWTH_PORT=8080` |
