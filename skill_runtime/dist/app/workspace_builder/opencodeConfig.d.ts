import type { StageId } from "../shared/schemas/index.js";
export interface OpencodeConfigOptions {
    port: number;
    skillId: string;
    stageId: StageId;
}
export declare function buildOpencodeConfig(opts: OpencodeConfigOptions): Promise<Record<string, unknown>>;
//# sourceMappingURL=opencodeConfig.d.ts.map