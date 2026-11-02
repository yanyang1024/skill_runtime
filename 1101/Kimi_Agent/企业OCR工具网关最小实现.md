# 企业 OCR／识图：OpenCode 原生轻工具＋中央 HTTP 网关最小实现

> 本版已按多用户 Agent 平台场景，从“每实例连接 Remote MCP”调整为“OpenCode 原生轻工具＋中央共享 HTTP 网关”。OpenCode 不启动 MCP Server，不加载 MinerU，不持有 GPU Worker。
>
> 验证边界：中央 HTTP 网关通过 9 项自动化测试；原生 TypeScript 插件已通过 esbuild 静态构建。当前环境没有 Bun／真实 OpenCode 运行时，因此没有声称完成 OpenCode 内实际加载验证；真实 MinerU GPU／VLM 推理也需接入企业服务后验证。

## 1. 架构与资源生命周期

```text
每个 OpenCode 实例
└── .opencode/plugins/corp-tools.ts
    ├── 启动时只注册 Schema＋HTTP 调用闭包
    ├── 不启动 MCP Server
    ├── 不加载 MinerU／模型
    └── 调用时读取文件、环境变量、sessionID
              │ multipart HTTP
              ▼
中央共享 HTTP Gateway
├── 身份、设备、IP、sessionID、agent 审计
├── 工具 ACL：默认拒绝
├── 用户＋工具滑动窗口限流
├── 上传大小、类型、超时和错误处理
└── MinerU CLI／HTTP 适配器、OpenAI 兼容 VLM 适配器
```

这版实现将两种加载分开：

- **工具定义轻量常驻**：让模型始终知道 `corp_ocr` 和 `corp_vision` 存在。
- **重型资源按需执行**：只有工具被调用时才向中央服务发请求，重型服务由所有实例共享。

## 2. 文件结构

```text
opencode-native-tools-gateway-reference/
├── gateway.py
├── policy.json
├── requirements.txt
├── opencode.json
├── test_gateway.py
└── .opencode/
    └── plugins/
        └── corp-tools.ts
```

## 3. 启动中央网关

```bash
cd opencode-native-tools-gateway-reference
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# MinerU >=4,<5 单独安装；也可以替换为企业 HTTP 后端。
mineru server start

export VISION_BASE_URL="http://your-internal-vlm/v1"
export VISION_MODEL="your-real-model-name"
export VISION_API_KEY="optional-internal-key"
export CORP_TRUSTED_PROXY_IPS="10.0.0.2,10.0.0.3"
export PORT=8000
python gateway.py
```

端点：

```text
GET  /healthz
POST /v1/ocr/parse          multipart: file、tier
POST /v1/vision/understand  multipart: file、prompt
```

`/healthz` 只表示进程存活，不冒充 MinerU 或 VLM 后端健康。

## 4. 接入 OpenCode

把 `.opencode/plugins/corp-tools.ts` 放到工作区，并设置：

```bash
export CORP_TOOL_GATEWAY="https://tools.corp.example.com"
export CORP_USER_ID="alice"                 # 企业机器／平台实例已有
export CORP_DEVICE_ID="dev-1"              # 可选
export CORP_CLIENT_IP="172.16.8.20"        # 平台入口断言的终端 IP，可选
```

`opencode.json` 只保留客户端防误触权限，不包含任何 `mcp` 配置：

```json
{
  "permission": {
    "corp_ocr": "ask",
    "corp_vision": "ask"
  }
}
```

OpenCode 的 `permission` 不是多用户安全边界；真实 ACL、限流和配额在中央网关执行。

## 5. 身份、IP 和会话审计

原生工具每次调用都会补充：

```text
X-Corp-User-Id
X-Corp-Device-Id
X-Corp-Client-IP
X-OpenCode-Session-Id
X-OpenCode-Agent
X-Request-Id
```

审计字段包括：

- `peer_ip`：直接连接网关的 IP；
- `client_ip`：受信代理规则下得到的调用运行时 IP；
- `end_user_ip`：平台入口传入的终端用户 IP；
- `end_user_ip_source=platform_ingress_asserted`；
- `session_id`、`agent`、`user_id`、`device_id`；
- `outcome`：成功、身份失败、无权限、超频或工具错误。

如果 OpenCode 运行在平台容器中，`client_ip` 通常只是 Pod／平台出口 IP，终端用户 IP 必须由平台登录入口传入，不能从网关连接反推。

## 6. MinerU 与其他后端适配

`MinerUCliBackend` 默认执行：

```bash
mineru parse <临时文件> --tier <tier> --json
```

若已有企业 MinerU HTTP 服务，只需实现同一个后端方法：

```python
async def parse(self, path: Path, tier: str) -> str:
    ...
```

在适配器中完成上传、创建任务、状态处理和结果归一化，然后替换：

```python
mineru_backend = MinerUHttpBackend()
```

身份、IP、ACL、限流和审计不需要改动。任务 pending 必须明确返回 pending 或改为 `submit/status/result` 异步契约，不能返回空文本假成功。

## 7. 权限和限流

`policy.json` 默认：

- 普通用户只允许 `corp_ocr`，每分钟 5 次；
- `alice` 允许 `corp_ocr` 和 `corp_vision`，每分钟各 10 次；
- 未匹配用户和未授权工具默认拒绝；
- 限流键为 `(user_id, tool_name)`。

当前内存限流只适用于单进程。多副本必须替换为 Redis 等共享实现。

## 8. 验证

```bash
python -m unittest -v
python -m py_compile gateway.py

esbuild .opencode/plugins/corp-tools.ts \
  --bundle --platform=node --format=esm \
  --external:@opencode-ai/plugin \
  --outfile=/tmp/corp-tools.js
```

9 项测试覆盖：身份、ACL、限流、IP、文件名、成功 HTTP 调用、审计、临时文件清理和后端失败。上线前还需在目标 OpenCode 版本内验证插件加载，并用真实 MinerU／VLM 服务做端到端验收。

## 9. 完整源码

### `gateway.py`

```python
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

```

### `.opencode/plugins/corp-tools.ts`

```typescript
import { type Plugin, tool } from "@opencode-ai/plugin"
import { basename } from "node:path"

const gateway = (process.env.CORP_TOOL_GATEWAY ?? "http://127.0.0.1:8000").replace(/\/$/, "")
const maxFileBytes = Number(process.env.CORP_TOOL_MAX_FILE_BYTES ?? 15 * 1024 * 1024)

type SessionContext = { sessionID: string; agent: string }

async function callGateway(
  route: string,
  filePath: string,
  fields: Record<string, string>,
  context: SessionContext,
) {
  const userId = process.env.CORP_USER_ID
  if (!userId) throw new Error("missing_corp_user_identity")

  const file = Bun.file(filePath)
  if (!await file.exists()) throw new Error("file_not_found")
  if (file.size === 0 || file.size > maxFileBytes) throw new Error("file_empty_or_too_large")

  const form = new FormData()
  form.append("file", file, basename(filePath))
  for (const [key, value] of Object.entries(fields)) form.append(key, value)

  const response = await fetch(`${gateway}${route}`, {
    method: "POST",
    headers: {
      "X-Corp-User-Id": userId,
      "X-Corp-Device-Id": process.env.CORP_DEVICE_ID ?? "",
      "X-Corp-Client-IP": process.env.CORP_CLIENT_IP ?? "",
      "X-OpenCode-Session-Id": context.sessionID,
      "X-OpenCode-Agent": context.agent,
      "X-Request-Id": crypto.randomUUID(),
    },
    body: form,
    signal: AbortSignal.timeout(120_000),
  })

  const text = await response.text()
  if (!response.ok) throw new Error(`tool_gateway_failed:${response.status}:${text}`)
  return text
}

export const CorpToolsPlugin: Plugin = async () => ({
  tool: {
    corp_ocr: tool({
      description: "Parse a local PDF or image with the central enterprise MinerU service",
      args: {
        filePath: tool.schema.string().describe("Local PDF or image path"),
        tier: tool.schema.string().describe("flash, basic, standard, or advanced"),
      },
      async execute(args, context) {
        return callGateway("/v1/ocr/parse", args.filePath, { tier: args.tier }, context)
      },
    }),
    corp_vision: tool({
      description: "Understand a local image with the central enterprise vision service",
      args: {
        filePath: tool.schema.string().describe("Local PNG, JPEG, or WebP image path"),
        prompt: tool.schema.string().describe("Question or instruction for image understanding"),
      },
      async execute(args, context) {
        return callGateway("/v1/vision/understand", args.filePath, { prompt: args.prompt }, context)
      },
    }),
  },
})

```

### `policy.json`

```json
{
  "users": {
    "*": {
      "allow_tools": ["corp_ocr"],
      "rate_limit_per_minute": 5
    },
    "alice": {
      "allow_tools": ["corp_ocr", "corp_vision"],
      "rate_limit_per_minute": 10
    }
  }
}

```

### `requirements.txt`

```text
fastapi>=0.115,<1
uvicorn>=0.34,<1
httpx>=0.27,<1
python-multipart>=0.0.20,<1

```

### `opencode.json`

```json
{
  "$schema": "https://opencode.ai/config.json",
  "permission": {
    "corp_ocr": "ask",
    "corp_vision": "ask"
  }
}

```

### `test_gateway.py`

```python
import unittest
from pathlib import Path
from unittest.mock import patch

import gateway
from fastapi.testclient import TestClient


class FakeMinerU:
    def __init__(self, fail=False):
        self.fail = fail
        self.last_path = None

    async def parse(self, path: Path, tier: str) -> str:
        self.last_path = path
        if self.fail:
            raise gateway.GatewayError(502, "mineru_failed", "stub failure")
        return f"OCR integration success:{tier}"


class GatewayUnitTests(unittest.TestCase):
    def test_direct_peer_ignores_spoofed_forwarded_header(self):
        with patch.object(gateway, "TRUSTED_PROXY_IPS", set()):
            ip = gateway.resolve_client_ip({"x-forwarded-for": "1.2.3.4"}, "10.0.0.8")
        self.assertEqual(ip, "10.0.0.8")

    def test_trusted_proxy_accepts_first_forwarded_ip(self):
        with patch.object(gateway, "TRUSTED_PROXY_IPS", {"10.0.0.2"}):
            ip = gateway.resolve_client_ip(
                {"x-forwarded-for": "1.2.3.4, 10.0.0.2"}, "10.0.0.2"
            )
        self.assertEqual(ip, "1.2.3.4")

    def test_filename_guard(self):
        name, suffix = gateway.validate_filename("../a.pdf", gateway.OCR_SUFFIXES)
        self.assertEqual((name, suffix), ("a.pdf", ".pdf"))
        with self.assertRaises(gateway.GatewayError):
            gateway.validate_filename("a.exe", gateway.OCR_SUFFIXES)

    def test_policy_default_deny_and_user_override(self):
        policy = gateway.FilePolicy(gateway.BASE_DIR / "policy.json")
        principal = gateway.Principal("bob", None, "10.0.0.8", "10.0.0.8")
        self.assertIn("corp_ocr", policy.rule_for("bob")["allow_tools"])
        with self.assertRaises(gateway.GatewayError):
            policy.authorize(principal, "corp_vision")


class RateLimiterTests(unittest.IsolatedAsyncioTestCase):
    async def test_rate_limit(self):
        limiter = gateway.InMemoryRateLimiter()
        principal = gateway.Principal("alice", None, "10.0.0.8", "10.0.0.8")
        await limiter.check(principal, "corp_ocr", 1)
        with self.assertRaises(gateway.GatewayError):
            await limiter.check(principal, "corp_ocr", 1)


class HttpApiTests(unittest.TestCase):
    def setUp(self):
        self.original_backend = gateway.mineru_backend
        self.fake_backend = FakeMinerU()
        gateway.mineru_backend = self.fake_backend
        gateway.limiter = gateway.InMemoryRateLimiter()
        self.client = TestClient(gateway.app)
        self.headers = {
            "X-Corp-User-Id": "alice",
            "X-Corp-Device-Id": "dev-1",
            "X-Corp-Client-IP": "172.16.8.20",
            "X-OpenCode-Session-Id": "session-1",
            "X-OpenCode-Agent": "build",
        }

    def tearDown(self):
        gateway.mineru_backend = self.original_backend
        self.client.close()

    def post_ocr(self, headers=None):
        return self.client.post(
            "/v1/ocr/parse",
            headers=self.headers if headers is None else headers,
            files={"file": ("demo.pdf", b"%PDF-demo", "application/pdf")},
            data={"tier": "standard"},
        )

    def test_success_audit_and_temp_cleanup(self):
        with self.assertLogs("corp_tool_audit", level="INFO") as logs:
            response = self.post_ocr()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["text"], "OCR integration success:standard")
        self.assertIn("X-Request-Id", response.headers)
        self.assertFalse(self.fake_backend.last_path.exists())
        event = logs.output[0].split(":", 2)[2]
        self.assertIn('"user_id": "alice"', event)
        self.assertIn('"end_user_ip": "172.16.8.20"', event)
        self.assertIn('"session_id": "session-1"', event)
        self.assertIn('"outcome": "succeeded"', event)

    def test_missing_identity_is_denied(self):
        response = self.post_ocr(headers={})
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["error"]["code"], "missing_corp_user_identity")

    def test_acl_is_enforced_at_execution_layer(self):
        response = self.client.post(
            "/v1/vision/understand",
            headers={**self.headers, "X-Corp-User-Id": "bob"},
            files={"file": ("demo.png", b"png", "image/png")},
            data={"prompt": "describe"},
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.json()["error"]["code"], "tool_not_allowed")

    def test_backend_failure_is_not_fake_success(self):
        self.fake_backend.fail = True
        with self.assertLogs("corp_tool_audit", level="INFO") as logs:
            response = self.post_ocr()
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.json()["error"]["code"], "mineru_failed")
        self.assertIn('"outcome": "tool_error"', logs.output[0])


if __name__ == "__main__":
    unittest.main()

```

