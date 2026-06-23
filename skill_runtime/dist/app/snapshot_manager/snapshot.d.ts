import type { SnapshotManifest } from "../shared/schemas/index.js";
export declare function createStableSnapshot(skillId: string, trigger: string, sourceRun?: string): Promise<SnapshotManifest>;
export declare function createPreviewSnapshot(skillId: string, previewId: string, trigger: string, sourceRun?: string): Promise<SnapshotManifest>;
export declare function restoreSnapshot(manifest: SnapshotManifest): Promise<void>;
//# sourceMappingURL=snapshot.d.ts.map