import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { buildBwrapCommand, shouldUseBwrap } from "../app/workspace_builder/bwrap.js";
import { REPO_ROOT } from "../app/shared/utils/paths.js";

function makeCtx(overrides?: Partial<Parameters<typeof buildBwrapCommand>[0]>) {
  return {
    workspacePath: path.join(REPO_ROOT, "runs", "run-001", "grow-build", "attempts", "attempt-001", "workspace"),
    skillId: "tech-doc-didactic-rewriter",
    previewId: "preview-001",
    runId: "run-001",
    stageId: "grow-build",
    attempt: 1,
    skillMount: "preview-writable" as const,
    workWritable: true,
    ...overrides,
  };
}

describe("bwrap: default enable", () => {
  it("returns true by default", () => {
    const original = process.env.STAGE_USE_BWRAP;
    delete process.env.STAGE_USE_BWRAP;
    assert.equal(shouldUseBwrap(), true);
    if (original !== undefined) process.env.STAGE_USE_BWRAP = original;
  });

  it("can be disabled via env", () => {
    const original = process.env.STAGE_USE_BWRAP;
    process.env.STAGE_USE_BWRAP = "0";
    assert.equal(shouldUseBwrap(), false);
    if (original !== undefined) process.env.STAGE_USE_BWRAP = original;
    else delete process.env.STAGE_USE_BWRAP;
  });
});

describe("bwrap: command generation", () => {
  it("includes bwrap and workspace bind", async () => {
    const ctx = makeCtx();
    const cmd = await buildBwrapCommand(ctx, ["opencode", "serve"]);
    assert.equal(cmd[0], "bwrap");
    assert.ok(cmd.includes("--bind"));
    assert.ok(cmd.includes(ctx.workspacePath));
    assert.ok(cmd.includes("opencode"));
    assert.ok(cmd.includes("serve"));
  });

  it("rejects workspace outside repo", async () => {
    const ctx = makeCtx({ workspacePath: "/tmp/outside" });
    await assert.rejects(
      () => buildBwrapCommand(ctx, ["opencode", "serve"]),
      /路径不在允许的根目录内/,
    );
  });

  it("includes read-only repo and node_modules mounts", async () => {
    const ctx = makeCtx();
    const cmd = await buildBwrapCommand(ctx, ["opencode", "serve"]);
    assert.ok(cmd.includes("--ro-bind"));
    assert.ok(cmd.includes(REPO_ROOT));
    assert.ok(cmd.includes(path.join(REPO_ROOT, "node_modules")));
  });

  it("includes skill stable as read-only", async () => {
    const ctx = makeCtx();
    const cmd = await buildBwrapCommand(ctx, ["opencode", "serve"]);
    const stableDir = path.join(REPO_ROOT, "skills", ctx.skillId, "stable");
    assert.ok(cmd.includes("--ro-bind"));
    assert.ok(cmd.includes(stableDir));
  });

  it("binds preview when skill_mount is preview-writable", async () => {
    const ctx = makeCtx({ skillMount: "preview-writable" });
    const cmd = await buildBwrapCommand(ctx, ["opencode", "serve"]);
    const previewDir = path.join(REPO_ROOT, "skills", ctx.skillId, "previews", ctx.previewId);
    const previewIndex = cmd.indexOf(previewDir);
    assert.ok(previewIndex > 0, "preview dir should be mounted");
    assert.equal(cmd[previewIndex - 1], "--bind");
  });

  it("makes preview read-only when skill_mount is preview-readonly", async () => {
    const ctx = makeCtx({ skillMount: "preview-readonly" });
    const cmd = await buildBwrapCommand(ctx, ["opencode", "serve"]);
    const previewDir = path.join(REPO_ROOT, "skills", ctx.skillId, "previews", ctx.previewId);
    const previewIndex = cmd.indexOf(previewDir);
    assert.ok(previewIndex > 0, "preview dir should be mounted");
    assert.equal(cmd[previewIndex - 1], "--ro-bind");
  });

  it("skips preview mount when previewId is missing", async () => {
    const ctx = makeCtx({ previewId: undefined, skillMount: "preview-writable" });
    const cmd = await buildBwrapCommand(ctx, ["opencode", "serve"]);
    const previewDir = path.join(REPO_ROOT, "skills", ctx.skillId, "previews");
    assert.ok(!cmd.some((arg) => arg.includes(previewDir)), "preview dir should not be mounted");
  });

  it("includes configs/model-providers and prompt_library as read-only", async () => {
    const ctx = makeCtx();
    const cmd = await buildBwrapCommand(ctx, ["opencode", "serve"]);
    assert.ok(cmd.includes(path.join(REPO_ROOT, "configs", "model-providers")));
    assert.ok(cmd.includes(path.join(REPO_ROOT, "prompt_library")));
  });
});
