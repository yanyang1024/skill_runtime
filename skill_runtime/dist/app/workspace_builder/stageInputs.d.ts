import type { StageId } from "../shared/schemas/index.js";
export declare function prepareStageInputs(opts: {
    run_id: string;
    stage_id: StageId;
    attempt: number;
    skill_id: string;
    sessionLogPath?: string;
    apiDocsAvailable?: boolean;
    previous_stage_id?: StageId;
    previous_attempt?: number;
}): Promise<void>;
export declare function copyDirectorReview(run_id: string, fromStageId: StageId, fromAttempt: number, toStageId: StageId, toAttempt: number): Promise<void>;
//# sourceMappingURL=stageInputs.d.ts.map