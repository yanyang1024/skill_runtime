import { Router, type Request } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import type { StageId } from "../../shared/schemas/index.js";
import { recommendPrompt } from "../../prompt_recommender/recommender.js";
import {
  startStageRuntime,
  stopStageRuntime,
  getRuntime,
  listRuntimes,
} from "../stageRuntimeManager.js";
import { createOpencodeSessionClient } from "../../opencode_client/index.js";
import { abortEventStream } from "../../opencode_client/sse.js";
import { loadStageState, updateStageState } from "../../orchestration/stateMachine.js";
import { loadRunState } from "../../orchestration/stateMachine.js";
import { refreshStageOutputs, initStage } from "../../orchestration/runLifecycle.js";
import { getStageContract } from "../../orchestration/stageContracts.js";
import { syncWorkToPreview } from "../../workspace_builder/builder.js";
import { runApiTests } from "../../api_test_runner/runner.js";
import { stageDir, stageInputDir, stageOutputDir } from "../../shared/utils/paths.js";
import { utcTimestamp } from "../../shared/utils/time.js";
import {
  validateRunStageParams,
  getSafeParams,
} from "../middleware/validateParams.js";

const router: Router = Router();

router.use("/:runId/stage/:stageId/*", validateRunStageParams());

function getRunStageParams(req: Request) {
  return getSafeParams<{ runId: string; stageId: string; attempt: number }>(req);
}

router.post("/:runId/stage/:stageId/start", async (req, res) => {
  const { runId, stageId, attempt } = getRunStageParams(req);
  const {
    previous_stage_id,
    previous_attempt,
    session_log_path,
    api_docs_available,
  } = req.body;

  try {
    const run = await loadRunState(runId);
    if (!run) {
      res.status(404).json({ error: "run not found" });
      return;
    }

    // 防并发：检查是否已有同名 runtime
    const serverId = `${runId}-${stageId}-${attempt}`;
    const existing = getRuntime(serverId);
    if (existing?.status === "running") {
      res.json({
        server_id: existing.server_id,
        stage_id: existing.stage_id,
        port: existing.port,
        open_url: existing.open_url,
        proxy_url: existing.proxy_url,
        status: existing.status,
        info: "already running",
      });
      return;
    }

    const runtime = await startStageRuntime({
      run_id: runId,
      stage_id: stageId as StageId,
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
  } catch (err) {
    try {
      await updateStageState(runId, stageId as StageId, attempt, { status: "error" });
    } catch { /* best-effort */ }
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
      const nextStatus = "completed";
      const contract = getStageContract(stageId as StageId);
      if (contract.skill_mount === "preview-writable") {
        const run = await loadRunState(runId);
        if (run?.preview_id) {
          try {
            await syncWorkToPreview(run.skill_id, runId, stageId as StageId, attempt, run.preview_id);
          } catch (syncErr) {
            console.error("[stages] syncWorkToPreview failed during stop:", syncErr);
          }
        }
      }
      await updateStageState(runId, stageId as StageId, attempt, {
        status: nextStatus,
      });
      await refreshStageOutputs(runId, stageId as StageId, attempt);
      res.json({
        ok: true,
        status: nextStatus,
        exit_code: result.exit_code,
        exit_signal: result.exit_signal,
      });
    } else {
      res.json({ ok: false, error: "runtime not found" });
    }
  } catch (err) {
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
    const contract = getStageContract(stageId as StageId);
    if (contract.skill_mount !== "preview-writable") {
      res.status(400).json({ error: "stage does not write to preview" });
      return;
    }
    let stageState = await loadStageState(runId, stageId as StageId, attempt);
    if (!stageState) {
      const { stageState: created } = await initStage({
        run_id: runId,
        stage_id: stageId as StageId,
        attempt,
      });
      stageState = created;
    }
    await syncWorkToPreview(run.skill_id, runId, stageId as StageId, attempt, run.preview_id);
    await refreshStageOutputs(runId, stageId as StageId, attempt);
    res.json({ ok: true, preview_id: run.preview_id });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post("/:runId/stage/:stageId/run-api-tests", async (req, res) => {
  const { runId, stageId, attempt } = getRunStageParams(req);
  try {
    const results = await runApiTests(runId, stageId as StageId, attempt);
    res.json({ ok: true, results });
  } catch (err) {
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
    const nextAttempt = await findNextAttempt(runId, stageId as StageId);
    // 检查是否已经有同 attempt 的 runtime 在运行（防竞态）
    const nextServerId = `${runId}-${stageId as StageId}-${nextAttempt}`;
    if (getRuntime(nextServerId)) {
      res.json({ server_id: nextServerId, attempt: nextAttempt, info: "already running" });
      return;
    }
    const runtime = await startStageRuntime({
      run_id: runId,
      stage_id: stageId as StageId,
      skill_id: run.skill_id,
      preview_id: run.preview_id,
      attempt: nextAttempt,
      previous_stage_id: req.body.previous_stage_id,
      previous_attempt: req.body.previous_attempt,
      sessionLogPath: req.body.session_log_path,
      apiDocsAvailable: req.body.api_docs_available,
    });
    res.json({
      server_id: runtime.server_id,
      attempt: nextAttempt,
      open_url: runtime.open_url,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/:runId/stage/:stageId/state", async (req, res) => {
  const { runId, stageId, attempt } = getRunStageParams(req);
  try {
    const state = await loadStageState(runId, stageId as StageId, attempt);
    if (!state) {
      res.status(404).json({ error: "stage state not found" });
      return;
    }
    res.json(state);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post("/:runId/stage/:stageId/director-review", async (req, res) => {
  const { runId, stageId, attempt } = getRunStageParams(req);
  const { content } = req.body;
  try {
    if (typeof content !== "string" || content.trim().length === 0) {
      res.status(400).json({ error: "missing or empty review content" });
      return;
    }
    const run = await loadRunState(runId);
    if (!run) {
      res.status(404).json({ error: "run not found" });
      return;
    }
    const outDir = path.join(stageDir(runId, stageId as StageId, attempt), "output");
    await fs.mkdir(outDir, { recursive: true });
    const reviewPath = path.join(outDir, "director-review.md");
    await fs.writeFile(
      reviewPath,
      `# Director Review\n\n## Stage\n${stageId}\n\n## Run\n${runId}\n\n## Content\n${content}\n\n## Created At\n${utcTimestamp()}\n`,
      "utf-8",
    );
    await refreshStageOutputs(runId, stageId as StageId, attempt);
    res.json({ ok: true, path: reviewPath });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post("/:runId/stage/:stageId/recommend-prompt", async (req, res) => {
  const { runId, stageId, attempt } = getRunStageParams(req);
  const { server_id, recent_output_summary, director_review, goal } = req.body;
  try {
    const recommendation = await recommendPrompt({
      stage_id: stageId as StageId,
      run_id: runId,
      server_id: server_id ?? `${runId}-${stageId}-${attempt}`,
      attempt,
      recent_output_summary,
      director_review,
      goal,
    });
    res.json(recommendation);
  } catch (err) {
    const msg = String(err);
    const friendly = (msg.includes("timed out") || msg.includes("AbortError"))
      ? "Prompt 推荐超时。模型端点可能负载过高，请稍后重试或使用更小模型。"
      : msg;
    res.status(500).json({ error: friendly });
  }
});

// GET /context — 列出模型可访问的全部文件清单
router.get("/:runId/stage/:stageId/context", async (req, res) => {
  const { runId, stageId, attempt } = getRunStageParams(req);
  try {
    const run = await loadRunState(runId);
    const inputDir = stageInputDir(runId, stageId, attempt);
    const outputDir = stageOutputDir(runId, stageId, attempt);

    const listFiles = async (dir: string): Promise<string[]> => {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true, recursive: true });
        return entries.filter((e) => e.isFile()).map((e) => path.relative(dir, path.join(e.parentPath ?? dir, e.name)));
      } catch { return []; }
    };

    // 上一阶段产物
    const prevOutput = await listFiles(path.join(inputDir, "previous_stage_output"));
    // session log
    const sessionLog = await listFiles(path.join(inputDir, "session_log"));
    // api docs
    const apiDocs = await listFiles(path.join(inputDir, "api_docs"));
    // output 模板（预置文件）
    const templates = await listFiles(outputDir);

    res.json({
      skill_source: run?.preview_id ? `preview (${run.preview_id})` : "stable",
      inputs: {
        previous_stage_output: prevOutput,
        session_log: sessionLog,
        api_docs: apiDocs,
      },
      output_templates: templates,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/:runId/stage/:stageId/status", async (req, res) => {
  const { runId, stageId, attempt } = getRunStageParams(req);
  const serverId = `${runId}-${stageId}-${attempt}`;
  const runtime = getRuntime(serverId);
  res.json({
    registered: !!runtime,
    status: runtime?.status ?? "not_registered",
    healthy: runtime?.healthy ?? false,
    error: runtime?.error ?? null,
    port: runtime?.port ?? null,
  });
});

router.get("/", (_req, res) => {
  res.json(listRuntimes());
});

export default router;
