"""Shared HTTP tool gateway for lightweight OpenCode native tools.

No MinerU runtime, model, or per-session MCP server runs in OpenCode.
Environment identity is for audit correlation, not authentication.
"""
from __future__ import annotations

import asyncio
import base64
import ipaddress
import json
import logging
import os
import tempfile
import time
import uuid
from collections import defaultdict, deque
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

import httpx
import uvicorn
from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.responses import JSONResponse

BASE_DIR = Path(__file__).resolve().parent
MAX_FILE_BYTES = int(os.getenv("MAX_FILE_BYTES", str(15 * 1024 * 1024)))
MAX_RESULT_CHARS = int(os.getenv("MAX_RESULT_CHARS", "30000"))
TRUSTED_PROXY_IPS = {
    item.strip()
    for item in os.getenv("CORP_TRUSTED_PROXY_IPS", "").split(",")
    if item.strip()
}
OCR_SUFFIXES = {".pdf", ".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}
VISION_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp"}
MIME_BY_SUFFIX = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
}
ROUTE_TOOLS = {
    "/v1/ocr/parse": "corp_ocr",
    "/v1/vision/understand": "corp_vision",
}

logging.basicConfig(level=logging.INFO, format="%(message)s")
audit_logger = logging.getLogger("corp_tool_audit")


class GatewayError(Exception):
    def __init__(self, status_code: int, code: str, message: str, outcome: str = "tool_error"):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.outcome = outcome


@dataclass(frozen=True)
class Principal:
    user_id: str
    device_id: str | None
    peer_ip: str
    client_ip: str
    end_user_ip: str | None = None
    identity_source: str = "env_header_unverified"


def resolve_client_ip(headers: dict[str, str], peer_ip: str) -> str:
    """Trust X-Forwarded-For only when the direct peer is a trusted proxy."""
    if peer_ip not in TRUSTED_PROXY_IPS:
        return peer_ip
    forwarded = headers.get("x-forwarded-for")
    if not forwarded:
        return peer_ip
    candidate = forwarded.split(",", 1)[0].strip()
    try:
        return str(ipaddress.ip_address(candidate))
    except ValueError as exc:
        raise GatewayError(400, "invalid_x_forwarded_for", "Invalid forwarded client IP", "identity_failed") from exc


class EnvHeaderIdentityProvider:
    """Replace with OIDC verification without changing tool endpoints."""

    def from_request(self, request: Request) -> Principal:
        headers = {key.lower(): value for key, value in request.headers.items()}
        user_id = headers.get("x-corp-user-id", "").strip()
        if not user_id:
            raise GatewayError(401, "missing_corp_user_identity", "Missing enterprise user identity", "identity_failed")
        peer_ip = request.client.host if request.client else "unknown"
        end_user_ip = headers.get("x-corp-client-ip") or None
        if end_user_ip:
            try:
                end_user_ip = str(ipaddress.ip_address(end_user_ip))
            except ValueError as exc:
                raise GatewayError(400, "invalid_end_user_ip", "Invalid platform-asserted user IP", "identity_failed") from exc
        return Principal(
            user_id=user_id,
            device_id=headers.get("x-corp-device-id") or None,
            peer_ip=peer_ip,
            client_ip=resolve_client_ip(headers, peer_ip),
            end_user_ip=end_user_ip,
        )


class FilePolicy:
    """Default-deny tool ACL plus per-user/per-tool rate configuration."""

    def __init__(self, path: Path):
        self.data = json.loads(path.read_text(encoding="utf-8"))

    def rule_for(self, user_id: str) -> dict[str, Any]:
        users = self.data.get("users", {})
        return users.get(user_id) or users.get("*") or {
            "allow_tools": [],
            "rate_limit_per_minute": 0,
        }

    def authorize(self, principal: Principal, tool_name: str) -> dict[str, Any]:
        rule = self.rule_for(principal.user_id)
        if tool_name not in rule.get("allow_tools", []):
            raise GatewayError(403, "tool_not_allowed", f"Tool not allowed: {tool_name}", "permission_denied")
        return rule


class InMemoryRateLimiter:
    """Single-process sliding window. Replace with Redis for multiple replicas."""

    def __init__(self):
        self.events: dict[tuple[str, str], deque[float]] = defaultdict(deque)
        self.lock = asyncio.Lock()

    async def check(self, principal: Principal, tool_name: str, limit: int, window_sec: int = 60):
        if limit <= 0:
            raise GatewayError(500, "rate_limit_not_configured", "Rate limit is not configured")
        key = (principal.user_id, tool_name)
        now = time.monotonic()
        async with self.lock:
            events = self.events[key]
            while events and events[0] <= now - window_sec:
                events.popleft()
            if len(events) >= limit:
                retry_after = max(1, int(window_sec - (now - events[0])) + 1)
                raise GatewayError(429, "rate_limit_exceeded", f"Retry after {retry_after} seconds", "rate_limited")
            events.append(now)


class MinerUBackend(Protocol):
    async def parse(self, path: Path, tier: str) -> str: ...


class MinerUCliBackend:
    """MinerU >=4,<5 adapter. Replace with the enterprise HTTP adapter if needed."""

    def __init__(self):
        self.binary = os.getenv("MINERU_BIN", "mineru")
        self.timeout = int(os.getenv("MINERU_TIMEOUT_SEC", "600"))

    async def parse(self, path: Path, tier: str) -> str:
        env = os.environ.copy()
        env["MINERU_TELEMETRY_DISABLED"] = "1"
        process = await asyncio.create_subprocess_exec(
            self.binary, "parse", str(path), "--tier", tier, "--json",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )
        try:
            stdout, stderr = await asyncio.wait_for(process.communicate(), self.timeout)
        except TimeoutError as exc:
            process.kill()
            await process.wait()
            raise GatewayError(504, "mineru_timeout", "MinerU timed out") from exc
        if process.returncode != 0:
            detail = stderr.decode("utf-8", errors="replace")[-1500:]
            raise GatewayError(502, "mineru_failed", detail)
        try:
            payload = json.loads(stdout)
        except json.JSONDecodeError as exc:
            raise GatewayError(502, "mineru_invalid_json_output", "MinerU returned invalid JSON") from exc
        if payload.get("error"):
            error = payload["error"]
            raise GatewayError(502, f"mineru_{error.get('code', 'error')}", error.get("message", ""))
        content = payload.get("content")
        if isinstance(content, dict):
            for key in ("content", "markdown", "text"):
                if isinstance(content.get(key), str):
                    return content[key]
        if isinstance(content, str):
            return content
        if content is None:
            raise GatewayError(409, "mineru_parse_pending", "Use an asynchronous job contract")
        return json.dumps(content, ensure_ascii=False)


class OpenAIVisionBackend:
    """OpenAI-compatible endpoint for an internal VLM inference service."""

    def __init__(self):
        self.base_url = os.getenv("VISION_BASE_URL", "http://127.0.0.1:30000/v1").rstrip("/")
        self.model = os.getenv("VISION_MODEL", "mineru-vlm")
        self.api_key = os.getenv("VISION_API_KEY", "")
        self.timeout = int(os.getenv("VISION_TIMEOUT_SEC", "180"))

    async def understand(self, image: bytes, mime: str, prompt: str) -> str:
        image_b64 = base64.b64encode(image).decode("ascii")
        headers = {"Authorization": f"Bearer {self.api_key}"} if self.api_key else {}
        payload = {
            "model": self.model,
            "max_tokens": 2048,
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{image_b64}"}},
                ],
            }],
        }
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(f"{self.base_url}/chat/completions", json=payload, headers=headers)
        if response.status_code != 200:
            raise GatewayError(502, f"vision_backend_http_{response.status_code}", response.text[-1000:])
        try:
            content = response.json()["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError, json.JSONDecodeError) as exc:
            raise GatewayError(502, "vision_backend_invalid_response", "Invalid VLM response") from exc
        return content if isinstance(content, str) else json.dumps(content, ensure_ascii=False)


def bounded_result(text: str) -> dict[str, Any]:
    truncated = len(text) > MAX_RESULT_CHARS
    return {
        "text": text[:MAX_RESULT_CHARS],
        "truncated": truncated,
        "note": "Full-result persistence/pagination is a production extension." if truncated else None,
    }


def validate_filename(filename: str | None, allowed_suffixes: set[str]) -> tuple[str, str]:
    safe_name = Path(filename or "").name
    suffix = Path(safe_name).suffix.lower()
    if suffix not in allowed_suffixes:
        raise GatewayError(415, "unsupported_file_type", f"Unsupported file type: {suffix}")
    return safe_name, suffix


async def save_upload(upload: UploadFile) -> tuple[Path, str]:
    safe_name, suffix = validate_filename(upload.filename, OCR_SUFFIXES)
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(prefix="corp-ocr-", suffix=suffix, delete=False) as temp:
            temp_path = Path(temp.name)
            size = 0
            while chunk := await upload.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_FILE_BYTES:
                    raise GatewayError(413, "file_too_large", "Uploaded file is too large")
                temp.write(chunk)
        if not temp_path or temp_path.stat().st_size == 0:
            raise GatewayError(400, "empty_file", "Uploaded file is empty")
        return temp_path, safe_name
    except Exception:
        if temp_path:
            temp_path.unlink(missing_ok=True)
        raise


app = FastAPI(title="Enterprise Native Tool Gateway", version="1.0.0")
mineru_backend = MinerUCliBackend()
vision_backend = OpenAIVisionBackend()
policy = FilePolicy(Path(os.getenv("POLICY_FILE", str(BASE_DIR / "policy.json"))))
identity = EnvHeaderIdentityProvider()
limiter = InMemoryRateLimiter()


def error_response(error: GatewayError, request_id: str) -> JSONResponse:
    return JSONResponse(
        status_code=error.status_code,
        content={"error": {"code": error.code, "message": error.message}, "request_id": request_id},
    )


def emit_audit(request: Request, tool_name: str, outcome: str, principal: Principal | None,
               request_id: str, started: float, detail: str | None = None):
    headers = {key.lower(): value for key, value in request.headers.items()}
    event = {
        "event": "http_tool_call",
        "request_id": request_id,
        "tool": tool_name,
        "outcome": outcome,
        "user_id": principal.user_id if principal else None,
        "device_id": principal.device_id if principal else None,
        "identity_source": principal.identity_source if principal else "missing",
        "peer_ip": principal.peer_ip if principal else (request.client.host if request.client else "unknown"),
        "client_ip": principal.client_ip if principal else None,
        "end_user_ip": principal.end_user_ip if principal else None,
        "end_user_ip_source": "platform_ingress_asserted" if principal and principal.end_user_ip else None,
        "session_id": headers.get("x-opencode-session-id"),
        "agent": headers.get("x-opencode-agent"),
        "latency_ms": round((time.perf_counter() - started) * 1000, 2),
        "detail": detail,
    }
    audit_logger.info(json.dumps(event, ensure_ascii=False))


@app.middleware("http")
async def govern_tool_calls(request: Request, call_next):
    tool_name = ROUTE_TOOLS.get(request.url.path)
    if not tool_name:
        return await call_next(request)
    request_id = uuid.uuid4().hex
    request.state.request_id = request_id
    started = time.perf_counter()
    principal = None
    try:
        principal = identity.from_request(request)
        request.state.principal = principal
        rule = policy.authorize(principal, tool_name)
        await limiter.check(principal, tool_name, int(rule["rate_limit_per_minute"]))
    except GatewayError as error:
        emit_audit(request, tool_name, error.outcome, principal, request_id, started, error.code)
        response = error_response(error, request_id)
        response.headers["X-Request-Id"] = request_id
        return response
    response = await call_next(request)
    outcome = "succeeded" if response.status_code < 400 else "tool_error"
    emit_audit(request, tool_name, outcome, principal, request_id, started)
    response.headers["X-Request-Id"] = request_id
    return response


@app.exception_handler(GatewayError)
async def handle_gateway_error(request: Request, error: GatewayError):
    return error_response(error, getattr(request.state, "request_id", "untracked"))


@app.get("/healthz")
async def healthz():
    return {"status": "ok", "note": "Process liveness only; backend health is not implied"}


@app.post("/v1/ocr/parse")
async def parse_ocr(file: UploadFile = File(...), tier: str = Form("standard")):
    if tier not in {"flash", "basic", "standard", "advanced"}:
        raise GatewayError(400, "invalid_mineru_tier", "Invalid MinerU tier")
    temp_path = None
    try:
        temp_path, safe_name = await save_upload(file)
        text = await mineru_backend.parse(temp_path, tier)
        return {"filename": safe_name, **bounded_result(text)}
    finally:
        await file.close()
        if temp_path:
            temp_path.unlink(missing_ok=True)


@app.post("/v1/vision/understand")
async def understand_image(file: UploadFile = File(...), prompt: str = Form("Describe the image and extract visible text.")):
    if not prompt.strip() or len(prompt) > 4000:
        raise GatewayError(400, "invalid_prompt", "Prompt is empty or too long")
    safe_name, suffix = validate_filename(file.filename, VISION_SUFFIXES)
    content = await file.read(MAX_FILE_BYTES + 1)
    await file.close()
    if not content:
        raise GatewayError(400, "empty_file", "Uploaded file is empty")
    if len(content) > MAX_FILE_BYTES:
        raise GatewayError(413, "file_too_large", "Uploaded file is too large")
    text = await vision_backend.understand(content, MIME_BY_SUFFIX[suffix], prompt)
    return {"filename": safe_name, **bounded_result(text)}


if __name__ == "__main__":
    uvicorn.run(app, host=os.getenv("HOST", "0.0.0.0"), port=int(os.getenv("PORT", "8000")))
