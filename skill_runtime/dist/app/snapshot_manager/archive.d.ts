import type { ArchiveManifest } from "../shared/schemas/index.js";
export interface ArchiveOperation {
    originalPath: string;
    reason: string;
    replacement?: string[];
}
export declare function archiveFiles(skillId: string, operations: ArchiveOperation[], trigger: string, sourceRun?: string): Promise<ArchiveManifest>;
//# sourceMappingURL=archive.d.ts.map