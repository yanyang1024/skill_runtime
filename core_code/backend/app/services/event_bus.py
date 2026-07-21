"""事件总线：每个会话维护一条到 opencode /event 的长连接，标准化后 fan-out 给前端 SSE。"""
import asyncio
import json
import logging
import time

import httpx

from app.config import settings
from app.database import execute, query_one
from app.models import utcnow_iso
from app.services import recommender
from app.services.opencode_client import opencode_client
from app.services.opencode_runtime import opencode_runtime

logger = logging.getLogger(__name__)


class SessionSubscription:
    """单个会话的 opencode 事件订阅（常驻后台任务，断线自动重连）。"""

    def __init__(self, conversation_id: str, runtime_workspace: str, session_id: str | None) -> None:
        self.conversation_id = conversation_id
        self.runtime_workspace = runtime_workspace
        self.session_id = session_id  # opencode session 懒创建后可更新
        self.queues: set[asyncio.Queue] = set()
        self.task: asyncio.Task | None = None
        self._stopped = False
        self._part_types: dict[str, str] = {}       # part_id -> part.type（text/reasoning 等）
        self._call_to_part: dict[str, str] = {}     # callID -> part_id
        self._call_to_request: dict[str, str] = {}  # callID -> question/permission request_id

    # ── 生命周期 ──
    def start(self) -> None:
        if self.task is None or self.task.done():
            self._stopped = False
            self.task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        self._stopped = True
        for q in list(self.queues):
            try:
                q.put_nowait(None)  # 通知前端 SSE 生成器退出
            except asyncio.QueueFull:
                pass
        if self.task:
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass
            except Exception:
                logger.warning("停止事件订阅任务异常", exc_info=True)

    # ── 订阅者管理（asyncio.Queue fan-out）──
    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=1000)
        self.queues.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        self.queues.discard(q)

    def broadcast(self, event: dict | None) -> None:
        if event is not None:
            # 任何真实会话事件（delta/tool/status…）都说明 OpenCode 在活跃工作，
            # 刷新活动时钟，避免空闲看门狗在长任务生成期间误停服务
            opencode_runtime.touch_activity()
        # delta 类在队列满时可丢（done 后前端会全量重拉消息补齐）；
        # 控制事件不能丢——队列满时挤出最旧一条为其腾位
        is_control = event is not None and event.get("type") not in ("text_delta", "reasoning_delta")
        for q in list(self.queues):
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                if not is_control:
                    continue
                try:
                    q.get_nowait()  # 丢掉最旧一条（通常是 delta）
                    q.put_nowait(event)
                except (asyncio.QueueEmpty, asyncio.QueueFull):
                    logger.warning("订阅者队列满，控制事件未能送达: %s", event.get("type"))

    # ── 后台订阅循环（指数退避重连）──
    async def _run(self) -> None:
        url = f"{settings.opencode_base_url}/event"
        backoff = 1
        while not self._stopped:
            try:
                headers = opencode_client._make_headers(self.runtime_workspace)
                async with httpx.AsyncClient(timeout=None) as client:
                    async with client.stream("GET", url, headers=headers) as resp:
                        if resp.status_code != 200:
                            raise ConnectionError(f"/event 返回 {resp.status_code}")
                        backoff = 1
                        logger.info("事件流已连接: 会话=%s session=%s", self.conversation_id, self.session_id)
                        # （重）连成功后的对账：busy 状态、孤儿 question、pending question/permission 回放
                        try:
                            await self._on_connected()
                        except Exception:
                            logger.debug("连接后对账失败: 会话=%s", self.conversation_id, exc_info=True)
                        async for line in resp.aiter_lines():
                            if self._stopped:
                                return
                            if not line.startswith("data:"):
                                continue
                            payload = line[len("data:"):].strip()
                            if not payload:
                                continue
                            try:
                                raw = json.loads(payload)
                            except json.JSONDecodeError:
                                continue
                            await self._handle(raw)
            except asyncio.CancelledError:
                raise
            except Exception as e:
                # opencode 未启动或连接断开：静默等待后重连
                logger.debug("事件流断开，等待重连: %s", e)
            if not self._stopped:
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2, 30)

    # ── 原始事件 -> 标准化事件（字段名与前端契约一致）──
    async def _handle(self, raw: dict) -> None:
        etype = raw.get("type", "")
        props = raw.get("properties") or {}
        sid = self.session_id

        if etype == "message.part.updated":
            part = props.get("part") or {}
            if part.get("sessionID") != sid:
                return
            part_id = part.get("id", "")
            ptype = part.get("type", "")
            call_id = part.get("callID", "")
            if part_id:
                self._part_types[part_id] = ptype
            if call_id and part_id:
                self._call_to_part[call_id] = part_id
            if ptype == "tool":
                state = part.get("state") or {}
                status = state.get("status", "pending")
                event = {
                    "type": "tool_update",
                    "part_id": part_id,
                    "call_id": call_id,
                    "tool": part.get("tool", "unknown"),
                    "status": status,
                    "input": state.get("input") or {},
                    "output": state.get("output", ""),
                    "error": state.get("error", "") if status == "error" else "",
                    "title": state.get("title", ""),
                }
                request_id = self._call_to_request.get(call_id)
                if request_id:
                    event["request_id"] = request_id
                self.broadcast(event)
            # text/reasoning 只登记 part 类型，内容由 delta 事件携带；step/file 等第一版忽略
            return

        if etype == "message.part.delta":
            if props.get("sessionID") != sid:
                return
            part_id = props.get("partID", "")
            delta = props.get("delta", "")
            if not part_id or not delta:
                return
            ptype = self._part_types.get(part_id, "text")
            if ptype == "text":
                self.broadcast({"type": "text_delta", "part_id": part_id, "content": delta})
            elif ptype == "reasoning":
                self.broadcast({"type": "reasoning_delta", "part_id": part_id, "content": delta})
            return

        if etype == "question.asked":
            if props.get("sessionID") != sid:
                return
            request_id = props.get("id", "")
            call_id = (props.get("tool") or {}).get("callID", "")
            if call_id and request_id:
                self._call_to_request[call_id] = request_id
            event = {"type": "question_request", "request_id": request_id, "call_id": call_id}
            part_id = self._call_to_part.get(call_id)
            if part_id:
                event["part_id"] = part_id
            if props.get("questions") is not None:
                event["questions"] = props["questions"]
            self.broadcast(event)
            return

        if etype == "permission.asked":
            if props.get("sessionID") != sid:
                return
            request_id = props.get("id", "")
            call_id = (props.get("tool") or {}).get("callID", "")
            if call_id and request_id:
                self._call_to_request[call_id] = request_id
            event = {
                "type": "permission_request",
                "request_id": request_id,
                "call_id": call_id,
                "permission": props.get("permission", ""),
            }
            part_id = self._call_to_part.get(call_id)
            if part_id:
                event["part_id"] = part_id
            self.broadcast(event)
            return

        if etype == "todo.updated":
            if props.get("sessionID") != sid:
                return
            self.broadcast({"type": "todo_updated", "todos": props.get("todos") or []})
            return

        if etype == "session.status":
            if props.get("sessionID") != sid:
                return
            raw_status = (props.get("status") or {}).get("type", "idle")
            # 归一化为契约状态：opencode 原始值为 busy/retry/idle，前端只认 running/idle
            is_busy = raw_status in ("busy", "retry")
            opencode_runtime.set_session_busy(self.conversation_id, is_busy)
            self.broadcast({"type": "session_status", "status": "running" if is_busy else "idle"})
            return

        if etype == "session.idle":
            if props.get("sessionID") != sid:
                return
            await self._on_idle()
            return

        if etype == "session.error":
            if props.get("sessionID") != sid:
                return
            err = props.get("error")
            err_name = ""
            if isinstance(err, dict):
                err_name = str(err.get("name") or "")
                data = err.get("data") or {}
                content = (
                    (data.get("message") if isinstance(data, dict) else None)
                    or err.get("message")
                    or json.dumps(err, ensure_ascii=False)
                )
            else:
                content = str(err or "未知错误")
            # 用户主动中止：opencode 以 MessageAbortedError 形式上报，
            # 对用户而言这是正常结束而非错误，按 idle + done 处理（不触发推荐）
            if err_name == "MessageAbortedError" or content.strip().lower() == "aborted":
                opencode_runtime.set_session_busy(self.conversation_id, False)
                self.broadcast({"type": "session_status", "status": "idle"})
                self.broadcast({"type": "done"})
                return
            opencode_runtime.set_session_busy(self.conversation_id, False)
            self.broadcast({"type": "error", "content": content})
            return

    async def _on_connected(self) -> None:
        """（重）连成功后的对账：busy 状态、孤儿 question、pending 请求回放。"""
        if not self.session_id:
            return
        await self._reconcile_busy()
        await self._detect_orphan_questions()
        await self._replay_pending()

    async def _reconcile_busy(self) -> None:
        """用 opencode /session/status 对账本地 busy 标记（后端重启或事件丢失后的纠偏）。

        查询失败时保持现状：busy 误清的最坏后果是看门狗误停 opencode，
        但会话事件会实时刷新活动时钟，实际不会误停进行中的任务。
        """
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(10.0)) as client:
                r = await client.get(
                    f"{settings.opencode_base_url}/session/status",
                    headers=opencode_client._make_headers(self.runtime_workspace),
                )
                data = r.json() if r.status_code == 200 else None
        except Exception:
            return
        if not isinstance(data, dict):
            return
        # /session/status 只列出非 idle 的 session；查不到即视为空闲
        st = ((data.get(self.session_id) or {}).get("type")) or "idle"
        opencode_runtime.set_session_busy(self.conversation_id, st in ("busy", "retry"))

    async def _replay_pending(self) -> None:
        """回放服务端仍 pending 的 question/permission（前端刷新后重新展示卡片）。"""
        for q in await opencode_client.list_questions(self.runtime_workspace):
            rid, call_id = q.get("id", ""), (q.get("tool") or {}).get("callID", "")
            if not rid:
                continue
            if call_id:
                self._call_to_request[call_id] = rid
            event: dict = {"type": "question_request", "request_id": rid, "call_id": call_id}
            part_id = self._call_to_part.get(call_id)
            if part_id:
                event["part_id"] = part_id
            if q.get("questions") is not None:
                event["questions"] = q["questions"]
            self.broadcast(event)
        for p in await opencode_client.list_permissions(self.runtime_workspace):
            rid, call_id = p.get("id", ""), (p.get("tool") or {}).get("callID", "")
            if not rid:
                continue
            if call_id:
                self._call_to_request[call_id] = rid
            event = {
                "type": "permission_request",
                "request_id": rid,
                "call_id": call_id,
                "permission": p.get("permission", ""),
            }
            part_id = self._call_to_part.get(call_id)
            if part_id:
                event["part_id"] = part_id
            self.broadcast(event)

    async def _detect_orphan_questions(self) -> None:
        """检测孤儿 question 并广播 question_rejected，让前端清理卡住的提问卡片。

        opencode 的 pending question 记录保存在内存中，服务重启后丢失；
        但消息历史里的 question 工具仍停在 pending/running 状态，会成为孤儿。
        """
        if not self.session_id:
            return
        # 1. 服务端当前真正 pending 的 question（callID 集合），顺带登记 request_id
        pending = await opencode_client.list_questions(self.runtime_workspace)
        valid_call_ids: set[str] = set()
        for q in pending or []:
            call_id = (q.get("tool") or {}).get("callID", "")
            qid = q.get("id", "")
            if call_id and qid:
                valid_call_ids.add(call_id)
                self._call_to_request[call_id] = qid
        # 2. 消息历史里仍停在 pending/running 的 question 工具
        messages = await opencode_client.get_messages(self.session_id, self.runtime_workspace)
        orphans: set[tuple[str, str]] = set()
        for msg in messages:
            for part in msg.get("parts") or []:
                if part.get("type") == "tool" and part.get("tool") == "question":
                    status = ((part.get("state") or {}).get("status")) or "pending"
                    call_id = part.get("callID", "")
                    if status in ("pending", "running") and call_id and call_id not in valid_call_ids:
                        orphans.add((call_id, part.get("id", "")))
        # 3. 广播失效事件
        for call_id, part_id in orphans:
            logger.info("检测到孤儿 question: 会话=%s call_id=%s", self.conversation_id, call_id)
            event: dict = {"type": "question_rejected", "call_id": call_id}
            if part_id:
                event["part_id"] = part_id
            self.broadcast(event)

    async def _on_idle(self) -> None:
        """一轮回复结束：状态归位、同步标题与 token 用量、发 done、触发推荐。"""
        opencode_runtime.set_session_busy(self.conversation_id, False)
        self.broadcast({"type": "session_status", "status": "idle"})
        if self.session_id:
            try:
                info = await opencode_client.get_session(self.session_id, self.runtime_workspace)
                title = ((info or {}).get("title") or "").strip()
                if title:
                    # 仅在本地尚未有标题时采用 opencode 自动标题，避免覆盖用户手动改名
                    row = query_one("SELECT title FROM conversations WHERE id=?", (self.conversation_id,))
                    if row is not None and not (row["title"] or ""):
                        execute(
                            "UPDATE conversations SET title=?, updated_at=? WHERE id=?",
                            (title, utcnow_iso(), self.conversation_id),
                        )
                        self.broadcast({"type": "title_updated", "title": title})
            except Exception:
                logger.debug("同步会话标题失败", exc_info=True)
            # 汇总 token 用量（opencode 在 assistant 消息 info.tokens 里给出统计）
            try:
                messages = await opencode_client.get_messages(self.session_id, self.runtime_workspace)
                total = sum(
                    (((m.get("info") or {}).get("tokens") or {}).get("total") or 0)
                    for m in messages
                )
                execute(
                    "UPDATE conversations SET total_tokens=? WHERE id=?",
                    (total, self.conversation_id),
                )
            except Exception:
                logger.debug("汇总 token 用量失败", exc_info=True)
        self.broadcast({"type": "done"})
        logger.info("一轮回复结束: 会话=%s session=%s", self.conversation_id, self.session_id)
        # 回复结束后异步生成下一轮推荐（未配置推荐模型则静默跳过）
        if settings.recommender_base_url and settings.recommender_model:
            self.broadcast({"type": "recommendation_started"})
            asyncio.create_task(self._run_recommendation())

    async def _run_recommendation(self) -> None:
        try:
            started = time.monotonic()
            rec = await recommender.generate(self.conversation_id)
            if rec:
                logger.info(
                    "推荐生成完成: 会话=%s 阶段=%s 置信度=%.2f 耗时=%.1fs",
                    self.conversation_id, rec["inferred_stage"], rec["confidence"], time.monotonic() - started,
                )
                self.broadcast({"type": "recommendation_ready", "recommendation_id": rec["id"]})
            else:
                logger.info("推荐生成跳过或无效: 会话=%s 耗时=%.1fs", self.conversation_id, time.monotonic() - started)
                # 失败/无效也要闭环（不带 id），否则前端骨架屏永久卡住
                self.broadcast({"type": "recommendation_ready"})
        except Exception:
            logger.warning("推荐生成失败: 会话=%s", self.conversation_id, exc_info=True)
            self.broadcast({"type": "recommendation_ready"})


class EventBus:
    """会话级事件订阅管理器。"""

    def __init__(self) -> None:
        self._subs: dict[str, SessionSubscription] = {}

    def ensure(self, conversation_id: str, runtime_workspace: str, session_id: str | None) -> SessionSubscription:
        """确保会话的订阅任务已启动；opencode session 懒创建后更新 session_id。"""
        sub = self._subs.get(conversation_id)
        if sub is None:
            sub = SessionSubscription(conversation_id, runtime_workspace, session_id)
            self._subs[conversation_id] = sub
        else:
            if session_id:
                sub.session_id = session_id
            sub.runtime_workspace = runtime_workspace
        sub.start()
        return sub

    def emit(self, conversation_id: str, event: dict) -> None:
        """向某会话的所有前端订阅者广播一条本地事件（无订阅则丢弃）。"""
        sub = self._subs.get(conversation_id)
        if sub:
            sub.broadcast(event)

    async def stop(self, conversation_id: str) -> None:
        sub = self._subs.pop(conversation_id, None)
        if sub:
            await sub.stop()

    async def stop_all(self) -> None:
        for sub in list(self._subs.values()):
            await sub.stop()
        self._subs.clear()


event_bus = EventBus()
