import { spawn } from "cross-spawn";
export interface Session {
    id: string;
    skillId: string;
    label: string;
    version: string;
    port: number;
    url: string;
    proxyUrl: string;
    workspaceDir: string;
    process: ReturnType<typeof spawn>;
}
export declare function startSession(opts: {
    skillId: string;
    label: string;
    version: string;
}): Promise<Session>;
export declare function stopSession(sessionId: string): boolean;
export declare function listSessions(): Omit<Session, "process">[];
export declare function getSession(sessionId: string): Session | undefined;
export declare function stopAllSessions(): void;
//# sourceMappingURL=sessionManager.d.ts.map