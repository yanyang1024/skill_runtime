/**
 * 基于原生 fetch 的 OpenCode serve HTTP 客户端。
 *
 * 不使用 @opencode-ai/sdk，因为 SDK 会把 GET/HEAD 的 x-opencode-directory
 * 头改写成 query 参数，而我们希望统一通过 header 传递 workspace 目录。
 */
export interface OpencodeSessionClient {
    createSession(workspacePath: string, title: string): Promise<{
        id: string;
    }>;
    getSession(workspacePath: string, sessionId: string): Promise<unknown>;
    deleteSession(workspacePath: string, sessionId: string): Promise<Response>;
    getMessages(workspacePath: string, sessionId: string, limit?: number): Promise<unknown[]>;
    sendPromptAsync(workspacePath: string, sessionId: string, body: {
        parts: unknown[];
        agent?: string;
        model?: string;
    }): Promise<Response>;
    abortSession(workspacePath: string, sessionId: string): Promise<Response>;
    replyQuestion(workspacePath: string, sessionId: string, questionId: string, answer: unknown): Promise<Response>;
    replyPermission(workspacePath: string, sessionId: string, permissionId: string, allowed: boolean): Promise<Response>;
    streamEvents(workspacePath: string, sessionId: string, signal: AbortSignal): Promise<ReadableStream<Uint8Array>>;
}
export interface CreateOpencodeSessionClientOptions {
    baseUrl: string;
    username?: string;
    password?: string;
}
export declare function createOpencodeSessionClient(opts: CreateOpencodeSessionClientOptions): OpencodeSessionClient;
//# sourceMappingURL=index.d.ts.map