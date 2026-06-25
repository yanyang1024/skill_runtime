import { describe, it } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import http from "node:http";
import express from "express";
import artifactsRouter from "../app/server/routes/artifacts.js";
import { stageOutputDir } from "../app/shared/utils/paths.js";
import {
  assertSafeIdentifier,
  sanitizePathComponent,
  resolveContainedPath,
  assertContainedPath,
  safeResolve,
  PathSecurityError,
} from "../app/shared/utils/security.js";

describe("security: identifier validation", () => {
  it("accepts valid skill id", () => {
    assert.doesNotThrow(() => assertSafeIdentifier("tech-doc-didactic-rewriter", "skill"));
  });

  it("rejects skill id with uppercase", () => {
    assert.throws(() => assertSafeIdentifier("Tech-Doc", "skill"), PathSecurityError);
  });

  it("rejects skill id with dots", () => {
    assert.throws(() => assertSafeIdentifier("tech.doc", "skill"), PathSecurityError);
  });

  it("rejects empty identifier", () => {
    assert.throws(() => assertSafeIdentifier("", "run"), PathSecurityError);
    assert.throws(() => assertSafeIdentifier(undefined as unknown as string, "run"), PathSecurityError);
  });

  it("rejects invalid stage id", () => {
    assert.throws(() => assertSafeIdentifier("", "stage"), PathSecurityError);
  });
});

describe("security: path component sanitization", () => {
  it("replaces path separators", () => {
    assert.equal(sanitizePathComponent("a/b\\c").value, "a_b_c");
  });

  it("replaces double dots", () => {
    assert.equal(sanitizePathComponent("..").value, "_");
  });

  it("removes illegal chars", () => {
    assert.equal(sanitizePathComponent("hello world!").value, "hello_world_");
  });

  it("truncates long components", () => {
    const long = "a".repeat(200);
    assert.equal(sanitizePathComponent(long).value.length, 128);
  });

  it("falls back to unknown for empty input", () => {
    assert.equal(sanitizePathComponent("").value, "unknown");
  });
});

describe("security: resolveContainedPath", () => {
  const root = path.join(os.tmpdir(), "sg-security-test-root");

  it("resolves simple relative path", () => {
    const resolved = resolveContainedPath(root, "foo/bar.txt");
    assert.equal(resolved, path.resolve(root, "foo/bar.txt"));
  });

  it("rejects empty path", () => {
    assert.throws(() => resolveContainedPath(root, ""), PathSecurityError);
  });

  it("rejects absolute path", () => {
    assert.throws(() => resolveContainedPath(root, "/etc/passwd"), PathSecurityError);
  });

  it("rejects dot-dot escape", () => {
    assert.throws(() => resolveContainedPath(root, "../../etc/passwd"), PathSecurityError);
  });

  it("rejects dot-dot inside path that escapes", () => {
    assert.throws(() => resolveContainedPath(root, "foo/../../../etc/passwd"), PathSecurityError);
  });

  it("allows harmless dot segments", () => {
    const resolved = resolveContainedPath(root, "foo/./bar/../baz.txt");
    assert.equal(resolved, path.resolve(root, "foo/baz.txt"));
  });
});

describe("security: safeResolve with symlinks", () => {
  const root = path.join(os.tmpdir(), `sg-safe-resolve-${Date.now()}`);

  it("rejects symlink escape", async () => {
    await fs.mkdir(path.join(root, "workspace", "sub"), { recursive: true });
    const outside = path.join(os.tmpdir(), `sg-outside-${Date.now()}.txt`);
    await fs.writeFile(outside, "secret");
    await fs.symlink(outside, path.join(root, "workspace", "sub", "escape.txt"));

    await assert.rejects(
      () => safeResolve(path.join(root, "workspace"), "sub/escape.txt"),
      PathSecurityError,
    );

    await fs.rm(outside);
  });

  it("resolves normal file", async () => {
    await fs.mkdir(path.join(root, "workspace"), { recursive: true });
    const file = path.join(root, "workspace", "normal.txt");
    await fs.writeFile(file, "ok");
    const resolved = await safeResolve(path.join(root, "workspace"), "normal.txt");
    assert.equal(resolved, file);
  });
});

describe("security: artifact route blocks symlink escape", () => {
  it("returns 403 when artifact path is a symlink outside output dir", async () => {
    const runId = `security-run-${Date.now()}`;
    const stageId = "grow-build";
    const attempt = 1;
    const outputDir = stageOutputDir(runId, stageId, attempt);
    const outsideFile = path.join(os.tmpdir(), `sg-secret-${Date.now()}.txt`);

    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(outsideFile, "secret");
    await fs.symlink(outsideFile, path.join(outputDir, "escape.txt"));

    const app = express();
    app.use("/api/runs", artifactsRouter);
    const server = http.createServer(app);

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;

    try {
      const res = await fetch(
        `http://127.0.0.1:${port}/api/runs/${runId}/stage/${stageId}/artifact/escape.txt?attempt=${attempt}`,
      );
      assert.equal(res.status, 403);
    } finally {
      server.close();
      await fs.rm(outsideFile);
      await fs.rm(path.dirname(outputDir), { recursive: true, force: true });
    }
  });
});
