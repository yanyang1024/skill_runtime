import type { ChatMessage, PendingPermission, PendingQuestion } from "../types/chat";
export interface UseChatSessionResult {
    messages: ChatMessage[];
    streaming: boolean;
    error?: string;
    pendingPermissions: PendingPermission[];
    pendingQuestions: PendingQuestion[];
    sessionId: string | null;
    createSession: () => Promise<void>;
    sendMessage: (text: string) => Promise<void>;
    abort: () => Promise<void>;
    replyQuestion: (questionId: string, answer: unknown) => Promise<void>;
    replyPermission: (requestId: string, allowed: boolean) => Promise<void>;
    clearError: () => void;
}
export declare function useChatSession(runId: string | null, stageId: string | null, attempt: number): UseChatSessionResult;
//# sourceMappingURL=useChatSession.d.ts.map