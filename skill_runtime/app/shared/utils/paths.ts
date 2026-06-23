import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
export const REPO_ROOT = path.resolve(path.dirname(__filename), "../../..");

export function skillRoot(skillId: string): string {
  return path.join(REPO_ROOT, "skills", skillId);
}

export function skillStableDir(skillId: string): string {
  return path.join(skillRoot(skillId), "stable");
}

export function skillPreviewDir(skillId: string, previewId: string): string {
  return path.join(skillRoot(skillId), "previews", previewId);
}

export function skillReleaseDir(skillId: string, version: string): string {
  return path.join(skillRoot(skillId), "releases", version);
}

export function skillArchiveDir(skillId: string, timestamp: string): string {
  return path.join(skillRoot(skillId), ".archive", timestamp.replace(/:/g, "-"));
}

export function backupsDir(skillId: string): string {
  return path.join(REPO_ROOT, ".Grow_backups", skillId);
}

export function stableBackupDir(skillId: string): string {
  return path.join(REPO_ROOT, ".Grow_backups", "stable", skillId);
}

export function previewBackupDir(skillId: string, previewId: string): string {
  return path.join(REPO_ROOT, ".Grow_backups", "preview", skillId, previewId);
}

export function tracesDir(skillId: string): string {
  return path.join(REPO_ROOT, "traces", skillId);
}

export function growthRunsDir(skillId: string): string {
  return path.join(REPO_ROOT, "growth_runs", skillId);
}

export function experimentsDir(skillId: string): string {
  return path.join(REPO_ROOT, "experiments", skillId);
}

export function apiDocsDir(skillId: string): string {
  return path.join(REPO_ROOT, "api_docs", skillId);
}

export function runsDir(): string {
  return path.join(REPO_ROOT, "runs");
}

export function runDir(runId: string): string {
  return path.join(runsDir(), runId);
}

export function stageDir(runId: string, stageId: string, attempt?: number): string {
  const base = path.join(runDir(runId), stageId);
  if (attempt === undefined) return base;
  return path.join(base, "attempts", `attempt-${String(attempt).padStart(3, "0")}`);
}

export function stageWorkspaceDir(runId: string, stageId: string, attempt?: number): string {
  return path.join(stageDir(runId, stageId, attempt), "workspace");
}

export function stageOutputDir(runId: string, stageId: string, attempt?: number): string {
  return path.join(stageDir(runId, stageId, attempt), "output");
}

export function stageInputDir(runId: string, stageId: string, attempt?: number): string {
  return path.join(stageDir(runId, stageId, attempt), "input");
}

export function stageWorkDir(runId: string, stageId: string, attempt?: number): string {
  return path.join(stageDir(runId, stageId, attempt), "workspace", "work");
}

export function toPosix(relativeOrAbsolute: string): string {
  return relativeOrAbsolute.split(path.sep).join("/");
}
