import fs from "node:fs/promises";
import path from "node:path";
import { createRunState, loadRunState, updateRunState, createStageState, updateStageState, } from "./stateMachine.js";
import { runDir, stageDir, stageWorkspaceDir, stageOutputDir, skillPreviewDir } from "../shared/utils/paths.js";
import { filenameTimestamp } from "../shared/utils/time.js";
export function generateRunId() {
    return `run-${filenameTimestamp()}`;
}
export async function createRun(opts) {
    const runId = generateRunId();
    const dir = runDir(runId);
    await fs.mkdir(dir, { recursive: true });
    const digestPath = path.join(dir, "stage-digest.md");
    try {
        await fs.writeFile(digestPath, `# Stage Digest\n\n## Run\n${runId}\n\n## Skill\n${opts.skill_id}\n\n## Preview\n${opts.preview_id ?? "N/A"}\n\n## Current Stage\nN/A\n\n## Key Findings\n\n## Next Recommended Action\n\n`, "utf-8");
        return await createRunState({ run_id: runId, skill_id: opts.skill_id, preview_id: opts.preview_id });
    }
    catch (err) {
        // 回滚：写入 YAML 失败时，清理已创建的目录
        const { removeRunDir } = await import("./stateMachine.js");
        await removeRunDir(runId);
        throw err;
    }
}
export async function findNextAttempt(runId, stageId) {
    let attempt = 1;
    while (await stageExists(runId, stageId, attempt)) {
        attempt++;
    }
    return attempt;
}
async function stageExists(runId, stageId, attempt) {
    try {
        await fs.access(stageDir(runId, stageId, attempt));
        return true;
    }
    catch (err) {
        const nodeErr = err;
        if (nodeErr.code === "ENOENT")
            return false;
        throw err;
    }
}
export async function initStage(opts) {
    const { run_id, stage_id } = opts;
    const runState = await loadRunState(run_id);
    if (!runState) {
        throw new Error(`Run not found: ${run_id}`);
    }
    const attempt = opts.attempt ?? (await findNextAttempt(run_id, stage_id));
    const workspacePath = stageWorkspaceDir(run_id, stage_id, attempt);
    const digestPath = path.join(stageDir(run_id, stage_id, attempt), "stage-digest.md");
    const stageState = await createStageState({
        run_id,
        stage_id,
        attempt,
        workspace_path: workspacePath,
        digest_path: digestPath,
    });
    const nextRun = await updateRunState(run_id, {
        current_stage: stage_id,
        status: "running",
    });
    return { runState: nextRun, stageState };
}
export async function markStageStatus(runId, stageId, attempt, status, outputs) {
    const patch = { status };
    if (outputs !== undefined) {
        patch.outputs = outputs;
    }
    await updateStageState(runId, stageId, attempt, patch);
}
export async function listStageOutputs(runId, stageId, attempt) {
    const outDir = stageOutputDir(runId, stageId, attempt);
    try {
        const entries = await fs.readdir(outDir, { withFileTypes: true });
        return entries.filter((e) => e.isFile()).map((e) => e.name);
    }
    catch (err) {
        const nodeErr = err;
        if (nodeErr.code === "ENOENT")
            return [];
        throw err;
    }
}
export async function refreshStageOutputs(runId, stageId, attempt) {
    const outputs = await listStageOutputs(runId, stageId, attempt);
    await updateStageState(runId, stageId, attempt, { outputs });
}
export async function ensureSkillPreviewExists(skillId, previewId) {
    try {
        await fs.access(skillPreviewDir(skillId, previewId));
        return true;
    }
    catch (err) {
        const nodeErr = err;
        if (nodeErr.code === "ENOENT")
            return false;
        throw err;
    }
}
//# sourceMappingURL=runLifecycle.js.map