export declare function apiGet(path: string): Promise<unknown>;
export declare function apiPost(path: string, body?: unknown): Promise<unknown>;
export declare function apiText(path: string): Promise<string>;
export declare function createRun(skillId: string, previewId?: string): Promise<{
    run_id: string;
}>;
export declare function listRuns(): Promise<Array<{
    run_id: string;
    skill_id: string;
    status: string;
}>>;
export declare function listSkills(): Promise<string[]>;
export declare function startStage(runId: string, stageId: string, attempt?: number): Promise<{
    server_id: string;
    port: number;
    open_url: string;
    status: string;
}>;
export declare function stopStage(runId: string, stageId: string, attempt?: number): Promise<unknown>;
export declare function commitStage(runId: string, stageId: string, attempt?: number): Promise<unknown>;
export declare function retryStage(runId: string, stageId: string): Promise<{
    server_id: string;
    attempt: number;
    open_url: string;
}>;
export declare function getStageState(runId: string, stageId: string, attempt?: number): Promise<unknown>;
export declare function recommendPrompt(runId: string, stageId: string, attempt: number, serverId: string, opts?: Record<string, unknown>): Promise<{
    primary: string;
    alternatives: string[];
    rationale: string;
    risk_hint?: string;
}>;
export declare function listArtifacts(runId: string, stageId: string, attempt?: number): Promise<Array<{
    name: string;
}>>;
export declare function getArtifact(runId: string, stageId: string, name: string, attempt?: number): Promise<string>;
export declare function saveDirectorReview(runId: string, stageId: string, content: string, attempt?: number): Promise<unknown>;
//# sourceMappingURL=api.d.ts.map