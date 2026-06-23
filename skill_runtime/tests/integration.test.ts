import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { skillRoot, skillStableDir, skillPreviewDir, skillReleaseDir } from "../app/shared/utils/paths.js";
import { copyDir, removeDir } from "../app/shared/utils/fs.js";
import { runObserve } from "../app/workers/observe/index.js";
import { runGrowDryRun } from "../app/workers/grow/dryRun.js";
import { runGrowLive } from "../app/workers/grow/live.js";
import { runStabilizePromote } from "../app/workers/stabilize/promote.js";
import { runRollback } from "../app/workers/stabilize/rollback.js";

const SOURCE_SKILL = "tech-doc-didactic-rewriter";

let skillId = "";

describe("integration: skill lifecycle", () => {
  beforeEach(async () => {
    skillId = `integration-test-skill-${Date.now()}`;
    await fs.mkdir(skillRoot(skillId), { recursive: true });
    await copyDir(skillStableDir(SOURCE_SKILL), skillStableDir(skillId));
    await fs.mkdir(path.join(skillRoot(skillId), "previews"), { recursive: true });
    await fs.mkdir(path.join(skillRoot(skillId), "releases"), { recursive: true });
    await fs.mkdir(path.join(skillRoot(skillId), ".archive"), { recursive: true });
  });

  afterEach(async () => {
    const roots = ["skills", "traces", "growth_runs", "experiments", "api_docs", ".Grow_backups"];
    for (const r of roots) {
      await removeDir(path.resolve(process.cwd(), r, skillId));
    }
  });

  it("runs observe and creates a trace", async () => {
    const { runId, trace } = await runObserve(skillId);
    assert.ok(runId.startsWith("run-"));
    assert.equal(trace.skill_id, skillId);
    assert.ok(trace.growth_candidates.length > 0);
  });

  it("runs grow dry-run and creates a plan", async () => {
    const trace = await runObserve(skillId);
    const { plan, proposal } = await runGrowDryRun(skillId, trace.trace);
    assert.equal(plan.mode, "dry-run");
    assert.ok(plan.planned_operations.length > 0);
    assert.ok(proposal.markdown.includes("一键确认"));
  });

  it("runs grow live and produces a passing preview", async () => {
    const trace = await runObserve(skillId);
    const { plan } = await runGrowDryRun(skillId, trace.trace);
    const result = await runGrowLive(skillId, plan);
    assert.ok(result.previewId.startsWith("preview-"));
    assert.ok(result.snapshot.snapshot_id.startsWith("snapshot-"));
    assert.equal(result.qualityReport.overall_passed, true);
    const previewDir = skillPreviewDir(skillId, result.previewId);
    const stat = await fs.stat(path.join(previewDir, "SKILL.md"));
    assert.ok(stat.isFile());
  });

  it("promotes preview to stable and creates a release", async () => {
    const trace = await runObserve(skillId);
    const { plan } = await runGrowDryRun(skillId, trace.trace);
    const { previewId } = await runGrowLive(skillId, plan);
    const promote = await runStabilizePromote(skillId, previewId);
    assert.ok(promote.releaseVersion.startsWith("v0.1"));
    const stableSkillYaml = path.join(skillStableDir(skillId), "skill.yaml");
    assert.ok(await fileExists(stableSkillYaml));
    const releaseDir = skillReleaseDir(skillId, promote.releaseVersion);
    assert.ok(await fileExists(releaseDir));
  });

  it("rolls back to a previous snapshot", async () => {
    const trace = await runObserve(skillId);
    const { plan } = await runGrowDryRun(skillId, trace.trace);
    const { previewId, snapshot } = await runGrowLive(skillId, plan);
    const beforePromoteStable = await fs.readFile(path.join(skillStableDir(skillId), "SKILL.md"), "utf-8");
    await runStabilizePromote(skillId, previewId);
    await runRollback(skillId, snapshot.snapshot_id);
    const afterRollbackStable = await fs.readFile(path.join(skillStableDir(skillId), "SKILL.md"), "utf-8");
    assert.equal(afterRollbackStable, beforePromoteStable);
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
