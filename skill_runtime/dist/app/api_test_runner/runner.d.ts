import type { StageId } from "../shared/schemas/index.js";
export interface ApiTestResult {
    name: string;
    path: string;
    status: "passed" | "failed" | "error" | "skipped";
    stdout: string;
    stderr: string;
    exit_code?: number;
    duration_ms: number;
    error?: string;
}
export interface MachineTestReport {
    generated_at: string;
    stage_id: StageId;
    run_id: string;
    attempt: number;
    summary: {
        total: number;
        passed: number;
        failed: number;
        error: number;
        skipped: number;
    };
    results: ApiTestResult[];
}
export declare function runApiTests(runId: string, stageId: StageId, attempt: number): Promise<ApiTestResult[]>;
//# sourceMappingURL=runner.d.ts.map