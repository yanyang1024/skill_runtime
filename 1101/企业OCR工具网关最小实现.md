# 企业 OCR／识图 MCP 工具网关：启发性最小实现

> 目标：OpenCode 统一配置一个远程工具入口；复用企业内部 MinerU OCR／GPU 与 OpenAI 兼容识图服务；记录用户环境变量身份和来源 IP；为后续工具 ACL 与用户级限流保留清晰扩展点。
>
> 验证边界：网关已通过 FastMCP 2.14.7 的 Streamable HTTP 实际调用测试，身份、ACL、限流和 IP 逻辑有自动化测试。协议联调使用 MinerU 后端桩，没有声称已经验证你的真实 GPU 推理服务。

## 1. 这版实现的核心取舍

```text
OpenCode managed config
  └─ 注入 X-Corp-User-Id / X-Corp-Device-Id
       ↓ Streamable HTTP MCP
GatewayMiddleware
  ├─ 环境变量请求头身份：env_header_unverified
  ├─ 来源 IP：peer_ip + 受信代理下的 client_ip
  ├─ 工具 ACL：默认拒绝
  ├─ 用户＋工具滑动窗口限流
  └─ 成功、拒绝、超频、后端错误全部写 JSON 审计
       ↓
mineru_ocr / mineru_vision
       ↓
MinerU CLI 适配器 / OpenAI 兼容 VLM 适配器
```

三个有意保留的边界：

1. **当前环境变量身份只用于审计关联，不是认证。** 日志明确写入 `identity_source=env_header_unverified`。以后用 OIDC 替换 `EnvHeaderIdentityProvider`，工具代码不变。
2. **ACL 在执行层默认拒绝。** 当前没有按用户动态隐藏 `tools/list`；即使未来增加清单过滤，也不能替代执行层校验。
3. **限流是单进程内存实现。** 多副本生产部署必须换成 Redis 等共享存储，否则每个副本都会各算一份额度。

## 2. 文件结构

```text
mineru-mcp-gateway-reference/
├── gateway.py          # 服务、两个工具、中间层、后端适配器
├── policy.json         # 用户工具权限与每分钟频率
├── requirements.txt
├── opencode.json       # 企业机器上的 OpenCode 配置示例
└── test_gateway.py     # 纯逻辑测试
```

## 3. 启动与接入

### 3.1 网关侧

```bash
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# MinerU >=4,<5 单独安装；网关服务器需要能使用你的内部 GPU 解析服务。
mineru server start

export VISION_BASE_URL="http://your-internal-vlm/v1"
export VISION_MODEL="your-real-model-name"
export VISION_API_KEY="optional-internal-key"

# 如果前面有 Nginx／Ingress，只把它的真实 IP 加入受信列表。
export CORP_TRUSTED_PROXY_IPS="10.0.0.2,10.0.0.3"
export PORT=8000
python gateway.py
```

`mineru_ocr` 默认通过当前 MinerU 4.x CLI 执行 `mineru parse <file> --tier <tier> --json`。MinerU 4.x 的 Agent 工作流以 `parse/read` 和分页定位符为核心；旧版 `/file_parse` 不应写死为通用当前接口。若复用已有 MinerU 4.x HTTP 服务，只需把 `MinerUCliBackend` 换成“上传→创建 parse job→轮询→读取结果”的企业 HTTP 适配器。

`mineru_vision` 是另一条调用链：它调用内部 OpenAI 兼容 `/chat/completions`。`mineru-vlm` 只是占位模型名，必须替换为真实部署名。

### 3.2 OpenCode 侧

Linux 可下发到 `/etc/opencode/opencode.json`。用户机器已有的 `CORP_USER_ID` 和 `CORP_DEVICE_ID` 会被配置替换为请求头。

```bash
opencode debug config
opencode mcp list
```

当前示例显式 `oauth: false`，因为这是环境变量身份试点配置。生产需要可信授权、按人配额或私有结果隔离时，应启用企业 OIDC，而不是给环境变量增加“签名格式”但仍让客户端自签。

### 3.3 审计事件示例

```json
{
  "event": "mcp_tool_call",
  "request_id": "7665b128fa164850a629df87fee493c6",
  "tool": "mineru_ocr",
  "outcome": "succeeded",
  "user_id": "alice",
  "device_id": "dev-1",
  "identity_source": "env_header_unverified",
  "peer_ip": "127.0.0.1",
  "client_ip": "127.0.0.1",
  "latency_ms": 26.99,
  "detail": null
}
```

`peer_ip` 是直接连接方；`client_ip` 只有在直接连接方属于 `CORP_TRUSTED_PROXY_IPS` 时才采用 `X-Forwarded-For` 第一项。未受信客户端不能通过伪造该头改写审计 IP。

## 4. 权限和频率策略

默认用户只能调用 OCR，每分钟 5 次；`alice` 可以调用 OCR 与识图，每分钟各 10 次。未出现在允许列表中的工具默认拒绝。

限流键是：

```text
(user_id, tool_name)
```

因此 OCR 与识图分别计数，失败的后端调用也占用调用频率，避免通过失败请求绕过压力控制。以后如果还要做 GPU 成本配额，应另外记录“页数／GPU 毫秒／任务并发”，不要把调用次数当作资源成本本身。

## 5. 适配到生产时优先改的五处

1. **身份**：用 OIDC Provider 替换 `EnvHeaderIdentityProvider`，从 Token 的 `sub` 生成 `Principal.user_id`，并把 `identity_source` 改为 `oidc_verified`。
2. **分布式限流**：用 Redis Lua／令牌桶替换 `InMemoryRateLimiter`，保持中间层接口不变。
3. **大文件与长文档**：Base64 只适合小文件验证。生产改为上传 API＋`document_id`，增加 `submit/status/result` 异步工具，结果分页返回。
4. **已有 MinerU HTTP 服务**：只替换后端适配器，不要把身份、ACL、限流复制进每个工具函数。
5. **审计持久化**：当前 JSON 输出到 stdout，由日志平台采集；不要默认记录 Base64、图片、OCR 全文或 Authorization 头。

## 6. 验证

```bash
python -m unittest -v
python -m py_compile gateway.py
```

当前覆盖：受信／未受信代理 IP、路径清理与 Base64 校验、默认拒绝与用户 ACL 覆盖、频率拒绝。另已通过真实 MCP HTTP 客户端完成工具发现、OCR 调用和审计事件验证。

## 7. 完整源码

### `gateway.py`

```python
"""Minimal enterprise MinerU MCP gateway.

Identity in this reference is intentionally marked env_header_unverified.
It is suitable for audit correlation on managed devices, not authentication.
"""
from __future__ import annotations

import asyncio
import base64
import binascii
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
from fastmcp import FastMCP
from fastmcp.exceptions import ToolError
from fastmcp.server.dependencies import get_http_request
from fastmcp.server.middleware import Middleware, MiddlewareContext
from starlette.requests import Request

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

logging.basicConfig(level=logging.INFO, format="%(message)s")
audit_logger = logging.getLogger("corp_ocr_audit")


@dataclass(frozen=True)
class Principal:
    user_id: str
    device_id: str | None
    peer_ip: str
    client_ip: str
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
        raise ToolError("invalid_x_forwarded_for") from exc


class EnvHeaderIdentityProvider:
    """Replace this class with OIDC verification without changing tool code."""

    def from_request(self, request: Request) -> Principal:
        headers = {key.lower(): value for key, value in request.headers.items()}
        user_id = headers.get("x-corp-user-id", "").strip()
        if not user_id:
            raise ToolError("missing_corp_user_identity")
        peer_ip = request.client.host if request.client else "unknown"
        return Principal(
            user_id=user_id,
            device_id=headers.get("x-corp-device-id") or None,
            peer_ip=peer_ip,
            client_ip=resolve_client_ip(headers, peer_ip),
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
            raise ToolError(f"tool_not_allowed:{tool_name}")
        return rule


class InMemoryRateLimiter:
    """Single-process sliding window. Replace with Redis for multiple replicas."""

    def __init__(self):
        self.events: dict[tuple[str, str], deque[float]] = defaultdict(deque)
        self.lock = asyncio.Lock()

    async def check(self, principal: Principal, tool_name: str, limit: int, window_sec: int = 60):
        if limit <= 0:
            raise ToolError("rate_limit_not_configured")
        key = (principal.user_id, tool_name)
        now = time.monotonic()
        async with self.lock:
            events = self.events[key]
            while events and events[0] <= now - window_sec:
                events.popleft()
            if len(events) >= limit:
                retry_after = max(1, int(window_sec - (now - events[0])) + 1)
                raise ToolError(f"rate_limit_exceeded;retry_after_sec={retry_after}")
            events.append(now)


class MinerUBackend(Protocol):
    async def parse(self, path: Path, tier: str) -> str: ...


class MinerUCliBackend:
    """MinerU >=4,<5 adapter. The CLI may use your internal GPU parse service."""

    def __init__(self):
        self.binary = os.getenv("MINERU_BIN", "mineru")
        self.timeout = int(os.getenv("MINERU_TIMEOUT_SEC", "600"))

    async def parse(self, path: Path, tier: str) -> str:
        env = os.environ.copy()
        env["MINERU_TELEMETRY_DISABLED"] = "1"
        process = await asyncio.create_subprocess_exec(
            self.binary,
            "parse",
            str(path),
            "--tier",
            tier,
            "--json",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )
        try:
            stdout, stderr = await asyncio.wait_for(process.communicate(), self.timeout)
        except TimeoutError as exc:
            process.kill()
            await process.wait()
            raise ToolError("mineru_timeout") from exc
        if process.returncode != 0:
            detail = stderr.decode("utf-8", errors="replace")[-1500:]
            raise ToolError(f"mineru_failed:{detail}")
        try:
            payload = json.loads(stdout)
        except json.JSONDecodeError as exc:
            raise ToolError("mineru_invalid_json_output") from exc
        if payload.get("error"):
            error = payload["error"]
            raise ToolError(f"mineru_{error.get('code', 'error')}:{error.get('message', '')}")
        content = payload.get("content")
        if isinstance(content, dict):
            for key in ("content", "markdown", "text"):
                if isinstance(content.get(key), str):
                    return content[key]
        if isinstance(content, str):
            return content
        if content is None:
            raise ToolError("mineru_parse_pending_use_async_job_contract")
        return json.dumps(content, ensure_ascii=False)


class OpenAIVisionBackend:
    """OpenAI-compatible endpoint for an internal MinerU/VLM inference service."""

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
            raise ToolError(f"vision_backend_http_{response.status_code}:{response.text[-1000:]}")
        try:
            content = response.json()["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError, json.JSONDecodeError) as exc:
            raise ToolError("vision_backend_invalid_response") from exc
        if isinstance(content, str):
            return content
        return json.dumps(content, ensure_ascii=False)


def decode_upload(encoded: str, allowed_suffixes: set[str], filename: str) -> tuple[bytes, str, str]:
    safe_name = Path(filename).name
    suffix = Path(safe_name).suffix.lower()
    if suffix not in allowed_suffixes:
        raise ToolError(f"unsupported_file_type:{suffix}")
    if len(encoded) > (MAX_FILE_BYTES * 4 // 3 + 1024):
        raise ToolError("file_too_large")
    if encoded.startswith("data:"):
        try:
            encoded = encoded.split(",", 1)[1]
        except IndexError as exc:
            raise ToolError("invalid_data_uri") from exc
    try:
        content = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ToolError("invalid_base64") from exc
    if not content or len(content) > MAX_FILE_BYTES:
        raise ToolError("file_empty_or_too_large")
    return content, safe_name, suffix


def bounded_result(text: str) -> dict[str, Any]:
    truncated = len(text) > MAX_RESULT_CHARS
    return {
        "text": text[:MAX_RESULT_CHARS],
        "truncated": truncated,
        "note": "Full-result persistence/pagination is a production extension." if truncated else None,
    }


class GatewayMiddleware(Middleware):
    def __init__(self, identity: EnvHeaderIdentityProvider, policy: FilePolicy, limiter: InMemoryRateLimiter):
        self.identity = identity
        self.policy = policy
        self.limiter = limiter

    def emit(self, request: Request, request_id: str, tool_name: str, outcome: str,
             principal: Principal | None, started: float, detail: str | None = None):
        event = {
            "event": "mcp_tool_call",
            "request_id": request_id,
            "tool": tool_name,
            "outcome": outcome,
            "user_id": principal.user_id if principal else None,
            "device_id": principal.device_id if principal else None,
            "identity_source": principal.identity_source if principal else "missing",
            "peer_ip": principal.peer_ip if principal else (request.client.host if request.client else "unknown"),
            "client_ip": principal.client_ip if principal else None,
            "latency_ms": round((time.perf_counter() - started) * 1000, 2),
            "detail": detail,
        }
        audit_logger.info(json.dumps(event, ensure_ascii=False))

    async def on_call_tool(self, context: MiddlewareContext, call_next):
        request = get_http_request()
        request_id = uuid.uuid4().hex
        tool_name = context.message.name
        started = time.perf_counter()
        principal = None
        try:
            principal = self.identity.from_request(request)
        except Exception as exc:
            self.emit(request, request_id, tool_name, "identity_failed", None, started, str(exc))
            raise
        try:
            rule = self.policy.authorize(principal, tool_name)
        except Exception as exc:
            self.emit(request, request_id, tool_name, "permission_denied", principal, started, str(exc))
            raise
        try:
            await self.limiter.check(principal, tool_name, int(rule["rate_limit_per_minute"]))
        except Exception as exc:
            self.emit(request, request_id, tool_name, "rate_limited", principal, started, str(exc))
            raise
        try:
            result = await call_next(context)
        except Exception as exc:
            self.emit(request, request_id, tool_name, "tool_error", principal, started, type(exc).__name__)
            raise
        self.emit(request, request_id, tool_name, "succeeded", principal, started)
        return result


mcp = FastMCP("corp-mineru-gateway")
mineru_backend = MinerUCliBackend()
vision_backend = OpenAIVisionBackend()
policy = FilePolicy(Path(os.getenv("POLICY_FILE", str(BASE_DIR / "policy.json"))))
mcp.add_middleware(GatewayMiddleware(EnvHeaderIdentityProvider(), policy, InMemoryRateLimiter()))


@mcp.tool()
async def mineru_ocr(file_base64: str, filename: str = "document.pdf", tier: str = "standard") -> dict[str, Any]:
    """Parse a Base64 PDF/image with internal MinerU. Supports flash/basic/standard/advanced tiers."""
    if tier not in {"flash", "basic", "standard", "advanced"}:
        raise ToolError("invalid_mineru_tier")
    content, safe_name, suffix = decode_upload(file_base64, OCR_SUFFIXES, filename)
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(prefix="corp-ocr-", suffix=suffix, delete=False) as temp:
            temp.write(content)
            temp_path = Path(temp.name)
        text = await mineru_backend.parse(temp_path, tier)
        return {"filename": safe_name, **bounded_result(text)}
    finally:
        if temp_path:
            temp_path.unlink(missing_ok=True)


@mcp.tool()
async def mineru_vision(image_base64: str, prompt: str = "Describe the image and extract visible text.", filename: str = "image.png") -> dict[str, Any]:
    """Understand a Base64 PNG/JPEG/WebP image through the internal OpenAI-compatible VLM service."""
    if not prompt.strip() or len(prompt) > 4000:
        raise ToolError("invalid_prompt")
    content, safe_name, suffix = decode_upload(image_base64, VISION_SUFFIXES, filename)
    text = await vision_backend.understand(content, MIME_BY_SUFFIX[suffix], prompt)
    return {"filename": safe_name, **bounded_result(text)}


if __name__ == "__main__":
    mcp.run(
        transport="streamable-http",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "8000")),
        path="/mcp",
    )

```

### `policy.json`

```json
{
  "users": {
    "*": {
      "allow_tools": ["mineru_ocr"],
      "rate_limit_per_minute": 5
    },
    "alice": {
      "allow_tools": ["mineru_ocr", "mineru_vision"],
      "rate_limit_per_minute": 10
    }
  }
}

```

### `requirements.txt`

```text
fastmcp>=2.13,<3
httpx>=0.27,<1

```

### `opencode.json`

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "corp_ocr": {
      "type": "remote",
      "url": "https://ocr-mcp.corp.example.com/mcp",
      "enabled": true,
      "oauth": false,
      "timeout": 120000,
      "headers": {
        "X-Corp-User-Id": "{env:CORP_USER_ID}",
        "X-Corp-Device-Id": "{env:CORP_DEVICE_ID}"
      }
    }
  },
  "permission": {
    "corp_ocr_*": "ask"
  }
}

```

### `test_gateway.py`

```python
import asyncio
import base64
import unittest
from unittest.mock import patch

import gateway
from fastmcp.exceptions import ToolError


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

    def test_base64_and_size_guard(self):
        encoded = base64.b64encode(b"%PDF-demo").decode()
        content, name, suffix = gateway.decode_upload(encoded, gateway.OCR_SUFFIXES, "../a.pdf")
        self.assertEqual(content, b"%PDF-demo")
        self.assertEqual(name, "a.pdf")
        self.assertEqual(suffix, ".pdf")
        with self.assertRaises(ToolError):
            gateway.decode_upload("not-base64", gateway.OCR_SUFFIXES, "a.pdf")

    def test_policy_default_deny_and_user_override(self):
        policy = gateway.FilePolicy(gateway.BASE_DIR / "policy.json")
        principal = gateway.Principal("bob", None, "10.0.0.8", "10.0.0.8")
        self.assertIn("mineru_ocr", policy.rule_for("bob")["allow_tools"])
        with self.assertRaises(ToolError):
            policy.authorize(principal, "mineru_vision")


class RateLimiterTests(unittest.IsolatedAsyncioTestCase):
    async def test_rate_limit(self):
        limiter = gateway.InMemoryRateLimiter()
        principal = gateway.Principal("alice", None, "10.0.0.8", "10.0.0.8")
        await limiter.check(principal, "mineru_ocr", 1)
        with self.assertRaises(ToolError):
            await limiter.check(principal, "mineru_ocr", 1)


if __name__ == "__main__":
    unittest.main()

```

