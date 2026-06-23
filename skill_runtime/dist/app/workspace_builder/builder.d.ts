import type { StageId, RunState, StageState } from "../shared/schemas/index.js";
export interface BuildWorkspaceOptions {
    runState: RunState;
    stageState: StageState;
    port: number;
    corsOrigins: string[];
    previousStageId?: StageId;
    previousAttempt?: number;
}
export declare function buildStageWorkspace(opts: BuildWorkspaceOptions): Promise<string>;
export declare function syncWorkToPreview(skillId: string, runId: string, stageId: StageId, attempt: number, previewId: string): Promise<void>;
//# sourceMappingURL=builder.d.ts.map