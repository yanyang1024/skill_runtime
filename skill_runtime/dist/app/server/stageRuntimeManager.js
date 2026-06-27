import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import net from "node:net";
import { spawn } from "cross-spawn";
import { spawnSync } from "node:child_process";
import { getStageContract } from "../orchestration/stageContracts.js";
import { createStableSnapshot, createPreviewSnapshot, } from "../snapshot_manager/snapshot.js";
import { buildStageWorkspace } from "../workspace_builder/builder.js";
import { buildBwrapCommand, shouldUseBwrap } from "../workspace_builder/bwrap.js";
import { createOpencodeSessionClient } from "../opencode_client/index.js";
import { abortEventStream, removeSSEEmitter, } from "../opencode_client/sse.js";
import { skillPreviewDir, skillStableDir } from "../shared/utils/paths.js";
import { copyDir } from "../shared/utils/fs.js";
import { watchStageOutput, unwatchStageOutput, } from "./artifactWatcher.js";
import { emitArtifactChanged, emitStageStatusChanged } from "./routes/events.js";
const runtimes = new Map();
let nextPort = 9500;
// opencode 路径缓存：首次解析后复用，避免每次 stage 启动重复 which + realpath + --version
let cachedOpencodePath = null;
async function resolveOpencodePath() {
    if (cachedOpencodePath)
        return cachedOpencodePath;
    try {
        const whichResult = spawnSync("which", ["opencode"], { encoding: "utf-8" });
        if (whichResult.status === 0 && whichResult.stdout.trim()) {
            cachedOpencodePath = fsSync.realpathSync(whichResult.stdout.trim());
        }
        await new Promise((resolve, reject) => {
            const check = spawn("opencode", ["--version"], { stdio: "pipe" });
            check.on("error", (err) => reject(err));
            check.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`opencode --version exit ${code}`))));
        });
    }
    catch (err) {
        const nodeErr = err;
        if (nodeErr.code === "ENOENT") {
            throw new Error("opencode CLI not found in PATH. Install it via: npm install -g @opencode-ai/opencode-ai");
        }
        throw new Error(`opencode CLI check failed: ${nodeErr.message}`);
    }
    return cachedOpencodePath ?? "opencode";
}
// cgroup v2 资源限制（默认关闭，通过 STAGE_CGROUP=1 启用）
async function applyCgroupLimits(serverId, pid) {
    if (process.env.STAGE_CGROUP !== "1")
        return;
    const cgroupBase = "/sys/fs/cgroup";
    const cgroupPath = `${cgroupBase}/stage-${serverId}`;
    try {
        await fs.mkdir(cgroupPath);
        const memMB = parseInt(process.env.STAGE_MEMORY_MB ?? "3200", 10);
        const cpuQuota = parseInt(process.env.STAGE_CPU_QUOTA ?? "200000", 10);
        await fs.writeFile(`${cgroupPath}/memory.max`, String(memMB * 1024 * 1024));
        await fs.writeFile(`${cgroupPath}/cpu.max`, `${cpuQuota} 100000`);
        await fs.writeFile(`${cgroupPath}/cgroup.procs`, String(pid));
        console.log(`[stageRuntime] cgroup applied: mem=${memMB}MB cpu=${cpuQuota}us`);
    }
    catch (err) {
        console.error(`[stageRuntime] cgroup setup failed:`, err);
    }
}
// 运行中健康监控：定期检查 opencode 进程是否仍然响应
function startHealthMonitor(runtime, interval = 30000) {
    const timer = setInterval(async () => {
        if (runtime.process.exitCode !== null || runtime.status === "stopped") {
            clearInterval(timer);
            return;
        }
        try {
            const resp = await fetch(`${runtime.base_url}/global/health`, {
                headers: { authorization: `Basic ${getAuth()}` },
                signal: AbortSignal.timeout(3000),
            });
            if (!resp.ok) {
                runtime.healthy = false;
                runtime.error = `Health check returned ${resp.status}`;
                emitStageStatusChanged({
                    run_id: runtime.run_id, stage_id: runtime.stage_id,
                    attempt: runtime.attempt, status: "error", server_id: runtime.server_id,
                });
            }
            else {
                runtime.healthy = true;
            }
        }
        catch {
            runtime.healthy = false;
            runtime.error = "Health check unreachable";
            emitStageStatusChanged({
                run_id: runtime.run_id, stage_id: runtime.stage_id,
                attempt: runtime.attempt, status: "error", server_id: runtime.server_id,
            });
            clearInterval(timer);
        }
    }, interval);
    runtime.health_timer = timer;
}
function generateServerId(runId, stageId, attempt) {
    return `${runId}-${stageId}-${attempt}`;
}
async function allocatePort() {
    const MAX_PORT = 9600;
    while (true) {
        const port = nextPort++;
        if (port > MAX_PORT) {
            throw new Error(`No available ports in range 9500-${MAX_PORT}`);
        }
        const open = await isPortOpen(port);
        if (!open)
            return port;
    }
}
async function isPortOpen(port, host = "127.0.0.1", timeout = 2000) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(timeout);
        socket.once("connect", () => {
            socket.destroy();
            resolve(true);
        });
        socket.once("timeout", () => {
            socket.destroy();
            resolve(false);
        });
        socket.once("error", () => {
            resolve(false);
        });
        socket.connect(port, host);
    });
}
function getAuth() {
    const username = process.env.OPENCODE_SERVER_USERNAME ?? "opencode";
    const password = process.env.OPENCODE_SERVER_PASSWORD ?? "skillgrowth";
    return Buffer.from(`${username}:${password}`).toString("base64");
}
async function waitForHealth(port, proc, timeout = 30000) {
    const started = Date.now();
    let stdout = "";
    let stderr = "";
    let resolved = false;
    const auth = getAuth();
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            cleanup();
            reject(new Error(`Timeout waiting for opencode serve on port ${port}\n--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}`));
        }, timeout);
        const onStdout = (chunk) => {
            stdout += chunk.toString();
        };
        const onStderr = (chunk) => {
            stderr += chunk.toString();
        };
        const onExit = (code) => {
            cleanup();
            reject(new Error(`opencode serve exited with ${code}\n--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}`));
        };
        const cleanup = () => {
            clearTimeout(timer);
            clearInterval(poll);
            proc.stdout?.off("data", onStdout);
            proc.stderr?.off("data", onStderr);
            proc.off("exit", onExit);
        };
        proc.stdout?.on("data", onStdout);
        proc.stderr?.on("data", onStderr);
        proc.on("exit", onExit);
        const poll = setInterval(async () => {
            if (resolved)
                return;
            if (Date.now() - started > timeout) {
                clearInterval(poll);
                return;
            }
            try {
                const open = await isPortOpen(port, "127.0.0.1", 500);
                if (!open)
                    return;
                const healthResp = await fetch(`http://127.0.0.1:${port}/global/health`, {
                    headers: { authorization: `Basic ${auth}` },
                });
                if (!healthResp.ok)
                    return;
                const providerResp = await fetch(`http://127.0.0.1:${port}/provider`, {
                    headers: { authorization: `Basic ${auth}` },
                });
                if (!providerResp.ok)
                    return;
                const configResp = await fetch(`http://127.0.0.1:${port}/config`, {
                    headers: { authorization: `Basic ${auth}` },
                });
                if (!configResp.ok)
                    return;
                resolved = true;
                clearInterval(poll);
                cleanup();
                resolve();
            }
            catch {
                // ignore
            }
        }, 500);
    });
}
export async function startStageRuntime(opts) {
    const contract = getStageContract(opts.stage_id);
    const attempt = opts.attempt ?? 1;
    const serverId = generateServerId(opts.run_id, opts.stage_id, attempt);
    if (runtimes.has(serverId)) {
        const existing = runtimes.get(serverId);
        if (existing.status === "running") {
            return existing;
        }
        await stopStageRuntime(serverId);
    }
    // 自动初始化 preview：preview-* stage 需要 preview 目录存在
    if (contract.skill_mount === "preview-readonly" || contract.skill_mount === "preview-writable") {
        const pid = opts.preview_id ?? "p1";
        const previewDir = skillPreviewDir(opts.skill_id, pid);
        const stableDir = skillStableDir(opts.skill_id);
        try {
            await fs.access(previewDir);
        }
        catch {
            try {
                await copyDir(stableDir, previewDir);
                console.log(`[stageRuntime] auto-initialized preview ${pid} from stable for stage ${opts.stage_id}`);
            }
            catch (copyErr) {
                throw new Error(`Failed to initialize preview ${pid} from stable: ${String(copyErr)}`);
            }
        }
        // 确保 opts 中有 preview_id
        if (!opts.preview_id) {
            opts.preview_id = pid;
        }
    }
    if (contract.requires_snapshot_before_start) {
        if (opts.stage_id === "grow-build" || opts.stage_id === "rehearse-iteration") {
            if (!opts.preview_id) {
                throw new Error(`Stage ${opts.stage_id} requires a preview_id for snapshot`);
            }
            await createPreviewSnapshot(opts.skill_id, opts.preview_id, `${opts.stage_id}-start`, opts.run_id);
        }
    }
    const { loadStageState, updateStageState, loadRunState, updateRunState: updateRun } = await import("../orchestration/stateMachine.js");
    const { initStage } = await import("../orchestration/runLifecycle.js");
    let stageState = await loadStageState(opts.run_id, opts.stage_id, attempt);
    if (!stageState) {
        const { stageState: created } = await initStage({
            run_id: opts.run_id,
            stage_id: opts.stage_id,
            attempt,
        });
        stageState = created;
    }
    const runState = await loadRunState(opts.run_id);
    if (!runState) {
        throw new Error(`Run not found: ${opts.run_id}`);
    }
    const port = await allocatePort();
    // 并行化：workspace 构建 与 input 准备 互不依赖，同时执行
    const { prepareStageInputs } = await import("../workspace_builder/stageInputs.js");
    const [{ workspaceDir, opencodeConfig }] = await Promise.all([
        buildStageWorkspace({
            runState,
            stageState,
            port,
            previousStageId: opts.previous_stage_id,
            previousAttempt: opts.previous_attempt,
        }),
        prepareStageInputs({
            run_id: opts.run_id,
            stage_id: opts.stage_id,
            attempt,
            skill_id: opts.skill_id,
            sessionLogPath: opts.sessionLogPath,
            apiDocsAvailable: opts.apiDocsAvailable,
            previous_stage_id: opts.previous_stage_id,
            previous_attempt: opts.previous_attempt,
        }),
    ]);
    // opencode 路径解析（缓存）
    const resolvedOpencodePath = await resolveOpencodePath();
    // 启动 headless opencode serve，绑定到当前 stage workspace
    const opencodeCommand = [resolvedOpencodePath, "serve", "--hostname", "127.0.0.1", "--port", String(port)];
    // bwrap 预检
    if (shouldUseBwrap()) {
        const bwrapPath = process.platform === "linux" ? "/usr/bin/bwrap" : "bwrap";
        try {
            await fs.access(bwrapPath);
        }
        catch {
            throw new Error(`bwrap is enabled but ${bwrapPath} not found – install bubblewrap or set STAGE_USE_BWRAP=0`);
        }
    }
    const cmd = shouldUseBwrap()
        ? await buildBwrapCommand({
            workspacePath: workspaceDir,
            skillId: opts.skill_id,
            previewId: opts.preview_id,
            runId: opts.run_id,
            stageId: opts.stage_id,
            attempt,
            skillMount: contract.skill_mount,
            workWritable: contract.work_writable,
        }, opencodeCommand)
        : opencodeCommand;
    if (process.env.BWRAP_DEBUG || process.env.STAGE_DEBUG) {
        console.log(`[stageRuntime] spawn ${cmd.join(" ")}`);
        console.log(`[stageRuntime] cwd: ${workspaceDir}`);
    }
    const proc = spawn(cmd[0], cmd.slice(1), {
        cwd: workspaceDir,
        env: {
            ...process.env,
            OPENCODE_CONFIG: path.join(workspaceDir, "opencode.json"),
            OPENCODE_CONFIG_DIR: path.join(workspaceDir, ".opencode"),
            OPENCODE_SERVER_PASSWORD: process.env.OPENCODE_SERVER_PASSWORD ?? "skillgrowth",
            OPENCODE_SERVER_USERNAME: process.env.OPENCODE_SERVER_USERNAME ?? "opencode",
        },
    });
    // cgroup v2 资源限制（可选，通过 STAGE_CGROUP=1 启用）
    if (proc.pid)
        void applyCgroupLimits(serverId, proc.pid);
    let healthErr = "";
    try {
        await waitForHealth(port, proc);
    }
    catch (err) {
        healthErr = err instanceof Error ? err.message : String(err);
        // 健康检查失败：注册一个 error runtime 便于上层查询，然后 kill 子进程
        const errorRuntime = {
            server_id: serverId,
            stage_id: opts.stage_id,
            run_id: opts.run_id,
            skill_id: opts.skill_id,
            runtime_mode: contract.runtime_mode,
            port,
            base_url: `http://127.0.0.1:${port}`,
            open_url: `http://127.0.0.1:${port}`,
            open_url_with_auth: "",
            proxy_url: "",
            workspace_path: workspaceDir,
            opencode_config_dir: path.join(workspaceDir, ".opencode"),
            process_pid: proc.pid,
            status: "error",
            attempt,
            process: proc,
            healthy: false,
            error: healthErr,
        };
        runtimes.set(serverId, errorRuntime);
        proc.kill("SIGTERM");
        await updateStageState(opts.run_id, opts.stage_id, attempt, {
            server_id: serverId,
            status: "error",
        }).catch(() => { });
        throw new Error(`Health check failed for stage ${opts.stage_id}: ${healthErr}`);
    }
    const username = process.env.OPENCODE_SERVER_USERNAME ?? "opencode";
    const password = process.env.OPENCODE_SERVER_PASSWORD ?? "skillgrowth";
    const authToken = Buffer.from(`${username}:${password}`).toString("base64url");
    const openUrl = `http://127.0.0.1:${port}`;
    const runtime = {
        server_id: serverId,
        stage_id: opts.stage_id,
        run_id: opts.run_id,
        skill_id: opts.skill_id,
        runtime_mode: contract.runtime_mode,
        port,
        base_url: openUrl,
        open_url: openUrl,
        open_url_with_auth: `${openUrl}?auth_token=${authToken}`,
        proxy_url: "",
        workspace_path: workspaceDir,
        opencode_config_dir: path.join(workspaceDir, ".opencode"),
        process_pid: proc.pid,
        status: "running",
        attempt,
        process: proc,
        healthy: true,
    };
    runtimes.set(serverId, runtime);
    // 启动 artifact watcher，output 目录文件变化时推送到全局 /api/events
    void watchStageOutput(opts.run_id, opts.stage_id, attempt, emitArtifactChanged).then((unwatch) => {
        const rt = runtimes.get(serverId);
        if (rt) {
            rt.unwatch_output = unwatch;
        }
    }, (err) => {
        console.error("[stageRuntime] watchStageOutput failed:", err);
    });
    proc.on("exit", (code, signal) => {
        const rt = runtimes.get(serverId);
        const finalStatus = code === 0 && !signal ? "completed" : "error";
        if (rt) {
            rt.status = "stopped";
            rt.healthy = false;
            rt.exit_code = code;
            rt.exit_signal = signal;
            if (code !== 0 || signal) {
                rt.error = `Process exited with code ${code} signal ${signal}`;
            }
        }
        void updateStageState(opts.run_id, opts.stage_id, attempt, {
            status: finalStatus,
        }).catch(() => { });
        // 广播 stage 状态变化
        emitStageStatusChanged({
            run_id: opts.run_id,
            stage_id: opts.stage_id,
            attempt,
            status: finalStatus,
            server_id: serverId,
        });
        // 更新 run 状态
        if (finalStatus === "completed" || finalStatus === "error") {
            updateRun(opts.run_id, {
                status: finalStatus === "completed" ? "completed" : "failed",
            }).catch(() => { });
        }
    });
    await updateStageState(opts.run_id, opts.stage_id, attempt, {
        server_id: serverId,
        status: "running",
    });
    // 启动运行中健康监控
    startHealthMonitor(runtime);
    return runtime;
}
export async function stopStageRuntime(serverId, gracefulTimeout = 5000) {
    const runtime = runtimes.get(serverId);
    if (!runtime) {
        return { stopped: false, exit_code: null, exit_signal: null };
    }
    // 1. 取消当前 stage 的 SSE 读取器
    runtime.abort_event_stream?.();
    // 2. abort / delete 该 stage 的活跃 session
    if (runtime.active_session_id && runtime.base_url) {
        const client = createOpencodeSessionClient({ baseUrl: runtime.base_url });
        try {
            await client.abortSession(runtime.workspace_path, runtime.active_session_id);
        }
        catch {
            // ignore
        }
        try {
            await client.deleteSession(runtime.workspace_path, runtime.active_session_id);
        }
        catch {
            // ignore
        }
        if (runtime.run_id && runtime.stage_id && runtime.attempt) {
            abortEventStream(runtime.run_id, runtime.stage_id, runtime.attempt, runtime.active_session_id);
            removeSSEEmitter(runtime.run_id, runtime.stage_id, runtime.attempt, runtime.active_session_id);
        }
        runtime.active_session_id = undefined;
        runtime.abort_event_stream = undefined;
    }
    // 停止 artifact watcher
    runtime.unwatch_output?.();
    unwatchStageOutput(runtime.run_id, runtime.stage_id, runtime.attempt);
    const proc = runtime.process;
    if (proc.exitCode !== null || proc.signalCode !== null) {
        runtime.status = "stopped";
        runtimes.delete(serverId);
        return {
            stopped: true,
            exit_code: proc.exitCode,
            exit_signal: proc.signalCode,
        };
    }
    const exited = new Promise((resolve) => {
        proc.once("exit", () => resolve());
    });
    proc.kill("SIGTERM");
    const killTimer = setTimeout(() => {
        proc.kill("SIGKILL");
    }, gracefulTimeout);
    await Promise.race([
        exited,
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout waiting for process exit")), gracefulTimeout + 2000)),
    ]);
    clearTimeout(killTimer);
    const result = {
        stopped: true,
        exit_code: proc.exitCode ?? null,
        exit_signal: proc.signalCode ?? null,
    };
    runtime.status = "stopped";
    runtimes.delete(serverId);
    return result;
}
export async function stopAllRuntimes() {
    const ids = Array.from(runtimes.keys());
    await Promise.all(ids.map((id) => stopStageRuntime(id)));
}
export function listRuntimes() {
    return Array.from(runtimes.values()).map((rt) => {
        const { process: _process, ...rest } = rt;
        return rest;
    });
}
export function getRuntime(serverId) {
    return runtimes.get(serverId);
}
export async function createRunSnapshot(opts) {
    if (opts.preview_id) {
        await createPreviewSnapshot(opts.skill_id, opts.preview_id, opts.trigger, opts.run_id);
    }
    else {
        await createStableSnapshot(opts.skill_id, opts.trigger, opts.run_id);
    }
}
//# sourceMappingURL=stageRuntimeManager.js.map