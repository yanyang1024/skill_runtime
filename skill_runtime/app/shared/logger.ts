/**
 * 零依赖结构化日志模块。
 * 写入 logs/skill_runtime.log（JSON 行格式），同时保留 console 输出。
 */
import fs from "node:fs/promises";
import path from "node:path";

const LOG_DIR = "logs";
const LOG_FILE = "skill_runtime.log";

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type Level = keyof typeof LEVELS;
const currentLevel = LEVELS[(process.env.LOG_LEVEL as Level) ?? "info"] ?? LEVELS.info;

let logPromise: Promise<void> = Promise.resolve();

async function writeLine(line: string): Promise<void> {
  logPromise = logPromise.then(async () => {
    try {
      await fs.mkdir(LOG_DIR, { recursive: true });
      await fs.appendFile(path.join(LOG_DIR, LOG_FILE), line + "\n");
    } catch {
      // 日志写入失败不应影响应用运行
    }
  });
}

function log(level: Level, module: string, msg: string, data?: unknown): void {
  if (LEVELS[level] < currentLevel) return;
  const entry = JSON.stringify({
    t: new Date().toISOString(),
    l: level,
    m: module,
    msg,
    ...(data !== undefined ? { data } : {}),
  });
  // 始终保留 console 输出便于开发调试
  const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  fn(`[${module}] ${msg}`, data !== undefined ? data : "");
  void writeLine(entry);
}

export interface Logger {
  debug(msg: string, data?: unknown): void;
  info(msg: string, data?: unknown): void;
  warn(msg: string, data?: unknown): void;
  error(msg: string, data?: unknown): void;
}

export function createLogger(module: string): Logger {
  return {
    debug: (msg, data) => log("debug", module, msg, data),
    info: (msg, data) => log("info", module, msg, data),
    warn: (msg, data) => log("warn", module, msg, data),
    error: (msg, data) => log("error", module, msg, data),
  };
}
