# Deployment Modes

## mode: proxy_private

推荐生产默认模式。

架构：

```text
Internet -> Nginx/Caddy/ALB:443 -> app private IP / unix socket
```

应用监听：

- `127.0.0.1`：适合没有本机不可信 agent 的普通服务器。
- 私网 IP：适合反向代理和应用不在同一网络 namespace。
- Unix socket：适合同机 Nginx + Gunicorn/Uvicorn workers。

注意：如果用户的特殊目标是“防本机 agent 通过 127.0.0.1 扫描”，不要用 loopback 监听。

## mode: anti_local_agent

特殊隔离模式。目标是让本机自动化 agent 扫不到业务端口。

动作：

1. 应用不要监听 `127.0.0.1`。
2. 应用不要监听 `0.0.0.0`，除非已经有防火墙和认证。
3. 绑定到明确的非 loopback 地址，例如 `192.168.x.x`。
4. 防火墙拒绝来自 `127.0.0.1` 到业务端口的访问。
5. 外部访问统一走 Nginx/HTTPS 或指定 IP allowlist。

验证：

```bash
curl -v http://127.0.0.1:8000/
# 期望 connection refused / timeout / blocked

ss -tlnp | grep :8000
# 期望不是 127.0.0.1:8000，也不是 0.0.0.0:8000
```

## mode: local_only

仅本机可信组件访问，不对公网开放。

动作：

1. 监听 `127.0.0.1` 或 Unix socket。
2. 仍然添加 token 或 mTLS，避免本机其他进程误用。
3. 不在 Nginx 中公开。
4. 防火墙拒绝公网访问。

## 启动示例

FastAPI/Uvicorn：

```bash
uvicorn main:app --host "$APP_HOST" --port "$APP_PORT"
```

Gunicorn + Flask：

```bash
gunicorn -w 4 -b "$APP_HOST:$APP_PORT" app:app
```

自动获取默认出口 IP：

```bash
APP_HOST=$(ip route get 1.1.1.1 | awk '{print $7; exit}')
```
