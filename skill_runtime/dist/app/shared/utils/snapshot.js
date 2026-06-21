import fs from "node:fs/promises";
import path from "node:path";
import * as tar from "tar";
import { skillRoot, backupsDir } from "./paths.js";
import { filenameTimestamp, utcTimestamp } from "./time.js";
export async function createSkillSnapshot(skillId, trigger, sourceRun) {
    const root = skillRoot(skillId);
    const ts = filenameTimestamp();
    const backupRoot = backupsDir(skillId);
    await fs.mkdir(backupRoot, { recursive: true });
    const archivePath = path.join(backupRoot, `${ts}.tar.gz`);
    await tar.create({
        gzip: true,
        file: archivePath,
        cwd: root,
    }, ["."]);
    const manifest = {
        snapshot_id: `snapshot-${ts}`,
        created_at: utcTimestamp(),
        skill_id: skillId,
        path: archivePath,
        included: [
            `skills/${skillId}/stable`,
            `skills/${skillId}/previews`,
            `skills/${skillId}/releases`,
            `skills/${skillId}/.archive`,
        ],
        triggered_by: trigger,
        source_run: sourceRun,
        restore_command: `skill-growth restore --snapshot snapshot-${ts}`,
    };
    return manifest;
}
//# sourceMappingURL=snapshot.js.map