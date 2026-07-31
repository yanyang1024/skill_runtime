"""SSE 双通道：
- POST /stream/chat/{id}      发消息并流式返回该次回复的事件（done 结束）
- GET  /stream/subscribe/{id} 持久订阅：初始状态 + keepalive + 控制事件（loop/推荐/状态）
"""
import asyncio
import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sse_starlette.sse import EventSourceResponse

from .. import config
from ..db import SessionLocal, get_db
from ..deps import ensure_opencode_session, get_conversation_or_404
from ..event_bus import get_event_bus
from ..instance_manager import get_instance_manager
from ..loop_controller import get_loop_controller
from ..opencode import get_opencode_client

log = logging.getLogger("stream")
router = APIRouter(prefix="/stream", tags=["stream"])


class StreamChatRequest(BaseModel):
    message: str
    agent: str | None = None
    model: str | None = None  # "provider/model" 按消息覆盖；优先于会话级设置


def _sse(item: dict) -> dict:
    return {"event": "message", "data": json.dumps(item, ensure_ascii=False)}


# 防任何中间层（代理/转发中继）缓冲 SSE
_SSE_HEADERS = {"X-Accel-Buffering": "no", "Cache-Control": "no-cache"}


def _event_source(gen, ping: int = 15) -> EventSourceResponse:
    return EventSourceResponse(gen, ping=ping, headers=_SSE_HEADERS)


@router.post("/chat/{conv_id}")
async def stream_chat(conv_id: str, request: StreamChatRequest, db: Session = Depends(get_db)):
    conv = get_conversation_or_404(conv_id, db)
    try:
        oc_session_id = await ensure_opencode_session(conv, db)
    except Exception as e:
        # 实例启动/session 创建失败也要以 SSE 形式告知前端
        async def err_stream():
            yield _sse({"type": "error", "message": f"OpenCode 实例不可用: {e}"})
            yield _sse({"type": "done"})

        return _event_source(err_stream())

    workspace_path = conv.workspace_path
    mgr = get_instance_manager()
    mgr.touch_activity()

    loop = get_loop_controller()
    loop.signal_user_message(conv_id)  # 防 loop 竞态：本次 idle 属于用户消息

    eb = get_event_bus()
    queue = await eb.ensure(conv_id, oc_session_id, workspace_path)

    async def chat_stream():
        try:
            try:
                oc = get_opencode_client()
                # 显式带上模型：请求级 > 会话级 > 全局默认。
                # 必须显式——opencode session 会粘住上次使用的模型。
                model = request.model or conv.model or await oc.get_default_model()
                await oc.send_prompt_async(
                    oc_session_id,
                    request.message,
                    workspace_path,
                    request.agent or conv.agent or config.DEFAULT_AGENT,
                    model,
                )
            except Exception as e:
                yield _sse({"type": "error", "message": f"发送消息失败: {e}"})
                yield _sse({"type": "done"})
                return
            # 从 event bus queue 取事件，逐条 SSE 推送给前端，done 结束
            while True:
                try:
                    item = await asyncio.wait_for(
                        queue.get(), timeout=config.CHAT_INACTIVITY_TIMEOUT_SECONDS
                    )
                except asyncio.TimeoutError:
                    yield _sse({
                        "type": "error",
                        "message": "等待回复超时：模型无响应（可能当前网络不可达该模型），请更换模型或重试",
                    })
                    yield _sse({"type": "done"})
                    break
                yield _sse(item)
                if item.get("type") == "done":
                    break
        finally:
            eb.release(conv_id, queue)

    return _event_source(chat_stream(), ping=15)


@router.post("/chat/{conv_id}/abort")
async def abort_chat(conv_id: str, db: Session = Depends(get_db)):
    """中断当前会话正在进行的生成。"""
    conv = get_conversation_or_404(conv_id, db)
    if not conv.opencode_session_id:
        return {"aborted": False}
    try:
        await get_opencode_client().abort(conv.opencode_session_id, conv.workspace_path)
        return {"aborted": True}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"中断失败: {e}")


@router.get("/subscribe/{conv_id}")
async def subscribe_session(conv_id: str, db: Session = Depends(get_db)):
    conv = get_conversation_or_404(conv_id, db)
    workspace_path = conv.workspace_path
    oc_session_id = conv.opencode_session_id  # 可能为 None（尚未懒绑定）

    async def subscribe_stream():
        eb = get_event_bus()
        queue = None
        attached_session = oc_session_id

        if attached_session:
            queue = await eb.ensure(conv_id, attached_session, workspace_path)
            # 初始状态：todos
            try:
                todos = await get_opencode_client().get_todos(attached_session, workspace_path)
                yield _sse({"type": "todos", "items": todos})
            except Exception:
                pass
            yield _sse({"type": "session_status", "status": "idle"})
        else:
            yield _sse({"type": "session_status", "status": "idle"})

        while True:
            if queue is None:
                # OpenCode session 尚未创建：轮询等待懒绑定完成，同时 keepalive
                await asyncio.sleep(5)
                with SessionLocal() as poll_db:
                    row = poll_db.get(type(conv), conv_id)
                    new_session = row.opencode_session_id if row else None
                if new_session:
                    attached_session = new_session
                    queue = await eb.ensure(conv_id, attached_session, workspace_path)
                else:
                    yield {"event": "keepalive", "data": ""}
                continue
            try:
                item = await asyncio.wait_for(queue.get(), timeout=15.0)
            except asyncio.TimeoutError:
                yield {"event": "keepalive", "data": ""}
                continue
            # done 也转发：前端用它把 loop 轮次内容落成消息（连接本身由 keepalive 保活）
            yield _sse(item)

    return _event_source(subscribe_stream(), ping=30)
