# Flask / FastAPI Security Patterns

## 1. Flask 全局 Bearer Token 认证

适合纯 API 服务。比给每个路由手动加装饰器更不容易漏。

```python
# security.py
import os
from flask import request, jsonify

API_TOKEN = os.getenv("API_TOKEN")
PUBLIC_PATHS = {"/healthz"}

def install_security(app):
    if not API_TOKEN:
        raise RuntimeError("API_TOKEN is required")

    @app.before_request
    def require_token():
        if request.path in PUBLIC_PATHS:
            return None
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer ") or auth[7:] != API_TOKEN:
            return jsonify({"error": "Unauthorized"}), 401
        return None

    @app.after_request
    def security_headers(response):
        response.headers.pop("X-Powered-By", None)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.errorhandler(Exception)
    def handle_error(exc):
        app.logger.exception("Unhandled exception")
        return jsonify({"error": "Internal error"}), 500
```

接入：

```python
from flask import Flask
from security import install_security

app = Flask(__name__)
app.config["DEBUG"] = False
install_security(app)
```

## 2. FastAPI 全局 Bearer Token 认证

```python
# security.py
import os
import logging
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)
security = HTTPBearer(auto_error=False)
API_TOKEN = os.getenv("API_TOKEN")

async def verify_token(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if not API_TOKEN:
        raise RuntimeError("API_TOKEN is required")
    if credentials is None or credentials.scheme.lower() != "bearer" or credentials.credentials != API_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized")

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers.pop("server", None)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Cache-Control"] = "no-store"
        return response

async def internal_error_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception")
    return JSONResponse({"error": "Internal error"}, status_code=500)
```

接入：

```python
from fastapi import FastAPI, Depends
from security import verify_token, SecurityHeadersMiddleware, internal_error_handler

app = FastAPI(
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
    dependencies=[Depends(verify_token)],
)
app.add_middleware(SecurityHeadersMiddleware)
app.add_exception_handler(Exception, internal_error_handler)
```

## 3. 受保护的健康检查

默认健康检查也应要求 token。若负载均衡器必须无认证访问，只返回极简状态：

```python
{"status": "ok"}
```

不要返回：版本号、主机名、绝对路径、数据库连接状态、依赖列表、环境变量。

## 4. 浏览器 Web 应用例外

如果是浏览器页面，不要只靠 Bearer token。优先使用：

- Session cookie；
- CSRF protection；
- Secure / HttpOnly / SameSite cookie；
- OAuth/OIDC 或企业 SSO；
- 反向代理层认证。

## 5. Secret 规则

禁止：

```python
API_TOKEN = "sk-hardcoded"
SECRET_KEY = "dev"
```

推荐：

```python
API_TOKEN = os.environ["API_TOKEN"]
SECRET_KEY = os.environ["SECRET_KEY"]
```

启动前生成：

```bash
export API_TOKEN="$(python - <<'PY'
import secrets
print('sk-' + secrets.token_urlsafe(32))
PY
)"
```
