import fs from "node:fs/promises";
import path from "node:path";
import { growthRunsDir } from "./paths.js";
import { filenameTimestamp } from "./time.js";
import YAML from "yaml";
export async function createRunDir(skillId) {
    const runId = `run-${filenameTimestamp()}`;
    const dir = path.join(growthRunsDir(skillId), runId);
    await fs.mkdir(dir, { recursive: true });
    return { runId, dir };
}
export async function writeJson(filePath, data) {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}
export async function writeYaml(filePath, data) {
    await fs.writeFile(filePath, YAML.stringify(data), "utf-8");
}
export async function writeMarkdown(filePath, content) {
    await fs.writeFile(filePath, content, "utf-8");
}
//# sourceMappingURL=growthRun.js.map