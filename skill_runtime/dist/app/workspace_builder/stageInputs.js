import fs from "node:fs/promises";
import path from "node:path";
import { stageInputDir, apiDocsDir } from "../shared/utils/paths.js";
async function copyDir(src, dest) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
        const s = path.join(src, entry.name);
        const d = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            await copyDir(s, d);
        }
        else {
            await fs.copyFile(s, d);
        }
    }
}
export async function prepareStageInputs(opts) {
    const { run_id, stage_id, attempt, skill_id, sessionLogPath, apiDocsAvailable } = opts;
    const inputDir = stageInputDir(run_id, stage_id, attempt);
    if (sessionLogPath) {
        const dest = path.join(inputDir, "session_log");
        const stat = await fs.stat(sessionLogPath).catch(() => null);
        if (stat?.isDirectory()) {
            await copyDir(sessionLogPath, dest);
        }
        else if (stat?.isFile()) {
            await fs.mkdir(dest, { recursive: true });
            await fs.copyFile(sessionLogPath, path.join(dest, path.basename(sessionLogPath)));
        }
    }
    if (apiDocsAvailable) {
        const src = apiDocsDir(skill_id);
        const dest = path.join(inputDir, "api_docs");
        try {
            await fs.access(src);
            await copyDir(src, dest);
        }
        catch {
            // no api docs
        }
    }
}
export async function copyDirectorReview(run_id, fromStageId, fromAttempt, toStageId, toAttempt) {
    const src = path.join(stageInputDir(run_id, fromStageId, fromAttempt), "director-review.md");
    const dest = path.join(stageInputDir(run_id, toStageId, toAttempt), "director-review.md");
    try {
        await fs.copyFile(src, dest);
    }
    catch {
        // ignore if not exists
    }
}
//# sourceMappingURL=stageInputs.js.map