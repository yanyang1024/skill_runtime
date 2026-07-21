"""Prompt 推荐与阶段选择路由。"""
import asyncio
import logging

from fastapi import APIRouter, HTTPException

from app.api.conversations import conversation_public, get_conversation_or_404
from app.config import settings
from app.database import execute, query_one
from app.models import row_to_recommendation, utcnow_iso
from app.schemas import StageSelect
from app.services import recommender
from app.services.event_bus import event_bus

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/conversations/{conversation_id}", tags=["recommendations"])


@router.get("/recommendation")
async def get_recommendation(conversation_id: str):
    get_conversation_or_404(conversation_id)
    row = query_one(
        "SELECT * FROM prompt_recommendations WHERE conversation_id=? "
        "ORDER BY created_at DESC LIMIT 1",
        (conversation_id,),
    )
    return {"recommendation": row_to_recommendation(row) if row else None}


@router.post("/recommendation/regenerate")
async def regenerate_recommendation(conversation_id: str):
    get_conversation_or_404(conversation_id)

    async def _run() -> None:
        event_bus.emit(conversation_id, {"type": "recommendation_started"})
        try:
            rec = None
            if settings.recommender_base_url and settings.recommender_model:
                rec = await recommender.generate(conversation_id)
            if rec:
                event_bus.emit(
                    conversation_id,
                    {"type": "recommendation_ready", "recommendation_id": rec["id"]},
                )
            else:
                # 未配置模型/生成无效同样闭环，前端收到后复位 loading
                event_bus.emit(conversation_id, {"type": "recommendation_ready"})
        except Exception:
            logger.warning("重新生成推荐失败", exc_info=True)
            event_bus.emit(conversation_id, {"type": "recommendation_ready"})

    asyncio.create_task(_run())
    return {"ok": True}


@router.post("/stage")
async def set_stage(conversation_id: str, body: StageSelect):
    get_conversation_or_404(conversation_id)
    if body.stage not in recommender.STAGES:
        raise HTTPException(status_code=400, detail=f"未知阶段：{body.stage}")
    if body.mode not in ("auto", "manual"):
        raise HTTPException(status_code=400, detail="mode 只能是 auto 或 manual")
    execute(
        "UPDATE conversations SET selected_stage=?, stage_mode=?, updated_at=? WHERE id=?",
        (body.stage, body.mode, utcnow_iso(), conversation_id),
    )
    return conversation_public(get_conversation_or_404(conversation_id))
