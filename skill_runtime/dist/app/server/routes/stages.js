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
import { stageDir } from "../../shared/utils/paths.js";
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
        const ok = stopStageRuntime(serverId);
        if (ok) {
            const contract = getStageContract(stageId);
            if (contract.skill_mount === "preview-writable") {
                const run = await loadRunState(runId);
                if (run?.preview_id) {
                    await syncWorkToPreview(run.skill_id, runId, stageId, attempt, run.preview_id);
                }
            }
            await updateStageState(runId, stageId, attempt, {
                status: "completed",
            });
            await refreshStageOutputs(runId, stageId, attempt);
        }
        res.json({ ok });
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
    res.json({ open_url: runtime.open_url });
});
async function proxyToRuntime(req, res, runtime, pathSuffix) {
    const targetUrl = `${runtime.base_url}${pathSuffix}`;
    const username = process.env.OPENCODE_SERVER_USERNAME ?? "opencode";
    const password = process.env.OPENCODE_SERVER_PASSWORD ?? "skillgrowth";
    const auth = Buffer.from(`${username}:${password}`).toString("base64");
    try {
        const response = await fetch(targetUrl, {
            method: req.method,
            headers: {
                ...req.headers,
                host: `127.0.0.1:${runtime.port}`,
                authorization: `Basic ${auth}`,
            },
            body: req.method !== "GET" && req.method !== "HEAD" ? JSON.stringify(req.body) : undefined,
        });
        response.headers.forEach((value, key) => {
            if (key === "x-frame-options" || key === "content-security-policy")
                return;
            res.setHeader(key, value);
        });
        res.status(response.status);
        const body = await response.arrayBuffer();
        res.send(Buffer.from(body));
    }
    catch (err) {
        res.status(502).json({ error: String(err) });
    }
}
router.all("/:runId/stage/:stageId/view/*", async (req, res) => {
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
    try {
        let sessionId = session_id;
        if (!sessionId) {
            const username = process.env.OPENCODE_SERVER_USERNAME ?? "opencode";
            const password = process.env.OPENCODE_SERVER_PASSWORD ?? "skillgrowth";
            const auth = Buffer.from(`${username}:${password}`).toString("base64");
            const createResp = await fetch(`${runtime.base_url}/session`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    authorization: `Basic ${auth}`,
                },
                body: JSON.stringify({ title: `${stageId} session` }),
            });
            const createData = (await createResp.json());
            sessionId = createData.id;
        }
        const username = process.env.OPENCODE_SERVER_USERNAME ?? "opencode";
        const password = process.env.OPENCODE_SERVER_PASSWORD ?? "skillgrowth";
        const auth = Buffer.from(`${username}:${password}`).toString("base64");
        const resp = await fetch(`${runtime.base_url}/session/${sessionId}/message`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                authorization: `Basic ${auth}`,
            },
            body: JSON.stringify({ parts, agent, model }),
        });
        const data = await resp.json();
        // Refresh outputs after message
        await refreshStageOutputs(runId, stageId, Number(attempt));
        res.json({ session_id: sessionId, response: data });
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
export default router;
//# sourceMappingURL=stages.js.map