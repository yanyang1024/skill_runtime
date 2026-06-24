import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {
  watchStageOutput,
  unwatchStageOutput,
  stopAllArtifactWatchers,
} from "../app/server/artifactWatcher.js";
import { stageOutputDir } from "../app/shared/utils/paths.js";

describe("artifact watcher", () => {
  after(async () => {
    await stopAllArtifactWatchers();
  });

  it("emits artifact_changed when output file changes", async () => {
    const runId = `test-run-${Date.now()}`;
    const stageId = "grow-build";
    const attempt = 1;
    const outputDir = stageOutputDir(runId, stageId, attempt);
    await fs.mkdir(outputDir, { recursive: true });

    const events: Array<{ run_id: string; stage_id: string; attempt: number; name?: string }> = [];
    const unwatch = await watchStageOutput(runId, stageId, attempt, (event) => {
      events.push(event);
    });

    // 等待 watcher 就绪
    await new Promise((resolve) => setTimeout(resolve, 100));

    await fs.writeFile(path.join(outputDir, "growth-plan.md"), "# Plan\n", "utf-8");

    // 等待 debounce + scan
    await new Promise((resolve) => setTimeout(resolve, 500));

    unwatch();
    await fs.rm(path.dirname(outputDir), { recursive: true, force: true });

    assert.ok(events.length >= 1, `expected at least 1 event, got ${events.length}`);
    assert.equal(events[0]?.run_id, runId);
    assert.equal(events[0]?.stage_id, stageId);
    assert.equal(events[0]?.attempt, attempt);
  });

  it("stops watching after unwatch", async () => {
    const runId = `test-run-unwatch-${Date.now()}`;
    const stageId = "grow-build";
    const attempt = 1;
    const outputDir = stageOutputDir(runId, stageId, attempt);
    await fs.mkdir(outputDir, { recursive: true });

    const events: Array<{ run_id: string; stage_id: string; attempt: number; name?: string }> = [];
    const unwatch = await watchStageOutput(runId, stageId, attempt, (event) => {
      events.push(event);
    });

    unwatch();
    await new Promise((resolve) => setTimeout(resolve, 100));

    await fs.writeFile(path.join(outputDir, "x.md"), "x", "utf-8");
    await new Promise((resolve) => setTimeout(resolve, 400));

    await fs.rm(path.dirname(outputDir), { recursive: true, force: true });

    assert.equal(events.length, 0);
  });
});
