"""FastAPI 入口：Skill Growth Chat Lite 后端。"""
import asyncio
import logging
import time
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api import conversations, files, recommendations, skills
from app.auth import require_auth
from app.config import ensure_dirs, settings
from app.database import init_db
from app.logging_config import setup_logging
from app.services.event_bus import event_bus
from app.services.opencode_client import opencode_client
from app.services.opencode_runtime import opencode_runtime

setup_logging()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动：确保数据目录与数据库表存在
    ensure_dirs()
    init_db()
    # 为老会话 workspace 补齐 AGENTS.md 路径规则（注入给 OpenCode 的读写作业约定）
    from app.services.workspace import backfill_workspace_guidance

    filled = backfill_workspace_guidance()
    if filled:
        logger.info("已为 %d 个老会话 workspace 补齐 AGENTS.md 路径规则", filled)
    logger.info("后端启动完成，数据目录: %s", settings.data_root)
    # 空闲自动关闭看门狗（IDLE_TIMEOUT_MINUTES=0 时内部直接返回）
    watchdog = asyncio.create_task(opencode_runtime.idle_watchdog())
    yield
    # 关闭：停止看门狗与所有事件订阅后台任务
    watchdog.cancel()
    await event_bus.stop_all()
    logger.info("后端已停止")


# 开启认证后关闭公开文档端点（/docs /redoc /openapi.json 会泄露完整 API schema）
app = FastAPI(
    title="Skill Growth Chat Lite",
    lifespan=lifespan,
    docs_url=None if settings.simple_token else "/docs",
    redoc_url=None if settings.simple_token else "/redoc",
    openapi_url=None if settings.simple_token else "/openapi.json",
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """请求级日志：方法 + 路径 + 状态码 + 耗时（SSE 长连接记录建立与关闭）。"""
    path = request.url.path
    is_sse = path.endswith("/events")
    # 活动跟踪：除健康检查外的 /api 请求都视为用户活动（用于空闲自动关闭）
    if path.startswith("/api/") and path != "/api/health":
        opencode_runtime.touch_activity()
    start = time.monotonic()
    if is_sse:
        logger.info("SSE 连接建立: %s %s", request.method, path)
    try:
        response = await call_next(request)
    except Exception:
        elapsed = (time.monotonic() - start) * 1000
        logger.exception("请求异常: %s %s (%.0fms)", request.method, path, elapsed)
        raise
    elapsed = (time.monotonic() - start) * 1000
    if is_sse:
        # 流式响应创建即返回，真正的断开由路由侧 event_generator 记录
        logger.info("SSE 流式响应开始: %s %s -> %s", request.method, path, response.status_code)
    elif path != "/api/health" or response.status_code != 200:
        # 健康检查成功的不记（前端轮询频繁），其余全部记录
        logger.info("%s %s -> %s (%.0fms)", request.method, path, response.status_code, elapsed)
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5174", "http://127.0.0.1:5174",
        "http://localhost:5173", "http://127.0.0.1:5173",  # 兼容旧默认端口
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(conversations.router, prefix="/api", dependencies=[Depends(require_auth)])
app.include_router(files.router, prefix="/api", dependencies=[Depends(require_auth)])
app.include_router(skills.router, prefix="/api", dependencies=[Depends(require_auth)])
app.include_router(recommendations.router, prefix="/api", dependencies=[Depends(require_auth)])


@app.get("/api/health")
async def health():
    """后端 + OpenCode 健康状态（OpenCode 未启动时 opencode 字段为 null，属正常降级）。"""
    oc_health = await opencode_client.health()
    return {
        "backend": "ok",
        "opencode": oc_health,
        "opencode_base_url": settings.opencode_base_url,
    }
