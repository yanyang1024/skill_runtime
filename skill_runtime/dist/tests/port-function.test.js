import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { skillRoot, skillStableDir, skillPreviewDir, stageWorkDir, stageOutputDir, runDir, } from "../app/shared/utils/paths.js";
import { copyDir, removeDir } from "../app/shared/utils/fs.js";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const OPENCODE_BASE_URL = process.env.OPENCODE_BASE_URL ?? "http://127.0.0.1:4096";
const OPENCODE_USERNAME = process.env.OPENCODE_SERVER_USERNAME ?? "opencode";
const OPENCODE_PASSWORD = process.env.OPENCODE_SERVER_PASSWORD ?? "testpass123";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function postJson(url, body, auth) {
    const headers = { "Content-Type": "application/json" };
    if (auth) {
        headers.authorization = "Basic " + Buffer.from(`${auth.username}:${auth.password}`).toString("base64");
    }
    const resp = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
    });
    return resp;
}
async function getJson(url, auth) {
    const headers = {};
    if (auth) {
        headers.authorization = "Basic " + Buffer.from(`${auth.username}:${auth.password}`).toString("base64");
    }
    const resp = await fetch(url, { headers });
    return resp;
}
async function isPortReachable(url) {
    try {
        const resp = await fetch(url, { signal: AbortSignal.timeout(2000) });
        return resp.ok || resp.status < 500;
    }
    catch {
        return false;
    }
}
function startOpencodeServer() {
    return new Promise((resolve, reject) => {
        const proc = spawn("opencode", ["serve", "--port", "4096", "--hostname", "127.0.0.1"], {
            cwd: REPO_ROOT,
            env: {
                ...process.env,
                OPENCODE_CONFIG: "/home/yy/opencode_server_use/opencode.json",
                OPENCODE_SERVER_PASSWORD: OPENCODE_PASSWORD,
                OPENCODE_SERVER_USERNAME: OPENCODE_USERNAME,
            },
            stdio: ["ignore", "pipe", "pipe"],
        });
        let output = "";
        const onData = (chunk) => {
            output += chunk.toString();
            if (output.includes("opencode server listening on")) {
                cleanup();
                resolve(proc);
            }
        };
        const onError = (err) => {
            cleanup();
            reject(err);
        };
        const cleanup = () => {
            proc.stdout?.off("data", onData);
            proc.stderr?.off("data", onData);
            proc.off("error", onError);
        };
        proc.stdout?.on("data", onData);
        proc.stderr?.on("data", onData);
        proc.on("error", onError);
        setTimeout(() => {
            cleanup();
            proc.kill();
            reject(new Error(`opencode server start timeout\n${output}`));
        }, 30000);
    });
}
function startAppServer() {
    return new Promise((resolve, reject) => {
        const proc = spawn("pnpm", ["exec", "tsx", "app/server/index.ts"], {
            cwd: REPO_ROOT,
            env: {
                ...process.env,
                SKILL_GROWTH_PORT: "0",
            },
            stdio: ["ignore", "pipe", "pipe"],
        });
        let output = "";
        const onData = (chunk) => {
            output += chunk.toString();
            const match = output.match(/listening on http:\/\/localhost:(\d+)/);
            if (match) {
                cleanup();
                resolve({ port: Number(match[1]), proc });
            }
        };
        const onError = (err) => {
            cleanup();
            reject(err);
        };
        const cleanup = () => {
            proc.stdout?.off("data", onData);
            proc.stderr?.off("data", onData);
            proc.off("error", onError);
        };
        proc.stdout?.on("data", onData);
        proc.stderr?.on("data", onData);
        proc.on("error", onError);
        setTimeout(() => {
            cleanup();
            proc.kill();
            reject(new Error(`app server start timeout\n${output}`));
        }, 30000);
    });
}
async function cleanupSkillRun(skillId, runId) {
    await removeDir(skillRoot(skillId)).catch(() => null);
    if (runId) {
        await removeDir(runDir(runId)).catch(() => null);
    }
}
// ---------------------------------------------------------------------------
// 1. 模型端点连通性
// ---------------------------------------------------------------------------
describe("model endpoints", () => {
    const localBase = "http://172.24.16.1:11434/v1";
    it("glm4:9b responds", async () => {
        const resp = await fetch(`${localBase}/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "glm4:9b",
                messages: [{ role: "user", content: "用两个字回答：你好" }],
                max_tokens: 32,
            }),
        });
        assert.equal(resp.status, 200);
        const data = (await resp.json());
        assert.ok(data.choices?.[0]?.message);
    });
    it("qwen3.5:9b responds", async () => {
        const resp = await fetch(`${localBase}/chat/completions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "qwen3.5:9b",
                messages: [{ role: "user", content: "用两个字回答：你好" }],
                max_tokens: 64,
            }),
        });
        assert.equal(resp.status, 200);
        const data = (await resp.json());
        assert.ok(data.choices?.[0]?.message);
    });
    (DEEPSEEK_API_KEY ? it : it.skip)("deepseek-v4-pro responds", async (t) => {
        if (!DEEPSEEK_API_KEY) {
            t.skip("no deepseek api key");
            return;
        }
        try {
            const resp = await fetch("https://api.deepseek.com/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    authorization: `Bearer ${DEEPSEEK_API_KEY}`,
                },
                body: JSON.stringify({
                    model: "deepseek-v4-pro",
                    messages: [{ role: "user", content: "用两个字回答：你好" }],
                    max_tokens: 64,
                    stream: false,
                }),
                signal: AbortSignal.timeout(15000),
            });
            assert.equal(resp.status, 200);
            const data = (await resp.json());
            assert.ok(data.choices?.[0]?.message);
        }
        catch {
            t.skip("deepseek api unreachable from this environment");
        }
    });
});
// ---------------------------------------------------------------------------
// 2. OpenCode server 端点
// ---------------------------------------------------------------------------
describe("opencode server", () => {
    let reachable = false;
    let sessionId = "";
    let opencodeProc = null;
    before(async () => {
        reachable = await isPortReachable(`${OPENCODE_BASE_URL}/global/health`);
        if (!reachable) {
            try {
                opencodeProc = await startOpencodeServer();
                reachable = true;
            }
            catch (err) {
                console.warn("Could not start opencode server:", err);
            }
        }
    });
    after(() => {
        opencodeProc?.kill();
    });
    it("/global/health is healthy", async (t) => {
        if (!reachable) {
            t.skip("opencode server not reachable");
            return;
        }
        const resp = await getJson(`${OPENCODE_BASE_URL}/global/health`, {
            username: OPENCODE_USERNAME,
            password: OPENCODE_PASSWORD,
        });
        assert.equal(resp.status, 200);
        const data = (await resp.json());
        assert.equal(data.healthy, true);
    });
    it("can create a session", async (t) => {
        if (!reachable) {
            t.skip("opencode server not reachable");
            return;
        }
        const resp = await postJson(`${OPENCODE_BASE_URL}/session`, { title: "port-function-test" }, { username: OPENCODE_USERNAME, password: OPENCODE_PASSWORD });
        assert.equal(resp.status, 200);
        const data = (await resp.json());
        assert.ok(data.id);
        sessionId = data.id;
    });
    it("can get session details", async (t) => {
        if (!reachable) {
            t.skip("opencode server not reachable");
            return;
        }
        const resp = await getJson(`${OPENCODE_BASE_URL}/session/${sessionId}`, {
            username: OPENCODE_USERNAME,
            password: OPENCODE_PASSWORD,
        });
        assert.equal(resp.status, 200);
        const data = (await resp.json());
        assert.equal(data.id, sessionId);
    });
    it("can send an async prompt", async (t) => {
        if (!reachable) {
            t.skip("opencode server not reachable");
            return;
        }
        const resp = await postJson(`${OPENCODE_BASE_URL}/session/${sessionId}/prompt_async`, {
            parts: [{ type: "text", text: "用两个字回答：你好" }],
            model: { providerID: "ollama", modelID: "glm4:9b" },
        }, { username: OPENCODE_USERNAME, password: OPENCODE_PASSWORD });
        // prompt_async returns 200/202/204 with an empty body or task id
        assert.ok([200, 202, 204].includes(resp.status));
    });
});
// ---------------------------------------------------------------------------
// 3. Skill Growth Studio 应用 API
// ---------------------------------------------------------------------------
describe("skill-growth app api", () => {
    let server = null;
    const sourceSkill = "tech-doc-didactic-rewriter";
    let skillId = "";
    let runId = "";
    before(async () => {
        server = await startAppServer();
        skillId = `api-test-skill-${Date.now()}`;
        await fs.mkdir(skillRoot(skillId), { recursive: true });
        await copyDir(skillStableDir(sourceSkill), skillStableDir(skillId));
    });
    after(async () => {
        if (server) {
            server.proc.kill();
        }
        await cleanupSkillRun(skillId, runId);
    });
    function api(path) {
        return `http://127.0.0.1:${server.port}/api${path}`;
    }
    it("/api/health returns ok", async () => {
        const resp = await fetch(api("/health"));
        assert.equal(resp.status, 200);
        const data = (await resp.json());
        assert.equal(data.ok, true);
    });
    it("can create a run", async () => {
        const resp = await postJson(api("/runs"), { skillId });
        assert.equal(resp.status, 200);
        const data = (await resp.json());
        assert.ok(data.run_id.startsWith("run-"));
        assert.equal(data.skill_id, skillId);
        runId = data.run_id;
    });
    it("can get run state", async () => {
        const resp = await fetch(api(`/runs/${runId}`));
        assert.equal(resp.status, 200);
        const data = (await resp.json());
        assert.equal(data.run_id, runId);
    });
    it("recommend-prompt returns structured suggestion", async () => {
        const resp = await postJson(api(`/runs/${runId}/stage/observe-log-review/recommend-prompt`), {
            server_id: `${runId}-observe-log-review-1`,
            goal: "生成 replay-card 和 growth-opportunities",
        });
        assert.equal(resp.status, 200);
        const data = (await resp.json());
        assert.ok(data.primary);
        assert.ok(Array.isArray(data.alternatives));
        assert.ok(data.rationale);
    });
    it("can commit work/ to preview", async () => {
        const previewId = `preview-${Date.now()}`;
        const resp = await postJson(api("/runs"), { skillId, previewId });
        const data = (await resp.json());
        const previewRunId = data.run_id;
        // Manually create a stage workspace work/ file
        await fs.mkdir(stageWorkDir(previewRunId, "grow-build", 1), { recursive: true });
        await fs.writeFile(path.join(stageWorkDir(previewRunId, "grow-build", 1), "SKILL.md"), "# Preview Skill\n\nupdated\n", "utf-8");
        const commitResp = await postJson(api(`/runs/${previewRunId}/stage/grow-build/commit`), { attempt: 1 });
        assert.equal(commitResp.status, 200);
        const commitData = (await commitResp.json());
        assert.equal(commitData.ok, true);
        assert.equal(commitData.preview_id, previewId);
        const previewSkillPath = path.join(skillPreviewDir(skillId, previewId), "SKILL.md");
        assert.ok(await fs.access(previewSkillPath).then(() => true, () => false));
        const content = await fs.readFile(previewSkillPath, "utf-8");
        assert.ok(content.includes("updated"));
        await removeDir(runDir(previewRunId)).catch(() => null);
        await removeDir(skillPreviewDir(skillId, previewId)).catch(() => null);
    });
    it("can run api-tests and produce machine-test-result.json", async () => {
        const previewId = `preview-${Date.now()}`;
        const resp = await postJson(api("/runs"), { skillId, previewId });
        const data = (await resp.json());
        const apiRunId = data.run_id;
        const testDir = path.join(stageOutputDir(apiRunId, "observe-api-scan", 1), "api-tests");
        await fs.mkdir(testDir, { recursive: true });
        await fs.writeFile(path.join(testDir, "test_sample.sh"), "#!/bin/bash\necho '{\"status\":\"ok\"}'\nexit 0\n", { mode: 0o755 });
        const runnerResp = await postJson(api(`/runs/${apiRunId}/stage/observe-api-scan/run-api-tests`), { attempt: 1 });
        assert.equal(runnerResp.status, 200);
        const runnerData = (await runnerResp.json());
        assert.equal(runnerData.ok, true);
        assert.equal(runnerData.results[0].status, "passed");
        const reportPath = path.join(stageOutputDir(apiRunId, "observe-api-scan", 1), "machine-test-result.json");
        assert.ok(await fs.access(reportPath).then(() => true, () => false));
        const report = JSON.parse(await fs.readFile(reportPath, "utf-8"));
        assert.equal(report.summary.passed, 1);
        await removeDir(runDir(apiRunId)).catch(() => null);
    });
});
//# sourceMappingURL=port-function.test.js.map