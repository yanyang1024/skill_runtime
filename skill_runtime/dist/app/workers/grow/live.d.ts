import type { DryRunPlan, SnapshotManifest, ArchiveManifest, QualityReport } from "../../shared/schemas/index.js";
export interface LiveRunResult {
    previewId: string;
    snapshot: SnapshotManifest;
    archive: ArchiveManifest | null;
    qualityReport: QualityReport;
}
export declare function runGrowLive(skillId: string, plan: DryRunPlan): Promise<LiveRunResult>;
//# sourceMappingURL=live.d.ts.map