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

  // 预检查：确保源目录存在且非空（至少包含 SKILL.md）
  try {
    await fs.access(path.join(root, "SKILL.md"));
  } catch {
    throw new Error(`Stable snapshot aborted: source directory ${root} has no SKILL.md`);
  }

  const tmpArchive = path.join(backupRoot, `.tmp-${ts}.tar.gz`);
  const archivePath = path.join(backupRoot, `${ts}.tar.gz`);

  await tar.create(
    {
      gzip: true,
      file: tmpArchive,
      cwd: root,
    },
    ["."],
  );
  // 写入完成后 rename 为最终路径，避免失败时留下不完整快照
  await fs.rename(tmpArchive, archivePath);

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

  // 预检查：确保源目录存在且非空（至少包含 SKILL.md）
  try {
    await fs.access(path.join(root, "SKILL.md"));
  } catch {
    throw new Error(`Preview snapshot aborted: source directory ${root} has no SKILL.md`);
  }

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

  // 验证 snapshot tar.gz 存在且可读
  try {
    await fs.access(manifest.path);
  } catch {
    throw new Error(`Snapshot archive not found: ${manifest.path}`);
  }

  // 先提取到临时目录，验证完整性后再替换
  const tmpDest = `${dest}.restore-tmp-${process.pid}`;
  await fs.mkdir(tmpDest, { recursive: true });
  try {
    await tar.extract({
      gzip: true,
      file: manifest.path,
      cwd: tmpDest,
    });
    // 验证提取结果：至少包含 SKILL.md
    try {
      await fs.access(path.join(tmpDest, "SKILL.md"));
    } catch {
      throw new Error(`Snapshot restore failed: extracted content at ${tmpDest} is missing SKILL.md — snapshot may be corrupted`);
    }
    // 原子替换
    await fs.rm(dest, { recursive: true, force: true });
    await fs.rename(tmpDest, dest);
  } catch (err) {
    // 清理临时目录
    try { await fs.rm(tmpDest, { recursive: true, force: true }); } catch {}
    throw err;
  }
}
