import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { skillRoot, skillStableDir, runDir, stageDir } from "../app/shared/utils/paths.js";
import { copyDir, removeDir } from "../app/shared/utils/fs.js";
import { createRun } from "../app/orchestration/runLifecycle.js";
import { loadRunState, loadStageState } from "../app/orchestration/stateMachine.js";

const SOURCE_SKILL = "tech-doc-didactic-rewriter";

let skillId = "";

describe("v0.2 run / stage lifecycle", () => {
  beforeEach(async () => {
    skillId = `v02-test-skill-${Date.now()}`;
    await fs.mkdir(skillRoot(skillId), { recursive: true });
    await copyDir(skillStableDir(SOURCE_SKILL), skillStableDir(skillId));
    await fs.mkdir(path.join(skillRoot(skillId), "previews"), { recursive: true });
  });

  afterEach(async () => {
    const roots = ["skills", "runs"];
    for (const r of roots) {
      await removeDir(path.resolve(process.cwd(), r, skillId));
    }
  });

  it("creates a run and persists run-state.yaml", async () => {
    const run = await createRun({ skill_id: skillId });
    assert.ok(run.run_id.startsWith("run-"));
    assert.equal(run.skill_id, skillId);

    const loaded = await loadRunState(run.run_id);
    assert.ok(loaded);
    assert.equal(loaded!.skill_id, skillId);

    const statePath = path.join(runDir(run.run_id), "run-state.yaml");
    assert.ok(await fileExists(statePath));
  });

  it("creates stage state on start endpoint request (without opencode)", async () => {
    const run = await createRun({ skill_id: skillId });

    // We can't spawn opencode in CI, but we can verify the API route shape
    // by checking that workspace construction begins with state file creation.
    // Here we just verify stage state can be created manually.
    const { initStage } = await import("../app/orchestration/runLifecycle.js");
    const { stageState } = await initStage({
      run_id: run.run_id,
      stage_id: "observe-log-review",
      attempt: 1,
    });

    assert.equal(stageState.stage_id, "observe-log-review");
    assert.equal(stageState.status, "pending");

    const loaded = await loadStageState(run.run_id, "observe-log-review", 1);
    assert.ok(loaded);
    assert.equal(loaded!.workspace_path, stageState.workspace_path);

    const stagePath = stageDir(run.run_id, "observe-log-review", 1);
    assert.ok(await fileExists(stagePath));
  });
});

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
