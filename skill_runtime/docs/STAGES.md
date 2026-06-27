# Stage 使用指南 — Skill Growth Studio v0.3

> 面向导演（用户）的完整 Stage 操作文档。涵盖 8 个 stage 的区别、推荐使用流程、以及跨阶段共享的文件。

---

## 1. 四个动词 × 八个阶段

Skill Growth Studio 围绕四个动词组织 8 个 stage，形成完整的 Skill 生命周期：

```
Observe ──► Grow ──► Rehearse ──► Stabilize
  │           │          │             │
  ├─ log-review  ├─ plan   ├─ preview    └─ release
  └─ api-scan    ├─ build  └─ iteration
                 └─ quality-review
```

---

## 2. Stage 能力矩阵

每个 stage 对 Skill 文件有不同的**访问权限**和**产物要求**：

| Stage | 动词 | 角色 | Skill 访问 | 可写工作区 | 启动前快照 | 人类身份 |
|---|---|---|---|---|---|---|
| `observe-log-review` | Observe | 观察 | `stable-readonly`（只读稳定版） | ❌ | ❌ | 旁观 |
| `observe-api-scan` | Observe | 观察 | `stable-readonly` | ✅ | ❌ | 旁观 |
| `grow-plan` | Grow | 规划 | `stable-readonly` | ❌ | ❌ | 旁观 |
| `grow-build` | Grow | 构建 | `preview-writable`（可写预览版） | ✅ | ✅ 自动 | 旁观 |
| `grow-quality-review` | Grow | 审查 | `preview-readonly`（只读预览版） | ❌ | ❌ | 旁观 |
| `rehearse-preview` | Rehearse | 体验 | `preview-readonly` | ✅ | ❌ | **导演体验** |
| `rehearse-iteration` | Rehearse | 迭代 | `preview-writable` | ✅ | ✅ 自动 | 旁观 |
| `stabilize-release` | Stabilize | 发布 | `preview-readonly` | ❌ | ❌ | **写 Review** |

### 关键概念

- **stable**：Skill 的正式发布版本，所有只读 stage 默认读取此版本。永远不允许 stage 直接修改。
- **preview**：在 Grow 阶段创建的 Skill 修改版本。`grow-build` 和 `rehearse-iteration` 可以修改它，其他 stage 只能读取。
- **快照**（snapshot）：写操作前的自动备份（`.Grow_backups/`）。`grow-build` 和 `rehearse-iteration` 启动前**自动**创建 preview 快照；promote 前**自动**创建 stable 快照。

---

## 3. 推荐使用流程

### 标准路径（一次完整 Skill 生长周期）

```
第 1 步: observe-log-review ──► 输出: replay-card.md, growth-opportunities.md
            │                     (携带到下一步)
            ▼
第 2 步: grow-plan            ──► 输出: growth-plan.md, planned-file-changes.md
            │                     (携带到下一步)
            ▼
第 3 步: grow-build           ──► 输出: patch-notes.md, changed-files.md
            │                     (启动前自动快照 preview)
            │                     (修改 preview 中的 Skill)
            ▼
第 4 步: grow-quality-review  ──► 输出: quality-review.md, followup-fix-plan.md
            │                     (质量不通过则回到第 3 步)
            ▼
第 5 步: rehearse-preview     ──► 输出: director-review.md
            │                     (导演体验 Skill，写反馈)
            ▼
第 6 步: rehearse-iteration   ──► 输出: iteration-review.md
            │                     (基于导演反馈修改)
            │                     (可回到第 5 步再次体验)
            ▼
第 7 步: stabilize-release    ──► 输出: release-review.md, changelog-draft.md
            │
            ▼
第 8 步: 手动 promote         ──► POST /api/skills/:id/promote
            (preview → stable，更新 CHANGELOG)
```

### 快捷路径

- **只看不改**：跳过 Grow，直接 `observe-log-review` → 看报告结束
- **修复质量**：`grow-quality-review` → `grow-build`（"fix" 路径，携带 quality-review.md）
- **只体验**：在已有 preview 上直接启动 `rehearse-preview`
- **重新开始**：任何 stage 都可以 `retry`（"重跑 Stage" 按钮，创建新 attempt）

### 流转图（15 条预定义路径）

```
observe-log-review ──► grow-plan ──► grow-build ──► grow-quality-review ──► rehearse-preview ──► rehearse-iteration
        │                  ▲                            │    ▲                     │    ▲                  │    ▲
        │                  │                            │    │                     │    │                  │    │
        │                  │                         fix│    │                     │    │                  │    │
        │                  │                            ▼    │                     ▼    │                  ▼    │
   observe-api-scan ───────┘                   grow-build ──┘              rehearse-iteration ──┘         stabilize-release
                                                                                                                  ▲
                                                                                    rehearse-iteration ──────────┘
                                                                                    rehearse-preview ────────────┘
```

---

## 4. 每个 Stage 的详细说明

### 4.1 `observe-log-review` — 复盘会话日志

| 属性 | 值 |
|---|---|
| 用途 | 读取已有 session log，生成 replay-card、识别增长机会 |
| 输入 | 上一轮会话日志（`traces/<skill>/session-log.txt`） |
| 预期产物 | `replay-card.md`、`growth-opportunities.md`、`completion-report.md` |
| 典型操作 | 将 session log 粘贴到 input/，在 ChatPage 中指示 OpenCode 分析 |
| 流程 | 完成后自动推荐进入 `grow-plan` |

### 4.2 `observe-api-scan` — 扫描 API 文档

| 属性 | 值 |
|---|---|
| 用途 | 扫描 API 文档变化，生成 diff 和测试计划 |
| 输入 | API 文档（`api_docs/<skill>/raw/`） |
| 预期产物 | `api-endpoint-diff.md`、`api-test-plan.md`、`api-test-report.md`、`api-skill-growth-plan.md`、`tool-wrapper-suggestions.md` |
| 特殊能力 | `work_writable: true` — 可在 `output/api-tests/` 生成测试脚本，后端可执行（`POST .../run-api-tests`） |
| 流程 | 完成后自动推荐进入 `grow-plan` |

### 4.3 `grow-plan` — 制定增长计划

| 属性 | 值 |
|---|---|
| 用途 | 基于观察结果制定修改计划，列出要修改的文件和风险 |
| 输入 | 来自 observe 阶段的 `replay-card.md`、`growth-opportunities.md` |
| 预期产物 | `growth-plan.md`、`planned-file-changes.md`、`archive-plan.md`、`risk-notes.md` |
| 关键点 | **只读规划，不修改任何文件** |
| 流程 | 完成后自动推荐进入 `grow-build` |

### 4.4 `grow-build` — 执行修改

| 属性 | 值 |
|---|---|
| 用途 | 在隔离的 preview workspace 中实际修改 Skill 文件 |
| 输入 | 来自 `grow-plan` 的 `growth-plan.md`、`planned-file-changes.md` |
| 预期产物 | `patch-notes.md`、`changed-files.md`、`completion-report.md` |
| 关键点 | **启动前自动快照 preview**；OpenCode 在 `work/` 目录中修改文件 |
| 权限 | 有 `edit: allow` 权限（AGENT 模式）；停止时自动 `sync work/ → preview` |
| 流程 | 完成后自动推荐进入 `grow-quality-review` |

### 4.5 `grow-quality-review` — 质量审查

| 属性 | 值 |
|---|---|
| 用途 | 审查 `grow-build` 的修改是否通过 Quality Gate |
| 输入 | 来自 `grow-build` 的 `patch-notes.md`、`changed-files.md` |
| 预期产物 | `quality-review.md`、`stale-content-report.md`、`coupling-issues.md`、`followup-fix-plan.md` |
| 关键点 | **不通过时会推荐回到 `grow-build`（"fix" 路径）** |
| 前置条件 | **promote 前必须完成** — promote API 会检查此 stage 的 completed 状态 |

### 4.6 `rehearse-preview` — 导演体验

| 属性 | 值 |
|---|---|
| 用途 | **人类导演亲自体验**当前 preview Skill 的行为 |
| 输入 | 无特定输入（直接体验 preview Skill） |
| 预期产物 | `preview-session-log`、`director-review.md` |
| 关键点 | **唯一标记 `human_role: "experience"` 的 stage** — 导演需要实际测试 Skill |
| 流程 | 完成后可选择进入 `rehearse-iteration`（迭代修改）或 `stabilize-release`（准备发布） |

### 4.7 `rehearse-iteration` — 基于反馈迭代

| 属性 | 值 |
|---|---|
| 用途 | 根据 `rehearse-preview` 的导演反馈修改 Skill |
| 输入 | `director-review.md` |
| 预期产物 | `iteration-plan.md`、`iteration-patch-notes.md`、`iteration-review.md` |
| 关键点 | **启动前自动快照 preview**；`work_writable: true` |
| 流程 | 完成后可回到 `rehearse-preview`（再次体验）或进入 `stabilize-release` |

### 4.8 `stabilize-release` — 发布前检查

| 属性 | 值 |
|---|---|
| 用途 | 发布前的最后语义检查，起草 CHANGELOG |
| 输入 | `director-review.md` |
| 预期产物 | `release-review.md`、`changelog-draft.md`、`remaining-work.md` |
| 关键点 | **`human_role: "write-review"`** — 最终由导演决定是否发布 |
| 流程 | 完成后**手动**调用 `POST /api/skills/:id/promote` 将 preview 提升为 stable |

---

## 5. 跨阶段共享的文件

### 5.1 Workspace 内部（每个 stage 独立）

每个 stage 启动时，`buildStageWorkspace` 创建：

```
runs/<run-id>/<stage-id>/attempts/attempt-NNN/
├── workspace/
│   ├── opencode.json              # OpenCode 配置（独立生成）
│   ├── .opencode/skills/<skill>/  # Skill 文件副本（OpenCode 自动发现）
│   ├── input/                     # 输入文件
│   │   ├── skill_snapshot/        # Skill 快照（stable 或 preview 版本）
│   │   ├── session_log/           # 会话日志（如有）
│   │   ├── api_docs/              # API 文档（如有）
│   │   └── previous_stage_output/ # 上一阶段的产物副本
│   ├── output/                    # 产物（ArtifactPanel 实时展示）
│   │   ├── session-stream.md      # 原始 SSE 事件日志
│   │   ├── session-stream-reasoning.md  # reasoning 文本
│   │   ├── session-stream-content.md    # content 文本
│   │   └── director-review.md     # 导演反馈
│   └── work/                      # 可写工作区（仅 work_writable stage）
│       └── <skill 可编辑副本>
├── server.json                    # 运行时元信息
└── stage-state.yaml               # Stage 状态持久化
```

### 5.2 Stage 输出携带机制

从 `A` → `B` 流转时，`carry_outputs` 指定哪些产物从 A 的 `output/` 复制到 B 的 `input/previous_stage_output/`：

| 从 | 到 | 携带文件 |
|---|---|---|
| observe-log-review | grow-plan | `replay-card.md`, `growth-opportunities.md` |
| observe-api-scan | grow-plan | `api-skill-growth-plan.md` |
| grow-plan | grow-build | `growth-plan.md`, `planned-file-changes.md`, `archive-plan.md` |
| grow-build | grow-quality-review | `patch-notes.md`, `changed-files.md` |
| grow-quality-review | grow-build (fix) | `quality-review.md`, `followup-fix-plan.md` |
| rehearse-preview | rehearse-iteration | `director-review.md`, `preview-session-log` |
| rehearse-preview | stabilize-release | `director-review.md` |
| rehearse-iteration | stabilize-release | `iteration-review.md` |

### 5.3 跨所有 Stage 共享的全局文件

| 文件/目录 | 位置 | 说明 |
|---|---|---|
| Skill stable 版本 | `skills/<skill>/stable/SKILL.md` | 所有 `stable-readonly` stage 的参考基线 |
| Skill preview 版本 | `skills/<skill>/previews/<id>/` | `preview-writable` stage 修改的目标 |
| Run 状态 | `runs/<run-id>/run-state.yaml` | 记录当前 stage、run 状态 |
| 流转历史 | `runs/<run-id>/transitions.yaml` | 记录所有 stage-to-stage 流转 |
| 快照 | `.Grow_backups/` | stable/preview 快照 tar.gz |
| 归档 | `skills/<skill>/.archive/` | 被 archive 的旧文件（永不删除） |
| Prompt 库 | `prompt_library/<stage>.md` | Prompt Recommender 使用的推荐语句模板 |

### 5.4 `director-review.md` — 跨阶段关键文件

`director-review.md` 是唯一允许**人类导演**写入的产物。它在 `rehearse-preview` 阶段由导演通过前端 Prompt Assistant 或手动编辑生成，然后被 `carry_outputs` 携带到 `rehearse-iteration` 和 `stabilize-release`。它是决定 Skill 最终是否发布的**关键决策依据**。

### 5.5 Stage 缓存状态元数据

所有 stage 共享 `run-state.yaml` 来追踪整个生长过程的进度：

```yaml
run_id: run-2026-06-26T12-00-00.000Z
skill_id: tech-doc-didactic-rewriter
preview_id: p1
current_stage: grow-build
status: running       # idle → running → completed/failed
```

每个 stage 各自维护 `stage-state.yaml`：
```yaml
stage_id: grow-build
status: completed     # pending → running → completed/failed/error
attempt: 1
outputs: ["patch-notes.md", "changed-files.md"]
```

---

## 6. Web UI 操作流程

### 6.1 启动

1. 浏览器打开 `http://localhost:5173`（或生产 `http://localhost:3000`）
2. 顶部选择 Skill → 点击 "创建 Run"
3. 左侧选择 Stage → 点击 "启动 Stage"

### 6.2 聊天交互

1. 在 ChatPage 输入框中输入 prompt → 回车发送
2. 等待 AI 回复（流式显示，支持 reasoning 折叠）
3. 如有 permission 或 question 请求，在卡片中回复
4. 右侧 Prompt Assistant 可自动生成推荐 prompt → 点击 "发送到 ChatPage"

### 6.3 查看产物

1. 底部 Artifact Panel 实时展示 `output/` 目录文件
2. 点击文件名查看内容
3. 流式产物（`session-stream*.md`）同步更新
4. 红色提示表示产物加载失败

### 6.4 流转到下一 Stage

1. 当前 Stage 完成后点击 "停止 Stage"
2. 在 Stage Navigator 中选择推荐的下一个 Stage
3. 点击 "启动 Stage"（backend 自动复制上一阶段产物到 input/）

### 6.5 发布（目前需手动 API 调用）

```bash
curl -X POST http://localhost:3000/api/skills/tech-doc-didactic-rewriter/promote \
  -H "Content-Type: application/json" \
  -d '{"previewId":"p1","runId":"run-2026-06-26T12-00-00.000Z"}'
```

---

## 7. 常见操作场景

### 场景 A：初次创建 Skill

1. 在 `skills/<id>/stable/` 下创建 `SKILL.md`
2. 运行 `pnpm check` 验证环境
3. 从 `observe-log-review` 开始（准备 session log 或空启动）
4. 按推荐流程推进

### 场景 B：修复现有 Skill

1. 直接从 `grow-build` 开始（前提：已有 preview）
2. 修改完成后进入 `grow-quality-review` 审查
3. 质量不通过 → 再回到 `grow-build`（fix 路径）
4. 通过后 → `rehearse-preview` → `stabilize-release` → promote

### 场景 C：只体验不修改

1. 在已有 preview 上启动 `rehearse-preview`
2. 体验后写 `director-review.md`
3. 如果满意 → `stabilize-release` → promote
4. 如果需要修改 → `rehearse-iteration`

### 场景 D：从日志中学习

1. 把 session log 放到 `traces/<skill>/`
2. 启动 `observe-log-review`（传递 `session_log_path`）
3. OpenCode 分析后生成 `replay-card.md` 和 `growth-opportunities.md`
4. 进入 `grow-plan` 制定修改计划

---

## 8. Stage 前置条件

每个 stage 启动前，系统自动检查以下条件。不满足时返回明确错误。

| 条件 | stable-readonly | preview-* | grow-build / rehearse-iteration | 所有 stage |
|---|---|---|---|---|
| `skills/<id>/stable/SKILL.md` | ✅ 必须 | | | |
| `skills/<id>/previews/<pid>/SKILL.md` | | ✅ 必须 | ✅ 必须（快照阶段） | |
| `run.preview_id` 非空 | | ✅ 必须 | | |
| `opencode` CLI 在 PATH 中 | | | | ✅ 必须 |
| bwrap 已安装 | | | | ✅ 必须 (默认) |
| 端口 9500-9600 有空闲 | | | | ✅ 必须 |

**初始化预览：** 如果 `grow-build` 作为第一个 stage 启动且 preview 不存在，系统从 stable 自动复制。

---

## 9. 文件上传与下载

### 上传（ChatInput）

📎 按钮 → 选择本地文件 → 上传到 stage `input/` 目录 → prompt 中自动包含文件路径引用。

限制：**10 MB / 文件**。

### 下载（ArtifactPanel）

每个产物文件名旁有 ⬇ 按钮 → 点击下载到本地。`Content-Disposition: attachment` 响应。

---

## 10. 深入参考

- **[会话与文件流转](SESSION_AND_FILE_FLOW.md)** — 会话生命周期、SSE 双层架构、文件上传/产物/流转的完整技术文档
- **[系统架构](ARCHITECTURE.md)** — 组件深潜、安全模型、配置系统
- **[OpenCode 集成](opencode-integration.md)** — opencode serve 启动、权限模型、SSE 归一化映射
