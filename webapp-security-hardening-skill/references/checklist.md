#上线前 Security Checklist

## 应用层

- [ ] 所有业务路由需要认证。
- [ ] `/health` / `/metrics` 没有泄露版本、路径、依赖、数据库状态。
- [ ] FastAPI 生产环境关闭 `/docs`、`/redoc`、`/openapi.json`，或放到受保护路径。
- [ ] Flask 未公开 Swagger/flasgger/apispec 文档。
- [ ] token、secret、数据库密码不硬编码。
- [ ] Debug 模式关闭。
- [ ] 全局异常处理对外只返回通用错误。
- [ ] 服务端日志记录异常堆栈，但日志权限受限。
- [ ] 响应头包含基础安全头。
- [ ] 文件上传/下载接口有鉴权、大小限制和路径穿越防护。
- [ ] CORS 不使用 `*` 搭配 credentials。

## 部署层

- [ ] 明确选择 `proxy_private` / `anti_local_agent` / `local_only`。
- [ ] 服务未误绑定 `0.0.0.0`。
- [ ] 监听地址符合部署模式。
- [ ] 公网入口强制 HTTPS。
- [ ] Nginx/网关正确转发 `Authorization`、`X-Forwarded-For`、`X-Forwarded-Proto`。
- [ ] 只开放必要端口。
- [ ] 防火墙规则持久化。
- [ ] 进程使用普通用户运行。
- [ ] `.env` 或 EnvironmentFile 权限为 600/640。
- [ ] systemd 使用基础 sandbox 选项。

## 验证层

- [ ] 无 token 请求返回 401/403。
- [ ] 错误 token 请求返回 401/403。
- [ ] 正确 token 请求返回 200。
- [ ] 文档路径返回 404/401/403。
- [ ] 故意触发错误不会返回 traceback。
- [ ] `curl -I` 不暴露不必要框架头。
- [ ] `ss -tlnp` 显示监听地址符合预期。
- [ ] HTTP 跳 HTTPS。
- [ ] 日志中能看到请求 IP、方法、路径、状态码、耗时。
