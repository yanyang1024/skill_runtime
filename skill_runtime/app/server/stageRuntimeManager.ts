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

export interface RunningStage extends OpencodeRuntime {
  process: ReturnType<typeof spawn>;
}

const runtimes = new Map<string, RunningStage>();
let nextPort = 9000;

function allocatePort(): number {
  const port = nextPort++;
  return port;
}

function generateServerId(runId: string, stageId: StageId, attempt: number): string {
  return `${runId}-${stageId}-${attempt}`;
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

async function waitForHealth(
  port: number,
  proc: ReturnType<typeof spawn>,
  timeout = 30000,
): Promise<boolean> {
  const started = Date.now();
  let output = "";

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout waiting for opencode web on port ${port}`));
    }, timeout);

    const onStdout = (chunk: Buffer) => {
      const text = chunk.toString();
      output += text;
      if (text.includes("Web interface:") || text.includes("opencode server listening on")) {
        // Give it a moment then resolve
        setTimeout(() => {
          cleanup();
          resolve(true);
        }, 500);
      }
    };

    const onStderr = (chunk: Buffer) => {
      output += chunk.toString();
    };

    const onExit = (code: number | null) => {
      cleanup();
      reject(new Error(`opencode web exited with ${code}\n${output}`));
    };

    const cleanup = () => {
      clearTimeout(timer);
      proc.stdout?.off("data", onStdout);
      proc.stderr?.off("data", onStderr);
      proc.off("exit", onExit);
    };

    proc.stdout?.on("data", onStdout);
    proc.stderr?.on("data", onStderr);
    proc.on("exit", onExit);

    // Also poll health endpoint
    const poll = setInterval(async () => {
      try {
        if (Date.now() - started > timeout) {
          clearInterval(poll);
          return;
        }
        const open = await isPortOpen(port);
        if (open) {
          clearInterval(poll);
          cleanup();
          resolve(true);
        }
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
  corsOrigins?: string[];
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
    // stale entry, stop it
    stopStageRuntime(serverId);
  }

  // Snapshot before start if required
  if (contract.requires_snapshot_before_start) {
    if (opts.stage_id === "grow-build" || opts.stage_id === "rehearse-iteration") {
      if (!opts.preview_id) {
        throw new Error(`Stage ${opts.stage_id} requires a preview_id for snapshot`);
      }
      await createPreviewSnapshot(opts.skill_id, opts.preview_id, `${opts.stage_id}-start`, opts.run_id);
    }
  }

  const port = allocatePort();
  const corsOrigins = opts.corsOrigins ?? ["http://localhost:3000"];

  // Build workspace
  const { loadStageState, updateStageState } = await import(
    "../orchestration/stateMachine.js"
  );
  const { initStage } = await import("../orchestration/runLifecycle.js");

  // Initialize stage state if not exists
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

  const workspaceDir = await buildStageWorkspace({
    runState,
    stageState,
    port,
    corsOrigins,
    previousStageId: opts.previous_stage_id,
    previousAttempt: opts.previous_attempt,
  });

  // Prepare inputs
  const { prepareStageInputs } = await import("../workspace_builder/stageInputs.js");
  await prepareStageInputs({
    run_id: opts.run_id,
    stage_id: opts.stage_id,
    attempt,
    skill_id: opts.skill_id,
    sessionLogPath: opts.sessionLogPath,
    apiDocsAvailable: opts.apiDocsAvailable,
  });

  // Build command
  const cmd = shouldUseBwrap()
    ? buildBwrapCommand(workspaceDir, [
        "opencode",
        contract.runtime_mode,
        "--port",
        String(port),
        "--hostname",
        "127.0.0.1",
        ...corsOrigins.flatMap((o) => ["--cors", o]),
      ])
    : [
        "opencode",
        contract.runtime_mode,
        "--port",
        String(port),
        "--hostname",
        "127.0.0.1",
        ...corsOrigins.flatMap((o) => ["--cors", o]),
      ];

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

  const runtime: RunningStage = {
    server_id: serverId,
    stage_id: opts.stage_id,
    run_id: opts.run_id,
    skill_id: opts.skill_id,
    runtime_mode: contract.runtime_mode,
    port,
    base_url: `http://127.0.0.1:${port}`,
    open_url: `http://127.0.0.1:${port}`,
    proxy_url: `/api/runs/${opts.run_id}/stage/${opts.stage_id}/view/`,
    workspace_path: workspaceDir,
    opencode_config_dir: path.join(workspaceDir, ".opencode"),
    process_pid: proc.pid,
    status: "running",
    process: proc,
  };

  runtimes.set(serverId, runtime);

  proc.on("exit", () => {
    const rt = runtimes.get(serverId);
    if (rt) {
      rt.status = "stopped";
    }
  });

  // Update stage state with server info
  await updateStageState(opts.run_id, opts.stage_id, attempt, {
    server_id: serverId,
    status: "running",
  });

  return runtime;
}

export function stopStageRuntime(serverId: string): boolean {
  const runtime = runtimes.get(serverId);
  if (!runtime) return false;
  try {
    runtime.process.kill();
  } catch {
    // ignore
  }
  runtime.status = "stopped";
  runtimes.delete(serverId);
  return true;
}

export function stopAllRuntimes(): void {
  for (const runtime of runtimes.values()) {
    try {
      runtime.process.kill();
    } catch {
      // ignore
    }
  }
  runtimes.clear();
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
