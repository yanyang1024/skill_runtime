import fs from "node:fs/promises";
import path from "node:path";
import net from "node:net";
import { spawn } from "cross-spawn";
import type { StageId, OpencodeRuntime } from "../shared/schemas/index.js";
import { getStageContract } from "../orchestration/stageContracts.js";
import {
  createStableSnapshot,
  createPreviewSnapshot,
} from "../snapshot_manager/snapshot.js";
import { buildStageWorkspace } from "../workspace_builder/builder.js";
import { buildBwrapCommand, shouldUseBwrap } from "../workspace_builder/bwrap.js";
import { createOpencodeSessionClient } from "../opencode_client/index.js";
import {
  abortEventStream,
  removeSSEEmitter,
} from "../opencode_client/sse.js";
import {
  watchStageOutput,
  unwatchStageOutput,
} from "./artifactWatcher.js";
import { emitArtifactChanged } from "./routes/events.js";

// per-stage serve: each stage has its own opencode serve process and port.

export interface RunningStage extends OpencodeRuntime {
  process: ReturnType<typeof spawn>;
  attempt: number;
  exit_code?: number | null;
  exit_signal?: string | null;
  active_session_id?: string;
  abort_event_stream?: () => void;
  unwatch_output?: () => void;
}

const runtimes = new Map<string, RunningStage>();
let nextPort = 9500;

function generateServerId(runId: string, stageId: StageId, attempt: number): string {
  return `${runId}-${stageId}-${attempt}`;
}

async function allocatePort(): Promise<number> {
  while (true) {
    const port = nextPort++;
    const open = await isPortOpen(port);
    if (!open) return port;
  }
}

async function isPortOpen(port: number, host = "127.0.0.1", timeout = 2000): Promise<boolean> {
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

function getAuth(): string {
  const username = process.env.OPENCODE_SERVER_USERNAME ?? "opencode";
  const password = process.env.OPENCODE_SERVER_PASSWORD ?? "skillgrowth";
  return Buffer.from(`${username}:${password}`).toString("base64");
}

async function waitForHealth(
  port: number,
  proc: ReturnType<typeof spawn>,
  timeout = 30000,
): Promise<void> {
  const started = Date.now();
  let output = "";
  let resolved = false;
  const auth = getAuth();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout waiting for opencode serve on port ${port}`));
    }, timeout);

    const onStdout = (chunk: Buffer) => {
      output += chunk.toString();
    };
    const onStderr = onStdout;

    const onExit = (code: number | null) => {
      cleanup();
      reject(new Error(`opencode serve exited with ${code}\n${output}`));
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
      if (resolved) return;
      if (Date.now() - started > timeout) {
        clearInterval(poll);
        return;
      }
      try {
        const open = await isPortOpen(port, "127.0.0.1", 500);
        if (!open) return;

        const healthResp = await fetch(`http://127.0.0.1:${port}/global/health`, {
          headers: { authorization: `Basic ${auth}` },
        });
        if (!healthResp.ok) return;

        const providerResp = await fetch(`http://127.0.0.1:${port}/provider`, {
          headers: { authorization: `Basic ${auth}` },
        });
        if (!providerResp.ok) return;

        const configResp = await fetch(`http://127.0.0.1:${port}/config`, {
          headers: { authorization: `Basic ${auth}` },
        });
        if (!configResp.ok) return;

        resolved = true;
        clearInterval(poll);
        cleanup();
        resolve();
      } catch {
        // ignore
      }
    }, 500);
  });
}

export interface StartStageRuntimeOptions {
  run_id: string;
  stage_id: StageId;
  skill_id: string;
  preview_id?: string;
  attempt?: number;
  previous_stage_id?: StageId;
  previous_attempt?: number;
  sessionLogPath?: string;
  apiDocsAvailable?: boolean;
}

export async function startStageRuntime(opts: StartStageRuntimeOptions): Promise<OpencodeRuntime> {
  const contract = getStageContract(opts.stage_id);
  const attempt = opts.attempt ?? 1;
  const serverId = generateServerId(opts.run_id, opts.stage_id, attempt);

  if (runtimes.has(serverId)) {
    const existing = runtimes.get(serverId)!;
    if (existing.status === "running") {
      return existing;
    }
    await stopStageRuntime(serverId);
  }

  if (contract.requires_snapshot_before_start) {
    if (opts.stage_id === "grow-build" || opts.stage_id === "rehearse-iteration") {
      if (!opts.preview_id) {
        throw new Error(`Stage ${opts.stage_id} requires a preview_id for snapshot`);
      }
      await createPreviewSnapshot(opts.skill_id, opts.preview_id, `${opts.stage_id}-start`, opts.run_id);
    }
  }

  const { loadStageState, updateStageState } = await import(
    "../orchestration/stateMachine.js"
  );
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

  await updateStageState(opts.run_id, opts.stage_id, attempt, {
    status: "running",
    server_id: serverId,
  });

  const { loadRunState } = await import("../orchestration/stateMachine.js");
  const runState = await loadRunState(opts.run_id);
  if (!runState) {
    throw new Error(`Run not found: ${opts.run_id}`);
  }

  const port = await allocatePort();

  const { workspaceDir, opencodeConfig } = await buildStageWorkspace({
    runState,
    stageState,
    port,
    previousStageId: opts.previous_stage_id,
    previousAttempt: opts.previous_attempt,
  });

  const { prepareStageInputs } = await import("../workspace_builder/stageInputs.js");
  await prepareStageInputs({
    run_id: opts.run_id,
    stage_id: opts.stage_id,
    attempt,
    skill_id: opts.skill_id,
    sessionLogPath: opts.sessionLogPath,
    apiDocsAvailable: opts.apiDocsAvailable,
  });

  // 启动 headless opencode serve，绑定到当前 stage workspace
  const cmd = shouldUseBwrap()
    ? await buildBwrapCommand(
        {
          workspacePath: workspaceDir,
          skillId: opts.skill_id,
          previewId: opts.preview_id,
          runId: opts.run_id,
          stageId: opts.stage_id,
          attempt,
          skillMount: contract.skill_mount,
        },
        ["opencode", "serve", "--hostname", "127.0.0.1", "--port", String(port)],
      )
    : ["opencode", "serve", "--hostname", "127.0.0.1", "--port", String(port)];

  const proc = spawn(cmd[0]!, cmd.slice(1), {
    cwd: workspaceDir,
    env: {
      ...process.env,
      OPENCODE_CONFIG: path.join(workspaceDir, "opencode.json"),
      OPENCODE_CONFIG_DIR: path.join(workspaceDir, ".opencode"),
      OPENCODE_SERVER_PASSWORD: process.env.OPENCODE_SERVER_PASSWORD ?? "skillgrowth",
      OPENCODE_SERVER_USERNAME: process.env.OPENCODE_SERVER_USERNAME ?? "opencode",
    },
  });

  await waitForHealth(port, proc);

  const username = process.env.OPENCODE_SERVER_USERNAME ?? "opencode";
  const password = process.env.OPENCODE_SERVER_PASSWORD ?? "skillgrowth";
  const authToken = Buffer.from(`${username}:${password}`).toString("base64url");
  const openUrl = `http://127.0.0.1:${port}`;

  const runtime: RunningStage = {
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
  };

  runtimes.set(serverId, runtime);

  // 启动 artifact watcher，output 目录文件变化时推送到全局 /api/events
  void watchStageOutput(opts.run_id, opts.stage_id, attempt, emitArtifactChanged).then(
    (unwatch) => {
      const rt = runtimes.get(serverId);
      if (rt) {
        rt.unwatch_output = unwatch;
      }
    },
  );

  proc.on("exit", (code, signal) => {
    const rt = runtimes.get(serverId);
    if (rt) {
      rt.status = "stopped";
      rt.exit_code = code;
      rt.exit_signal = signal;
    }
  });

  await updateStageState(opts.run_id, opts.stage_id, attempt, {
    server_id: serverId,
    status: "running",
  });

  return runtime;
}

export interface StopRuntimeResult {
  stopped: boolean;
  exit_code: number | null;
  exit_signal: string | null;
}

export async function stopStageRuntime(
  serverId: string,
  gracefulTimeout = 5000,
): Promise<StopRuntimeResult> {
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
    } catch {
      // ignore
    }
    try {
      await client.deleteSession(runtime.workspace_path, runtime.active_session_id);
    } catch {
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

  const exited = new Promise<void>((resolve) => {
    proc.once("exit", () => resolve());
  });

  proc.kill("SIGTERM");
  const killTimer = setTimeout(() => {
    proc.kill("SIGKILL");
  }, gracefulTimeout);

  await Promise.race([
    exited,
    new Promise<void>((_, reject) =>
      setTimeout(
        () => reject(new Error("timeout waiting for process exit")),
        gracefulTimeout + 2000,
      ),
    ),
  ]);
  clearTimeout(killTimer);

  const result: StopRuntimeResult = {
    stopped: true,
    exit_code: proc.exitCode ?? null,
    exit_signal: proc.signalCode ?? null,
  };
  runtime.status = "stopped";
  runtimes.delete(serverId);
  return result;
}

export async function stopAllRuntimes(): Promise<void> {
  const ids = Array.from(runtimes.keys());
  await Promise.all(ids.map((id) => stopStageRuntime(id)));
}

export function listRuntimes(): OpencodeRuntime[] {
  return Array.from(runtimes.values()).map((rt) => {
    const { process: _process, ...rest } = rt;
    return rest;
  });
}

export function getRuntime(serverId: string): RunningStage | undefined {
  return runtimes.get(serverId);
}

export async function createRunSnapshot(opts: {
  run_id: string;
  skill_id: string;
  preview_id?: string;
  trigger: string;
}): Promise<void> {
  if (opts.preview_id) {
    await createPreviewSnapshot(opts.skill_id, opts.preview_id, opts.trigger, opts.run_id);
  } else {
    await createStableSnapshot(opts.skill_id, opts.trigger, opts.run_id);
  }
}
