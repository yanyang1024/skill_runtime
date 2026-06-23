export interface PromoteResult {
    releaseVersion: string;
    oldStableMovedTo: string;
    changelogPath: string;
}
export declare function runStabilizePromote(skillId: string, previewId?: string): Promise<PromoteResult>;
//# sourceMappingURL=promote.d.ts.map