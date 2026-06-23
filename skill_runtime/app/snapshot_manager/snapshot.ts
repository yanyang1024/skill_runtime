import fs from "node:fs/promises";
import path from "node:path";
import * as tar from "tar";
import YAML from "yaml";
import {
  skillStableDir,
  skillPreviewDir,
  stableBackupDir,
  previewBackupDir,
} from "../shared/utils/paths.js";
import { filenameTimestamp, utcTimestamp } from "../shared/utils/time.js";
import type { SnapshotManifest } from "../shared/schemas/index.js";

export async function createStableSnapshot(
  skillId: string,
  trigger: string,
  sourceRun?: string,
): Promise<SnapshotManifest> {
  const root = skillStableDir(skillId);
  const ts = filenameTimestamp();
  const backupRoot = stableBackupDir(skillId);
  await fs.mkdir(backupRoot, { recursive: true });

  const archivePath = path.join(backupRoot, `${ts}.tar.gz`);

  await tar.create(
    {
      gzip: true,
      file: archivePath,
      cwd: root,
    },
    ["."],
  );

  const manifest: SnapshotManifest = {
    snapshot_id: `snapshot-stable-${ts}`,
    created_at: utcTimestamp(),
    skill_id: skillId,
    path: archivePath,
    included: [`skills/${skillId}/stable`],
    triggered_by: trigger,
    source_run: sourceRun,
    restore_command: `skill-growth restore --snapshot snapshot-stable-${ts}`,
  };

  const manifestPath = archivePath.replace(/\.tar\.gz$/, ".manifest.yaml");
  await fs.writeFile(manifestPath, YAML.stringify(manifest), "utf-8");

  return manifest;
}

export async function createPreviewSnapshot(
  skillId: string,
  previewId: string,
  trigger: string,
  sourceRun?: string,
): Promise<SnapshotManifest> {
  const root = skillPreviewDir(skillId, previewId);
  const ts = filenameTimestamp();
  const backupRoot = previewBackupDir(skillId, previewId);
  await fs.mkdir(backupRoot, { recursive: true });

  const archivePath = path.join(backupRoot, `${ts}.tar.gz`);

  await tar.create(
    {
      gzip: true,
      file: archivePath,
      cwd: root,
    },
    ["."],
  );

  const manifest: SnapshotManifest = {
    snapshot_id: `snapshot-preview-${previewId}-${ts}`,
    created_at: utcTimestamp(),
    skill_id: skillId,
    preview_id: previewId,
    path: archivePath,
    included: [`skills/${skillId}/previews/${previewId}`],
    triggered_by: trigger,
    source_run: sourceRun,
    restore_command: `skill-growth restore --snapshot snapshot-preview-${previewId}-${ts}`,
  };

  const manifestPath = archivePath.replace(/\.tar\.gz$/, ".manifest.yaml");
  await fs.writeFile(manifestPath, YAML.stringify(manifest), "utf-8");

  return manifest;
}

export async function restoreSnapshot(manifest: SnapshotManifest): Promise<void> {
  const dest = manifest.preview_id
    ? skillPreviewDir(manifest.skill_id, manifest.preview_id)
    : skillStableDir(manifest.skill_id);
  await fs.mkdir(dest, { recursive: true });
  await tar.extract({
    gzip: true,
    file: manifest.path,
    cwd: dest,
  });
}
