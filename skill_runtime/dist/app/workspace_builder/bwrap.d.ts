import { PathSecurityError } from "../shared/utils/security.js";
export interface BwrapContext {
    workspacePath: string;
    skillId: string;
    previewId?: string;
    runId: string;
    stageId: string;
    attempt: number;
    skillMount: "stable-readonly" | "preview-readonly" | "preview-writable" | "none";
    workWritable: boolean;
}
/**
 * 是否使用 bwrap。默认启用，可通过 STAGE_USE_BWRAP=0 关闭。
 * 写 stage（work_writable）强烈建议启用；只读 stage 在禁用时会发出警告。
 */
export declare function shouldUseBwrap(): boolean;
/**
 * 读取 bwrap profile 模板并生成完整命令。
 * workspacePath 必须先经 path 安全校验。
 */
export declare function buildBwrapCommand(ctx: BwrapContext, opencodeCommand: string[]): Promise<string[]>;
export { PathSecurityError };
//# sourceMappingURL=bwrap.d.ts.map