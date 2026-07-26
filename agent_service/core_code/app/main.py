"""FastAPI 入口。"""
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from . import db
from .api import apps, openai
from .services.instance_manager import app_manager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    idle_task = asyncio.create_task(app_manager.idle_check_worker())
    yield
    idle_task.cancel()


app = FastAPI(title="agent_service", lifespan=lifespan)
app.include_router(openai.router)
app.include_router(apps.router)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    # 统一兜底：记录完整堆栈，响应里给出可读错误而不是裸 "Internal Server Error"
    logger.exception("未处理异常: %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": str(exc)})


@app.get("/health")
async def health():
    return {"ok": True}
