import fs from "node:fs/promises";
import path from "node:path";
import { growthRunsDir } from "./paths.js";
import { filenameTimestamp } from "./time.js";
import YAML from "yaml";

export interface RunPaths {
  runId: string;
  dir: string;
}

export async function createRunDir(skillId: string): Promise<RunPaths> {
  const runId = `run-${filenameTimestamp()}`;
  const dir = path.join(growthRunsDir(skillId), runId);
  await fs.mkdir(dir, { recursive: true });
  return { runId, dir };
}

export async function writeJson<T>(filePath: string, data: T): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

export async function writeYaml<T>(filePath: string, data: T): Promise<void> {
  await fs.writeFile(filePath, YAML.stringify(data), "utf-8");
}

export async function writeMarkdown(filePath: string, content: string): Promise<void> {
  await fs.writeFile(filePath, content, "utf-8");
}
