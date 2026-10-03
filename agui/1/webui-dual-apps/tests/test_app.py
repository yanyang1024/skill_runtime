import asyncio
import copy
import json
from pathlib import Path
import tempfile
import unittest

import httpx

from app.analytics import ROWS, analyze
from app.config import Settings
from app.main import create_app
from app.responses import ProviderError, ResponsesClient, json_text
from app.schemas import FormPatch, Selection, strict_schema
from app.store import Conflict, Store

FORM = {"title": "测试报告", "metric": "tool_failure_rate", "departments": ["研发", "工艺"],
        "date_from": "2026-09-01", "date_to": "2026-09-14"}
SELECTION = {k: v for k, v in FORM.items() if k != "title"}


def function(name, args, call_id):
    return {"type": "function_call", "call_id": call_id, "name": name, "arguments": json_text(args)}


class ScriptedProvider:
    def __init__(self, callback):
        self.callback, self.requests = callback, []

    async def request(self, **kwargs):
        self.requests.append(copy.deepcopy(kwargs))
        return self.callback(len(self.requests), kwargs)

    async def close(self):
        pass


class AppTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.settings = Settings(database_path=str(Path(self.temp.name) / "app.sqlite3"))
        await self.open_app()

    async def open_app(self, settings=None, provider=None):
        self.app = create_app(settings or self.settings, provider)
        self.lifespan = self.app.router.lifespan_context(self.app)
        await self.lifespan.__aenter__()
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="http://test")
        await self.client.get("/api/config")  # Establish the browser cookie before concurrent requests.

    async def close_app(self):
        await self.client.aclose()
        await self.lifespan.__aexit__(None, None, None)

    async def asyncTearDown(self):
        await self.close_app()
        self.temp.cleanup()

    async def task(self, goal="比较研发和工艺的工具失败率"):
        response = await self.client.post("/api/native/tasks", json={"goal": goal})
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    async def terminal(self, task_id):
        for _ in range(160):
            data = (await self.client.get(f"/api/native/tasks/{task_id}")).json()
            if data["status"] not in {"running", "pending"}:
                return data
            await asyncio.sleep(0.02)
        self.fail("task did not reach a terminal/waiting state")

    async def test_pages_and_configuration_have_no_credentials(self):
        for path in ["/adapted", "/native"]:
            response = await self.client.get(path)
            self.assertEqual(response.status_code, 200)
            self.assertIn("用量观察", response.text)
        config = (await self.client.get("/api/config")).json()
        self.assertEqual(config["mode"], "demo")
        self.assertNotIn("api_key", config)
        self.assertTrue(config["dataset"]["synthetic"])

    async def test_manual_analysis_uses_exact_denominator(self):
        response = await self.client.post("/api/adapted/analyze", json=FORM)
        self.assertEqual(response.status_code, 200, response.text)
        row = response.json()["result"]["rows"][0]
        source = [r for r in ROWS if r["department"] == "研发"]
        self.assertEqual(row["tool_calls"], sum(r["tool_calls"] for r in source))
        self.assertEqual(row["value"], round(100 * sum(r["failed_tool_calls"] for r in source) / row["tool_calls"], 2))

    async def test_active_users_are_deduplicated_across_days(self):
        result = analyze(Selection(**(SELECTION | {"metric": "active_users"})))
        expected = len({r["user_id"] for r in ROWS if r["department"] == "研发"})
        self.assertEqual(result["rows"][0]["value"], expected)
        self.assertLess(expected, sum(d["value"] for d in result["daily"]))

    async def test_invalid_ranges_and_empty_departments_are_rejected(self):
        for changes in [{"date_from": "2026-08-01"}, {"date_to": "2026-08-01"}, {"departments": []}, {"metric": "made_up"}, {"departments": ["研发", "研发"]}]:
            response = await self.client.post("/api/adapted/analyze", json=FORM | changes)
            self.assertEqual(response.status_code, 422)
            self.assertEqual(response.json()["error"]["code"], "invalid_input")

    async def test_suggestions_do_not_submit_or_modify_unspecified_fields(self):
        response = await self.client.post("/api/adapted/suggest", json={"instruction": "看研发和工艺9月5日至10日的工具失败率", "current": FORM})
        self.assertEqual(response.status_code, 200, response.text)
        changes = response.json()["changes"]
        self.assertEqual(changes["date_from"], "2026-09-05")
        self.assertEqual(changes["date_to"], "2026-09-10")
        self.assertNotIn("title", changes)
        self.assertEqual((await self.client.get("/api/native/tasks")).json()["tasks"], [])

    async def test_form_explanation_and_export(self):
        response = await self.client.post("/api/adapted/explain", json=FORM)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["mode"], "demo")
        self.assertIn("sample-usage-v1", response.json()["markdown"])
        exported = await self.client.post("/api/adapted/export", json=FORM)
        self.assertEqual(exported.status_code, 200)
        self.assertIn("测试报告", exported.text)

    async def test_invalid_suggested_calendar_date_is_a_user_error(self):
        for instruction in ["看9月0日至10日的工具失败率", "看9月1日至20日的工具失败率"]:
            response = await self.client.post("/api/adapted/suggest", json={"instruction": instruction, "current": FORM})
            self.assertEqual(response.status_code, 422, response.text)

    async def test_vague_goal_waits_for_structured_confirmation(self):
        task = await self.task("帮我看看各部门使用情况")
        task = await self.terminal(task["id"])
        self.assertEqual(task["status"], "waiting_input")
        self.assertIsNone(task["draft"])
        self.assertFalse(any(e["type"] == "statistics" for e in task["events"]))
        rejected = await self.client.post(f"/api/native/tasks/{task['id']}/message", json={"message": "继续"})
        self.assertEqual(rejected.status_code, 422)
        confirmed = await self.client.post(f"/api/native/tasks/{task['id']}/message", json={"message": "确认", "selection": SELECTION})
        self.assertEqual(confirmed.status_code, 200)
        final = await self.terminal(task["id"])
        self.assertEqual(final["status"], "awaiting_review")
        self.assertEqual(final["draft"]["result"]["selection"], SELECTION)

    async def test_proposal_acceptance_is_explicit_and_exportable(self):
        task = await self.terminal((await self.task())["id"])
        self.assertEqual(task["artifact_text"], "")
        self.assertEqual(task["artifact_version"], 0)
        response = await self.client.post(f"/api/native/tasks/{task['id']}/accept", json={"draft_id": task["draft"]["id"]})
        self.assertEqual(response.status_code, 200, response.text)
        accepted = response.json()
        self.assertEqual(accepted["artifact_version"], 1)
        self.assertEqual(accepted["status"], "completed")
        self.assertIsNone(accepted["draft"])
        exported = await self.client.get(f"/api/native/tasks/{task['id']}/export")
        self.assertEqual(exported.text, accepted["artifact_text"])

    async def test_human_edit_invalidates_old_draft_then_reproposal(self):
        task = await self.terminal((await self.task())["id"])
        url = f"/api/native/tasks/{task['id']}"
        saved = await self.client.post(url + "/artifact", json={"text": "# 人工补充\n请优先核查权限错误。", "expected_version": 0})
        self.assertEqual(saved.status_code, 200)
        stale = await self.client.post(url + "/accept", json={"draft_id": task["draft"]["id"]})
        self.assertEqual(stale.status_code, 409)
        self.assertIn("旧版本", stale.json()["error"]["message"])
        await self.client.post(url + "/message", json={"message": "保留人工补充并重新提案"})
        next_task = await self.terminal(task["id"])
        self.assertEqual(next_task["draft"]["base_version"], 1)
        self.assertIn("权限错误", next_task["draft"]["text"])
        self.assertEqual(next_task["artifact_text"], "# 人工补充\n请优先核查权限错误。")

    async def test_two_writes_with_same_version_cannot_both_win(self):
        task = await self.task()
        results = await asyncio.gather(*(self.client.post(f"/api/native/tasks/{task['id']}/artifact", json={"text": f"版本{i}", "expected_version": 0}) for i in [1, 2]))
        self.assertEqual(sorted(r.status_code for r in results), [200, 409])

    async def test_cancel_blocks_late_proposal(self):
        task = await self.task()
        response = await self.client.post(f"/api/native/tasks/{task['id']}/cancel", json={})
        self.assertEqual(response.status_code, 200)
        await asyncio.sleep(0.65)
        final = (await self.client.get(f"/api/native/tasks/{task['id']}")).json()
        self.assertEqual(final["status"], "cancelled")
        self.assertIsNone(final["draft"])
        self.assertFalse(any(e["type"] == "proposal" for e in final["events"]))

    async def test_discard_preserves_current_report(self):
        task = await self.terminal((await self.task())["id"])
        url = f"/api/native/tasks/{task['id']}"
        await self.client.post(url + "/artifact", json={"text": "人工报告", "expected_version": 0})
        response = await self.client.post(url + "/discard", json={})
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json()["draft"])
        self.assertEqual(response.json()["artifact_text"], "人工报告")

    async def test_task_is_scoped_to_browser_session(self):
        task = await self.task()
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url="http://test") as stranger:
            result = await stranger.get(f"/api/native/tasks/{task['id']}")
            self.assertEqual(result.status_code, 404)
            self.assertEqual((await stranger.get("/api/native/tasks")).json()["tasks"], [])

    async def test_cross_origin_mutation_is_rejected(self):
        response = await self.client.post("/api/native/tasks", json={"goal": "test"}, headers={"Origin": "https://unrelated.example"})
        self.assertEqual(response.status_code, 403)

    async def test_live_agent_preserves_all_output_and_tool_results(self):
        await self.close_app()
        def callback(round_no, request):
            if round_no == 1:
                return {"output": [{"type": "reasoning", "id": "rs_fixture", "summary": []}, function("describe_dataset", {}, "call_scope")]}
            if round_no == 2:
                return {"output": [function("analyze_usage", SELECTION, "call_stats")]}
            stats = json.loads([item for item in request["inputs"] if item.get("type") == "function_call_output"][-1]["output"])
            return {"output": [function("propose_report", {"stats_id": stats["stats_id"], "title": "真实路径模拟", "summary": "基于统计核查失败日志。", "recommendations": ["检查错误类别。"]}, "call_draft")]}
        provider = ScriptedProvider(callback)
        live = Settings(api_key="test-key-not-real", mode="live", database_path=self.settings.database_path)
        await self.open_app(live, provider)
        task = await self.terminal((await self.task())["id"])
        self.assertEqual(task["status"], "awaiting_review")
        self.assertEqual(len(provider.requests), 3)
        second_input = provider.requests[1]["inputs"]
        self.assertTrue(any(i.get("id") == "rs_fixture" for i in second_input))
        self.assertTrue(any(i.get("call_id") == "call_scope" and i.get("type") == "function_call_output" for i in second_input))
        self.assertEqual(task["draft"]["result"]["rows"], analyze(Selection(**SELECTION))["rows"])

    async def test_unknown_tools_are_bounded_and_cannot_create_report(self):
        await self.close_app()
        provider = ScriptedProvider(lambda n, _: {"output": [function("run_shell", {"command": "whoami"}, f"c{n}")]})
        live = Settings(api_key="test-key", mode="live", max_rounds=2, database_path=self.settings.database_path)
        await self.open_app(live, provider)
        task = await self.terminal((await self.task())["id"])
        self.assertEqual(task["status"], "failed")
        self.assertEqual(task["error"]["code"], "agent_budget")
        self.assertIsNone(task["draft"])
        self.assertEqual(len(provider.requests), 2)

    async def test_agent_cannot_propose_with_fabricated_statistics_id(self):
        await self.close_app()
        provider = ScriptedProvider(lambda n, _: {"output": [function("propose_report", {"stats_id": "invented", "title": "假的", "summary": "没有统计", "recommendations": ["test"]}, f"c{n}")]})
        live = Settings(api_key="test-key", mode="live", max_rounds=1, database_path=self.settings.database_path)
        await self.open_app(live, provider)
        task = await self.terminal((await self.task())["id"])
        self.assertEqual(task["status"], "failed")
        self.assertIsNone(task["draft"])

    async def test_live_auth_failure_does_not_fall_back_to_demo(self):
        await self.close_app()
        live = Settings(api_key="SECRET_TEST_KEY", mode="live", database_path=self.settings.database_path)
        provider = ResponsesClient(live, transport=httpx.MockTransport(lambda _: httpx.Response(401, json={"error": "SECRET_TEST_KEY"})))
        await self.open_app(live, provider)
        config = (await self.client.get("/api/config")).json()
        self.assertEqual(config["mode"], "live")
        self.assertNotIn("SECRET_TEST_KEY", json_text(config))
        form = await self.client.post("/api/adapted/suggest", json={"instruction": "看会话数", "current": FORM})
        self.assertEqual(form.status_code, 502)
        self.assertEqual(form.json()["error"]["code"], "llm_http_401")
        task = await self.terminal((await self.task())["id"])
        self.assertEqual(task["status"], "failed")
        self.assertEqual(task["error"]["code"], "llm_http_401")
        self.assertIsNone(task["draft"])
        self.assertNotIn("SECRET_TEST_KEY", json_text(task))


class ContractTests(unittest.IsolatedAsyncioTestCase):
    async def test_responses_structured_payload_uses_text_format(self):
        captured = []
        def responder(request):
            captured.append(json.loads(request.content))
            patch = {"title": None, "metric": "sessions", "departments": None,
                     "date_from": None, "date_to": None, "explanation": "只改指标"}
            return httpx.Response(200, json={"status": "completed", "output": [{"type": "message", "content": [{"type": "output_text", "text": json_text(patch)}]}]})
        client = ResponsesClient(Settings(api_key="hidden-test-key"), transport=httpx.MockTransport(responder))
        try:
            patch = await client.structured(instructions="test", inputs=[{"role": "user", "content": "test"}], output_model=FormPatch)
            self.assertEqual(patch.metric, "sessions")
            body = captured[0]
            self.assertFalse(body["store"])
            self.assertNotIn("response_format", body)
            self.assertEqual(body["text"]["format"]["type"], "json_schema")
            schema = body["text"]["format"]["schema"]
            self.assertEqual(set(schema["required"]), set(schema["properties"]))
            self.assertFalse(schema["additionalProperties"])
        finally:
            await client.close()

    async def test_responses_tools_are_flattened_and_sequential(self):
        captured = []
        def responder(request):
            captured.append(json.loads(request.content))
            self.assertEqual(str(request.url), "https://api.openai.com/v1/responses")
            return httpx.Response(200, json={"output": [function("describe_dataset", {}, "c1")]})
        from app.runtime import tools_contract
        client = ResponsesClient(Settings(api_key="test-key"), transport=httpx.MockTransport(responder))
        try:
            await client.request(instructions="test", inputs=[], tools=tools_contract())
            body = captured[0]
            self.assertFalse(body["parallel_tool_calls"])
            self.assertIn("name", body["tools"][0])
            self.assertNotIn("function", body["tools"][0])
        finally:
            await client.close()

    async def test_provider_errors_do_not_leak_response_body(self):
        for status in [400, 401, 429, 500]:
            client = ResponsesClient(Settings(api_key="SECRET_TOKEN"), transport=httpx.MockTransport(lambda _: httpx.Response(status, json={"error": "SECRET_TOKEN"})))
            try:
                with self.assertRaises(ProviderError) as error:
                    await client.request(instructions="test", inputs=[])
                self.assertNotIn("SECRET_TOKEN", str(error.exception))
            finally:
                await client.close()

    async def test_incomplete_and_refusal_are_not_accepted_as_success(self):
        fixtures = [{"status": "incomplete", "output": []}, {"output": [{"type": "message", "content": [{"type": "refusal", "refusal": "no"}]}]}]
        for data in fixtures:
            client = ResponsesClient(Settings(), transport=httpx.MockTransport(lambda _: httpx.Response(200, json=data)))
            try:
                with self.assertRaises(ProviderError):
                    await client.request(instructions="test", inputs=[])
            finally:
                await client.close()

    async def test_restart_marks_active_task_interrupted_and_keeps_report(self):
        with tempfile.TemporaryDirectory() as temp:
            store = Store(Path(temp) / "db.sqlite3")
            task = store.create("owner", "goal")
            store.save_artifact(task["id"], "保留报告", 0)
            store.update(task["id"], status="running", run_id="r1")
            Store(Path(temp) / "db.sqlite3").recover()
            loaded = store.get(task["id"])
            self.assertEqual(loaded["status"], "interrupted")
            self.assertEqual(loaded["artifact_text"], "保留报告")


if __name__ == "__main__":
    unittest.main()
