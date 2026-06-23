import type { SnapshotManifest } from "../shared/schemas/index.js";
export declare function findSnapshotManifest(skillId: string, snapshotId: string): Promise<SnapshotManifest | null>;
export declare function rollbackSkill(skillId: string, snapshotId: string): Promise<void>;
//# sourceMappingURL=rollback.d.ts.map