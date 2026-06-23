import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { stageOutputDir, stageWorkspaceDir } from "../shared/utils/paths.js";
const execFileAsync = promisify(execFile);
async function findTestScripts(testDir) {
    try {
        await fs.access(testDir);
    }
    catch {
        return [];
    }
    const entries = await fs.readdir(testDir, { withFileTypes: true });
    const scripts = [];
    for (const entry of entries) {
        if (!entry.isFile())
            continue;
        const name = entry.name;
        if (name.endsWith(".py") || name.endsWith(".sh") || name.endsWith(".js")) {
            scripts.push(path.join(testDir, name));
        }
    }
    return scripts.sort();
}
async function runScript(scriptPath, cwd) {
    const name = path.basename(scriptPath);
    const ext = path.extname(scriptPath);
    const start = Date.now();
    let cmd;
    let args = [];
    if (ext === ".py") {
        cmd = "python3";
        args = [scriptPath];
    }
    else if (ext === ".sh") {
        cmd = "bash";
        args = [scriptPath];
    }
    else if (ext === ".js") {
        cmd = "node";
        args = [scriptPath];
    }
    else {
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
    }
    catch (err) {
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
export async function runApiTests(runId, stageId, attempt) {
    const outputDir = stageOutputDir(runId, stageId, attempt);
    const workspaceDir = stageWorkspaceDir(runId, stageId, attempt);
    await fs.mkdir(workspaceDir, { recursive: true });
    const testDir = path.join(outputDir, "api-tests");
    const scripts = await findTestScripts(testDir);
    const results = [];
    for (const script of scripts) {
        results.push(await runScript(script, workspaceDir));
    }
    const report = {
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
    await fs.writeFile(path.join(outputDir, "machine-test-result.json"), JSON.stringify(report, null, 2), "utf-8");
    return results;
}
//# sourceMappingURL=runner.js.map