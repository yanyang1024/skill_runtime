import fs from "node:fs/promises";
import path from "node:path";
import { findSnapshotManifest } from "../../snapshot_manager/rollback.js";
import { restoreSnapshot } from "../../snapshot_manager/snapshot.js";
import { archiveFiles } from "../../snapshot_manager/archive.js";
import { removeDir } from "../../shared/utils/fs.js";
import { skillRoot } from "../../shared/utils/paths.js";

export async function runRollback(skillId: string, snapshotId: string): Promise<void> {
  const manifest = await findSnapshotManifest(skillId, snapshotId);
  if (!manifest) {
    throw new Error(`snapshot ${snapshotId} not found in .Grow_backups`);
  }

  // Archive current state before restoring instead of deleting
  const root = skillRoot(skillId);
  const archiveOps: { originalPath: string; reason: string }[] = [];
  for (const name of ["stable", "previews", "releases"]) {
    const p = path.join(root, name);
    if (await fileExists(p)) {
      archiveOps.push({ originalPath: name, reason: "rollback pre-restore archive" });
    }
  }
  if (archiveOps.length > 0) {
    await archiveFiles(skillId, archiveOps, "rollback-pre-restore");
  }

  // Remove any leftover directories (archiveFiles already moved them)
  for (const name of ["stable", "previews", "releases"]) {
    await removeDir(path.join(root, name)).catch(() => null);
  }

  await restoreSnapshot(manifest);
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
