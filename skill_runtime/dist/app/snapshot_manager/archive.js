import fs from "node:fs/promises";
import path from "node:path";
import { skillRoot } from "../shared/utils/paths.js";
import { filenameTimestamp, utcTimestamp } from "../shared/utils/time.js";
export async function archiveFiles(skillId, operations, trigger, sourceRun) {
    const ts = filenameTimestamp();
    const archiveRoot = path.join(skillRoot(skillId), ".archive", ts);
    await fs.mkdir(archiveRoot, { recursive: true });
    const archivedFiles = [];
    for (const op of operations) {
        const absOriginal = path.isAbsolute(op.originalPath)
            ? op.originalPath
            : path.join(skillRoot(skillId), op.originalPath);
        const relativeInsideSkill = path.relative(skillRoot(skillId), absOriginal);
        const archiveTarget = path.join(archiveRoot, relativeInsideSkill);
        await fs.mkdir(path.dirname(archiveTarget), { recursive: true });
        await fs.rename(absOriginal, archiveTarget);
        archivedFiles.push({
            original_path: relativeInsideSkill,
            archive_path: path.join(".archive", ts, relativeInsideSkill),
            reason: op.reason,
            replacement: op.replacement,
        });
    }
    const manifest = {
        archive_id: `archive-${ts}`,
        created_at: utcTimestamp(),
        skill_id: skillId,
        triggered_by: trigger,
        source_run: sourceRun,
        archived_files: archivedFiles,
        policy: {
            never_delete: true,
            can_restore: true,
        },
    };
    return manifest;
}
//# sourceMappingURL=archive.js.map