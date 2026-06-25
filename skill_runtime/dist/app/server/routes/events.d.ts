import { Router } from "express";
declare const router: Router;
export declare function emitStatus(text: string, cls?: string): void;
export declare function emitStageStatusChanged(data: {
    run_id: string;
    stage_id: string;
    attempt: number;
    status: string;
    server_id?: string;
}): void;
export declare function emitArtifactChanged(data: {
    run_id: string;
    stage_id: string;
    attempt: number;
    name?: string;
}): void;
export default router;
//# sourceMappingURL=events.d.ts.map