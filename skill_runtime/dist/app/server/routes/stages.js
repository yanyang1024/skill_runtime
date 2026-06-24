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
import { validateRunStageParams, getSafeParams, } from "../middleware/validateParams.js";
const router = Router();
router.use("/:runId/stage/:stageId/*", validateRunStageParams());
function getRunStageParams(req) {
    return getSafeParams(req);
}
router.post("/:runId/stage/:stageId/start", async (req, res) => {
    const { runId, stageId, attempt } = getRunStageParams(req);
    const { previous_stage_id, previous_attempt, session_log_path, api_docs_available, } = req.body;
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
    const { runId, stageId, attempt } = getRunStageParams(req);
    const serverId = `${runId}-${stageId}-${attempt}`;
    try {
        const runtime = getRuntime(serverId);
        // 先取消 SSE 读取器，避免等待长超时
        runtime?.abort_event_stream?.();
        const result = await stopStageRuntime(serverId);
        if (result.stopped) {
            // v0.3 使用共享 opencode serve，单个 stage 停止时共享进程通常仍在运行，
            // 因此以 stopStageRuntime 成功移除管理即视为 graceful。
            const graceful = true;
            const nextStatus = "completed";
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
    const { runId, stageId, attempt } = getRunStageParams(req);
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
    const { runId, stageId, attempt } = getRunStageParams(req);
    try {
        const results = await runApiTests(runId, stageId, attempt);
        res.json({ ok: true, results });
    }
    catch (err) {
        res.status(500).json({ error: String(err) });
    }
});
router.post("/:runId/stage/:stageId/retry", async (req, res) => {
    const { runId, stageId } = getRunStageParams(req);
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
    const { runId, stageId, attempt } = getRunStageParams(req);
    try {
        const state = await loadStageState(runId, stageId, attempt);
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
router.post("/:runId/stage/:stageId/director-review", async (req, res) => {
    const { runId, stageId, attempt } = getRunStageParams(req);
    const { content } = req.body;
    try {
        const run = await loadRunState(runId);
        if (!run) {
            res.status(404).json({ error: "run not found" });
            return;
        }
        const outDir = path.join(stageDir(runId, stageId, attempt), "output");
        await fs.mkdir(outDir, { recursive: true });
        const reviewPath = path.join(outDir, "director-review.md");
        await fs.writeFile(reviewPath, `# Director Review\n\n## Stage\n${stageId}\n\n## Run\n${runId}\n\n## Content\n${content}\n\n## Created At\n${utcTimestamp()}\n`, "utf-8");
        await refreshStageOutputs(runId, stageId, attempt);
        res.json({ ok: true, path: reviewPath });
    }
    catch (err) {
        res.status(500).json({ error: String(err) });
    }
});
router.post("/:runId/stage/:stageId/recommend-prompt", async (req, res) => {
    const { runId, stageId, attempt } = getRunStageParams(req);
    const { server_id, recent_output_summary, director_review, goal } = req.body;
    try {
        const recommendation = await recommendPrompt({
            stage_id: stageId,
            run_id: runId,
            server_id: server_id ?? `${runId}-${stageId}-${attempt}`,
            attempt,
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