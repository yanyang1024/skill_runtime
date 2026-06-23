import type { StageId, StageTransition } from "../shared/schemas/index.js";
export type TransitionReason = StageTransition["reason"];
export interface RecommendedTransition {
    from: StageId;
    to: StageId;
    reason: TransitionReason;
    carry_outputs: string[];
    label: string;
}
export declare const RECOMMENDED_TRANSITIONS: RecommendedTransition[];
export declare function getRecommendedNextStages(from: StageId): RecommendedTransition[];
export declare function createStageTransition(from: StageId, to: StageId, reason?: TransitionReason, carry_outputs?: string[]): StageTransition;
export declare function getDefaultPreviousStage(current: StageId): StageId | undefined;
//# sourceMappingURL=stageTransitions.d.ts.map