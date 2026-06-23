import fs from "node:fs/promises";
import path from "node:path";
import type { StageId, RunState } from "../shared/schemas/index.js";
import {
  createRunState,
  loadRunState,
  updateRunState,
  createStageState,
  loadStageState,
  updateStageState,
} from "./stateMachine.js";
import { getStageContract } from "./stageContracts.js";
import { runDir, stageDir, stageWorkspaceDir, stageOutputDir, skillPreviewDir } from "../shared/utils/paths.js";
import { filenameTimestamp } from "../shared/utils/time.js";

export function generateRunId(): string {
  return `run-${filenameTimestamp()}`;
}

export async function createRun(opts: {
  skill_id: string;
  preview_id?: string;
}): Promise<RunState> {
  const runId = generateRunId();
  const dir = runDir(runId);
  await fs.mkdir(dir, { recursive: true });
  // 创建跨阶段 digest 模板
  const digestPath = path.join(dir, "stage-digest.md");
  await fs.writeFile(
    digestPath,
    `# Stage Digest\n\n## Run\n${runId}\n\n## Skill\n${opts.skill_id}\n\n## Preview\n${opts.preview_id ?? "N/A"}\n\n## Current Stage\nN/A\n\n## Key Findings\n\n## Next Recommended Action\n\n`,
    "utf-8",
  );
  return createRunState({ run_id: runId, skill_id: opts.skill_id, preview_id: opts.preview_id });
}

export async function findNextAttempt(runId: string, stageId: StageId): Promise<number> {
  let attempt = 1;
  while (await stageExists(runId, stageId, attempt)) {
    attempt++;
  }
  return attempt;
}

async function stageExists(runId: string, stageId: StageId, attempt: number): Promise<boolean> {
  try {
    await fs.access(stageDir(runId, stageId, attempt));
    return true;
  } catch {
    return false;
  }
}

export async function initStage(opts: {
  run_id: string;
  stage_id: StageId;
  attempt?: number;
}): Promise<{ runState: RunState; stageState: import("../shared/schemas/index.js").StageState }> {
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

export async function markStageStatus(
  runId: string,
  stageId: StageId,
  attempt: number,
  status: import("../shared/schemas/index.js").StageState["status"],
  outputs?: string[],
): Promise<void> {
  const patch: Partial<import("../shared/schemas/index.js").StageState> = { status };
  if (outputs !== undefined) {
    patch.outputs = outputs;
  }
  await updateStageState(runId, stageId, attempt, patch);
}

export async function listStageOutputs(
  runId: string,
  stageId: StageId,
  attempt: number,
): Promise<string[]> {
  const outDir = stageOutputDir(runId, stageId, attempt);
  try {
    const entries = await fs.readdir(outDir, { withFileTypes: true });
    return entries.filter((e) => e.isFile()).map((e) => e.name);
  } catch {
    return [];
  }
}

export async function refreshStageOutputs(
  runId: string,
  stageId: StageId,
  attempt: number,
): Promise<void> {
  const outputs = await listStageOutputs(runId, stageId, attempt);
  await updateStageState(runId, stageId, attempt, { outputs });
}

export async function ensureSkillPreviewExists(
  skillId: string,
  previewId: string,
): Promise<boolean> {
  try {
    await fs.access(skillPreviewDir(skillId, previewId));
    return true;
  } catch {
    return false;
  }
}
