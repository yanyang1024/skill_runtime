"""AppManager：通过 systemd --user 管理每个 app 的 OpenCode 实例生命周期。"""
import asyncio
import hashlib
import logging
import time

import httpx

from .. import config

logger = logging.getLogger(__name__)


class AppManager:
    def __init__(self) -> None:
        self._locks: dict[str, asyncio.Lock] = {}
        self._last_activity: dict[str, float] = {}
        self._starting: set[str] = set()

    # ── 端口与地址 ──────────────────────────────────────────

    @staticmethod
    def port_for(app_id: str) -> int:
        # 与 scripts/start_agent.sh 同一公式
        return config.PORT_BASE + (
            int(hashlib.md5(app_id.encode()).hexdigest(), 16) % config.PORT_RANGE
        )

    def base_url_for(self, app_id: str) -> str:
        return f"http://127.0.0.1:{self.port_for(app_id)}"

    # ── systemd ─────────────────────────────────────────────

    @staticmethod
    async def _systemctl(*args: str) -> tuple[int, str]:
        proc = await asyncio.create_subprocess_exec(
            "systemctl", "--user", *args,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        out, _ = await proc.communicate()
        return proc.returncode, out.decode(errors="replace").strip()

    async def is_active(self, app_id: str) -> bool:
        code, out = await self._systemctl(
            "is-active", f"opencode-app@{app_id}.service"
        )
        return code == 0 and out == "active"

    # ── 生命周期 ────────────────────────────────────────────

    def _lock_for(self, app_id: str) -> asyncio.Lock:
        if app_id not in self._locks:
            self._locks[app_id] = asyncio.Lock()
        return self._locks[app_id]

    def _init_app_directories(self, app_id: str) -> None:
        app_dir = config.APPS_DIR / app_id
        for sub in ("home", "tmp", "workspace"):
            (app_dir / sub).mkdir(parents=True, exist_ok=True)

    async def start(self, app_id: str) -> None:
        async with self._lock_for(app_id):
            if await self.is_active(app_id):
                self.touch(app_id)
                return
            self._starting.add(app_id)
            try:
                self._init_app_directories(app_id)
                code, out = await self._systemctl(
                    "start", f"opencode-app@{app_id}.service"
                )
                if code != 0:
                    raise RuntimeError(f"systemctl start 失败: {out}")
                await self._wait_healthy(app_id, timeout=config.HEALTH_TIMEOUT)
                self.touch(app_id)
                logger.info("实例已启动: app=%s port=%s", app_id, self.port_for(app_id))
            finally:
                self._starting.discard(app_id)

    async def stop(self, app_id: str) -> None:
        async with self._lock_for(app_id):
            code, out = await self._systemctl(
                "stop", f"opencode-app@{app_id}.service"
            )
            if code != 0:
                logger.warning("systemctl stop %s: %s", app_id, out)
            self._last_activity.pop(app_id, None)
            logger.info("实例已停止: app=%s", app_id)

    async def status(self, app_id: str) -> dict:
        active = await self.is_active(app_id)
        if app_id in self._starting:
            state = "starting"
        elif active:
            state = "running"
        else:
            state = "stopped"
        return {
            "app_id": app_id,
            "status": state,
            "port": self.port_for(app_id),
            "last_activity": self._last_activity.get(app_id),
        }

    def touch(self, app_id: str) -> None:
        self._last_activity[app_id] = time.time()

    # ── 健康检查 ────────────────────────────────────────────

    async def _wait_healthy(self, app_id: str, timeout: float) -> None:
        url = f"{self.base_url_for(app_id)}/global/health"
        deadline = time.time() + timeout
        async with httpx.AsyncClient(
            auth=(config.OPENCODE_SERVER_USERNAME, config.OPENCODE_SERVER_PASSWORD),
            timeout=5.0,
        ) as client:
            while time.time() < deadline:
                try:
                    r = await client.get(url)
                    if r.status_code == 200 and r.json().get("healthy"):
                        return
                except Exception:
                    pass
                await asyncio.sleep(1.0)
        raise TimeoutError(f"实例 {app_id} 在 {timeout}s 内未通过健康检查")

    # ── 空闲回收 ────────────────────────────────────────────

    async def idle_check_worker(self) -> None:
        while True:
            await asyncio.sleep(config.IDLE_CHECK_INTERVAL)
            try:
                now = time.time()
                for app_id, last in list(self._last_activity.items()):
                    if app_id in self._starting:
                        continue
                    if now - last > config.IDLE_TIMEOUT:
                        if await self.is_active(app_id):
                            logger.info("回收空闲实例: app=%s", app_id)
                            await self.stop(app_id)
            except Exception:
                # 单次扫描失败不应杀死回收任务
                logger.exception("空闲扫描失败，下个周期重试")


app_manager = AppManager()
