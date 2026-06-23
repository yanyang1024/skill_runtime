import { spawn } from "cross-spawn";
import type { StageId, OpencodeRuntime } from "../shared/schemas/index.js";
export interface RunningStage extends OpencodeRuntime {
    process: ReturnType<typeof spawn>;
}
export interface StartStageRuntimeOptions {
    run_id: string;
    stage_id: StageId;
    skill_id: string;
    preview_id?: string;
    attempt?: number;
    previous_stage_id?: StageId;
    previous_attempt?: number;
    corsOrigins?: string[];
    sessionLogPath?: string;
    apiDocsAvailable?: boolean;
}
export declare function startStageRuntime(opts: StartStageRuntimeOptions): Promise<OpencodeRuntime>;
export declare function stopStageRuntime(serverId: string): boolean;
export declare function stopAllRuntimes(): void;
export declare function listRuntimes(): OpencodeRuntime[];
export declare function getRuntime(serverId: string): RunningStage | undefined;
export declare function createRunSnapshot(opts: {
    run_id: string;
    skill_id: string;
    preview_id?: string;
    trigger: string;
}): Promise<void>;
//# sourceMappingURL=stageRuntimeManager.d.ts.map