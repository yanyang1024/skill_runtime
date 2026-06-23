import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { z } from "zod";
import type { RunState, StageState, StageId, StageTransition } from "../shared/schemas/index.js";
import {
  RunState as RunStateSchema,
  StageState as StageStateSchema,
  StageTransition as StageTransitionSchema,
} from "../shared/schemas/index.js";
import { runDir, stageDir } from "../shared/utils/paths.js";
import { utcTimestamp } from "../shared/utils/time.js";

export async function loadRunState(runId: string): Promise<RunState | null> {
  const p = path.join(runDir(runId), "run-state.yaml");
  try {
    const raw = await fs.readFile(p, "utf-8");
    return RunStateSchema.parse(YAML.parse(raw));
  } catch {
    return null;
  }
}

export async function saveRunState(state: RunState): Promise<void> {
  const dir = runDir(state.run_id);
  await fs.mkdir(dir, { recursive: true });
  const p = path.join(dir, "run-state.yaml");
  await fs.writeFile(p, YAML.stringify(state), "utf-8");
}

export async function createRunState(opts: {
  run_id: string;
  skill_id: string;
  preview_id?: string;
}): Promise<RunState> {
  const now = utcTimestamp();
  const state: RunState = {
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

export async function updateRunState(
  runId: string,
  patch: Partial<RunState>,
): Promise<RunState> {
  const state = await loadRunState(runId);
  if (!state) {
    throw new Error(`Run not found: ${runId}`);
  }
  const next = { ...state, ...patch, updated_at: utcTimestamp() };
  await saveRunState(next);
  return next;
}

export async function loadStageState(
  runId: string,
  stageId: StageId,
  attempt: number,
): Promise<StageState | null> {
  const p = path.join(stageDir(runId, stageId, attempt), "stage-state.yaml");
  try {
    const raw = await fs.readFile(p, "utf-8");
    return StageStateSchema.parse(YAML.parse(raw));
  } catch {
    return null;
  }
}

export async function saveStageState(state: StageState): Promise<void> {
  const dir = stageDir(state.run_id, state.stage_id, state.attempt);
  await fs.mkdir(dir, { recursive: true });
  const p = path.join(dir, "stage-state.yaml");
  await fs.writeFile(p, YAML.stringify(state), "utf-8");
}

export async function createStageState(opts: {
  run_id: string;
  stage_id: StageId;
  attempt: number;
  workspace_path: string;
  digest_path: string;
}): Promise<StageState> {
  const now = utcTimestamp();
  const state: StageState = {
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

export async function updateStageState(
  runId: string,
  stageId: StageId,
  attempt: number,
  patch: Partial<StageState>,
): Promise<StageState> {
  const state = await loadStageState(runId, stageId, attempt);
  if (!state) {
    throw new Error(`Stage state not found: ${runId}/${stageId}/${attempt}`);
  }
  const next = { ...state, ...patch, updated_at: utcTimestamp() };
  await saveStageState(next);
  return next;
}

export async function appendStageTransitionForRun(
  runId: string,
  transition: StageTransition,
): Promise<void> {
  const p = path.join(runDir(runId), "transitions.yaml");
  let list: StageTransition[] = [];
  try {
    const raw = await fs.readFile(p, "utf-8");
    list = z.array(StageTransitionSchema).parse(YAML.parse(raw));
  } catch {
    // ignore
  }
  list.push(transition);
  await fs.writeFile(p, YAML.stringify(list), "utf-8");
}
