"""OpenCodeClient：连接 OpenCode 实例的 HTTP/SSE 接口，并把事件流翻译为 OpenAI chunk。"""
import asyncio
import base64
import json
import logging
import time
from typing import AsyncGenerator

import httpx

from .. import config
from ..schemas import make_chunk
from .instance_manager import app_manager

logger = logging.getLogger(__name__)


class OpenCodeClient:
    def __init__(self, base_url: str, username: str = "", password: str = ""):
        self.base_url = base_url
        self._username = username
        self._password = password
        self._abort_flags: dict[str, bool] = {}
        self._stream_clients: dict[str, httpx.AsyncClient] = {}

    # ── 基础 ────────────────────────────────────────────────

    def _make_headers(self, workspace_path: str | None = None) -> dict:
        headers: dict[str, str] = {"Content-Type": "application/json"}
        if workspace_path:
            # opencode 会把该 session 的文件操作限制在此目录内
            headers["x-opencode-directory"] = workspace_path
        if self._username and self._password:
            credentials = base64.b64encode(
                f"{self._username}:{self._password}".encode()
            ).decode()
            headers["Authorization"] = f"Basic {credentials}"
        return headers

    async def check_health(self) -> dict:
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"{self.base_url}/global/health", headers=self._make_headers()
            )
            r.raise_for_status()
            return r.json()

    async def create_session(
        self, title: str = "", workspace_path: str | None = None
    ) -> dict:
        async with httpx.AsyncClient() as client:
            body = {"title": title} if title else {}
            r = await client.post(
                f"{self.base_url}/session",
                json=body,
                headers=self._make_headers(workspace_path),
            )
            r.raise_for_status()
            return r.json()

    async def get_session(
        self, session_id: str, workspace_path: str | None = None
    ) -> dict | None:
        """查询 session 是否存在；任何错误（含实例不可达、404）都返回 None。"""
        try:
            async with httpx.AsyncClient() as client:
                r = await client.get(
                    f"{self.base_url}/session/{session_id}",
                    headers=self._make_headers(workspace_path),
                )
                return r.json() if r.status_code == 200 else None
        except Exception:
            return None

    async def delete_session(
        self, session_id: str, workspace_path: str | None = None
    ) -> bool:
        try:
            async with httpx.AsyncClient() as client:
                r = await client.delete(
                    f"{self.base_url}/session/{session_id}",
                    headers=self._make_headers(workspace_path),
                )
                return r.status_code == 200
        except Exception:
            return False

    async def get_messages(
        self, session_id: str, workspace_path: str | None = None
    ) -> list:
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"{self.base_url}/session/{session_id}/message",
                headers=self._make_headers(workspace_path),
            )
            r.raise_for_status()
            return r.json()

    async def reply_question(
        self, request_id: str, answers: list, workspace_path: str | None = None
    ) -> None:
        async with httpx.AsyncClient() as client:
            r = await client.post(
                f"{self.base_url}/question/{request_id}/reply",
                json={"answers": answers},
                headers=self._make_headers(workspace_path),
            )
            r.raise_for_status()

    async def reply_permission(
        self, request_id: str, reply: str, workspace_path: str | None = None
    ) -> None:
        async with httpx.AsyncClient() as client:
            r = await client.post(
                f"{self.base_url}/permission/{request_id}/reply",
                json={"reply": reply},
                headers=self._make_headers(workspace_path),
            )
            r.raise_for_status()

    async def list_questions(self, workspace_path: str | None = None) -> list:
        params = {"directory": workspace_path} if workspace_path else {}
        async with httpx.AsyncClient() as client:
            r = await client.get(
                f"{self.base_url}/question",
                params=params,
                headers=self._make_headers(workspace_path),
            )
            return r.json() if r.status_code == 200 else []

    async def abort_session(
        self, session_id: str, workspace_path: str | None = None
    ) -> None:
        """真正取消 opencode 侧任务，并断开本地 SSE 流。"""
        self._abort_flags[session_id] = True
        try:
            # 必须带 x-opencode-directory，否则 abort 会路由到错误的 instance context
            async with httpx.AsyncClient() as client:
                await client.post(
                    f"{self.base_url}/session/{session_id}/abort",
                    headers=self._make_headers(workspace_path),
                    timeout=10.0,
                )
        except Exception as e:
            logger.warning("abort API 调用失败: %s", e)
        # opencode 的 abort 不会自动拒绝 pending questions
        try:
            for q in await self.list_questions(workspace_path):
                q_id = q.get("id", "")
                if q_id:
                    async with httpx.AsyncClient() as client:
                        await client.post(
                            f"{self.base_url}/question/{q_id}/reject",
                            headers=self._make_headers(workspace_path),
                        )
        except Exception as e:
            logger.warning("清理 pending questions 失败: %s", e)
        await asyncio.sleep(0.5)
        stream_client = self._stream_clients.pop(session_id, None)
        if stream_client:
            try:
                await stream_client.aclose()
            except Exception:
                pass

    # ── 核心：SSE 事件流 → OpenAI chunk ─────────────────────

    async def stream_chat(
        self,
        session_id: str,
        message: str,
        agent: str,
        workspace_path: str | None = None,
        model: str = "",
        request_id: str = "",
    ) -> AsyncGenerator[dict, None]:
        """
        发送 prompt 并订阅 /event，产出 OpenAI chat.completion.chunk dict。
        结束（stop/error）时产出带 finish_reason 的 chunk 后返回。
        request_id 用于构造 chunk 的 id（对调用方暴露的是服务端 session id）。
        """
        headers = self._make_headers(workspace_path)
        client = httpx.AsyncClient(timeout=httpx.Timeout(300.0))
        self._stream_clients[session_id] = client
        self._abort_flags[session_id] = False

        chunk_id = f"chatcmpl-{request_id or session_id}"
        created = int(time.time())
        model = model or agent

        payload = {"parts": [{"type": "text", "text": message}], "agent": agent}
        part_registry: dict[str, str] = {}  # part_id -> part type
        sent_role = False

        def chunk(delta=None, finish_reason=None):
            return make_chunk(chunk_id, created, model, delta, finish_reason)

        try:
            async with client.stream(
                "GET", f"{self.base_url}/event", headers=headers
            ) as resp:
                # 先建立 SSE 连接再发 prompt，保证不漏事件；
                # 发送失败会抛异常，走下方统一异常处理（此前在后台任务里发，错误会被吞掉）
                r = await client.post(
                    f"{self.base_url}/session/{session_id}/prompt_async",
                    json=payload,
                    headers=headers,
                )
                r.raise_for_status()
                async for line in resp.aiter_lines():
                    if self._abort_flags.get(session_id, False):
                        yield chunk(finish_reason="stop")
                        return
                    if not line.startswith("data: "):
                        continue
                    try:
                        event = json.loads(line[6:])
                    except json.JSONDecodeError:
                        continue

                    etype = event.get("type", "")
                    props = event.get("properties", {})

                    if etype == "message.part.updated":
                        part = props.get("part", {})
                        if part.get("sessionID") != session_id:
                            continue
                        part_registry[part.get("id", "")] = part.get("type", "")

                    elif etype == "message.part.delta":
                        if props.get("sessionID") != session_id:
                            continue
                        p_type = part_registry.get(props.get("partID", ""), "text")
                        delta = props.get("delta", "")
                        if not delta or p_type not in ("text", "reasoning"):
                            continue
                        if not sent_role:
                            sent_role = True
                            yield chunk(delta={"role": "assistant"})
                        key = "content" if p_type == "text" else "reasoning_content"
                        yield chunk(delta={key: delta})

                    elif etype == "question.asked":
                        # 服务端无人工审批，MVP 一律自动批准
                        if props.get("sessionID") == session_id:
                            req_id = props.get("id", "")
                            if req_id:
                                try:
                                    await self.reply_question(
                                        req_id, [["yes"]], workspace_path
                                    )
                                except Exception as e:
                                    logger.warning("自动批准 question 失败: %s", e)

                    elif etype == "permission.asked":
                        if props.get("sessionID") == session_id:
                            req_id = props.get("id", "")
                            if req_id:
                                try:
                                    await self.reply_permission(
                                        req_id, "always", workspace_path
                                    )
                                except Exception as e:
                                    logger.warning("自动批准 permission 失败: %s", e)

                    elif etype == "session.idle":
                        if props.get("sessionID") == session_id:
                            yield chunk(finish_reason="stop")
                            return

                    elif etype == "session.error":
                        if props.get("sessionID") == session_id:
                            err = str(props.get("error", ""))
                            if err:
                                yield chunk(delta={"content": f"\n[error] {err}"})
                            yield chunk(finish_reason="error")
                            return
        except Exception as e:
            # SSE 连接被 abort 主动关闭时视为正常结束
            if self._abort_flags.get(session_id, False):
                yield chunk(finish_reason="stop")
            else:
                logger.error("SSE 流异常: %s", e)
                yield chunk(delta={"content": f"\n[error] {e}"})
                yield chunk(finish_reason="error")
        finally:
            self._abort_flags.pop(session_id, None)
            self._stream_clients.pop(session_id, None)
            try:
                await client.aclose()
            except Exception:
                pass


class OpenCodeRegistry:
    """app_id -> OpenCodeClient，避免实例间状态泄漏。"""

    def __init__(self) -> None:
        self._clients: dict[str, OpenCodeClient] = {}

    def get_client(self, app_id: str) -> OpenCodeClient:
        if app_id not in self._clients:
            self._clients[app_id] = OpenCodeClient(
                base_url=app_manager.base_url_for(app_id),
                username=config.OPENCODE_SERVER_USERNAME,
                password=config.OPENCODE_SERVER_PASSWORD,
            )
        return self._clients[app_id]

    def remove_client(self, app_id: str) -> None:
        self._clients.pop(app_id, None)


registry = OpenCodeRegistry()
