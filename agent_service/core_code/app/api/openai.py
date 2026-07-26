"""OpenAI 兼容路由：/v1/chat/completions、/v1/models。"""
import json
import logging
import time
import uuid

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse

from .. import config, db
from ..schemas import ChatCompletionRequest, is_valid_id
from ..services.instance_manager import app_manager
from ..services.opencode_client import registry
from ..services.workspace import provision_session_workspace

logger = logging.getLogger(__name__)
router = APIRouter()


async def _ensure_opencode_session(session: dict) -> dict:
    """
    懒绑定：首条消息时才创建 OpenCode session 并持久化映射。
    已有绑定但 opencode 侧 session 已不存在时（如实例数据被清），自动重建。
    实例未运行时会自动启动；启动失败抛 HTTPException(503)。
    """
    app_id = session["app_id"]
    try:
        if not await app_manager.is_active(app_id):
            logger.info("实例未运行，自动启动: app=%s", app_id)
            await app_manager.start(app_id)
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"实例启动失败: {e}")

    oc = registry.get_client(app_id)
    oc_sid = session["opencode_session_id"]
    if oc_sid:
        existing = await oc.get_session(
            oc_sid, workspace_path=session["workspace_path"]
        )
        if existing:
            return session
        logger.warning("opencode session 已失效，重建: %s", oc_sid)

    try:
        oc_session = await oc.create_session(
            workspace_path=session["workspace_path"]
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"创建 opencode session 失败: {e}")
    db.bind_opencode_session(session["session_id"], oc_session["id"])
    session["opencode_session_id"] = oc_session["id"]
    return session


@router.post("/v1/chat/completions")
async def chat_completions(
    req: ChatCompletionRequest,
    x_app_id: str = Header("default"),
    x_session_id: str | None = Header(None),
):
    if not is_valid_id(x_app_id):
        raise HTTPException(status_code=400, detail="非法 X-App-Id（只允许字母数字 _ -，最长 64）")
    if x_session_id is not None and not is_valid_id(x_session_id):
        raise HTTPException(status_code=400, detail="非法 X-Session-Id（只允许字母数字 _ -，最长 64）")

    app_id = x_app_id
    agent = req.model or config.DEFAULT_AGENT

    prompt = req.last_user_text()
    if not prompt:
        raise HTTPException(status_code=400, detail="messages 中缺少 user 消息")

    # 会话：客户端可传 X-Session-Id 复用上下文，否则新建
    session_id = x_session_id or uuid.uuid4().hex
    session = db.get_session(session_id)
    if session is None:
        workspace = provision_session_workspace(app_id, session_id)
        session = db.create_session(session_id, app_id, workspace, agent)
    elif session["app_id"] != app_id:
        raise HTTPException(status_code=400, detail="session 不属于该 app")

    session = await _ensure_opencode_session(session)
    app_manager.touch(app_id)

    oc = registry.get_client(app_id)
    model = agent
    gen = oc.stream_chat(
        session["opencode_session_id"],
        prompt,
        agent,
        workspace_path=session["workspace_path"],
        model=model,
        request_id=session_id,
    )
    # 流式/非流式都通过响应头透出 session id，供调用方续聊
    resp_headers = {"X-Session-Id": session_id}

    if req.stream:
        async def event_generator():
            async for chunk in gen:
                yield f"data: {json.dumps(chunk, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers=resp_headers,
        )

    # 非流式：聚合全部 chunk
    content_parts: list[str] = []
    reasoning_parts: list[str] = []
    finish_reason = "stop"
    async for chunk in gen:
        choice = chunk["choices"][0]
        delta = choice.get("delta") or {}
        if delta.get("content"):
            content_parts.append(delta["content"])
        if delta.get("reasoning_content"):
            reasoning_parts.append(delta["reasoning_content"])
        if choice.get("finish_reason"):
            finish_reason = choice["finish_reason"]

    message: dict = {"role": "assistant", "content": "".join(content_parts)}
    if reasoning_parts:
        message["reasoning_content"] = "".join(reasoning_parts)
    return JSONResponse(
        content={
            "id": f"chatcmpl-{session_id}",
            "object": "chat.completion",
            "created": int(time.time()),
            "model": model,
            "choices": [
                {"index": 0, "message": message, "finish_reason": finish_reason}
            ],
            "x_session_id": session_id,
        },
        headers=resp_headers,
    )


@router.get("/v1/models")
async def list_models():
    return {
        "object": "list",
        "data": [
            {"id": name, "object": "model", "created": 0, "owned_by": "opencode"}
            for name in ("build", "plan")
        ],
    }
