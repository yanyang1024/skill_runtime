from contextlib import asynccontextmanager
from pathlib import Path
import re
import secrets
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError

from .analytics import analyze, demo_explanation, describe_dataset, parse_demo_intent, report_markdown
from .config import ROOT, Settings
from .responses import ProviderError, ResponsesClient, json_text
from .runtime import AgentEngine
from .schemas import (AcceptDraftRequest, Explanation, FollowupRequest, FormPatch, FormValues,
                      GoalRequest, SaveArtifactRequest, SuggestRequest)
from .store import Conflict, Store


def create_app(settings=None, provider=None):
    settings = settings or Settings.from_env()
    store = Store(settings.database_path)
    provider = provider or ResponsesClient(settings)
    engine = AgentEngine(store, provider, settings)

    @asynccontextmanager
    async def lifespan(app):
        store.recover()
        yield
        await engine.shutdown()
        await provider.close()

    app = FastAPI(title="用量观察 · Two Web UI Patterns", lifespan=lifespan)
    app.state.store, app.state.engine, app.state.provider = store, engine, provider

    @app.middleware("http")
    async def browser_session(request: Request, call_next):
        origin = request.headers.get("origin")
        if request.method in {"POST", "PUT", "PATCH", "DELETE"} and origin:
            if urlparse(origin).netloc != request.headers.get("host"):
                return JSONResponse({"error": {"code": "origin_mismatch", "message": "此操作只接受同源请求。"}}, status_code=403)
        cookie = request.cookies.get("webui_owner", "")
        new_cookie = not bool(re.fullmatch(r"[a-zA-Z0-9_-]{40,64}", cookie))
        request.state.owner = secrets.token_urlsafe(32) if new_cookie else cookie
        response = await call_next(request)
        if new_cookie:
            response.set_cookie("webui_owner", request.state.owner, httponly=True, samesite="lax", max_age=86400 * 30)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "same-origin"
        response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'"
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.exception_handler(RequestValidationError)
    async def validation_error(request, exc):
        return JSONResponse({"error": {"code": "invalid_input", "message": "请检查输入字段。",
            "fields": [{"field": ".".join(str(x) for x in e["loc"][1:]), "message": e["msg"]} for e in exc.errors()]}}, status_code=422)

    @app.exception_handler(ProviderError)
    async def provider_error(request, exc):
        return JSONResponse({"error": {"code": exc.code, "message": exc.message}}, status_code=502)

    @app.exception_handler(Conflict)
    async def conflict_error(request, exc):
        return JSONResponse({"error": {"code": "state_conflict", "message": str(exc)}}, status_code=409)

    @app.exception_handler(HTTPException)
    async def http_error(request, exc):
        return JSONResponse({"error": {"code": "request_error", "message": str(exc.detail)}}, status_code=exc.status_code)

    def owned(request, task_id):
        task = store.get(task_id, request.state.owner)
        if not task:
            raise HTTPException(404, "任务不存在或不属于此浏览器会话。")
        return task

    @app.get("/")
    async def index():
        return RedirectResponse("/adapted", status_code=302)

    @app.get("/adapted")
    async def adapted_page():
        return FileResponse(ROOT / "static" / "adapted.html")

    @app.get("/native")
    async def native_page():
        return FileResponse(ROOT / "static" / "native.html")

    @app.get("/api/config")
    async def configuration():
        return {"mode": "live" if settings.live else "demo", "model": settings.model if settings.live else None,
                "dataset": describe_dataset(), "max_rounds": settings.max_rounds}

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    @app.post("/api/adapted/suggest")
    async def suggest(body: SuggestRequest):
        if not body.instruction.strip():
            raise HTTPException(422, "请描述需要修改的字段。")
        if settings.live:
            patch = await provider.structured(output_model=FormPatch,
                instructions="你是传统表单的填写助手。只提议用户明确要求修改的字段，其余字段返回 null。不要提交或执行分析。日期仅限样例范围；无法解释的要求用 explanation 说明且不要猜测。输出中的 explanation 简明说明建议。",
                inputs=[{"role": "user", "content": json_text({"instruction": body.instruction,
                    "current_form": body.current.model_dump(mode="json"), "dataset": describe_dataset()})}])
        else:
            values = {"title": None, "metric": None, "departments": None, "date_from": None, "date_to": None}
            values.update(parse_demo_intent(body.instruction))
            try:
                patch = FormPatch(**values, explanation="演示规则识别了这些字段；未识别的字段保持原值。请检查后应用建议。" if any(v is not None for v in values.values()) else "演示模式未识别到字段。可尝试：看研发和工艺9月5日至10日的工具失败率。")
            except ValidationError:
                raise HTTPException(422, "未能识别有效日期。请使用样例范围内的具体日期。")
        changes = {k: v for k, v in patch.model_dump(mode="json").items() if k != "explanation" and v is not None}
        try:
            FormValues.model_validate(body.current.model_dump(mode="json") | changes)
        except ValidationError:
            raise HTTPException(422, "建议字段不符合当前表单约束。请调整日期或部门后重新生成。")
        return {"changes": changes, "explanation": patch.explanation, "mode": "live" if settings.live else "demo"}

    @app.post("/api/adapted/analyze")
    async def manual_analysis(body: FormValues):
        return {"title": body.title, "result": analyze(body)}

    @app.post("/api/adapted/explain")
    async def explain(body: FormValues):
        result = analyze(body)  # Never trust browser-supplied statistics.
        if settings.live:
            explanation = await provider.structured(output_model=Explanation,
                instructions="解释服务器计算的使用统计，给出2至3条可验证建议。不要重新计算或更改数值，不推断原因，不作绩效判断。样例数据为合成数据。notes 写清数据局限。",
                inputs=[{"role": "user", "content": json_text(result)}])
            content = explanation.model_dump()
        else:
            content = demo_explanation(result)
        return content | {"mode": "live" if settings.live else "demo",
                          "markdown": report_markdown(body.title, content["summary"], content["recommendations"], result)}

    @app.post("/api/adapted/export")
    async def export_form(body: FormValues):
        result = analyze(body)
        text = report_markdown(body.title, "统计结果由服务器计算，解读可由人工补充。", ["结合日志进一步验证。"], result)
        return Response(text, media_type="text/markdown; charset=utf-8", headers={"Content-Disposition": 'attachment; filename="usage-analysis.md"'})

    @app.get("/api/native/tasks")
    async def list_tasks(request: Request):
        return {"tasks": store.list(request.state.owner)}

    @app.post("/api/native/tasks", status_code=201)
    async def create_task(body: GoalRequest, request: Request):
        if not body.goal.strip():
            raise HTTPException(422, "请先描述目标。")
        if sum(t["status"] == "running" for t in store.list(request.state.owner)) >= 3:
            raise Conflict("同时执行的任务已达上限，请先完成或取消一个任务。")
        task = store.create(request.state.owner, body.goal.strip())
        task = engine.start(task["id"], body.goal.strip())
        return store.public(task)

    @app.get("/api/native/tasks/{task_id}")
    async def get_task(task_id: str, request: Request):
        return store.public(owned(request, task_id))

    @app.post("/api/native/tasks/{task_id}/message")
    async def follow_up(task_id: str, body: FollowupRequest, request: Request):
        task = owned(request, task_id)
        if task["status"] == "running":
            raise Conflict("任务正在执行，请先取消再修改条件。")
        if task["status"] == "waiting_input" and body.selection is None:
            raise HTTPException(422, "请使用条件卡确认分析范围后继续。")
        if not body.message.strip():
            raise HTTPException(422, "请填写后续要求。")
        selection = body.selection.model_dump(mode="json") if body.selection else None
        return store.public(engine.start(task_id, body.message.strip(), selection))

    @app.post("/api/native/tasks/{task_id}/cancel")
    async def cancel_task(task_id: str, request: Request):
        owned(request, task_id)
        engine.cancel(task_id)
        return store.public(store.get(task_id))

    @app.post("/api/native/tasks/{task_id}/artifact")
    async def save_artifact(task_id: str, body: SaveArtifactRequest, request: Request):
        task = owned(request, task_id)
        if not body.text.strip():
            raise HTTPException(422, "报告内容不能为空。")
        task = store.save_artifact(task_id, body.text, body.expected_version)
        store.event(task_id, task["run_id"], "human_edit", f"人工编辑已保存为 v{task['artifact_version']}。")
        return store.public(task)

    @app.post("/api/native/tasks/{task_id}/accept")
    async def accept_draft(task_id: str, body: AcceptDraftRequest, request: Request):
        owned(request, task_id)
        task = store.accept(task_id, body.draft_id)
        store.event(task_id, task["run_id"], "accepted", f"草稿已采纳为当前报告 v{task['artifact_version']}。")
        return store.public(task)

    @app.post("/api/native/tasks/{task_id}/discard")
    async def discard_draft(task_id: str, request: Request):
        task = owned(request, task_id)
        if task["status"] != "awaiting_review":
            raise Conflict("当前没有可丢弃的草稿。")
        store.update(task_id, only_run=task["run_id"], only_status="awaiting_review", status="ready", draft=None)
        store.event(task_id, task["run_id"], "discarded", "草稿已丢弃，当前报告已保留。")
        return store.public(store.get(task_id))

    @app.get("/api/native/tasks/{task_id}/export")
    async def export_artifact(task_id: str, request: Request):
        task = owned(request, task_id)
        if not task["artifact_text"]:
            raise HTTPException(409, "请先采纳草稿或保存报告。")
        return Response(task["artifact_text"], media_type="text/markdown; charset=utf-8",
                        headers={"Content-Disposition": f'attachment; filename="report-{task_id[:8]}-v{task["artifact_version"]}.md"'})

    app.mount("/static", StaticFiles(directory=ROOT / "static"), name="static")
    return app
