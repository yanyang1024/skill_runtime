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
