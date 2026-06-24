export interface ArtifactChangedEvent {
    type: "artifact_changed";
    run_id: string;
    stage_id: string;
    attempt: number;
    name?: string;
}
/**
 * 监听 stage output 目录变化，发现新文件或修改时调用 onChange。
 * 返回一个停止监听的函数。
 */
export declare function watchStageOutput(runId: string, stageId: string, attempt: number, onChange: (event: ArtifactChangedEvent) => void): Promise<() => void>;
export declare function unwatchStageOutput(runId: string, stageId: string, attempt: number): void;
export declare function stopAllArtifactWatchers(): Promise<void>;
//# sourceMappingURL=artifactWatcher.d.ts.map