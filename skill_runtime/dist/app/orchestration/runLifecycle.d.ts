import type { StageId, RunState } from "../shared/schemas/index.js";
export declare function generateRunId(): string;
export declare function createRun(opts: {
    skill_id: string;
    preview_id?: string;
}): Promise<RunState>;
export declare function findNextAttempt(runId: string, stageId: StageId): Promise<number>;
export declare function initStage(opts: {
    run_id: string;
    stage_id: StageId;
    attempt?: number;
}): Promise<{
    runState: RunState;
    stageState: import("../shared/schemas/index.js").StageState;
}>;
export declare function markStageStatus(runId: string, stageId: StageId, attempt: number, status: import("../shared/schemas/index.js").StageState["status"], outputs?: string[]): Promise<void>;
export declare function listStageOutputs(runId: string, stageId: StageId, attempt: number): Promise<string[]>;
export declare function refreshStageOutputs(runId: string, stageId: StageId, attempt: number): Promise<void>;
export declare function ensureSkillPreviewExists(skillId: string, previewId: string): Promise<boolean>;
//# sourceMappingURL=runLifecycle.d.ts.map