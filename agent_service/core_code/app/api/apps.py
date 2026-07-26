"""运维路由：实例生命周期与会话管理。"""
from fastapi import APIRouter, HTTPException

from .. import db
from ..schemas import is_valid_id
from ..services.instance_manager import app_manager
from ..services.opencode_client import registry
from ..services.workspace import remove_session_workspace

router = APIRouter(prefix="/apps", tags=["apps"])


def _check_ids(app_id: str, session_id: str | None = None) -> None:
    if not is_valid_id(app_id):
        raise HTTPException(status_code=400, detail="非法 app_id")
    if session_id is not None and not is_valid_id(session_id):
        raise HTTPException(status_code=400, detail="非法 session_id")


def _get_session_or_404(app_id: str, session_id: str) -> dict:
    session = db.get_session(session_id)
    if not session or session["app_id"] != app_id:
        raise HTTPException(status_code=404, detail="session not found")
    return session


@router.post("/{app_id}/start")
async def start_app(app_id: str):
    _check_ids(app_id)
    try:
        await app_manager.start(app_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return await app_manager.status(app_id)


@router.post("/{app_id}/stop")
async def stop_app(app_id: str):
    _check_ids(app_id)
    await app_manager.stop(app_id)
    registry.remove_client(app_id)
    return await app_manager.status(app_id)


@router.get("/{app_id}/status")
async def app_status(app_id: str):
    _check_ids(app_id)
    return await app_manager.status(app_id)


@router.get("/{app_id}/sessions")
async def list_sessions(app_id: str):
    _check_ids(app_id)
    return [
        {
            "session_id": s["session_id"],
            "agent": s["agent"],
            "workspace_path": s["workspace_path"],
            "created_at": s["created_at"],
            "updated_at": s["updated_at"],
        }
        for s in db.list_sessions(app_id)
    ]


@router.get("/{app_id}/sessions/{session_id}/messages")
async def session_messages(app_id: str, session_id: str):
    """以 OpenAI messages 形式返回会话历史（拼接各 text part）。"""
    _check_ids(app_id, session_id)
    session = _get_session_or_404(app_id, session_id)
    if not session["opencode_session_id"]:
        return {"session_id": session_id, "messages": []}
    if not await app_manager.is_active(app_id):
        try:
            await app_manager.start(app_id)
        except Exception as e:
            raise HTTPException(status_code=503, detail=f"实例启动失败: {e}")
    oc = registry.get_client(app_id)
    try:
        oc_messages = await oc.get_messages(
            session["opencode_session_id"],
            workspace_path=session["workspace_path"],
        )
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"读取消息失败: {e}")
    messages = []
    for m in oc_messages:
        info = m.get("info", {})
        role = info.get("role", m.get("role", ""))
        if role not in ("user", "assistant"):
            continue
        content = "".join(
            p.get("text", "")
            for p in m.get("parts", [])
            if p.get("type") == "text"
        )
        messages.append({"role": role, "content": content})
    return {"session_id": session_id, "messages": messages}


@router.post("/{app_id}/sessions/{session_id}/abort")
async def abort_session(app_id: str, session_id: str):
    _check_ids(app_id, session_id)
    session = _get_session_or_404(app_id, session_id)
    if session["opencode_session_id"]:
        oc = registry.get_client(app_id)
        await oc.abort_session(
            session["opencode_session_id"],
            workspace_path=session["workspace_path"],
        )
    return {"ok": True}


@router.delete("/{app_id}/sessions/{session_id}")
async def delete_session(app_id: str, session_id: str):
    """中止任务、删除 opencode session、清理工作目录与 DB 映射。"""
    _check_ids(app_id, session_id)
    session = _get_session_or_404(app_id, session_id)
    if session["opencode_session_id"] and await app_manager.is_active(app_id):
        oc = registry.get_client(app_id)
        await oc.abort_session(
            session["opencode_session_id"],
            workspace_path=session["workspace_path"],
        )
        await oc.delete_session(
            session["opencode_session_id"],
            workspace_path=session["workspace_path"],
        )
    remove_session_workspace(app_id, session_id)
    db.delete_session(session_id)
    return {"ok": True}
