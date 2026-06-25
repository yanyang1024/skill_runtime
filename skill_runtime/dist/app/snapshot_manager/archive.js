import fs from "node:fs/promises";
import path from "node:path";
import { skillRoot } from "../shared/utils/paths.js";
import { resolveContainedPath, PathSecurityError } from "../shared/utils/security.js";
import { filenameTimestamp, utcTimestamp } from "../shared/utils/time.js";
export async function archiveFiles(skillId, operations, trigger, sourceRun) {
    const ts = filenameTimestamp();
    const archiveRoot = path.join(skillRoot(skillId), ".archive", ts);
    await fs.mkdir(archiveRoot, { recursive: true });
    const archivedFiles = [];
    const skillRootPath = skillRoot(skillId);
    for (const op of operations) {
        const absOriginal = path.isAbsolute(op.originalPath)
            ? op.originalPath
            : path.join(skillRootPath, op.originalPath);
        // 路径穿越防护
        try {
            resolveContainedPath(skillRootPath, op.originalPath);
        }
        catch (err) {
            if (err instanceof PathSecurityError) {
                throw err;
            }
        }
        const relativeInsideSkill = path.relative(skillRootPath, absOriginal);
        const archiveTarget = path.join(archiveRoot, relativeInsideSkill);
        await fs.mkdir(path.dirname(archiveTarget), { recursive: true });
        try {
            await fs.rename(absOriginal, archiveTarget);
        }
        catch (err) {
            const nodeErr = err;
            if (nodeErr.code === "EXDEV") {
                // 跨设备 fallback: 复制 + 删除
                await fs.copyFile(absOriginal, archiveTarget);
                await fs.unlink(absOriginal);
            }
            else {
                throw err;
            }
        }
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