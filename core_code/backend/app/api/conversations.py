"""会话、消息、SSE 事件、中止、Question/Permission 路由。"""
import asyncio
import json
import logging
import time
import uuid

import httpx
from fastapi import APIRouter, HTTPException, Request
from sse_starlette.sse import EventSourceResponse

from app.database import execute, query_all, query_one
from app.models import row_to_conversation, utcnow_iso
from app.schemas import (
    ConversationCreate,
    ConversationPatch,
    MessageCreate,
    PermissionReply,
    QuestionReply,
)
from app.services import recommender
from app.services.event_bus import event_bus
from app.services.opencode_client import opencode_client
from app.services.opencode_runtime import opencode_runtime
from app.services.workspace import provision_workspace, trash_workspace
from pathlib import Path

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/conversations", tags=["conversations"])


# ── 公共辅助（files / recommendations 路由复用）──

def get_conversation_or_404(conversation_id: str) -> dict:
    row = query_one("SELECT * FROM conversations WHERE id=? AND is_deleted=0", (conversation_id,))
    if row is None:
        raise HTTPException(status_code=404, detail="会话不存在")
    return row_to_conversation(row)


def conversation_public(conv: dict) -> dict:
    """对外暴露的会话字段（不含宿主机路径）。"""
    return {
        "id": conv["id"],
        "title": conv["title"],
        "opencode_session_id": conv["opencode_session_id"],
        "selected_stage": conv["selected_stage"],
        "stage_mode": conv["stage_mode"],
        "created_at": conv["created_at"],
        "updated_at": conv["updated_at"],
        "total_tokens": conv.get("total_tokens") or 0,
    }


def _require_session(conv: dict) -> str:
    sid = conv["opencode_session_id"]
    if not sid:
        raise HTTPException(status_code=400, detail="该会话尚未创建 OpenCode session，请先发送一条消息")
    return sid


def _opencode_502(action: str, e: Exception) -> HTTPException:
    return HTTPException(status_code=502, detail=f"{action}失败：{e}")


# ── 消息规范化：opencode info/parts 结构拍平成契约形状 ──

def _normalize_part(p: dict) -> dict:
    part = {"id": p.get("id", ""), "type": p.get("type", "")}
    ptype = p.get("type")
    if ptype in ("text", "reasoning"):
        part["text"] = p.get("text", "")
    elif ptype == "tool":
        state = p.get("state") or {}
        part["tool"] = p.get("tool", "")
        part["call_id"] = p.get("callID", "")
        part["status"] = state.get("status", "")
        part["input"] = state.get("input")
        part["output"] = state.get("output")
        part["error"] = state.get("error")
        part["title"] = state.get("title")
    elif ptype == "file":
        part["filename"] = p.get("filename", "")
    return part


def _normalize_message(raw: dict) -> dict:
    info = raw.get("info") or {}
    time_raw = info.get("time") or {}
    time = {"created": time_raw.get("created")}
    if time_raw.get("completed") is not None:
        time["completed"] = time_raw.get("completed")
    return {
        "id": info.get("id", ""),
        "role": info.get("role", ""),
        "time": time,
        "parts": [_normalize_part(p) for p in raw.get("parts") or []],
    }


# ── 会话 CRUD ──

@router.get("")
async def list_conversations():
    rows = query_all(
        "SELECT * FROM conversations WHERE is_deleted=0 ORDER BY updated_at DESC"
    )
    return [conversation_public(row_to_conversation(r)) for r in rows]


@router.post("")
async def create_conversation(body: ConversationCreate | None = None):
    conv_id = uuid.uuid4().hex
    title = ((body.title if body else None) or "").strip()
    host_ws, runtime_ws = provision_workspace(conv_id)
    now = utcnow_iso()
    execute(
        "INSERT INTO conversations "
        "(id, title, opencode_session_id, host_workspace_path, runtime_workspace_path, "
        "selected_stage, stage_mode, created_at, updated_at, is_deleted) "
        "VALUES (?,?,?,?,?,?,?,?,?,0)",
        (conv_id, title, None, str(host_ws), runtime_ws, None, "auto", now, now),
    )
    logger.info("新建会话: id=%s title=%r workspace=%s", conv_id, title, host_ws)
    return conversation_public(get_conversation_or_404(conv_id))


@router.get("/{conversation_id}")
async def get_conversation(conversation_id: str):
    return conversation_public(get_conversation_or_404(conversation_id))


@router.patch("/{conversation_id}")
async def patch_conversation(conversation_id: str, body: ConversationPatch):
    get_conversation_or_404(conversation_id)
    fields: list[str] = []
    params: list = []
    if body.title is not None:
        fields.append("title=?")
        params.append(body.title.strip())
    if body.selected_stage is not None:
        if body.selected_stage and body.selected_stage not in recommender.STAGES:
            raise HTTPException(status_code=400, detail=f"未知阶段：{body.selected_stage}")
        fields.append("selected_stage=?")
        params.append(body.selected_stage or None)
    if body.stage_mode is not None:
        if body.stage_mode not in ("auto", "manual"):
            raise HTTPException(status_code=400, detail="stage_mode 只能是 auto 或 manual")
        fields.append("stage_mode=?")
        params.append(body.stage_mode)
    if fields:
        fields.append("updated_at=?")
        params.append(utcnow_iso())
        params.append(conversation_id)
        execute(f"UPDATE conversations SET {', '.join(fields)} WHERE id=?", tuple(params))
    return conversation_public(get_conversation_or_404(conversation_id))


@router.delete("/{conversation_id}")
async def delete_conversation(conversation_id: str):
    conv = get_conversation_or_404(conversation_id)
    # 软删除 + 停止事件订阅 + 清除忙标记 + 尝试删除 opencode session + workspace 移入回收站
    execute("UPDATE conversations SET is_deleted=1, updated_at=? WHERE id=?", (utcnow_iso(), conversation_id))
    await event_bus.stop(conversation_id)
    opencode_runtime.set_session_busy(conversation_id, False)
    if conv["opencode_session_id"]:
        try:
            await opencode_client.delete_session(conv["opencode_session_id"], conv["runtime_workspace_path"])
        except Exception:
            pass  # opencode 不可用时不阻塞删除
    dest = trash_workspace(conversation_id, Path(conv["host_workspace_path"]))
    logger.info("删除会话: id=%s workspace 已移至 %s", conversation_id, dest)
    return {"ok": True}


# ── 消息 ──

@router.get("/{conversation_id}/messages")
async def get_messages(conversation_id: str):
    conv = get_conversation_or_404(conversation_id)
    if not conv["opencode_session_id"]:
        return {"messages": []}
    # opencode 可能因空闲自动关闭，读历史前懒启动（与发消息路径一致）
    await opencode_runtime.ensure_running()
    try:
        raw = await opencode_client.get_messages(conv["opencode_session_id"], conv["runtime_workspace_path"])
    except httpx.HTTPError as e:
        raise _opencode_502("从 OpenCode 获取消息", e)
    return {"messages": [_normalize_message(m) for m in raw]}


# 同一会话的「查 sid → 建 session → 写库」加锁，防并发首消息双建 session
_session_locks: dict[str, asyncio.Lock] = {}


def _get_session_lock(conversation_id: str) -> asyncio.Lock:
    lock = _session_locks.get(conversation_id)
    if lock is None:
        lock = asyncio.Lock()
        _session_locks[conversation_id] = lock
    return lock


@router.post("/{conversation_id}/messages")
async def post_message(conversation_id: str, body: MessageCreate):
    conv = get_conversation_or_404(conversation_id)
    message = body.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="消息内容不能为空")

    # 任何消息发送都先确保 opencode 在运行（老会话也可能遇上 opencode 空闲自动关闭）
    if not await opencode_runtime.ensure_running():
        raise HTTPException(
            status_code=502,
            detail="OpenCode 服务启动失败或启动超时，请检查 runtime/start-opencode.sh 或模型端点配置",
        )

    async with _get_session_lock(conversation_id):
        sid = conv["opencode_session_id"]
        if not sid:
            # 锁内重读，防止并发请求在锁外看到的都是空 sid
            sid = get_conversation_or_404(conversation_id)["opencode_session_id"]
        if not sid:
            # 懒创建 opencode session
            try:
                session = await opencode_client.create_session(
                    conv["runtime_workspace_path"], title=conv["title"] or ""
                )
            except httpx.HTTPError as e:
                raise _opencode_502("创建 OpenCode 会话", e)
            sid = session.get("id")
            if not sid:
                raise HTTPException(status_code=502, detail="创建 OpenCode 会话失败：响应中缺少 id")
            execute(
                "UPDATE conversations SET opencode_session_id=?, updated_at=? WHERE id=?",
                (sid, utcnow_iso(), conversation_id),
            )
            logger.info("懒创建 OpenCode session: 会话=%s session=%s", conversation_id, sid)

    # 先确保事件订阅已启动，再发消息，避免丢失早期事件
    event_bus.ensure(conversation_id, conv["runtime_workspace_path"], sid)
    # 发送前先标记忙（覆盖「已发送但首个 status 事件未到达」的窗口期）；
    # 若发送失败立即清除，否则由 session.idle/error/abort 事件清除
    opencode_runtime.set_session_busy(conversation_id, True)
    try:
        await opencode_client.send_prompt_async(sid, conv["runtime_workspace_path"], message, agent=body.agent)
    except httpx.HTTPError as e:
        opencode_runtime.set_session_busy(conversation_id, False)
        raise _opencode_502("发送消息到 OpenCode", e)
    execute("UPDATE conversations SET updated_at=? WHERE id=?", (utcnow_iso(), conversation_id))
    logger.info("发送消息: 会话=%s session=%s 长度=%d", conversation_id, sid, len(message))
    return {"ok": True, "opencode_session_id": sid}


# ── SSE 事件订阅 ──

@router.get("/{conversation_id}/events")
async def conversation_events(conversation_id: str, request: Request):
    conv = get_conversation_or_404(conversation_id)
    sub = event_bus.ensure(conversation_id, conv["runtime_workspace_path"], conv["opencode_session_id"])
    queue = sub.subscribe()

    async def event_generator():
        started = time.monotonic()
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=15)
                except asyncio.TimeoutError:
                    yield {"comment": "ping"}  # 心跳注释行，保持连接
                    continue
                if event is None:  # 会话已删除，结束流
                    break
                yield {"data": json.dumps(event, ensure_ascii=False)}
        finally:
            sub.unsubscribe(queue)
            logger.info("SSE 连接断开: 会话=%s 持续=%.1fs", conversation_id, time.monotonic() - started)

    return EventSourceResponse(event_generator())


# ── 中止 ──

@router.post("/{conversation_id}/abort")
async def abort_conversation(conversation_id: str):
    conv = get_conversation_or_404(conversation_id)
    if conv["opencode_session_id"]:
        await opencode_client.abort(conv["opencode_session_id"], conv["runtime_workspace_path"])
        logger.info("中止会话: id=%s session=%s", conversation_id, conv["opencode_session_id"])
    return {"ok": True}


# ── Question / Permission ──

@router.post("/{conversation_id}/questions/{request_id}/reply")
async def reply_question(conversation_id: str, request_id: str, body: QuestionReply):
    conv = get_conversation_or_404(conversation_id)
    _require_session(conv)
    await opencode_runtime.ensure_running()
    try:
        result = await opencode_client.reply_question(request_id, body.answers, conv["runtime_workspace_path"])
    except httpx.HTTPError as e:
        raise _opencode_502("回复 Question", e)
    return result if result is not None else {"ok": True}


@router.post("/{conversation_id}/questions/{request_id}/reject")
async def reject_question(conversation_id: str, request_id: str):
    conv = get_conversation_or_404(conversation_id)
    _require_session(conv)
    await opencode_runtime.ensure_running()
    try:
        result = await opencode_client.reject_question(request_id, conv["runtime_workspace_path"])
    except httpx.HTTPError as e:
        raise _opencode_502("拒绝 Question", e)
    return result if result is not None else {"ok": True}


@router.post("/{conversation_id}/permissions/{request_id}/reply")
async def reply_permission(conversation_id: str, request_id: str, body: PermissionReply):
    conv = get_conversation_or_404(conversation_id)
    _require_session(conv)
    await opencode_runtime.ensure_running()
    if body.reply not in ("once", "always", "reject"):
        raise HTTPException(status_code=400, detail="reply 只能是 once / always / reject")
    try:
        result = await opencode_client.reply_permission(request_id, body.reply, conv["runtime_workspace_path"])
    except httpx.HTTPError as e:
        raise _opencode_502("回复 Permission", e)
    return result if result is not None else {"ok": True}
