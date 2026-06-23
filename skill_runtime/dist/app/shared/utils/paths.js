import { fileURLToPath } from "node:url";
import path from "node:path";
const __filename = fileURLToPath(import.meta.url);
export const REPO_ROOT = path.resolve(path.dirname(__filename), "../../..");
export function skillRoot(skillId) {
    return path.join(REPO_ROOT, "skills", skillId);
}
export function skillStableDir(skillId) {
    return path.join(skillRoot(skillId), "stable");
}
export function skillPreviewDir(skillId, previewId) {
    return path.join(skillRoot(skillId), "previews", previewId);
}
export function skillReleaseDir(skillId, version) {
    return path.join(skillRoot(skillId), "releases", version);
}
export function skillArchiveDir(skillId, timestamp) {
    return path.join(skillRoot(skillId), ".archive", timestamp.replace(/:/g, "-"));
}
export function backupsDir(skillId) {
    return path.join(REPO_ROOT, ".Grow_backups", skillId);
}
export function stableBackupDir(skillId) {
    return path.join(REPO_ROOT, ".Grow_backups", "stable", skillId);
}
export function previewBackupDir(skillId, previewId) {
    return path.join(REPO_ROOT, ".Grow_backups", "preview", skillId, previewId);
}
export function tracesDir(skillId) {
    return path.join(REPO_ROOT, "traces", skillId);
}
export function growthRunsDir(skillId) {
    return path.join(REPO_ROOT, "growth_runs", skillId);
}
export function experimentsDir(skillId) {
    return path.join(REPO_ROOT, "experiments", skillId);
}
export function apiDocsDir(skillId) {
    return path.join(REPO_ROOT, "api_docs", skillId);
}
export function runsDir() {
    return path.join(REPO_ROOT, "runs");
}
export function runDir(runId) {
    return path.join(runsDir(), runId);
}
export function stageDir(runId, stageId, attempt) {
    const base = path.join(runDir(runId), stageId);
    if (attempt === undefined)
        return base;
    return path.join(base, "attempts", `attempt-${String(attempt).padStart(3, "0")}`);
}
export function stageWorkspaceDir(runId, stageId, attempt) {
    return path.join(stageDir(runId, stageId, attempt), "workspace");
}
export function stageOutputDir(runId, stageId, attempt) {
    return path.join(stageDir(runId, stageId, attempt), "output");
}
export function stageInputDir(runId, stageId, attempt) {
    return path.join(stageDir(runId, stageId, attempt), "input");
}
export function stageWorkDir(runId, stageId, attempt) {
    return path.join(stageDir(runId, stageId, attempt), "workspace", "work");
}
export function toPosix(relativeOrAbsolute) {
    return relativeOrAbsolute.split(path.sep).join("/");
}
//# sourceMappingURL=paths.js.map