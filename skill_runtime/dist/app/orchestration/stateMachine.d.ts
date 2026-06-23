import type { RunState, StageState, StageId, StageTransition } from "../shared/schemas/index.js";
export declare function loadRunState(runId: string): Promise<RunState | null>;
export declare function saveRunState(state: RunState): Promise<void>;
export declare function createRunState(opts: {
    run_id: string;
    skill_id: string;
    preview_id?: string;
}): Promise<RunState>;
export declare function updateRunState(runId: string, patch: Partial<RunState>): Promise<RunState>;
export declare function loadStageState(runId: string, stageId: StageId, attempt: number): Promise<StageState | null>;
export declare function saveStageState(state: StageState): Promise<void>;
export declare function createStageState(opts: {
    run_id: string;
    stage_id: StageId;
    attempt: number;
    workspace_path: string;
    digest_path: string;
}): Promise<StageState>;
export declare function updateStageState(runId: string, stageId: StageId, attempt: number, patch: Partial<StageState>): Promise<StageState>;
export declare function appendStageTransitionForRun(runId: string, transition: StageTransition): Promise<void>;
//# sourceMappingURL=stateMachine.d.ts.map