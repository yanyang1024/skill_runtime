# Skill Growth Studio Web UI 设计方案

> 目标：把 CLI 能力包装成一个直观的单页 Web 控制台，让用户可以“作为导演”查看 Skill 内容、对比版本、并同时观察多个隔离的 OpenCode 会话。

---

## 1. 设计目标与场景

### 1.1 核心场景
1. **Skill 内容速览**：用户刚打开应用，想快速看到 `SKILL.md`、references、tools 的当前状态，以及 stable vs preview 的差异。
2. **生长过程可视化**：Observe → Grow → Rehearse → Stabilize 每个阶段的产物都要能看、能审、能一键推进。
3. **多视角排练**：一次排练需要同时看多个隔离会话（例如 stable 基线 vs preview-A vs preview-B vs quality-gate runtime），避免反复切换窗口。
4. **导演式反馈**：用户看完会话后，能直接给每个会话打标签、写 note，不需要进入 OpenCode UI 内部操作。

### 1.2 设计原则
- **一页总览**：常用信息不要藏在三级菜单里。
- **阶段清晰**：顶部或左侧有生命周期导航，当前阶段高亮。
- **会话可隔离**：每个 OpenCode server 独立端口、独立配置目录、独立 iframe/proxy。
- **实时反馈**：后端事件通过 SSE 推送到前端，状态变化即时可见。
- **离线可用**：不依赖外部 CDN；CSS/JS/Markdown 渲染器都走本地静态资源。

---

## 2. 技术方案

### 2.1 总体架构

```
┌─────────────────────────────────────────────────────────────┐
│                    Browser (Frontend)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │ Skill Preview│  │  Run Dashboard│  │ Session Grid    │  │
│  │ (file tree   │  │  (Observe/    │  │ (multiple       │  │
│  │  + markdown) │  │   Grow/... )  │  │  iframes/proxy) │  │
│  └──────────────┘  └──────────────┘  └─────────────────┘  │
└─────────────────────────┬───────────────────────────────────┘
                          │ SSE + REST
┌─────────────────────────┴───────────────────────────────────┐
│              Control Plane Web Server (Node)                │
│  ┌─────────────┐ ┌─────────────┐ ┌───────────────────────┐  │
│  │ Static SPA  │ │  REST API   │ │  SSE /events          │  │
│  └─────────────┘ └─────────────┘ └───────────────────────┘  │
│  ┌─────────────┐ ┌─────────────┐ ┌───────────────────────┐  │
│  │ Workers     │ │  Session    │ │  Proxy (optional)     │  │
│  │ (Observe/   │ │  Manager    │ │  for OpenCode UI      │  │
│  │  Grow/...)  │ │  (ports/    │ │  same-origin embedding│  │
│  └─────────────┘ └─────────────┘ └───────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 后端选型
- **框架**：Express（轻量、熟悉度高、SSE 支持简单）。
- **静态资源**：`express.static` 挂载 `app/ui/dist/` 或 `app/ui/`。
- **反向代理**：如 OpenCode Web 禁止 iframe，使用 `http-proxy-middleware` 把各会话代理到 `/api/sessions/:id/view/*`。
- **进程管理**：每个 OpenCode server 作为子进程启动，记录 pid/port/configDir；关闭页面或停止按钮时清理。
- **事件总线**：内部 `EventEmitter`，前端 SSE 订阅该总线。

### 2.3 前端选型
- **无框架**：原生 ES Modules + 原生 DOM；减少构建步骤和依赖。
- **样式**：手写 `app/ui/styles.css`（约 300 行），走 flex/grid 布局，暗色/亮色类名切换。
- **Markdown 渲染**：本地 `marked`（`npm install marked`），前端直接渲染 `SKILL.md`/`replay-card.md`/`growth-proposal.md`。
- **代码高亮**：第一版可省略，或用 `<pre><code>` 原生样式。
- **图标**：内联 SVG，避免字体/CDN。

---

## 3. 页面布局

### 3.1 全局布局

```
┌────────────────────────────────────────────────────────────┐
│  Top Bar                                                   │
│  [Logo] Skill Growth Studio    [Skill Selector ▼]   [⚙]   │
└────────────────────────────────────────────────────────────┘
┌──────────┬─────────────────────────────────────┬──────────┐
│          │                                     │          │
│  Left    │         Main Workspace              │  Right   │
│  Sidebar │        (Tabbed Panels)              │  Drawer  │
│          │                                     │          │
└──────────┴─────────────────────────────────────┴──────────┘
```

#### Top Bar
- **Skill Selector**：下拉选择当前管理的 skill（如 `tech-doc-didactic-rewriter`）。
- **全局操作**：新建 Observe、运行 Quality Gate、打开设置。
- **运行状态徽章**：当前是否有 live run / rehearse 在跑。

#### Left Sidebar（按当前 skill 展开）
- **Skill**
  - stable/
  - previews/
  - releases/
  - .archive/
- **Traces**
  - raw sessions
  - replay cards
- **Growth Runs**
  - run-0001, run-0002 ...
- **Experiments**
  - rehearse-0001, quality-gate-0001 ...
- **API Docs**
  - raw / normalized / endpoint tests
- **Backups & Archives**

点击文件在 Main Workspace 打开只读预览或 diff。

#### Main Workspace（标签页）
默认标签：
1. **Skill Preview**（默认打开）
2. **Observe**
3. **Grow**
4. **Rehearse**
5. **Stabilize**

标签可关闭，文件预览也会作为新标签打开。

#### Right Drawer（可折叠）
- **当前阶段检查清单**（Quality Gate 进度）。
- **Director Notes**（当 Rehearse 标签激活时）。
- **系统日志**（后端 worker 输出 tail）。

---

## 4. Skill 内容预览

### 4.1 Skill Preview 标签

```
┌────────────────────────────────────────┬─────────────────────┐
│  File Tree                             │  Content Viewer     │
│  ├─ stable/                            │                     │
│  │  ├─ SKILL.md  ◄──── active         │  [Rendered Markdown]│
│  │  ├─ references/                    │                     │
│  │  └─ tools/                         │  [Raw] [Diff]       │
│  ├─ previews/                          │                     │
│  │  └─ preview-0003/                  │  ───────────────    │
│  └─ .archive/                          │  Frontmatter        │
│                                         │  name / version     │
└────────────────────────────────────────┴─────────────────────┘
```

- **File Tree**：递归展示 `skills/<skill>/` 下目录（排除 `node_modules`、隐藏缓存）。点击文件在右侧打开。
- **Content Viewer**：
  - Markdown 文件用 `marked` 渲染，frontmatter 单独成卡片展示。
  - YAML/JSON 用格式化 `<pre>` 展示。
  - 图片等二进制文件显示下载链接。
  - 提供 **Stable vs Preview Diff** 按钮：选中 preview 后，与 stable 做行级 diff 并高亮。
- **Diff 模式**：简单行 diff（基于 `diff` 算法或字符串 split），绿色新增、红色删除。

### 4.2 文件操作规则
- UI 上**不直接编辑** skill 文件；编辑仍由 Grow live run 通过 plan 执行。
- 用户可以点击“提议修改”按钮，把当前文件的某个观察结果快速加入下一次 Growth Run 的 note。

---

## 5. 多 OpenCode 会话同屏显示（Rehearse 标签）

### 5.1 Session Grid 布局

支持 1×1、1×2、2×2 布局切换。典型场景：

```
┌─────────────────────┬─────────────────────┐
│  [Stable Baseline]  │  [Preview v0.3]     │
│  iframe / proxy     │  iframe / proxy     │
├─────────────────────┼─────────────────────┤
│  [Preview v0.4]     │  [Quality Gate]     │
│  iframe / proxy     │  iframe / proxy     │
└─────────────────────┴─────────────────────┘
```

### 5.2 每个 Session Panel 的 UI

```
┌─────────────────────────────────────────┐
│ 🔴 Baseline · stable-0.2.1   [↻] [✕]  │  ← header
├─────────────────────────────────────────┤
│                                         │
│    OpenCode Web UI (iframe / proxy)     │
│                                         │
├─────────────────────────────────────────┤
│ 状态: busy  · 最后消息: 生成 HTML 中    │  ← status bar
│ [更自然] [太啰嗦] [问太多] [流程对] ... │  ← director tags
└─────────────────────────────────────────┘
```

- **Header**：自定义名称、skill 版本、运行状态（idle/busy/retry/error）、刷新、关闭。
- **Iframe/Proxy**：
  - **Mode A（直接 iframe）**：`src` 为 `http://127.0.0.1:<port>`。若 OpenCode Web 允许跨域嵌入即可用。
  - **Mode B（反向代理）**：`src` 为 `/api/sessions/:id/view/`。由后端转发并剥离 `X-Frame-Options`。
  - **Mode C（外链 fallback）**：如果前两种都失败，显示二维码/链接“在新标签打开”。
- **Status Bar**：后端通过 SSE 推送该会话的 `session.status` / `message.updated` 事件，显示当前忙碌状态和最后消息标题。
- **Director Feedback**：每个 panel 底部一排快速标签 + 文本框，点击即保存到 `experiments/<skill>/rehearse-XXXX/director-notes.yaml`。

### 5.3 启动新会话流程

1. 用户点击 “+ 新建会话”。
2. 弹窗选择：
   - **Skill 版本**：stable / 某个 preview / 某个 release。
   - **角色标签**：Baseline / Preview / Quality Gate / Custom。
   - **启动参数**：模型（可选）、初始 prompt（可选，从 eval prompt 列表选择）。
3. 后端：
   - 分配空闲端口。
   - 在 `experiments/<skill>/rehearse-XXXX/workspace/` 创建独立目录。
   - 复制对应 skill 版本到 `.opencode/skills/<skill>/`。
   - 生成 `opencode.json`（模型指向本地 SGLang，provider 配置）。
   - `spawn('opencode', ['serve', '--hostname=127.0.0.1', '--port=<port>'], { cwd: workspaceDir, env: { OPENCODE_CONFIG_CONTENT: JSON.stringify(config) } })`。
   - 解析 stdout 拿到 URL，存入 Session Manager。
4. 前端 iframe 加载对应 URL/Proxy；SSE 开始接收事件。

### 5.4 预置场景与 Eval Prompts

- 自动读取 `skills/<skill>/stable/evals/evals.json`。
- 在 Session Panel 旁边显示 “Eval Scenarios” 侧边列表：
  - 点击后在当前 OpenCode 会话的输入框里复制 prompt（跨域时只能复制到剪贴板；同域/proxy 可尝试自动填入）。
- 支持一键 “Run all evals in parallel”：为每个 eval prompt 启动一个会话，自动填入 prompt 并运行。

---

## 6. 工作流交互

### 6.1 Observe 标签

```
┌─────────────────────────────────────────────────────────────┐
│ 输入: [选择 session log ▼] [拖拽上传]  [生成 Replay Card]   │
├─────────────────────────────────────────────────────────────┤
│ 左侧: Runtime Trace (JSON tree / 折叠)                      │
│ 右侧: Runtime Replay Card (markdown 渲染)                   │
│ 底部: Growth Opportunities 列表                             │
│       [进入 Grow]                                           │
└─────────────────────────────────────────────────────────────┘
```

- **输入**：选择 `traces/<skill>/raw_sessions/` 下文件或拖拽上传。
- **Replay Card**：用 `marked` 渲染；原始用户语句用 `<blockquote>` 突出。
- **Growth Opportunities**：卡片列表，可勾选“纳入下一轮 Grow”。

### 6.2 Grow 标签

```
┌─────────────────────────────────────────────────────────────┐
│ 来源: run-0003  [重新 dry-run]  [一键确认 live run ▶]       │
├─────────────────────────────────────────────────────────────┤
│ 标签: [Proposal] [Dry-run Plan] [Archive Plan] [API Report] │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Markdown 渲染 + 操作表格                                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

- **Proposal**：渲染 `growth-proposal.md`。
- **Dry-run Plan**：表格展示 `planned_operations`（op_id / type / target / reason / risk）。
- **Archive Plan**：列出将被归档的文件及原因。
- **API Report**：endpoint 状态、测试状态。
- **一键确认**：
  - 二次确认弹窗列出“将创建的快照、将应用的修改、将归档的文件”。
  - 点击后后端进入 live run，SSE 推送进度条（快照 → 应用 → 归档 → Quality Gate → preview 生成）。
  - 失败自动回滚并显示日志。

### 6.3 Stabilize 标签

```
┌─────────────────────────────────────────────────────────────┐
│ Preview: preview-0003  vs  Stable: stable-0.2.1             │
├─────────────────────────────────────────────────────────────┤
│ 左侧: Release Diff                                          │
│ 右侧: Changelog (可编辑)                                    │
│ 底部: Quality Report + [Promote] [Revise] [Discard]         │
└─────────────────────────────────────────────────────────────┘
```

- **Promote**：再次快照 → 合并到 stable → 旧 stable 进 releases → 生成 changelog。
- **Revise**：把 director notes 带回 Grow，生成新的 preview。
- **Discard**：仅归档 preview 不删除。

---

## 7. 实时状态与事件

### 7.1 SSE 事件类型

前端连接 `/api/events`：

```json
{ "type": "worker.status", "payload": { "phase": "grow-live", "step": "snapshot", "done": false } }
{ "type": "session.status", "payload": { "sessionId": "preview-0003", "status": "busy" } }
{ "type": "quality.progress", "payload": { "check": "tool_registry_check", "passed": true } }
{ "type": "notification", "payload": { "level": "success", "message": "live run 完成" } }
```

### 7.2 后端事件来源
- Worker 主动 emit。
- 每个 OpenCode server 的 `client.global.event()` SSE 被后端订阅，翻译后转发给前端。

---

## 8. 后端 API 概要

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/` | 返回前端 SPA |
| GET | `/api/skills` | 列出 skills/ 下目录 |
| GET | `/api/skills/:id/tree` | 返回 skill 文件树 |
| GET | `/api/skills/:id/file/*path` | 读取 skill 文件内容 |
| GET | `/api/skills/:id/diff` | stable vs preview diff |
| POST | `/api/observe` | 触发 Observe worker |
| POST | `/api/grow/dry-run` | 触发 Grow dry-run |
| POST | `/api/grow/live` | 触发 Grow live run |
| GET | `/api/grow/runs` | 列出 growth_runs |
| POST | `/api/sessions` | 启动新的 OpenCode 会话 |
| GET | `/api/sessions` | 列出运行中的会话 |
| DELETE | `/api/sessions/:id` | 停止会话 |
| GET | `/api/sessions/:id/view/*` | 反向代理到对应 opencode server |
| POST | `/api/director-notes` | 保存导演反馈 |
| POST | `/api/quality` | 触发 Quality Gate |
| POST | `/api/stabilize/promote` | Promote preview |
| GET | `/api/events` | SSE 事件流 |

---

## 9. 与 CLI 的关系

- **CLI 继续存在**：所有 worker 逻辑同时暴露为 CLI 命令和 REST API。
- **CLI = 自动化/脚本化**：适合 CI 或 headless 运行。
- **Web UI = 可视化/导演体验**：适合人工审阅、多会话对比、一键确认。
- 两者共享同一套 worker 实现，避免重复。

---

## 10. 关键风险与缓解

| 风险 | 缓解 |
|---|---|
| OpenCode Web 不允许 iframe | 用后端反向代理剥离 `X-Frame-Options`；仍失败则提供外链 |
| 多端口冲突 | Session Manager 自动扫描空闲端口（从 9000 起） |
| 跨会话资源占用 | 页面关闭/停止按钮触发 `close()`；后端兜底定时清理僵尸进程 |
| 前端离线无 CDN | 本地安装 `marked`，手写 CSS，不引用外部资源 |
| 同一页面过多 iframe 卡顿 | 默认最多 4 个会话；超出时切换为标签页模式 |

---

## 11. 实施顺序建议

1. **Backend scaffold**：Express + static + SSE `/api/events`。
2. **Skill Preview**：文件树 API + markdown 渲染页面。
3. **Session Manager**：启动/停止/状态查询 OpenCode server 的 API。
4. **Session Grid UI**：1×1/1×2/2×2 iframe 布局 + 状态栏。
5. **Observe/Grow UI**：后端 worker 输出 + 前端标签页渲染。
6. **Director Feedback**：快速标签 + notes 保存。
7. **Stabilize UI**：diff、changelog、promote 按钮。
