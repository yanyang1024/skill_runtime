import type { RuntimeTrace, DryRunPlan, GrowthProposal } from "../../shared/schemas/index.js";
export declare function runGrowDryRun(skillId: string, trace: RuntimeTrace): Promise<{
    runId: string;
    plan: DryRunPlan;
    proposal: GrowthProposal;
}>;
//# sourceMappingURL=dryRun.d.ts.map