import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "cross-spawn";
import { fileURLToPath } from "node:url";
import { skillStableDir, skillPreviewDir, experimentsDir } from "../shared/utils/paths.js";
import { filenameTimestamp } from "../shared/utils/time.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../../..");

export interface Session {
  id: string;
  skillId: string;
  label: string;
  version: string;
  port: number;
  url: string;
  proxyUrl: string;
  workspaceDir: string;
  process: ReturnType<typeof spawn>;
}

const sessions = new Map<string, Session>();
let nextPort = 9000;

function allocatePort(): number {
  return nextPort++;
}

function generateId(): string {
  return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

export async function startSession(opts: {
  skillId: string;
  label: string;
  version: string;
}): Promise<Session> {
  const { skillId, label, version } = opts;

  const skillDir =
    version === "stable"
      ? skillStableDir(skillId)
      : skillPreviewDir(skillId, version);

  if (!(await fileExists(skillDir))) {
    throw new Error(`Skill version not found: ${skillDir}`);
  }

  const sessionId = generateId();
  const workspaceDir = path.join(
    experimentsDir(skillId),
    `rehearse-${filenameTimestamp()}`,
    "workspace",
  );
  const opencodeDir = path.join(workspaceDir, ".opencode");
  const skillsDir = path.join(opencodeDir, "skills", skillId);

  await fs.mkdir(skillsDir, { recursive: true });
  await copyDir(skillDir, skillsDir);

  const config = {
    $schema: "https://opencode.ai/config.json",
    logLevel: "INFO",
    share: "disabled",
    snapshot: true,
    enabled_providers: ["sglang"],
    provider: {
      sglang: {
        id: "sglang",
        options: {
          baseURL: "http://localhost:8000/v1",
          apiKey: "sk-no-key-required",
        },
      },
    },
    model: "sglang/qwen3.6-27b",
    small_model: "sglang/qwen3.6-27b",
  };

  await fs.writeFile(
    path.join(opencodeDir, "opencode.json"),
    JSON.stringify(config, null, 2),
  );

  const port = allocatePort();
  const proc = spawn(
    "opencode",
    ["serve", `--hostname=127.0.0.1`, `--port=${port}`],
    {
      cwd: workspaceDir,
      env: {
        ...process.env,
        OPENCODE_CONFIG_CONTENT: JSON.stringify(config),
      },
    },
  );

  const url = await waitForServerUrl(proc, port);

  const session: Session = {
    id: sessionId,
    skillId,
    label,
    version,
    port,
    url,
    proxyUrl: `/api/sessions/${sessionId}/view/`,
    workspaceDir,
    process: proc,
  };

  sessions.set(sessionId, session);

  proc.on("exit", () => {
    sessions.delete(sessionId);
  });

  return session;
}

export function stopSession(sessionId: string): boolean {
  const session = sessions.get(sessionId);
  if (!session) return false;
  session.process.kill();
  sessions.delete(sessionId);
  return true;
}

export function listSessions(): Omit<Session, "process">[] {
  return Array.from(sessions.values()).map((s) => {
    const { process: _process, ...rest } = s;
    return rest;
  });
}

export function getSession(sessionId: string): Session | undefined {
  return sessions.get(sessionId);
}

export function stopAllSessions(): void {
  for (const session of sessions.values()) {
    try {
      session.process.kill();
    } catch {
      // ignore
    }
  }
  sessions.clear();
}

function waitForServerUrl(
  proc: ReturnType<typeof spawn>,
  port: number,
  timeout = 30000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      proc.kill();
      reject(new Error(`Timeout waiting for opencode server on port ${port}`));
    }, timeout);

    let output = "";

    const onStdout = (chunk: Buffer) => {
      const text = chunk.toString();
      output += text;
      const match = text.match(/opencode server listening on (https?:\/\/[^\s]+)/);
      if (match && match[1]) {
        cleanup();
        resolve(match[1]);
      }
    };

    const onStderr = (chunk: Buffer) => {
      output += chunk.toString();
    };

    const onExit = (code: number | null) => {
      cleanup();
      reject(new Error(`opencode server exited with ${code}\n${output}`));
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
  });
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
