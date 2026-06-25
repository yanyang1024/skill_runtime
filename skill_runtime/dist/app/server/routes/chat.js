import { Router } from "express";
import { createOpencodeSessionClient } from "../../opencode_client/index.js";
import { ensureEventStream, getSSEEmitter, removeSSEEmitter, abortEventStream, } from "../../opencode_client/sse.js";
import { stageOutputDir } from "../../shared/utils/paths.js";
import { getRuntime } from "../stageRuntimeManager.js";
import { validateRunStageParams, getSafeParams, } from "../middleware/validateParams.js";
const router = Router({ mergeParams: true });
router.use(validateRunStageParams());
function getRuntimeForRequest(req) {
    const { runId, stageId, attempt } = getSafeParams(req);
    const serverId = `${runId}-${stageId}-${attempt}`;
    return getRuntime(serverId) ?? null;
}
function gateRuntime(req, res) {
    const runtime = getRuntimeForRequest(req);
    if (!runtime) {
        res.status(404).json({ error: "runtime not running" });
        return null;
    }
    if (runtime.status !== "running" || !runtime.healthy) {
        res.status(503).json({
            error: "runtime not ready",
            status: runtime.status,
            healthy: runtime.healthy,
            detail: runtime.error ?? null,
        });
        return null;
    }
    return runtime;
}
function serverError(res, err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
}
// POST /session -> 创建 session
router.post("/session", async (req, res) => {
    const runtime = gateRuntime(req, res);
    if (!runtime)
        return;
    const { title } = req.body;
    try {
        const client = createOpencodeSessionClient({ baseUrl: runtime.base_url });
        const session = await client.createSession(runtime.workspace_path, typeof title === "string" ? title : "stage session");
        res.json(session);
    }
    catch (err) {
        serverError(res, err);
    }
});
// GET /session/:sessionId -> 获取 session 状态
router.get("/session/:sessionId", async (req, res) => {
    const runtime = gateRuntime(req, res);
    if (!runtime)
        return;
    try {
        const client = createOpencodeSessionClient({ baseUrl: runtime.base_url });
        const session = await client.getSession(runtime.workspace_path, req.params.sessionId);
        res.json(session);
    }
    catch (err) {
        serverError(res, err);
    }
});
// DELETE /session/:sessionId -> 删除 session
router.delete("/session/:sessionId", async (req, res) => {
    const runtime = gateRuntime(req, res);
    if (!runtime)
        return;
    const { runId, stageId, attempt } = getSafeParams(req);
    const sessionId = req.params.sessionId;
    try {
        const client = createOpencodeSessionClient({ baseUrl: runtime.base_url });
        const resp = await client.deleteSession(runtime.workspace_path, sessionId);
        // 清理该 session 的 SSE emitter
        removeSSEEmitter(runId, stageId, attempt, sessionId);
        res.status(resp.status).json({ ok: resp.ok });
    }
    catch (err) {
        serverError(res, err);
    }
});
// POST /session/:sessionId/abort -> abort
router.post("/session/:sessionId/abort", async (req, res) => {
    const runtime = gateRuntime(req, res);
    if (!runtime)
        return;
    const { runId, stageId, attempt } = getSafeParams(req);
    const sessionId = req.params.sessionId;
    try {
        const client = createOpencodeSessionClient({ baseUrl: runtime.base_url });
        const resp = await client.abortSession(runtime.workspace_path, sessionId);
        abortEventStream(runId, stageId, attempt, sessionId);
        res.status(resp.status).json({ ok: resp.ok });
    }
    catch (err) {
        serverError(res, err);
    }
});
// POST /session/:sessionId/message -> 发送 prompt（异步，立即返回）
router.post("/session/:sessionId/message", async (req, res) => {
    const runtime = gateRuntime(req, res);
    if (!runtime)
        return;
    const { parts, agent, model } = req.body;
    const { runId, stageId, attempt } = getSafeParams(req);
    const sessionId = req.params.sessionId;
    try {
        // 跟踪活跃 session，stop 时用于 abort/delete
        runtime.active_session_id = sessionId;
        runtime.abort_event_stream = () => abortEventStream(runId, stageId, attempt, sessionId);
        const client = createOpencodeSessionClient({ baseUrl: runtime.base_url });
        // 先启动后台 SSE 消费，避免错过 prompt_async 触发后的早期事件
        const outputDir = stageOutputDir(runId, stageId, attempt);
        ensureEventStream(runtime.base_url, runtime.workspace_path, outputDir, runId, stageId, attempt, sessionId)
            .catch((err) => console.error("[chat] ensureEventStream failed:", err));
        const resp = await client.sendPromptAsync(runtime.workspace_path, sessionId, {
            parts: Array.isArray(parts) ? parts : [],
            agent,
            model,
        });
        if (![200, 202, 204].includes(resp.status)) {
            const text = await resp.text().catch(() => "");
            throw new Error(`prompt_async failed: ${resp.status} ${text}`);
        }
        res.json({ session_id: sessionId });
    }
    catch (err) {
        serverError(res, err);
    }
});
// GET /session/:sessionId/message?limit= -> 拉取历史消息
router.get("/session/:sessionId/message", async (req, res) => {
    const runtime = gateRuntime(req, res);
    if (!runtime)
        return;
    const rawLimit = req.query.limit;
    const limit = rawLimit && !Number.isNaN(Number(rawLimit)) ? Number(rawLimit) : undefined;
    try {
        const client = createOpencodeSessionClient({ baseUrl: runtime.base_url });
        const messages = await client.getMessages(runtime.workspace_path, req.params.sessionId, limit);
        res.json(messages);
    }
    catch (err) {
        serverError(res, err);
    }
});
// POST /session/:sessionId/question/:questionId -> 回复 question
router.post("/session/:sessionId/question/:questionId", async (req, res) => {
    const runtime = gateRuntime(req, res);
    if (!runtime)
        return;
    try {
        const client = createOpencodeSessionClient({ baseUrl: runtime.base_url });
        const resp = await client.replyQuestion(runtime.workspace_path, req.params.sessionId, req.params.questionId, req.body);
        res.status(resp.status).json({ ok: resp.ok });
    }
    catch (err) {
        serverError(res, err);
    }
});
// POST /session/:sessionId/permission/:permissionId -> 允许/拒绝权限
router.post("/session/:sessionId/permission/:permissionId", async (req, res) => {
    const runtime = gateRuntime(req, res);
    if (!runtime)
        return;
    const { allowed } = req.body;
    try {
        const client = createOpencodeSessionClient({ baseUrl: runtime.base_url });
        const resp = await client.replyPermission(runtime.workspace_path, req.params.sessionId, req.params.permissionId, allowed === true);
        res.status(resp.status).json({ ok: resp.ok });
    }
    catch (err) {
        serverError(res, err);
    }
});
// GET /events?session_id= -> SSE 代理
router.get("/events", async (req, res) => {
    const runtime = gateRuntime(req, res);
    if (!runtime)
        return;
    const sessionId = req.query.session_id;
    if (typeof sessionId !== "string" || sessionId.length === 0) {
        res.status(400).json({ error: "missing session_id query parameter" });
        return;
    }
    const { runId, stageId, attempt } = getSafeParams(req);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
    const emitter = getSSEEmitter(runId, stageId, attempt, sessionId);
    const listener = (event) => {
        if (res.writableEnded)
            return;
        try {
            res.write(`data: ${JSON.stringify(event)}\n\n`);
        }
        catch {
            cleanup();
        }
    };
    emitter.on("event", listener);
    const cleanup = () => {
        emitter.off("event", listener);
    };
    req.on("close", cleanup);
    res.on("close", cleanup);
    // 确保后台正在消费 OpenCode /event 流
    const outputDir = stageOutputDir(runId, stageId, attempt);
    ensureEventStream(runtime.base_url, runtime.workspace_path, outputDir, runId, stageId, attempt, sessionId)
        .catch((err) => console.error("[chat] ensureEventStream failed:", err));
});
export default router;
//# sourceMappingURL=chat.js.map