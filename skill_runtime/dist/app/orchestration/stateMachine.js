import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { z } from "zod";
import { RunState as RunStateSchema, StageState as StageStateSchema, StageTransition as StageTransitionSchema, } from "../shared/schemas/index.js";
import { runDir, stageDir } from "../shared/utils/paths.js";
import { utcTimestamp } from "../shared/utils/time.js";
// ─── atomic write helpers ──────────────────────────────────────────
async function atomicWrite(filePath, content) {
    const tmp = `${filePath}.atomic-${process.pid}`;
    await fs.writeFile(tmp, content, "utf-8");
    await fs.rename(tmp, filePath);
}
// ─── load with error distinction ───────────────────────────────────
function isENOENT(err) {
    return err.code === "ENOENT";
}
export async function loadRunState(runId) {
    const p = path.join(runDir(runId), "run-state.yaml");
    try {
        const raw = await fs.readFile(p, "utf-8");
        return RunStateSchema.parse(YAML.parse(raw));
    }
    catch (err) {
        if (isENOENT(err))
            return null;
        console.error(`[stateMachine] corrupt run state for ${runId}:`, err.stack ?? err);
        return null;
    }
}
export async function saveRunState(state) {
    const dir = runDir(state.run_id);
    await fs.mkdir(dir, { recursive: true });
    const p = path.join(dir, "run-state.yaml");
    await atomicWrite(p, YAML.stringify(state));
}
export async function createRunState(opts) {
    const now = utcTimestamp();
    const state = {
        run_id: opts.run_id,
        skill_id: opts.skill_id,
        preview_id: opts.preview_id,
        status: "idle",
        created_at: now,
        updated_at: now,
    };
    await saveRunState(state);
    return state;
}
export async function updateRunState(runId, patch) {
    const state = await loadRunState(runId);
    if (!state) {
        throw new Error(`Run not found: ${runId}`);
    }
    const next = { ...state, ...patch, updated_at: utcTimestamp() };
    await saveRunState(next);
    return next;
}
// ─── stage state ────────────────────────────────────────────────────
export async function loadStageState(runId, stageId, attempt) {
    const p = path.join(stageDir(runId, stageId, attempt), "stage-state.yaml");
    try {
        const raw = await fs.readFile(p, "utf-8");
        return StageStateSchema.parse(YAML.parse(raw));
    }
    catch (err) {
        if (isENOENT(err))
            return null;
        console.error(`[stateMachine] corrupt stage state for ${runId}/${stageId}/${attempt}:`, err.stack ?? err);
        return null;
    }
}
export async function saveStageState(state) {
    const dir = stageDir(state.run_id, state.stage_id, state.attempt);
    await fs.mkdir(dir, { recursive: true });
    const p = path.join(dir, "stage-state.yaml");
    await atomicWrite(p, YAML.stringify(state));
}
export async function createStageState(opts) {
    const now = utcTimestamp();
    const state = {
        stage_id: opts.stage_id,
        run_id: opts.run_id,
        status: "pending",
        attempt: opts.attempt,
        workspace_path: opts.workspace_path,
        outputs: [],
        digest_path: opts.digest_path,
        created_at: now,
        updated_at: now,
    };
    await saveStageState(state);
    return state;
}
export async function updateStageState(runId, stageId, attempt, patch) {
    const state = await loadStageState(runId, stageId, attempt);
    if (!state) {
        throw new Error(`Stage state not found: ${runId}/${stageId}/${attempt}`);
    }
    const next = { ...state, ...patch, updated_at: utcTimestamp() };
    await saveStageState(next);
    return next;
}
// ─── transitions (with corruption protection) ──────────────────────
export async function appendStageTransitionForRun(runId, transition) {
    const p = path.join(runDir(runId), "transitions.yaml");
    let list = [];
    try {
        const raw = await fs.readFile(p, "utf-8");
        const parsed = YAML.parse(raw);
        if (Array.isArray(parsed)) {
            list = z.array(StageTransitionSchema).parse(parsed);
        }
        else {
            console.error(`[stateMachine] transitions.yaml for ${runId} is not an array – rebuilding from scratch`);
        }
    }
    catch (err) {
        if (isENOENT(err)) {
            // first transition – normal
        }
        else {
            console.error(`[stateMachine] corrupt transitions.yaml for ${runId}:`, err.stack ?? err);
        }
    }
    list.push(transition);
    await atomicWrite(p, YAML.stringify(list));
}
// ─── run removal (for orphan cleanup) ───────────────────────────────
export async function removeRunDir(runId) {
    const dir = runDir(runId);
    try {
        await fs.rm(dir, { recursive: true, force: true });
    }
    catch {
        // best-effort
    }
}
//# sourceMappingURL=stateMachine.js.map