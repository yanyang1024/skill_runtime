import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { StageId } from "../shared/schemas/index.js";
import { stageOutputDir, stageWorkspaceDir } from "../shared/utils/paths.js";

const execFileAsync = promisify(execFile);

export interface ApiTestResult {
  name: string;
  path: string;
  status: "passed" | "failed" | "error" | "skipped";
  stdout: string;
  stderr: string;
  exit_code?: number;
  duration_ms: number;
  error?: string;
}

export interface MachineTestReport {
  generated_at: string;
  stage_id: StageId;
  run_id: string;
  attempt: number;
  summary: {
    total: number;
    passed: number;
    failed: number;
    error: number;
    skipped: number;
  };
  results: ApiTestResult[];
}

async function findTestScripts(testDir: string): Promise<string[]> {
  try {
    await fs.access(testDir);
  } catch {
    return [];
  }
  const entries = await fs.readdir(testDir, { withFileTypes: true });
  const scripts: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const name = entry.name;
    if (name.endsWith(".py") || name.endsWith(".sh") || name.endsWith(".js")) {
      scripts.push(path.join(testDir, name));
    }
  }
  return scripts.sort();
}

async function runScript(scriptPath: string, cwd: string): Promise<ApiTestResult> {
  const name = path.basename(scriptPath);
  const ext = path.extname(scriptPath);
  const start = Date.now();

  let cmd: string;
  let args: string[] = [];
  if (ext === ".py") {
    cmd = "python3";
    args = [scriptPath];
  } else if (ext === ".sh") {
    cmd = "bash";
    args = [scriptPath];
  } else if (ext === ".js") {
    cmd = "node";
    args = [scriptPath];
  } else {
    return {
      name,
      path: scriptPath,
      status: "skipped",
      stdout: "",
      stderr: "",
      duration_ms: 0,
      error: `unsupported extension ${ext}`,
    };
  }

  try {
    const { stdout, stderr } = await execFileAsync(cmd, args, {
      cwd,
      timeout: 60000,
      shell: false,
    });
    const duration_ms = Date.now() - start;
    return {
      name,
      path: scriptPath,
      status: "passed",
      stdout: stdout.toString(),
      stderr: stderr.toString(),
      exit_code: 0,
      duration_ms,
    };
  } catch (err: any) {
    const duration_ms = Date.now() - start;
    return {
      name,
      path: scriptPath,
      status: err.killed ? "error" : "failed",
      stdout: err.stdout?.toString() ?? "",
      stderr: err.stderr?.toString() ?? "",
      exit_code: err.code ?? undefined,
      duration_ms,
      error: err.message ?? String(err),
    };
  }
}

export async function runApiTests(
  runId: string,
  stageId: StageId,
  attempt: number,
): Promise<ApiTestResult[]> {
  const outputDir = stageOutputDir(runId, stageId, attempt);
  const workspaceDir = stageWorkspaceDir(runId, stageId, attempt);
  await fs.mkdir(workspaceDir, { recursive: true });
  const testDir = path.join(outputDir, "api-tests");

  const scripts = await findTestScripts(testDir);
  const results: ApiTestResult[] = [];

  for (const script of scripts) {
    results.push(await runScript(script, workspaceDir));
  }

  const report: MachineTestReport = {
    generated_at: new Date().toISOString(),
    stage_id: stageId,
    run_id: runId,
    attempt,
    summary: {
      total: results.length,
      passed: results.filter((r) => r.status === "passed").length,
      failed: results.filter((r) => r.status === "failed").length,
      error: results.filter((r) => r.status === "error").length,
      skipped: results.filter((r) => r.status === "skipped").length,
    },
    results,
  };

  await fs.writeFile(
    path.join(outputDir, "machine-test-result.json"),
    JSON.stringify(report, null, 2),
    "utf-8",
  );

  return results;
}
