import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { stageOutputDir } from "../shared/utils/paths.js";

export interface ArtifactChangedEvent {
  type: "artifact_changed";
  run_id: string;
  stage_id: string;
  attempt: number;
  name?: string;
}

interface WatcherEntry {
  watcher: fs.FSWatcher;
  outputDir: string;
  debounceTimer?: ReturnType<typeof setTimeout>;
  previousMtimes: Map<string, number>;
}

const watchers = new Map<string, WatcherEntry>();

function scopeKey(runId: string, stageId: string, attempt: number): string {
  return `${runId}|${stageId}|${attempt}`;
}

async function scanMtimes(dir: string): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  try {
    const entries = await fsPromises.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      try {
        const stat = await fsPromises.stat(path.join(dir, entry.name));
        map.set(entry.name, stat.mtimeMs);
      } catch {
        // ignore files that disappear between readdir and stat
      }
    }
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException;
    const key = [...watchers.keys()].find(() => true); // not ideal — we need access to the key for error reporting
    if (nodeErr.code !== "ENOENT") {
      console.error(`[artifactWatcher] scanMtimes error (${nodeErr.code}):`, nodeErr.message);
    }
  }
  return map;
}

/**
 * 监听 stage output 目录变化，发现新文件或修改时调用 onChange。
 * 返回一个停止监听的函数。
 */
export async function watchStageOutput(
  runId: string,
  stageId: string,
  attempt: number,
  onChange: (event: ArtifactChangedEvent) => void,
): Promise<() => void> {
  const key = scopeKey(runId, stageId, attempt);
  const existing = watchers.get(key);
  if (existing) {
    existing.watcher.close();
    if (existing.debounceTimer) clearTimeout(existing.debounceTimer);
    watchers.delete(key);
  }

  const outputDir = stageOutputDir(runId, stageId, attempt);
  await fsPromises.mkdir(outputDir, { recursive: true });
  const previousMtimes = await scanMtimes(outputDir);

  function emitChanges(name?: string) {
    onChange({ type: "artifact_changed", run_id: runId, stage_id: stageId, attempt, name });
  }

  function handleWatchEvent(_eventType: string, filename: string | Buffer | null) {
    const entry = watchers.get(key);
    if (!entry) return;

    if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
    entry.debounceTimer = setTimeout(async () => {
      const currentMtimes = await scanMtimes(outputDir);
      const changed: string[] = [];
      for (const [name, mtime] of currentMtimes) {
        const prev = entry.previousMtimes.get(name);
        if (prev === undefined || prev !== mtime) {
          changed.push(name);
        }
      }
      entry.previousMtimes = currentMtimes;

      if (changed.length > 0) {
        for (const name of changed) {
          emitChanges(name);
        }
      } else if (typeof filename === "string" && filename.length > 0) {
        // fs.watch 给出了文件名但我们没扫描到变化（可能是删除），仍通知前端刷新
        emitChanges(filename);
      }
    }, 200);
  }

  const watcher = fs.watch(outputDir, handleWatchEvent);
  watchers.set(key, { watcher, outputDir, previousMtimes });

  return () => {
    const entry = watchers.get(key);
    if (entry) {
      entry.watcher.close();
      if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
      watchers.delete(key);
    }
  };
}

export function unwatchStageOutput(runId: string, stageId: string, attempt: number): void {
  const key = scopeKey(runId, stageId, attempt);
  const entry = watchers.get(key);
  if (entry) {
    entry.watcher.close();
    if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
    watchers.delete(key);
  }
}

export async function stopAllArtifactWatchers(): Promise<void> {
  for (const [key, entry] of watchers) {
    entry.watcher.close();
    if (entry.debounceTimer) clearTimeout(entry.debounceTimer);
    watchers.delete(key);
  }
}
