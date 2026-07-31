"""Loop 控制 API：queue（队列播放）与 ai（Recommender 自动推进）双模式。"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import ensure_opencode_session, get_conversation_or_404
from ..event_bus import get_event_bus
from ..loop_controller import get_loop_controller
from ..opencode import get_opencode_client

router = APIRouter(prefix="/loop", tags=["loop"])


class LoopStartRequest(BaseModel):
    mode: str = "queue"            # "queue" | "ai"
    prompts: list[str] = []        # queue 模式：预写 prompt 队列
    goal: str = ""                 # ai 模式：目标描述（也作为上下文给 recommender）
    max_rounds: int = 20           # ai 模式：最大轮数


def _build_ctx(conv, oc_session_id: str) -> dict:
    oc = get_opencode_client()
    eb = get_event_bus()
    return {
        "oc": oc,
        "oc_session_id": oc_session_id,
        "workspace_path": conv.workspace_path,
        "model": conv.model,       # loop 使用会话级模型/agent（None = 后端显式默认逻辑之外）
        "agent": conv.agent,
        "resources": {},
        "broadcast": lambda item: eb.broadcast(conv.id, item),
    }


@router.post("/{conv_id}/start")
async def start_loop(conv_id: str, req: LoopStartRequest, db: Session = Depends(get_db)):
    if req.mode not in ("queue", "ai"):
        raise HTTPException(status_code=400, detail="mode 必须是 queue 或 ai")
    conv = get_conversation_or_404(conv_id, db)
    # loop 需要 opencode session（ai 模式第一轮就要读消息历史）
    oc_session_id = await ensure_opencode_session(conv, db)
    # 确保 event bus 订阅存在，loop 的广播事件才能到达前端
    await get_event_bus().ensure(conv_id, oc_session_id, conv.workspace_path)

    loop = get_loop_controller()
    ctx = _build_ctx(conv, oc_session_id)
    # 模型粘滞防护：loop 显式带上（会话级 > 全局默认）
    if not ctx["model"]:
        ctx["model"] = await get_opencode_client().get_default_model()
    result = loop.start(conv_id, req.mode, req.prompts, req.goal, req.max_rounds, ctx)
    if not result.get("active"):
        return {"active": False, "reason": result.get("reason", "启动失败")}
    return {"active": True, "mode": req.mode}


@router.post("/{conv_id}/pause")
async def pause_loop(conv_id: str, db: Session = Depends(get_db)):
    get_conversation_or_404(conv_id, db)
    get_loop_controller().pause(conv_id)
    return {"pausing": True}


@router.post("/{conv_id}/stop")
async def stop_loop(conv_id: str, db: Session = Depends(get_db)):
    get_conversation_or_404(conv_id, db)
    get_loop_controller().stop(conv_id)
    return {"active": False}


@router.get("/{conv_id}/status")
def loop_status(conv_id: str, db: Session = Depends(get_db)):
    get_conversation_or_404(conv_id, db)
    return get_loop_controller().status(conv_id)
