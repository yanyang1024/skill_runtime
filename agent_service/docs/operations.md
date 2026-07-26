# 运维手册

## 日常命令

```bash
# API 服务
systemctl --user status agent-service
systemctl --user restart agent-service
journalctl --user -u agent-service -f          # 跟踪日志

# OpenCode 实例（以 app_id=default 为例）
systemctl --user status opencode-app@default
systemctl --user restart opencode-app@default
journalctl --user -u opencode-app@default -f
systemctl --user list-units 'opencode-app@*'   # 所有实例

# 也可以用 API（推荐，会顺带更新内存状态）
curl -s http://127.0.0.1:8000/apps/default/status
curl -s -X POST http://127.0.0.1:8000/apps/default/stop
```

## 日志位置

| 日志 | 位置 |
|---|---|
| API 服务 | `journalctl --user -u agent-service` |
| OpenCode 实例（stdout） | `journalctl --user -u opencode-app@<app_id>` |
| OpenCode 内部详细日志 | `data/apps/<app_id>/home/.local/share/opencode/log/opencode.log`（排障首选，含 LLM 调用、tool 执行细节） |

## 资源与数据目录

```
data/
├── agent_service.db          # sqlite：session → opencode session 映射
└── apps/<app_id>/
    ├── home/                 # 实例的 HOME（opencode db/storage/cache，会话持久化在这）
    ├── opencode-config/      # 配置副本（启动时从 config/opencode 同步）
    ├── tmp/                  # 实例的 /tmp
    └── workspace/<session_id>/  # 各会话工作目录（Agent 文件操作的边界）
```

- **会话持久化**：会话历史存在各 app 的 `home/.local/share/opencode/opencode.db`，
  实例重启不丢；删掉 `home/` 等于清空该 app 全部会话记忆（DB 映射会自动重建新 session）
- **备份**：备份 `data/` 与 `config/` 即可完整备份服务状态
- **清理磁盘**：
  - 删单个会话：`curl -X DELETE http://127.0.0.1:8000/apps/<app_id>/sessions/<sid>`
  - 整个 app 下线：先 `POST /apps/<app_id>/stop`，再 `rm -rf data/apps/<app_id>`

## 空闲回收

后台任务每 `IDLE_CHECK_INTERVAL` 秒检查一次，实例距最后一次请求超过
`IDLE_TIMEOUT` 秒则自动 `systemctl stop`（日志出现「回收空闲实例」）。
注意：**服务重启后内存中的活跃时间清零**，刚重启的那一轮扫描不会回收任何实例
（`_last_activity` 为空），实例要等到下次被请求触碰后才开始计时。

## 故障排查

| 现象 | 排查 |
|---|---|
| 请求 503「实例启动失败」 | `journalctl --user -u opencode-app@<app_id>` 看启动错误；常见：`start_agent.sh` 路径变动、bwrap 不可用、端口被占 |
| 实例 active 但请求超时 | `curl -u agent:agent http://127.0.0.1:<port>/global/health`（port 见 status 接口）；不通则重启实例 |
| 回复慢（首 token 1~2 分钟） | 模型本身慢（如 deepseek reasoning），属正常现象；可换更快的模型 |
| 流式响应中途 error chunk | 看 `data/apps/<app_id>/home/.local/share/opencode/log/opencode.log`，常见：LLM key 失效/欠费、网关不可达 |
| Agent 不写文件/报权限错 | 服务对所有 permission 自动批准，正常不该发生；检查 workspace 目录磁盘与权限 |
| 全部接口 500 且实例日志有 EROFS | opencode 需要可写的配置目录——确认挂载的是 `data/apps/<app_id>/opencode-config/`（可写副本）而不是 ro-bind 的模板 |
| 修改了 config/opencode 不生效 | 配置只在实例启动时同步，需重启实例 |

## 安全注意事项

- API 服务**没有认证**，只监听 127.0.0.1。要暴露到局域网/公网，务必在前面
  加反向代理 + 认证（或自行实现 API Key 层），不要直接改监听地址裸奔
- `X-App-Id` 由调用方自报，无隔离鉴权——多租户场景必须加认证层
- Agent 在沙箱内对所有 tool 权限自动批准（无人工审批），它能读写会话工作目录、
  执行任意 shell 命令；沙箱（只读根 + home 隔离 + 命名空间）是唯一的防线，
  不要给 `start_agent.sh` 增加多余的可写 bind
- `config/auth.json` 含 LLM 明文 key，保持 600 权限、不要提交 git（已 gitignore）
