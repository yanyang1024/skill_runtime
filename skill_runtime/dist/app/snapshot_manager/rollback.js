import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { stableBackupDir, previewBackupDir } from "../shared/utils/paths.js";
import { restoreSnapshot } from "./snapshot.js";
export async function findSnapshotManifest(skillId, snapshotId) {
    const candidates = [];
    // stable snapshots
    const stableDir = stableBackupDir(skillId);
    try {
        const files = await fs.readdir(stableDir);
        for (const f of files) {
            if (f.endsWith(".manifest.yaml"))
                candidates.push(path.join(stableDir, f));
        }
    }
    catch {
        // ignore
    }
    // preview snapshots
    const previewDir = previewBackupDir(skillId, "*");
    // We need to scan all preview dirs
    const previewBase = path.dirname(previewDir);
    try {
        const previewIds = await fs.readdir(previewBase);
        for (const pid of previewIds) {
            const dir = path.join(previewBase, pid);
            const files = await fs.readdir(dir);
            for (const f of files) {
                if (f.endsWith(".manifest.yaml"))
                    candidates.push(path.join(dir, f));
            }
        }
    }
    catch {
        // ignore
    }
    for (const p of candidates) {
        try {
            const raw = await fs.readFile(p, "utf-8");
            const manifest = YAML.parse(raw);
            if (manifest.snapshot_id === snapshotId)
                return manifest;
        }
        catch {
            // ignore
        }
    }
    return null;
}
export async function rollbackSkill(skillId, snapshotId) {
    const manifest = await findSnapshotManifest(skillId, snapshotId);
    if (!manifest) {
        throw new Error(`Snapshot not found: ${snapshotId}`);
    }
    await restoreSnapshot(manifest);
}
//# sourceMappingURL=rollback.js.map