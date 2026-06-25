import { spawn } from "cross-spawn";
import type { StageId, OpencodeRuntime } from "../shared/schemas/index.js";
export interface RunningStage extends OpencodeRuntime {
    process: ReturnType<typeof spawn>;
    attempt: number;
    exit_code?: number | null;
    exit_signal?: string | null;
    active_session_id?: string;
    abort_event_stream?: () => void;
    unwatch_output?: () => void;
    healthy: boolean;
    error?: string;
}
export interface StartStageRuntimeOptions {
    run_id: string;
    stage_id: StageId;
    skill_id: string;
    preview_id?: string;
    attempt?: number;
    previous_stage_id?: StageId;
    previous_attempt?: number;
    sessionLogPath?: string;
    apiDocsAvailable?: boolean;
}
export declare function startStageRuntime(opts: StartStageRuntimeOptions): Promise<OpencodeRuntime>;
export interface StopRuntimeResult {
    stopped: boolean;
    exit_code: number | null;
    exit_signal: string | null;
}
export declare function stopStageRuntime(serverId: string, gracefulTimeout?: number): Promise<StopRuntimeResult>;
export declare function stopAllRuntimes(): Promise<void>;
export declare function listRuntimes(): OpencodeRuntime[];
export declare function getRuntime(serverId: string): RunningStage | undefined;
export declare function createRunSnapshot(opts: {
    run_id: string;
    skill_id: string;
    preview_id?: string;
    trigger: string;
}): Promise<void>;
//# sourceMappingURL=stageRuntimeManager.d.ts.map