"""SIMPLE_TOKEN Bearer 认证（个人版可选认证）。

- ``SIMPLE_TOKEN`` 为空：认证关闭，全部放行（本地默认）。
- 非空：除 ``/api/health`` 外所有 ``/api/**`` 需要
  ``Authorization: Bearer <token>``；SSE（EventSource 无法自定义头）可用
  ``?token=<token>`` 查询参数代替。
"""
from fastapi import HTTPException, Request

from app.config import settings


def _extract_token(request: Request) -> str:
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[len("Bearer "):].strip()
    # EventSource 无法设置请求头，SSE 走查询参数
    return request.query_params.get("token", "")


async def require_auth(request: Request) -> None:
    """FastAPI 依赖：挂在路由级，认证关闭时零开销放行。"""
    if not settings.simple_token:
        return
    if _extract_token(request) != settings.simple_token:
        raise HTTPException(status_code=401, detail="认证失败：缺少或错误的 token")
