# 部署与配置（服务构建者）

## 系统依赖

| 依赖 | 说明 |
|---|---|
| Linux + systemd user session | `systemctl --user` 可用（WSL2 亦可） |
| bubblewrap (`bwrap`) | 沙箱；需内核支持 user namespace |
| Python ≥ 3.10 | API 服务运行时 |
| OpenCode | npm 包 `opencode-ai`，当前固定路径见下文「OpenCode 二进制」 |

Python 包：`pip install -r requirements.txt`（fastapi / uvicorn / httpx /
sse-starlette / pydantic）

## 安装

```bash
cd /home/yy/agent_service
pip install -r requirements.txt
./scripts/install.sh
```

`install.sh` 做的事：

1. `chmod +x scripts/start_agent.sh`
2. 把 `systemd/opencode-app@.service`、`systemd/agent-service.service`
   复制到 `~/.config/systemd/user/`
3. `systemctl --user daemon-reload`
4. `systemctl --user enable --now agent-service.service`（API 服务，127.0.0.1:8000）

OpenCode 实例不需要预先启动——首个请求到达时按需拉起。

> **注销后保持运行（生产建议）**：`loginctl enable-linger $USER`。
> 未开启 linger 时，用户注销会杀掉所有 user 服务（WSL 默认 `Linger=no`）。

## 配置项

### 1. 模型与 provider —— `config/opencode/opencode.jsonc`

这是服务**独立**的 opencode 配置（与宿主机 `~/.config/opencode` 无关）：

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "model": "deepseek/deepseek-v4-pro",
  // 接自建 LLM 网关示例：
  "provider": {
    "iad": {
      "npm": "@ai-sdk/openai-compatible",
      "options": { "baseURL": "http://10.18.32.131:5555/v1" },
      "models": { "LLM-Chat": { "name": "Qwen3.6-27B" } }
    }
  }
}
```

改完后重启实例生效：`systemctl --user restart opencode-app@<app_id>`
（或 `POST /apps/<app_id>/stop`，下次请求自动拉起时重新同步配置）。

自定义 agent 放 `config/opencode/agents/<名字>.md`；skills 放
`config/opencode/skills/<名>/SKILL.md`，同样在实例重启时同步。

### 2. LLM 凭据 —— `config/auth.json`

opencode auth 格式（`opencode auth login` 写入的同一种 JSON），权限 600，
已 gitignore。以只读单文件注入沙箱，宿主机的 `~/.local/share/opencode/auth.json`
改动不会影响服务。

### 3. 服务参数 —— 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `AGENT_SERVICE_HOST` / `AGENT_SERVICE_PORT` | 127.0.0.1 / 8000 | API 监听地址（改 systemd 单元 ExecStart 也可） |
| `OPENCODE_SERVER_USERNAME` / `OPENCODE_SERVER_PASSWORD` | agent / agent | OpenCode 实例 HTTP Basic Auth。**三处必须一致**：`systemd/opencode-app@.service` 的 Environment、`start_agent.sh` 的默认值、API 服务环境变量 |
| `IDLE_CHECK_INTERVAL` | 300 | 空闲扫描周期（秒） |
| `IDLE_TIMEOUT` | 1800 | 空闲回收阈值（秒） |

给 agent-service 配环境变量的方式：`systemctl --user edit agent-service`，加

```ini
[Service]
Environment=IDLE_TIMEOUT=7200
```

### 4. OpenCode 二进制

固定在 `scripts/start_agent.sh` 的 `OPENCODE_BIN`
（当前 `~/.npm-global/lib/node_modules/opencode-ai/bin/opencode.exe`）。
升级 opencode（`npm update -g opencode-ai`）后确认该路径不变；
若改用其他安装方式，同步修改此变量，并保证其所在目录在 bwrap 里有 ro-bind
恢复（当前恢复的是整个 `~/.npm-global`）。

### 5. 端口规划

- API 服务：8000
- OpenCode 实例：`45000 + (md5(app_id) % 20536)`，即 45000–65535。
  不同 app_id 理论上存在哈希碰撞可能（概率极低），如遇碰撞改其中一个 app_id 即可。

## 多 app 使用

无需任何配置：调用方传不同的 `X-App-Id`（字母数字 `_` `-`，≤64 字符），
服务端自动创建 `data/apps/{app_id}/`、按端口公式启动独立实例。实例数量上限
取决于机器资源（每个 opencode 进程约几百 MB 内存）；配合空闲回收控制常驻数量。

## 升级

```bash
cd /home/yy/agent_service
git pull                                # 或手动同步代码
pip install -r requirements.txt         # 依赖有变化时
./scripts/install.sh                    # systemd 单元有变化时（会覆盖安装并重启 API 服务）
systemctl --user restart agent-service  # 仅代码变化时
```

正在运行的 OpenCode 实例不受 API 服务重启影响（独立 systemd 单元）；
`start_agent.sh` 有变化时需重启对应实例。
