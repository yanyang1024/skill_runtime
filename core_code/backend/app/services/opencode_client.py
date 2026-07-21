"""OpenCode serve 的简化异步客户端（单实例）。

参考 ref_scripts.txt 中的实现简化而来：
- 只保留个人 MVP 需要的方法；
- 所有请求强制携带 x-opencode-directory 与 Basic Auth；
- 不做 SSE fan-out（SSE 归 event_bus 管）。
"""
import base64
import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_DEFAULT_TIMEOUT = httpx.Timeout(30.0)


class OpenCodeClient:
    """对接单个 opencode serve 实例；所有会话请求强制绑定 workspace。"""

    def __init__(self, base_url: str, username: str, password: str) -> None:
        self.base_url = base_url.rstrip("/")
        self._username = username
        self._password = password

    def _basic_auth(self) -> str:
        raw = f"{self._username}:{self._password}".encode()
        return "Basic " + base64.b64encode(raw).decode()

    def _make_headers(self, workspace_path: str) -> dict[str, str]:
        """构造请求头；workspace_path 必填，注入 x-opencode-directory 与 Basic Auth。"""
        if not workspace_path:
            raise ValueError("workspace_path 不能为空：所有 OpenCode 请求必须绑定会话目录")
        return {
            "Content-Type": "application/json",
            "x-opencode-directory": workspace_path,
            "Authorization": self._basic_auth(),
        }

    async def health(self) -> dict | None:
        """GET /global/health（404/405 回退 POST）；OpenCode 不可用时返回 None。"""
        headers = {"Authorization": self._basic_auth()}
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(5.0)) as client:
                r = await client.get(f"{self.base_url}/global/health", headers=headers)
                if r.status_code in (404, 405):
                    r = await client.post(f"{self.base_url}/global/health", headers=headers)
                if r.status_code != 200:
                    return None
                try:
                    return r.json()
                except ValueError:
                    return {"raw": r.text}
        except httpx.HTTPError:
            return None

    async def create_session(self, workspace_path: str, title: str = "") -> dict:
        body = {"title": title} if title else {}
        async with httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT) as client:
            r = await client.post(
                f"{self.base_url}/session",
                json=body,
                headers=self._make_headers(workspace_path),
            )
            r.raise_for_status()
            return r.json()

    async def get_session(self, session_id: str, workspace_path: str) -> dict | None:
        """获取 session 信息（含 opencode 自动生成的 title）；失败返回 None。"""
        try:
            async with httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT) as client:
                r = await client.get(
                    f"{self.base_url}/session/{session_id}",
                    headers=self._make_headers(workspace_path),
                )
                return r.json() if r.status_code == 200 else None
        except httpx.HTTPError:
            return None

    async def delete_session(self, session_id: str, workspace_path: str) -> bool:
        try:
            async with httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT) as client:
                r = await client.delete(
                    f"{self.base_url}/session/{session_id}",
                    headers=self._make_headers(workspace_path),
                )
                return r.status_code == 200
        except httpx.HTTPError:
            return False

    async def get_messages(self, session_id: str, workspace_path: str) -> list:
        async with httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT) as client:
            r = await client.get(
                f"{self.base_url}/session/{session_id}/message",
                headers=self._make_headers(workspace_path),
            )
            r.raise_for_status()
            return r.json()

    async def send_prompt_async(
        self,
        session_id: str,
        workspace_path: str,
        message: str,
        agent: str | None = None,
    ) -> None:
        """异步发送消息，事件通过 /event SSE 流出。"""
        body: dict = {"parts": [{"type": "text", "text": message}]}
        if agent:
            body["agent"] = agent
        async with httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT) as client:
            r = await client.post(
                f"{self.base_url}/session/{session_id}/prompt_async",
                json=body,
                headers=self._make_headers(workspace_path),
            )
            r.raise_for_status()

    async def abort(self, session_id: str, workspace_path: str) -> None:
        """中止任务（尽力而为）：先调 abort API，再拒绝 pending questions。"""
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(10.0)) as client:
                await client.post(
                    f"{self.base_url}/session/{session_id}/abort",
                    headers=self._make_headers(workspace_path),
                )
        except httpx.HTTPError as e:
            logger.warning("调用 OpenCode abort 失败: %s", e)
        # opencode 的 abort 不会自动拒绝 pending questions，逐个拒绝避免悬挂
        try:
            for q in await self.list_questions(workspace_path):
                qid = q.get("id")
                if qid:
                    try:
                        await self.reject_question(qid, workspace_path)
                    except httpx.HTTPError:
                        pass
        except httpx.HTTPError:
            pass

    async def list_questions(self, workspace_path: str) -> list:
        try:
            async with httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT) as client:
                r = await client.get(
                    f"{self.base_url}/question",
                    params={"directory": workspace_path},
                    headers=self._make_headers(workspace_path),
                )
                return r.json() if r.status_code == 200 else []
        except httpx.HTTPError:
            return []

    async def list_permissions(self, workspace_path: str) -> list:
        """当前 pending 的 permission 请求（用于 SSE 建连后回放）。"""
        try:
            async with httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT) as client:
                r = await client.get(
                    f"{self.base_url}/permission",
                    params={"directory": workspace_path},
                    headers=self._make_headers(workspace_path),
                )
                data = r.json() if r.status_code == 200 else []
                return data if isinstance(data, list) else []
        except httpx.HTTPError:
            return []

    async def reply_question(self, request_id: str, answers: list, workspace_path: str):
        async with httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT) as client:
            r = await client.post(
                f"{self.base_url}/question/{request_id}/reply",
                json={"answers": answers},
                headers=self._make_headers(workspace_path),
            )
            r.raise_for_status()
            return _json_or_ok(r)

    async def reject_question(self, request_id: str, workspace_path: str):
        async with httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT) as client:
            r = await client.post(
                f"{self.base_url}/question/{request_id}/reject",
                headers=self._make_headers(workspace_path),
            )
            r.raise_for_status()
            return _json_or_ok(r)

    async def reply_permission(self, request_id: str, reply: str, workspace_path: str):
        async with httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT) as client:
            r = await client.post(
                f"{self.base_url}/permission/{request_id}/reply",
                json={"reply": reply},
                headers=self._make_headers(workspace_path),
            )
            r.raise_for_status()
            return _json_or_ok(r)


def _json_or_ok(r: httpx.Response):
    """opencode 部分接口返回 true 或空响应，统一兜底。"""
    try:
        return r.json()
    except ValueError:
        return {"ok": r.is_success}


opencode_client = OpenCodeClient(
    settings.opencode_base_url,
    settings.opencode_username,
    settings.opencode_password,
)
