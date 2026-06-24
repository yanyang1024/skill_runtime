import type { Request, RequestHandler } from "express";
import { StageId } from "../../shared/schemas/index.js";
export interface SafeSkillParams {
    skillId: string;
}
export declare function getSafeParams<T>(req: Request): T;
export declare function validateSkillParams(): RequestHandler;
export interface SafeRunStageParams {
    runId: string;
    stageId: StageId;
    attempt: number;
}
export declare function validateRunStageParams(): RequestHandler;
export interface SafeArtifactParams extends SafeRunStageParams {
    name: string;
}
export declare function validateArtifactParams(): RequestHandler;
//# sourceMappingURL=validateParams.d.ts.map