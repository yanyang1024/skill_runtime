"""OpenAI 兼容请求/响应模型。"""
import re
from typing import Any

from pydantic import BaseModel

_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


def is_valid_id(value: str) -> bool:
    """app_id / session_id 会拼进文件路径和 systemd 单元名，必须严格白名单。"""
    return bool(_ID_RE.match(value or ""))


class ChatMessage(BaseModel):
    role: str
    content: Any = ""  # str 或 OpenAI 多模态 parts 列表


class ChatCompletionRequest(BaseModel):
    model: str = ""
    messages: list[ChatMessage]
    stream: bool = False

    def last_user_text(self) -> str:
        """取最后一条 user 消息的纯文本。"""
        for msg in reversed(self.messages):
            if msg.role != "user":
                continue
            if isinstance(msg.content, str):
                return msg.content
            # parts 列表：拼接 text 类型
            return "".join(
                p.get("text", "")
                for p in msg.content
                if isinstance(p, dict) and p.get("type") == "text"
            )
        return ""


def make_chunk(
    chunk_id: str,
    created: int,
    model: str,
    delta: dict | None = None,
    finish_reason: str | None = None,
) -> dict:
    return {
        "id": chunk_id,
        "object": "chat.completion.chunk",
        "created": created,
        "model": model,
        "choices": [
            {"index": 0, "delta": delta or {}, "finish_reason": finish_reason}
        ],
    }
