import { findSnapshotManifest } from "../../snapshot_manager/rollback.js";
import { restoreSnapshot } from "../../snapshot_manager/snapshot.js";
import { removeDir } from "../../shared/utils/fs.js";
import path from "node:path";
import { skillRoot } from "../../shared/utils/paths.js";

export async function runRollback(skillId: string, snapshotId: string): Promise<void> {
  const manifest = await findSnapshotManifest(skillId, snapshotId);
  if (!manifest) {
    throw new Error(`snapshot ${snapshotId} not found in .Grow_backups`);
  }

  // clear current stable/previews/releases directories
  const root = skillRoot(skillId);
  await removeDir(path.join(root, "stable"));
  await removeDir(path.join(root, "previews"));
  await removeDir(path.join(root, "releases"));

  await restoreSnapshot(manifest);
}
