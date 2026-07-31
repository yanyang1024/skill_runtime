"""Loop 控制：task 驱动的双模式自动推进。

第一性原理：loop 的动机是把"下一步该做什么"的元认知自动化，同时让人随时可接管。
- queue 模式：用户预先写好的 prompt 队列，逐条播放（静态但确定）
- ai 模式：每轮由 Recommender（旁路 LLM）读上下文生成下一步 prompt 和 stop_decision

防失控五层：
  1. 每轮发送前 5 秒倒计时窗口（逐秒广播，可取消）
  2. 用户发消息立即接管（signal_user_message → 跳过自动发送并暂停）
  3. Recommender 的 stop_decision（ai 模式尊重；queue 模式忽略）
  4. 连续 NO_CHANGE_LIMIT 轮无文件变更 → 停滞自动暂停
  5. 每轮等待 idle 超时（IDLE_WAIT_TIMEOUT）→ 自动暂停
"""
import asyncio
import logging
from collections import deque

from . import recommender

log = logging.getLogger("loop_controller")

COUNTDOWN_SECONDS = 5
IDLE_WAIT_TIMEOUT = 120.0
NO_CHANGE_LIMIT = 3
DEFAULT_MAX_ROUNDS = 20


class _LoopState:
    def __init__(self, mode: str, queue: deque, goal: str, max_rounds: int, ctx: dict) -> None:
        self.mode = mode                  # "queue" | "ai"
        self.queue = queue
        self.goal = goal
        self.max_rounds = max_rounds
        self.ctx = ctx                    # {oc_session_id, workspace_path, model, agent, send, broadcast}
        self.round = 0
        self.no_change_rounds = 0
        self.task: asyncio.Task | None = None
        self.idle_event = asyncio.Event()
        self.user_event = asyncio.Event()
        self.running = True
        self.stop_reason = ""


class LoopController:
    def __init__(self) -> None:
        self._loops: dict[str, _LoopState] = {}

    # ---------- 状态查询 ----------

    def is_active(self, conv_id: str) -> bool:
        st = self._loops.get(conv_id)
        return bool(st and st.running)

    def status(self, conv_id: str) -> dict:
        st = self._loops.get(conv_id)
        if not st or not st.running:
            return {"active": False}
        return {
            "active": True,
            "mode": st.mode,
            "round": st.round,
            "remaining": len(st.queue) if st.mode == "queue" else None,
            "max_rounds": st.max_rounds if st.mode == "ai" else None,
        }

    # ---------- 启动/停止 ----------

    def start(self, conv_id: str, mode: str, prompts: list[str], goal: str,
              max_rounds: int, ctx: dict) -> dict:
        self.stop(conv_id, reason="replaced")
        st = _LoopState(
            mode=mode,
            queue=deque(p for p in (prompts or []) if p and p.strip()),
            goal=goal,
            max_rounds=max_rounds or DEFAULT_MAX_ROUNDS,
            ctx=ctx,
        )
        if mode == "queue" and not st.queue:
            return {"active": False, "reason": "队列为空"}
        self._loops[conv_id] = st
        st.task = asyncio.create_task(self._run(conv_id, st))
        return {"active": True, "mode": mode}

    def stop(self, conv_id: str, reason: str = "手动停止") -> None:
        st = self._loops.pop(conv_id, None)
        if not st:
            return
        st.running = False
        st.stop_reason = reason
        if st.task and not st.task.done():
            st.task.cancel()
        self._broadcast(st, {"type": "loop_status", "active": False, "reason": reason})

    def pause(self, conv_id: str, reason: str = "用户暂停") -> None:
        """温和暂停：倒计时中的本轮取消；等待中的本轮标记后退出。"""
        st = self._loops.get(conv_id)
        if st:
            st.user_event.set()
            st.idle_event.set()  # 唤醒等待，由 _run 检查后退出

    # ---------- 外部事件 ----------

    def signal_user_message(self, conv_id: str) -> None:
        """用户手动发消息：立即接管——loop 暂停，不再自动发送。"""
        st = self._loops.get(conv_id)
        if st and st.running:
            st.user_event.set()
            st.idle_event.set()

    def notify_idle(self, conv_id: str) -> None:
        """opencode session.idle → 唤醒等待中的 loop 进入下一轮。"""
        st = self._loops.get(conv_id)
        if st and st.running:
            st.idle_event.set()

    # ---------- 主循环 ----------

    def _broadcast(self, st: _LoopState, item: dict) -> None:
        cb = st.ctx.get("broadcast")
        if cb:
            cb(item)

    async def _next_prompt(self, conv_id: str, st: _LoopState) -> tuple[str | None, dict]:
        """返回 (prompt, stop_decision)。queue 模式直接出队；ai 模式调 recommender。"""
        if st.mode == "queue":
            if not st.queue:
                return None, {"action": "TERMINATE_SUCCEEDED", "reason": "队列已播完"}
            return st.queue.popleft(), {"action": "CONTINUE", "reason": ""}

        # ai 模式：收集上下文 → recommender
        oc = st.ctx["oc"]
        try:
            messages = await oc.get_messages(st.ctx["oc_session_id"], st.ctx["workspace_path"])
        except Exception:
            messages = []
        snap_after = recommender.snapshot_files(st.ctx["workspace_path"])
        changes = recommender.diff_snapshots(st.ctx.get("snapshot") or {}, snap_after)
        st.ctx["snapshot"] = snap_after
        if not any(changes.values()):
            st.no_change_rounds += 1
        else:
            st.no_change_rounds = 0

        self._broadcast(st, {"type": "recommendation_started"})
        rec = await recommender.generate_recommendation(
            messages,
            st.ctx["workspace_path"],
            file_changes=changes,
            resources=st.ctx.get("resources") or {},
            round_no=st.round + 1,
            no_change_rounds=st.no_change_rounds,
            goal=st.goal,
        )
        self._broadcast(st, {
            "type": "recommendations",
            "items": rec["suggestions"],
            "intent": rec.get("intent", ""),
        })
        prompt = rec["suggestions"][0] if rec["suggestions"] else None
        return prompt, rec["stop_decision"]

    async def _countdown(self, st: _LoopState, prompt: str) -> bool:
        """5 秒倒计时窗口，逐秒广播。用户在此期间介入则返回 False（取消本轮并暂停）。"""
        for left in range(COUNTDOWN_SECONDS, 0, -1):
            self._broadcast(st, {"type": "loop_countdown", "seconds": left, "prompt": prompt[:120]})
            await asyncio.sleep(1)
            if st.user_event.is_set():
                return False
        return True

    async def _run(self, conv_id: str, st: _LoopState) -> None:
        oc = st.ctx["oc"]
        try:
            while st.running:
                # 用户介入检查（轮首）
                if st.user_event.is_set():
                    self.stop(conv_id, reason="用户已接管")
                    return

                prompt, decision = await self._next_prompt(conv_id, st)

                # 停滞检测（两种模式都生效）
                if st.no_change_rounds >= NO_CHANGE_LIMIT:
                    self.stop(conv_id, reason=f"连续 {NO_CHANGE_LIMIT} 轮无文件变更，疑似停滞")
                    return
                # stop_decision（ai 模式尊重）
                if st.mode == "ai" and decision.get("action") != "CONTINUE":
                    reasons = {
                        "PAUSE_INPUT": "需要用户决策",
                        "TERMINATE_SUCCEEDED": "任务已完成",
                        "TERMINATE_STALLED": "任务停滞",
                    }
                    reason = reasons.get(decision["action"], decision["action"])
                    detail = decision.get("reason") or ""
                    self.stop(conv_id, reason=f"{reason}{('：' + detail) if detail else ''}")
                    return
                if prompt is None:
                    self.stop(conv_id, reason=decision.get("reason") or "没有下一步")
                    return
                if st.mode == "ai" and st.round >= st.max_rounds:
                    self.stop(conv_id, reason=f"达到最大轮数 {st.max_rounds}")
                    return

                # 倒计时窗口
                if not await self._countdown(st, prompt):
                    self.stop(conv_id, reason="倒计时内被用户取消")
                    return
                if st.user_event.is_set():
                    self.stop(conv_id, reason="用户已接管")
                    return

                # 发送本轮 prompt
                st.round += 1
                self._broadcast(st, {"type": "loop_prompt", "text": prompt, "round": st.round})
                self._broadcast_status(st)
                try:
                    await oc.send_prompt_async(
                        st.ctx["oc_session_id"], prompt, st.ctx["workspace_path"],
                        st.ctx.get("agent"), st.ctx.get("model"),
                    )
                except Exception as e:
                    log.exception("loop 发送 prompt 失败")
                    self.stop(conv_id, reason=f"发送失败: {e}")
                    return

                # 等待 opencode 空闲（event_bus 收到 session.idle 后 set）
                st.idle_event.clear()
                try:
                    await asyncio.wait_for(st.idle_event.wait(), timeout=IDLE_WAIT_TIMEOUT)
                except asyncio.TimeoutError:
                    self.stop(conv_id, reason=f"等待回复超过 {int(IDLE_WAIT_TIMEOUT)} 秒，自动暂停")
                    return
                if st.user_event.is_set():
                    self.stop(conv_id, reason="用户已接管")
                    return

            # running 变 False 的退出（stop 已广播）
        except asyncio.CancelledError:
            pass
        except Exception as e:
            log.exception("loop 主循环异常")
            self.stop(conv_id, reason=f"loop 异常: {e}")

    def _broadcast_status(self, st: _LoopState) -> None:
        self._broadcast(st, {
            "type": "loop_status",
            "active": True,
            "mode": st.mode,
            "round": st.round,
            "remaining": len(st.queue) if st.mode == "queue" else None,
        })


_controller: LoopController | None = None


def get_loop_controller() -> LoopController:
    global _controller
    if _controller is None:
        _controller = LoopController()
    return _controller
