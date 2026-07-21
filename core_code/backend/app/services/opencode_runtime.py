"""OpenCode 实例管理：systemd 懒启动 + 空闲自动关闭。

- 懒启动：检测 opencode 不健康时，优先 ``systemctl --user start``（unit 不存在则
  先安装到 ``~/.config/systemd/user/``），systemd 不可用时回退为直接 spawn
  ``runtime/start-opencode.sh``（写 pidfile，停止时按 pidfile/systemd 处理）。
- 活动跟踪：``touch_activity()`` 由请求中间件调用；``set_session_busy()`` 由
  event_bus 在会话忙/闲时调用（忙时会刷新活动时间，防止长任务被误判空闲）。
- 空闲关闭：后台任务每 ``IDLE_CHECK_INTERVAL_SECONDS`` 检查一次，空闲超过
  ``IDLE_TIMEOUT_MINUTES``（0 表示关闭该功能）且无忙会话时停止 opencode。
"""
import asyncio
import logging
import shutil
import subprocess
import time
from pathlib import Path

from app.config import settings
from app.services.opencode_client import opencode_client

logger = logging.getLogger(__name__)

_UNIT_NAME = "sgs-opencode.service"
_UNIT_DIR = Path.home() / ".config" / "systemd" / "user"

_UNIT_TEMPLATE = """[Unit]
Description=Skill Growth Chat Lite - OpenCode serve (bwrap 沙箱)
After=network.target

[Service]
Type=simple
ExecStart={start_script}
Restart=on-failure
RestartSec=3
TasksMax=2048
MemoryMax=64G

[Install]
WantedBy=default.target
"""


class OpenCodeRuntime:
    def __init__(self) -> None:
        self._last_activity = time.monotonic()
        self._busy_sessions: set[str] = set()
        self._start_lock = asyncio.Lock()
        self._fallback_proc: subprocess.Popen | None = None

    # ── 活动与忙闲跟踪 ──
    def touch_activity(self) -> None:
        self._last_activity = time.monotonic()

    def set_session_busy(self, conversation_id: str, busy: bool) -> None:
        if busy:
            self._busy_sessions.add(conversation_id)
            self.touch_activity()  # 长任务运行期间持续视为活动
        else:
            self._busy_sessions.discard(conversation_id)
            self.touch_activity()

    @property
    def idle_seconds(self) -> float:
        return time.monotonic() - self._last_activity

    # ── systemd ──
    @staticmethod
    def _systemd_available_sync() -> bool:
        if not shutil.which("systemctl"):
            return False
        try:
            r = subprocess.run(
                ["systemctl", "--user", "is-system-running"],
                capture_output=True, text=True, timeout=5,
            )
            # running / degraded 都说明 user bus 可用
            return r.stdout.strip() in ("running", "degraded")
        except Exception:
            return False

    async def _systemd_available(self) -> bool:
        # subprocess.run 会阻塞事件循环，放到线程里执行
        return await asyncio.to_thread(self._systemd_available_sync)

    async def _ensure_unit_installed(self) -> None:
        """把 systemd user unit 写入 ~/.config/systemd/user/（内容变化才重写）。"""
        start_script = settings.repo_root / "runtime" / "start-opencode.sh"
        content = _UNIT_TEMPLATE.format(start_script=start_script)
        unit_path = _UNIT_DIR / _UNIT_NAME
        if unit_path.exists() and unit_path.read_text() == content:
            return
        _UNIT_DIR.mkdir(parents=True, exist_ok=True)
        unit_path.write_text(content)
        proc = await asyncio.create_subprocess_exec(
            "systemctl", "--user", "daemon-reload",
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL,
        )
        await proc.wait()
        logger.info("已安装 systemd user unit: %s", unit_path)

    async def _systemctl(self, *args: str) -> tuple[bool, str]:
        proc = await asyncio.create_subprocess_exec(
            "systemctl", "--user", *args,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
        )
        out, _ = await proc.communicate()
        return proc.returncode == 0, (out or b"").decode(errors="replace").strip()

    # ── 启动 / 停止 ──
    async def ensure_running(self, wait_seconds: float = 90.0) -> bool:
        """确保 opencode 在运行（懒启动入口）。已健康则快速返回。"""
        self.touch_activity()
        if await opencode_client.health() is not None:
            return True
        async with self._start_lock:
            # 拿到锁后再查一次，避免并发重复启动
            if await opencode_client.health() is not None:
                return True
            logger.info("OpenCode 未运行，懒启动中…")
            if await self._systemd_available():
                try:
                    await self._ensure_unit_installed()
                    ok, out = await self._systemctl("start", _UNIT_NAME)
                    if not ok:
                        logger.warning("systemctl start 失败: %s", out)
                except Exception:
                    logger.warning("systemd 启动异常", exc_info=True)
            else:
                self._spawn_fallback()

            # 等待健康（bwrap 首次启动可能要建 venv，给足时间）
            deadline = time.monotonic() + wait_seconds
            while time.monotonic() < deadline:
                if await opencode_client.health() is not None:
                    logger.info("OpenCode 懒启动成功（%.1fs）", wait_seconds - (deadline - time.monotonic()))
                    self.touch_activity()
                    return True
                await asyncio.sleep(1.5)
            logger.warning("OpenCode 懒启动超时（%.0fs）", wait_seconds)
            return False

    def _spawn_fallback(self) -> None:
        """无 systemd 时的回退：直接 spawn 启动脚本（pidfile 记录在 data/ 下）。"""
        if self._fallback_proc is not None and self._fallback_proc.poll() is None:
            return
        start_script = settings.repo_root / "runtime" / "start-opencode.sh"
        log_path = settings.data_root / "logs" / "opencode.log"
        log_path.parent.mkdir(parents=True, exist_ok=True)
        log_f = open(log_path, "ab")
        self._fallback_proc = subprocess.Popen(
            [str(start_script)], stdout=log_f, stderr=subprocess.STDOUT,
            start_new_session=True,
        )
        log_f.close()  # 子进程已复制 fd，父进程副本立即关闭，避免句柄泄漏
        (settings.data_root / "opencode.pid").write_text(str(self._fallback_proc.pid))
        logger.info("systemd 不可用，已直接启动 start-opencode.sh (pid=%s)", self._fallback_proc.pid)

    async def _stop_fallback(self, reason: str) -> bool:
        """停掉 fallback/pidfile 启动的进程，有动作则返回 True。"""
        if self._fallback_proc is not None and self._fallback_proc.poll() is None:
            self._fallback_proc.terminate()
            logger.info("OpenCode 已停止（fallback pid=%s）%s", self._fallback_proc.pid, f"（{reason}）" if reason else "")
            self._fallback_proc = None
            return True
        pidfile = settings.data_root / "opencode.pid"
        if pidfile.exists():
            try:
                pid = int(pidfile.read_text().strip())
                # kill 也放线程，避免阻塞事件循环
                await asyncio.to_thread(
                    subprocess.run, ["kill", str(pid)], capture_output=True, timeout=5
                )
                logger.info("OpenCode 已按 pidfile 停止 (pid=%s)%s", pid, f"（{reason}）" if reason else "")
            except Exception:
                logger.debug("按 pidfile 停止失败", exc_info=True)
            pidfile.unlink(missing_ok=True)
            return True
        return False

    async def stop(self, reason: str = "") -> None:
        """停止 opencode（空闲自动关闭 / stop_all 脚本共用）。"""
        stopped = False
        if await self._systemd_available():
            ok, out = await self._systemctl("stop", _UNIT_NAME)
            if ok:
                stopped = True
                logger.info("OpenCode 已通过 systemd 停止%s", f"（{reason}）" if reason else "")
            else:
                logger.debug("systemctl stop 未生效: %s", out)
        # systemctl stop 对未运行的 unit 也返回 0，且进程可能实际是 fallback 启动的，
        # 因此无论 systemd 是否成功，都要再走一遍 fallback/pidfile 清理
        await self._stop_fallback(reason)
        if not stopped:
            logger.debug("stop 调用完成（systemd 未确认停止，fallback 已清理）%s", f"（{reason}）" if reason else "")

    # ── 空闲看门狗 ──
    async def idle_watchdog(self) -> None:
        """周期检查：空闲超时且无忙会话时自动停止 opencode。"""
        if settings.idle_timeout_minutes <= 0:
            logger.info("空闲自动关闭已禁用（IDLE_TIMEOUT_MINUTES=0）")
            return
        logger.info(
            "空闲看门狗启动：超时=%.1fmin 检查间隔=%ds",
            settings.idle_timeout_minutes, settings.idle_check_interval_seconds,
        )
        while True:
            await asyncio.sleep(settings.idle_check_interval_seconds)
            try:
                if self._busy_sessions:
                    self.touch_activity()
                    continue
                timeout_s = settings.idle_timeout_minutes * 60
                if self.idle_seconds < timeout_s:
                    continue
                if await opencode_client.health() is None:
                    continue  # 本来就没运行
                logger.info("空闲超过 %.1f 分钟，自动停止 OpenCode", settings.idle_timeout_minutes)
                await self.stop(reason="空闲超时")
            except Exception:
                logger.warning("空闲看门狗检查异常", exc_info=True)


opencode_runtime = OpenCodeRuntime()
