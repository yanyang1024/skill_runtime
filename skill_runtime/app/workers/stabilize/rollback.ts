import fs from "node:fs/promises";
import path from "node:path";
import * as tar from "tar";
import YAML from "yaml";
import { skillRoot, backupsDir } from "../../shared/utils/paths.js";
import { removeDir, readDirNames } from "../../shared/utils/fs.js";

export async function runRollback(skillId: string, snapshotId: string): Promise<void> {
  const root = skillRoot(skillId);
  const backups = await readDirNames(backupsDir(skillId));

  // find tar.gz matching snapshot id
  const target = backups.find((f) => f.includes(snapshotId) || snapshotId.includes(f.replace(/\.tar\.gz$/, "")));
  if (!target) throw new Error(`snapshot ${snapshotId} not found in .Grow_backups`);
  const tarPath = path.join(backupsDir(skillId), target);

  // clear current skill root directories (except .archive? restore overwrites)
  await removeDir(path.join(root, "stable"));
  await removeDir(path.join(root, "previews"));
  await removeDir(path.join(root, "releases"));

  // extract snapshot
  await tar.extract({
    file: tarPath,
    cwd: root,
  });
}
