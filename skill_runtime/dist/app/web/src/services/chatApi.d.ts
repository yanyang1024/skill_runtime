import type { ChatSSEEvent } from "../types/chat";
export declare function createSession(runId: string, stageId: string, attempt: number, title?: string): Promise<{
    id: string;
}>;
export declare function getSession(runId: string, stageId: string, attempt: number, sessionId: string): Promise<unknown>;
export declare function deleteSession(runId: string, stageId: string, attempt: number, sessionId: string): Promise<Response>;
export declare function abortSession(runId: string, stageId: string, attempt: number, sessionId: string): Promise<Response>;
export declare function sendMessage(runId: string, stageId: string, attempt: number, sessionId: string, parts: unknown[], agent?: string, model?: string): Promise<{
    session_id: string;
}>;
export declare function getMessages(runId: string, stageId: string, attempt: number, sessionId: string, limit?: number): Promise<unknown[]>;
export declare function replyQuestion(runId: string, stageId: string, attempt: number, sessionId: string, questionId: string, answer: unknown): Promise<Response>;
export declare function replyPermission(runId: string, stageId: string, attempt: number, sessionId: string, permissionId: string, allowed: boolean): Promise<Response>;
export declare function createEventSource(runId: string, stageId: string, attempt: number, sessionId: string): EventSource;
export declare function parseSSEEvent(data: string): ChatSSEEvent | null;
//# sourceMappingURL=chatApi.d.ts.map