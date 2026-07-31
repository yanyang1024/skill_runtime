"""Event Bus：每个会话一条到 OpenCode /event 的持久 SSE 连接，fan-out 给多个前端消费者。

事件转换（实测 opencode 1.17 事件形状）：
- message.part.delta {sessionID, partID, field, delta} -> {type: text|reasoning, part_id, content}
- session.status {sessionID, status:{type}}              -> {type: session_status, status}
- session.idle {sessionID}                               -> {type: done} + idle 回调（loop 续发或推荐）
"""
import asyncio
import json
import logging

import httpx

from . import config
from .instance_manager import get_instance_manager
from .loop_controller import get_loop_controller
from .opencode import get_opencode_client

log = logging.getLogger("event_bus")

GENERIC_RECOMMENDATIONS = [
    "总结一下目前完成的工作",
    "检查工作区里生成了哪些文件",
    "继续完善刚才的结果",
]


async def build_recommendations(oc_session_id: str, workspace_path: str) -> list[str]:
    """非 loop 的 idle 推荐：优先 Recommender LLM（上下文感知），失败回退 todos 启发式。"""
    from . import recommender

    oc = get_opencode_client()
    if recommender.available():
        try:
            messages = await oc.get_messages(oc_session_id, workspace_path)
            rec = await recommender.generate_recommendation(messages, workspace_path)
            if rec["suggestions"]:
                return rec["suggestions"]
        except Exception:
            log.exception("recommender 生成失败，回退启发式")
    # 回退：未完成 todos + 通用建议
    recs: list[str] = []
    try:
        todos = await oc.get_todos(oc_session_id, workspace_path)
        for t in todos:
            status = t.get("status", "")
            content = (t.get("content") or "").strip()
            if content and status not in ("completed", "cancelled"):
                recs.append(f"继续完成：{content}")
    except Exception:
        log.exception("获取 todos 失败，使用通用推荐")
    for g in GENERIC_RECOMMENDATIONS:
        if len(recs) >= 3:
            break
        recs.append(g)
    return recs[:3]


class SessionSubscription:
    def __init__(self, conv_id: str, oc_session_id: str, workspace_path: str) -> None:
        self.conv_id = conv_id
        self.oc_session_id = oc_session_id
        self.workspace_path = workspace_path
        self.queues: set[asyncio.Queue] = set()
        self._task: asyncio.Task | None = None
        self._stopped = False

    async def start(self) -> None:
        self._task = asyncio.create_task(self._run())

    async def close(self) -> None:
        self._stopped = True
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=1000)
        self.queues.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        self.queues.discard(q)

    def _broadcast(self, item: dict) -> None:
        for q in list(self.queues):
            try:
                q.put_nowait(item)
            except asyncio.QueueFull:
                log.warning("会话 %s 的消费者队列已满，丢弃事件 %s", self.conv_id, item.get("type"))

    async def _run(self) -> None:
        backoff = 1.0
        while not self._stopped:
            try:
                await self._connect()
                backoff = 1.0  # 连接正常结束后重置
            except asyncio.CancelledError:
                raise
            except Exception:
                log.exception("会话 %s 的 /event 连接断开，%.1f 秒后重连", self.conv_id, backoff)
            if not self._stopped:
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30.0)

    async def _connect(self) -> None:
        oc = get_opencode_client()
        headers = oc._make_headers(self.workspace_path)
        timeout = httpx.Timeout(None, connect=10.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            async with client.stream(
                "GET", f"{oc.base_url}/event", headers=headers, auth=oc._auth
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if self._stopped:
                        return
                    if line.startswith("data: "):
                        try:
                            event = json.loads(line[6:])
                        except json.JSONDecodeError:
                            continue
                        self._handle_event(event)

    def _handle_event(self, event: dict) -> None:
        props = event.get("properties") or {}
        if props.get("sessionID") != self.oc_session_id:
            return
        etype = event.get("type", "")
        if etype == "message.part.delta":
            field = props.get("field", "text")
            self._broadcast({
                "type": "reasoning" if field == "reasoning" else "text",
                "part_id": props.get("partID"),
                "content": props.get("delta", ""),
            })
        elif etype == "message.part.updated":
            part = props.get("part") or {}
            if part.get("type") == "tool":
                self._broadcast(_summarize_tool_part(part))
        elif etype == "session.status":
            status = (props.get("status") or {}).get("type", "")
            # opencode 每次状态切换会重复推送，去重连续的相同状态
            if status and status != getattr(self, "_last_status", None):
                self._last_status = status
                self._broadcast({"type": "session_status", "status": status})
        elif etype == "permission.asked":
            # 权限审批请求 → 前端审批卡片（人工选择 once/always/reject）
            self._broadcast({
                "type": "permission_asked",
                "request_id": props.get("id"),
                "permission": props.get("permission", ""),
                "patterns": props.get("patterns") or [],
                "metadata": props.get("metadata") or {},
            })
        elif etype == "permission.replied":
            # 已批复（可能来自其他标签页/客户端）：同步撤销审批卡片
            self._broadcast({
                "type": "permission_replied",
                "request_id": props.get("requestID"),
                "reply": props.get("reply", ""),
            })
        elif etype == "session.idle":
            self._broadcast({"type": "done"})
            asyncio.create_task(self._on_session_idle())

    async def _on_session_idle(self) -> None:
        loop = get_loop_controller()
        if loop.is_active(self.conv_id):
            # loop 激活：唤醒 loop task 进入下一轮；推荐由 loop 内部的 recommender 负责，
            # 不走普通 idle 推荐，避免前端误判会话结束
            get_instance_manager().touch_activity()
            loop.notify_idle(self.conv_id)
            return
        # 非 loop：生成推荐
        try:
            recs = await build_recommendations(self.oc_session_id, self.workspace_path)
            self._broadcast({"type": "recommendations", "items": recs})
        except Exception:
            log.exception("生成推荐失败")


def _tool_input_summary(tool: str, input_: dict) -> str:
    """从 tool input 里提取一行人类可读摘要。"""
    if not isinstance(input_, dict):
        return ""
    for key in ("command", "filePath", "path", "description", "pattern", "query", "url"):
        v = input_.get(key)
        if v:
            return str(v)[:200]
    return ""


def _summarize_tool_part(part: dict) -> dict:
    """把 opencode 的 tool part 压成前端友好事件。

    实测结构（opencode 1.17）：part.tool 为工具名（write/bash/task...），
    part.state = {status: pending|running|completed|error, input, output, title, metadata}
    """
    state = part.get("state") or {}
    tool = part.get("tool", "")
    out = (state.get("output") or "") if state.get("status") in ("completed", "error") else ""
    return {
        "type": "tool",
        "part_id": part.get("id"),
        "tool": tool,
        "status": state.get("status", ""),
        "title": (state.get("title") or "")[:200],
        "input_summary": _tool_input_summary(tool, state.get("input") or {}),
        "output_preview": str(out)[:300],
    }


class EventBus:
    def __init__(self) -> None:
        self._subs: dict[str, SessionSubscription] = {}

    async def ensure(self, conv_id: str, oc_session_id: str, workspace_path: str) -> asyncio.Queue:
        sub = self._subs.get(conv_id)
        if sub and sub.oc_session_id != oc_session_id:
            await sub.close()
            sub = None
        if sub is None:
            sub = SessionSubscription(conv_id, oc_session_id, workspace_path)
            self._subs[conv_id] = sub
            await sub.start()
        return sub.subscribe()

    def release(self, conv_id: str, q: asyncio.Queue) -> None:
        sub = self._subs.get(conv_id)
        if sub:
            sub.unsubscribe(q)

    def broadcast(self, conv_id: str, item: dict) -> None:
        """向某会话的所有订阅者广播（loop controller 等内部组件使用）。"""
        sub = self._subs.get(conv_id)
        if sub:
            sub._broadcast(item)

    async def close_all(self) -> None:
        for sub in list(self._subs.values()):
            await sub.close()
        self._subs.clear()


_bus: EventBus | None = None


def get_event_bus() -> EventBus:
    global _bus
    if _bus is None:
        _bus = EventBus()
    return _bus
