import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { recommendPrompt } from "../../prompt_recommender/recommender.js";
import { startStageRuntime, stopStageRuntime, getRuntime, listRuntimes, } from "../stageRuntimeManager.js";
import { loadStageState, updateStageState } from "../../orchestration/stateMachine.js";
import { loadRunState } from "../../orchestration/stateMachine.js";
import { refreshStageOutputs, initStage } from "../../orchestration/runLifecycle.js";
import { getStageContract } from "../../orchestration/stageContracts.js";
import { syncWorkToPreview } from "../../workspace_builder/builder.js";
import { runApiTests } from "../../api_test_runner/runner.js";
import { stageDir, stageOutputDir } from "../../shared/utils/paths.js";
import { utcTimestamp } from "../../shared/utils/time.js";
const router = Router();
router.post("/:runId/stage/:stageId/start", async (req, res) => {
    const { runId, stageId } = req.params;
    const { attempt, previous_stage_id, previous_attempt, session_log_path, api_docs_available, } = req.body;
    try {
        const run = await loadRunState(runId);
        if (!run) {
            res.status(404).json({ error: "run not found" });
            return;
        }
        const runtime = await startStageRuntime({
            run_id: runId,
            stage_id: stageId,
            skill_id: run.skill_id,
            preview_id: run.preview_id,
            attempt,
            previous_stage_id,
            previous_attempt,
            sessionLogPath: session_log_path,
            apiDocsAvailable: api_docs_available,
        });
        res.json({
            server_id: runtime.server_id,
            stage_id: runtime.stage_id,
            port: runtime.port,
            open_url: runtime.open_url,
            proxy_url: runtime.proxy_url,
            status: runtime.status,
        });
    }
    catch (err) {
        res.status(500).json({ error: String(err) });
    }
});
router.post("/:runId/stage/:stageId/stop", async (req, res) => {
    const { runId, stageId } = req.params;
    const { attempt = 1 } = req.body;
    const serverId = `${runId}-${stageId}-${attempt}`;
    try {
        const runtime = getRuntime(serverId);
        // Cancel the SSE reader first so we don't wait for a long timeout
        runtime?.abort_event_stream?.();
        if (runtime?.active_session_id) {
            const username = process.env.OPENCODE_SERVER_USERNAME ?? "opencode";
            const password = process.env.OPENCODE_SERVER_PASSWORD ?? "skillgrowth";
            const auth = Buffer.from(`${username}:${password}`).toString("base64");
            const sessionUrl = `${runtime.base_url}/session/${runtime.active_session_id}`;
            // Abort any in-flight inference before killing the process
            await fetch(`${sessionUrl}/abort`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    authorization: `Basic ${auth}`,
                },
                body: JSON.stringify({}),
            }).catch(() => null);
            // Clean up the session so it does not accumulate in the runtime
            await fetch(sessionUrl, {
                method: "DELETE",
                headers: { authorization: `Basic ${auth}` },
            }).catch(() => null);
        }
        const result = await stopStageRuntime(serverId);
        if (result.stopped) {
            const graceful = result.exit_code === 0 ||
                (result.exit_code === null && result.exit_signal === "SIGTERM");
            const nextStatus = graceful ? "completed" : "failed";
            const contract = getStageContract(stageId);
            if (graceful && contract.skill_mount === "preview-writable") {
                const run = await loadRunState(runId);
                if (run?.preview_id) {
                    await syncWorkToPreview(run.skill_id, runId, stageId, attempt, run.preview_id);
                }
            }
            await updateStageState(runId, stageId, attempt, {
                status: nextStatus,
            });
            await refreshStageOutputs(runId, stageId, attempt);
            res.json({
                ok: true,
                status: nextStatus,
                exit_code: result.exit_code,
                exit_signal: result.exit_signal,
            });
        }
        else {
            res.json({ ok: false, error: "runtime not found" });
        }
    }
    catch (err) {
        res.status(500).json({ error: String(err) });
    }
});
router.post("/:runId/stage/:stageId/commit", async (req, res) => {
    const { runId, stageId } = req.params;
    const { attempt = 1 } = req.body;
    try {
        const run = await loadRunState(runId);
        if (!run) {
            res.status(404).json({ error: "run not found" });
            return;
        }
        if (!run.preview_id) {
            res.status(400).json({ error: "run has no preview_id" });
            return;
        }
        const contract = getStageContract(stageId);
        if (contract.skill_mount !== "preview-writable") {
            res.status(400).json({ error: "stage does not write to preview" });
            return;
        }
        let stageState = await loadStageState(runId, stageId, attempt);
        if (!stageState) {
            const { stageState: created } = await initStage({
                run_id: runId,
                stage_id: stageId,
                attempt,
            });
            stageState = created;
        }
        await syncWorkToPreview(run.skill_id, runId, stageId, attempt, run.preview_id);
        await refreshStageOutputs(runId, stageId, attempt);
        res.json({ ok: true, preview_id: run.preview_id });
    }
    catch (err) {
        res.status(500).json({ error: String(err) });
    }
});
router.post("/:runId/stage/:stageId/run-api-tests", async (req, res) => {
    const { runId, stageId } = req.params;
    const { attempt = 1 } = req.body;
    try {
        const results = await runApiTests(runId, stageId, Number(attempt));
        res.json({ ok: true, results });
    }
    catch (err) {
        res.status(500).json({ error: String(err) });
    }
});
router.post("/:runId/stage/:stageId/retry", async (req, res) => {
    const { runId, stageId } = req.params;
    try {
        const run = await loadRunState(runId);
        if (!run) {
            res.status(404).json({ error: "run not found" });
            return;
        }
        const { findNextAttempt } = await import("../../orchestration/runLifecycle.js");
        const nextAttempt = await findNextAttempt(runId, stageId);
        const runtime = await startStageRuntime({
            run_id: runId,
            stage_id: stageId,
            skill_id: run.skill_id,
            preview_id: run.preview_id,
            attempt: nextAttempt,
        });
        res.json({
            server_id: runtime.server_id,
            attempt: nextAttempt,
            open_url: runtime.open_url,
        });
    }
    catch (err) {
        res.status(500).json({ error: String(err) });
    }
});
router.get("/:runId/stage/:stageId/state", async (req, res) => {
    const { runId, stageId } = req.params;
    const { attempt = 1 } = req.query;
    try {
        const state = await loadStageState(runId, stageId, Number(attempt));
        if (!state) {
            res.status(404).json({ error: "stage state not found" });
            return;
        }
        res.json(state);
    }
    catch (err) {
        res.status(500).json({ error: String(err) });
    }
});
router.get("/:runId/stage/:stageId/open", async (req, res) => {
    const { runId, stageId } = req.params;
    const { attempt = 1 } = req.query;
    const serverId = `${runId}-${stageId}-${attempt}`;
    const runtime = getRuntime(serverId);
    if (!runtime) {
        res.status(404).json({ error: "runtime not running" });
        return;
    }
    const username = process.env.OPENCODE_SERVER_USERNAME ?? "opencode";
    const password = process.env.OPENCODE_SERVER_PASSWORD ?? "skillgrowth";
    const authToken = Buffer.from(`${username}:${password}`).toString("base64url");
    const separator = runtime.open_url.includes("?") ? "&" : "?";
    res.json({
        open_url: runtime.open_url,
        open_url_with_auth: `${runtime.open_url}${separator}auth_token=${authToken}`,
    });
});
function validateFileParts(parts, workspacePath) {
    for (const part of parts) {
        const p = part;
        if (p.type !== "file")
            continue;
        const mime = p.mime;
        const url = p.url;
        if (typeof mime !== "string" || mime.length === 0) {
            throw new Error("file part missing mime");
        }
        if (typeof url !== "string" || !url.startsWith("file://")) {
            throw new Error("file part url must use file:// scheme");
        }
        const filePath = path.resolve(decodeURIComponent(url.slice("file://".length)));
        const resolvedWorkspace = path.resolve(workspacePath);
        if (!filePath.startsWith(resolvedWorkspace + path.sep) && filePath !== resolvedWorkspace) {
            throw new Error(`file attachment outside workspace: ${url}`);
        }
    }
}
async function proxyToRuntime(req, res, runtime, pathSuffix) {
    const targetUrl = `${runtime.base_url}${pathSuffix}`;
    const username = process.env.OPENCODE_SERVER_USERNAME ?? "opencode";
    const password = process.env.OPENCODE_SERVER_PASSWORD ?? "skillgrowth";
    const auth = Buffer.from(`${username}:${password}`).toString("base64");
    try {
        const headers = new Headers();
        for (const [key, value] of Object.entries(req.headers)) {
            if (value === undefined || value === null)
                continue;
            const lower = key.toLowerCase();
            if (["host", "connection", "content-length", "content-encoding"].includes(lower))
                continue;
            headers.set(key, Array.isArray(value) ? value.join(", ") : String(value));
        }
        headers.set("host", `127.0.0.1:${runtime.port}`);
        headers.set("authorization", `Basic ${auth}`);
        let body;
        if (req.method !== "GET" && req.method !== "HEAD") {
            const contentType = headers.get("content-type") ?? "";
            if (contentType.includes("application/json")) {
                body = JSON.stringify(req.body);
            }
            else if (req.body !== undefined && typeof req.body === "string") {
                body = req.body;
            }
        }
        const response = await fetch(targetUrl, {
            method: req.method,
            headers,
            body,
        });
        response.headers.forEach((value, key) => {
            if (key === "x-frame-options" || key === "content-security-policy")
                return;
            res.setHeader(key, value);
        });
        res.status(response.status);
        const responseBody = await response.arrayBuffer();
        res.send(Buffer.from(responseBody));
    }
    catch (err) {
        res.status(502).json({ error: String(err) });
    }
}
router.all("/:runId/stage/:stageId/view/*", async (req, res) => {
    if (process.env.STAGE_ENABLE_PROXY !== "1") {
        res.status(410).json({
            error: "OpenCode Web UI reverse proxy is disabled by default. Use open_url_with_auth to open the runtime in a new tab, or set STAGE_ENABLE_PROXY=1 to enable the experimental proxy.",
        });
        return;
    }
    const { runId, stageId } = req.params;
    const { attempt = 1 } = req.query;
    const serverId = `${runId}-${stageId}-${attempt}`;
    const runtime = getRuntime(serverId);
    if (!runtime) {
        res.status(404).json({ error: "runtime not running" });
        return;
    }
    const wildcard = req.params["0"] ?? "";
    const suffix = wildcard ? `/${wildcard}${req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : ""}` : "/";
    await proxyToRuntime(req, res, runtime, suffix);
});
router.post("/:runId/stage/:stageId/message", async (req, res) => {
    const { runId, stageId } = req.params;
    const { attempt = 1, parts, session_id, agent, model } = req.body;
    const serverId = `${runId}-${stageId}-${attempt}`;
    const runtime = getRuntime(serverId);
    if (!runtime) {
        res.status(404).json({ error: "runtime not running" });
        return;
    }
    const username = process.env.OPENCODE_SERVER_USERNAME ?? "opencode";
    const password = process.env.OPENCODE_SERVER_PASSWORD ?? "skillgrowth";
    const auth = Buffer.from(`${username}:${password}`).toString("base64");
    try {
        // Validate file attachments: must be inside the stage workspace
        if (Array.isArray(parts)) {
            validateFileParts(parts, runtime.workspace_path);
        }
        let sessionId = session_id;
        if (!sessionId) {
            const createResp = await fetch(`${runtime.base_url}/session`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    authorization: `Basic ${auth}`,
                },
                body: JSON.stringify({ title: `${stageId} session` }),
            });
            if (!createResp.ok) {
                throw new Error(`create session failed: ${createResp.status}`);
            }
            const createData = (await createResp.json());
            sessionId = createData.id;
        }
        // Track active session for graceful stop/abort
        runtime.active_session_id = sessionId;
        // Start listening to the SSE event stream before sending the prompt so we
        // don't miss early events. The stream is written to stage output for later
        // inspection and is used to detect session.idle as a fallback to polling.
        const streamPath = path.join(stageOutputDir(runId, stageId, Number(attempt)), "session-stream.md");
        const eventStreamController = new AbortController();
        runtime.abort_event_stream = () => eventStreamController.abort();
        const streamPromise = streamEventsToFile({
            baseUrl: runtime.base_url,
            auth,
            sessionId,
            outputPath: streamPath,
            signal: eventStreamController.signal,
        }).catch((err) => console.error("event stream error:", err));
        // Use async prompt to avoid blocking the HTTP request for long-running agent work
        const asyncResp = await fetch(`${runtime.base_url}/session/${sessionId}/prompt_async`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                authorization: `Basic ${auth}`,
            },
            body: JSON.stringify({ parts, agent, model }),
        });
        if (![200, 202, 204].includes(asyncResp.status)) {
            throw new Error(`prompt_async failed: ${asyncResp.status}`);
        }
        // Poll session status until idle (or timeout). This mirrors the official
        // async + SSE pattern while keeping the implementation simple.
        const maxWaitMs = 300_000;
        const pollIntervalMs = 1_000;
        const start = Date.now();
        let sessionStatus = "busy";
        while (sessionStatus === "busy" && Date.now() - start < maxWaitMs) {
            await new Promise((r) => setTimeout(r, pollIntervalMs));
            const statusResp = await fetch(`${runtime.base_url}/session/${sessionId}`, {
                headers: { authorization: `Basic ${auth}` },
            });
            if (statusResp.ok) {
                const statusData = (await statusResp.json());
                sessionStatus = statusData.status ?? "idle";
            }
        }
        // Fetch latest messages for the caller
        const messagesResp = await fetch(`${runtime.base_url}/session/${sessionId}/message?limit=10`, {
            headers: { authorization: `Basic ${auth}` },
        });
        const messages = messagesResp.ok ? (await messagesResp.json()) : [];
        // Wait for the event stream to finish writing (session.idle or timeout)
        await streamPromise;
        // Refresh outputs after message
        await refreshStageOutputs(runId, stageId, Number(attempt));
        res.json({ session_id: sessionId, status: sessionStatus, messages });
    }
    catch (err) {
        res.status(500).json({ error: String(err) });
    }
});
router.post("/:runId/stage/:stageId/director-review", async (req, res) => {
    const { runId, stageId } = req.params;
    const { attempt = 1, content } = req.body;
    try {
        const run = await loadRunState(runId);
        if (!run) {
            res.status(404).json({ error: "run not found" });
            return;
        }
        const outDir = path.join(stageDir(runId, stageId, Number(attempt)), "output");
        await fs.mkdir(outDir, { recursive: true });
        const reviewPath = path.join(outDir, "director-review.md");
        await fs.writeFile(reviewPath, `# Director Review\n\n## Stage\n${stageId}\n\n## Run\n${runId}\n\n## Content\n${content}\n\n## Created At\n${utcTimestamp()}\n`, "utf-8");
        await refreshStageOutputs(runId, stageId, Number(attempt));
        res.json({ ok: true, path: reviewPath });
    }
    catch (err) {
        res.status(500).json({ error: String(err) });
    }
});
router.post("/:runId/stage/:stageId/recommend-prompt", async (req, res) => {
    const { runId, stageId } = req.params;
    const { server_id, recent_output_summary, director_review, goal } = req.body;
    try {
        const recommendation = await recommendPrompt({
            stage_id: stageId,
            run_id: runId,
            server_id: server_id ?? `${runId}-${stageId}-1`,
            recent_output_summary,
            director_review,
            goal,
        });
        res.json(recommendation);
    }
    catch (err) {
        res.status(500).json({ error: String(err) });
    }
});
router.get("/", (_req, res) => {
    res.json(listRuntimes());
});
async function streamEventsToFile(opts) {
    const resp = await fetch(`${opts.baseUrl}/event`, {
        headers: {
            authorization: `Basic ${opts.auth}`,
            Accept: "text/event-stream",
        },
        signal: opts.signal,
    });
    if (!resp.ok) {
        throw new Error(`event stream failed: ${resp.status}`);
    }
    if (!resp.body) {
        throw new Error("event stream has no body");
    }
    await fs.mkdir(path.dirname(opts.outputPath), { recursive: true });
    // Raw event log for debugging
    const rawFile = await fs.open(opts.outputPath, "w");
    await rawFile.writeFile(`# Event Stream for session ${opts.sessionId}\n\n`);
    // Human-readable reasoning / content streams
    const reasoningPath = opts.outputPath.replace("session-stream.md", "session-stream-reasoning.md");
    const contentPath = opts.outputPath.replace("session-stream.md", "session-stream-content.md");
    const partTypes = new Map();
    const pendingDeltas = new Map();
    async function appendToStream(type, text) {
        const target = type === "reasoning" ? reasoningPath : contentPath;
        await fs.appendFile(target, text);
    }
    async function flushPending(partId, type) {
        const deltas = pendingDeltas.get(partId);
        if (!deltas)
            return;
        for (const d of deltas)
            await appendToStream(type, d);
        pendingDeltas.delete(partId);
    }
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let idle = false;
    const start = Date.now();
    const timeout = opts.timeoutMs ?? 300_000;
    try {
        while (!idle && Date.now() - start < timeout) {
            if (opts.signal?.aborted)
                break;
            const { done, value } = await reader.read();
            if (done)
                break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
                if (!line.startsWith("data: "))
                    continue;
                const json = line.slice("data: ".length);
                let event;
                try {
                    event = JSON.parse(json);
                }
                catch {
                    continue;
                }
                const e = event;
                const props = e.properties ?? {};
                const eventSessionId = props.sessionID ?? props.sessionId ?? props.session_id;
                if (eventSessionId && eventSessionId !== opts.sessionId)
                    continue;
                await rawFile.appendFile(`## ${e.type ?? "unknown"}\n\`\`\`json\n${JSON.stringify(props, null, 2)}\n\`\`\`\n\n`);
                if (e.type === "message.part.updated") {
                    const part = props.part;
                    const partId = part?.id;
                    const partType = part?.type;
                    if (partId && (partType === "text" || partType === "reasoning")) {
                        partTypes.set(partId, partType);
                        if (part.text) {
                            await appendToStream(partType, part.text);
                        }
                        await flushPending(partId, partType);
                    }
                }
                else if (e.type === "message.part.delta") {
                    const partId = props.partID;
                    const delta = props.delta;
                    if (!partId || typeof delta !== "string")
                        continue;
                    const type = partTypes.get(partId);
                    if (type) {
                        await appendToStream(type, delta);
                    }
                    else {
                        // Delta arrived before part.updated; buffer until type is known
                        const list = pendingDeltas.get(partId) ?? [];
                        list.push(delta);
                        pendingDeltas.set(partId, list);
                    }
                }
                if (e.type === "session.idle") {
                    idle = true;
                }
            }
        }
    }
    finally {
        await reader.cancel().catch(() => null);
        await rawFile.close();
    }
}
export default router;
//# sourceMappingURL=stages.js.map