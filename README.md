# Agent Chat

基于 OpenCode 的多会话 AI 聊天应用。OpenCode 作为独立 HTTP 服务进程运行在 bwrap 沙箱中（systemd --user 管理），FastAPI 后端做会话编排与 SSE 桥接，React 前端通过后端与 OpenCode 间接通信。

## 架构

```
React (5173) --/api--> FastAPI (8001) --HTTP/SSE--> OpenCode serve (127.0.0.1:9167, bwrap 沙箱)
```

三层设计：

1. **沙箱层**（`sandbox/start_agent.sh`）：bwrap 全盘只读（`--ro-bind / /`）+ `/dev/null` 覆盖 `/etc/shadow|gshadow` + `--tmpfs /home` 遮蔽用户目录 + 精确可写挂载（`data/home`、`data/tmp`、`data/workspaces`）+ `--unshare-pid/--unshare-ipc`。opencode 安装目录只读注入 `~/.opencode-bin`，`~/.config/opencode/agents` 只读注入（配置目录本身可写，opencode 启动要写 `.gitignore`）。Basic Auth 通过 `OPENCODE_SERVER_USERNAME/PASSWORD` 注入。
2. **会话隔离层**：每个会话一个 workspace 目录（`data/workspaces/{conversation_id}/`），后端每个请求注入 `x-opencode-directory` header。懒绑定：创建会话只建目录，首发消息时才启动实例（如未运行）并创建 OpenCode session。
3. **SSE 桥接层**：Event Bus 每会话维护一条到 OpenCode `/event` 的持久连接，fan-out 给多个前端消费者。前端两条通道：`POST /api/stream/chat/{id}`（发消息+临时流，`done` 结束）、`GET /api/stream/subscribe/{id}`（持久订阅，keepalive + loop/推荐/状态事件）。事件转换：`message.part.delta` → text/reasoning 增量；`message.part.updated` 中的 tool part → 工具调用事件（tool/status/title/input_summary/output_preview），前端渲染为可折叠的工具调用块（含 subagent `task`）；历史消息接口同样返回 reasoning 和 tools 摘要。断连恢复、初始状态、双通道仲裁等一致性设计详见下文「SSE 事件流与最终一致性」。

横切：文件 API 全部经过 `resolve_safe_path` 四层防护（空值→拒绝对路径→resolve→relative_to 边界）；实例级空闲回收（活动时间戳 + 每 5 分钟检查，`IDLE_TIMEOUT_MINUTES=480` 默认超时自动 `systemctl --user stop`）。

## SSE 事件流与最终一致性

前端一个标签页同时持有两条 SSE 通道，消费同一个 Event Bus 广播（同一事件双份投递）：

- `POST /api/stream/chat/{id}`：用户消息的专用流，`done` 结束。opencode 的 `session.idle` 事件**不带消息归属**——若用户在 loop 某一轮流式输出期间发消息，该轮的 idle 会先到达。因此收到 `done` 时后端会核对 `GET /session/status`（opencode 实测端点，返回 `{sessionID: {type: idle|busy|retry}}`）：仍 busy/retry 说明 done 属于上一轮，不转发、不结束，继续等真正的回复。
- `GET /api/stream/subscribe/{id}`：持久订阅（keepalive 15s），承载 loop/推荐/权限/状态等控制事件，以及 loop 轮次的 text/tool 内容。

**客户端仲裁**：`isUserChatActiveRef` 决定哪条通道的 text/tool 事件进入流式累加器（用户聊天期间 subscribe 通道丢弃增量，反之亦然），避免双通道重复累积。累加器放在 `streamAccRef`（同步 ref，不依赖 React 渲染节奏）——用 state 镜像曾在"末尾 delta 与 done 同 chunk 到达"时因 React 18 批量更新丢消息。

**传输健壮性**（后端 event_bus.py）：

- text/reasoning 增量**合帧**：按 part 攒 2KB 或 100ms 广播一次。opencode delta 频率可达每秒数百条，慢消费者（浏览器后台标签页被节流）会撑爆 1000 上限的消费者队列被静默丢弃，流式视图永久缺字。
- `session.status` 去重后记为 `_last_status`，新消费者 attach 时**回放**——中途加入的连接立刻拿到真实忙闲。
- 消费者队列满时丢弃并记 warning（兜底，正常不会触发，合帧后更不可能）。

**初始状态不伪造**：subscribe 建立时查询 opencode `/session/status` 取真实状态（失败回退 idle）。此前无条件发伪造的 `idle`——生成中途打开/刷新会话时 UI 误显示"空闲"，要等生成结束才自愈。

**恢复手段（前端 App.jsx）**：

- **重连 resync**：EventSource 自动重连后（`onopen`）重新拉取 messages + loopStatus + pending permissions。断连窗口内的事件不可恢复（无重放 buffer），只能从 REST 拉真值收敛；流式进行中跳过 messages 替换，避免与累加器打架。首次连接触发的 resync 顺带覆盖"listMessages 与 subscribe attach 之间"的加载间隙。客户端自造的 system 分隔消息（如"Loop 已停止"）在替换时保留。
- **看门狗 + 轮询兜底**：chat 流 2xx 响应头到达后 8s 无任何事件 → abort 并转为每 2s 轮询 `GET /conversations/{id}/messages`，直到 assistant 回复落进历史（流断了不代表 opencode 没在执行）。**所有"请求已被接受"后的失败**（缓冲、中途断网）统一走此兜底；请求未到达后端的失败（4xx/5xx/连接拒绝）直接报错；用户主动点停止（`userStopRef` 标记）不轮询。
- **历史消息即真值**：`GET /api/conversations/{id}/messages` 从 opencode 拉取并转换（含 reasoning 与 tools 摘要），刷新/轮询/resync 都以它为准收敛。

已知边界：loop 的内存态在后端重启后丢失（前端 loopStatus 待下次切换会话纠正）；loop 自动 prompt 的气泡样式（`via:'loop'`）是纯客户端渲染，resync 后回落为普通用户气泡（内容不丢，样式简化）。

**Loop 自动推进（双 LLM 解耦）**：OpenCode 负责执行，Recommender（`backend/app/recommender.py`，独立调用 OpenAI 兼容 LLM，默认 deepseek-chat，读 session 历史 + workspace 文件快照 diff + 可用资源）负责元认知——生成下一步建议和 `stop_decision`（CONTINUE/PAUSE_INPUT/TERMINATE_SUCCEEDED/TERMINATE_STALLED）。两种模式：`queue`（预写队列逐条播放）、`ai`（每轮由 Recommender 决定下一步直到任务完成/停滞）。防失控五层：5 秒倒计时窗口（逐秒广播可取消）、用户发消息立即接管、stop_decision、连续 3 轮无文件变更停滞暂停、每轮 120 秒 idle 超时暂停。loop 每轮的 prompt 与生成内容实时广播到前端可见，使用会话级 model/agent。非 loop 的 idle 推荐也由 Recommender 生成（失败回退 todos 启发式）。凭据：`RECOMMENDER_API_KEY` 环境变量优先，否则读沙箱 HOME 的 opencode auth.json；`RECOMMENDER_MODEL`/`RECOMMENDER_BASE_URL` 可覆盖。

## 目录结构

- `sandbox/` — bwrap 启动脚本 + systemd user unit
- `backend/` — FastAPI 应用（`app/` 源码，`run.sh` 一键启动）
- `frontend/` — React 18 + Vite
- `data/` — 运行时数据：workspaces（各会话工作区）、home（沙箱 HOME）、opencode_config（agents/配置）、app.db

## 启动

```bash
# 1. OpenCode 沙箱实例（首次需安装 unit）
mkdir -p ~/.config/systemd/user
cp sandbox/opencode.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user start opencode.service

# 2. 前端构建（后端直接托管 dist，单端口部署）
cd frontend && npm install && npm run build && cd ..

# 3. 后端（0.0.0.0:8001，同时服务页面和 /api）
backend/run.sh
```

打开 **http://localhost:8001**；若从 Windows 宿主机浏览器访问 WSL 且 localhost 转发异常（SSE 被缓冲、对话不实时更新），改用 WSL IP：`hostname -I` 取第一个地址，访问 `http://<WSL-IP>:8001`，绕开 WSL2 localhost 转发中继。

开发模式（可选）：`cd frontend && npm run dev`，dev server 在 5173 并把 /api 代理到 8001。

## 配置（环境变量）

| 变量 | 默认 | 说明 |
|---|---|---|
| `OPENCODE_PORT` | 9167 | 沙箱内 opencode 端口 |
| `OPENCODE_SERVER_USERNAME/PASSWORD` | FLASH_AGENT / flask_agent | Basic Auth（脚本与后端需一致） |
| `BACKEND_PORT` | 8001 | 后端端口 |
| `IDLE_TIMEOUT_MINUTES` | 480 | 实例空闲自动停止阈值 |
| `OPENCODE_AGENT` | 空（opencode 默认） | prompt 使用的 agent |
| `OPENCODE_EXTRA_ARGS` | 空 | 传给 opencode serve 的额外参数（如 `--print-logs --log-level DEBUG`） |

## 模型配置

- **全局默认**：`data/opencode_config/opencode.jsonc`（映射为沙箱内 `~/.config/opencode`）中已显式配置 `"model": "deepseek/deepseek-v4-pro"`、`"small_model": "deepseek/deepseek-v4-flash"`。改完执行 `systemctl --user restart opencode.service`。
- **单会话覆盖**：前端聊天头部下拉框选择模型（数据源 `GET /api/models`，即已连接 provider 的模型清单）；或 `PATCH /api/conversations/{id}` 传 `{"model": "provider/model"}`（空字符串恢复默认）。会话级覆盖落库在 conversations.model 列。
- **按消息覆盖**：`POST /api/stream/chat/{id}` 的 body 可带 `"model": "provider/model"`，优先级：按消息 > 会话级 > 全局默认。
- **新增 provider**：宿主机 `opencode auth login` 后运行 `sandbox/sync_auth.sh`（同步 auth.json 进沙箱 HOME 并重启实例）。

## 资源管理（agents / skills）：稳定版 + 测试副本双层模型

利用 opencode "project overrides global" 的机制做两层资源：

- **稳定版（全局，只读）**：宿主机 `data/resources/{agents,skills}` 经 bwrap `--ro-bind` 注入沙箱 `~/.config/opencode/{agents,skills}`。所有会话共享，沙箱内强制只读，会话无法污染。Web 资源库页（`/resources`）管理的就是这一层：新建/编辑/上传 = 发布稳定版。
- **测试副本（项目级，可写）**：会话资源面板勾选某资源 → 复制到该会话 workspace 的 `.opencode/{agents,skills}`。opencode 可写项目级目录——可以在会话中让 agent 修改它做 dry-run；同名资源项目级优先加载（遮蔽稳定版，其他会话不受影响）。
- **晋升**：验证满意后点"晋升到稳定版"（`POST /api/conversations/{id}/resources/pull`），把项目级副本回写进稳定版库（覆盖同名），dispose 实例后全局生效。
- 会话内 agent 下拉（数据来自 opencode `GET /agent`，含全局稳定版与项目级副本，过滤 hidden 内部 agent），选择落库 conversations.agent 列，prompt 时透传；优先级：请求级 > 会话级 > 全局默认。
- 上传约定：agent 传单个 `.md`（名字取文件名）；skill 传 `.zip`（支持含 scripts/references 等目录结构，顶层单一目录名即 skill 名，或根部直接放 SKILL.md 则取 zip 文件名；带 zip-slip 防护、强制校验 SKILL.md 存在）。

注意：实例对配置有缓存，资源变更（投影/晋升/稳定版编辑）后需 dispose 该目录实例生效——相关 API 已自动调用 `/instance/dispose`。

## 已知坑（排障记录）

- **权限审批人机回环**：opencode 的 `external_directory`/`doom_loop` 保留 `ask`（其余放开）。Event Bus 解析 `permission.asked` 广播审批卡片（前端显示权限类型+目标路径，按钮：允许一次/始终允许/拒绝），批复经 `POST /api/permissions/{conv}/{rid}/reply` 代理回 opencode；`permission.replied` 事件广播撤销卡片实现多标签同步；进入会话时 `GET /api/permissions/{conv}/pending` 恢复未处理卡片。bwrap 沙箱是硬隔离边界，放开常规操作是安全的。
- **glob/grep 工具报 "ripgrep execution failed"**：opencode 的 glob/grep 工具要调用 `rg`，但系统 PATH 里没有（只有 kimi CLI 自带的）。已将静态链接的 rg 复制到 `data/tools/rg`，经 `--ro-bind` 注入沙箱 `~/.local/bin/rg` 并 prepend 到沙箱 PATH。注意 rg 默认跳过隐藏目录，所以 glob `**/*` 不会扫到 `.opencode/` 内部（这是正确行为）。
- **opencode 免费模型（opencode/*-free）在当前网络不可达且免费额度有限**：选中后请求挂起、无事件、无报错，session 进入 `retry` 状态并阻塞后续所有 prompt。因此 `/api/models` 默认过滤 `opencode` provider（`EXCLUDED_PROVIDERS` 环境变量可调整），聊天流也加了 120s 无事件超时（`CHAT_INACTIVITY_TIMEOUT_SECONDS`）兜底报错。
- **opencode session 会"粘住"上次使用的模型**：某条消息用了模型 X，之后不带 model 字段的 prompt 会继续用 X，即使全局配置不同。因此后端每次 prompt 都显式带上模型（请求级 > 会话级 > GET /config 全局默认）。
- 若某会话的 opencode session 已损坏（如卡在 retry）：`UPDATE conversations SET opencode_session_id=NULL WHERE id='...'`，下次发消息会自动懒绑定新 session（历史记录随之重置）。

## 注意

- 凭据是拷贝而非挂载：`~/.local/share/opencode/auth.json` → `data/home/.local/share/opencode/`（`sync_auth.sh` 自动化此步骤）。
- 本机 8000 端口被其他项目占用，故后端用 8001。
