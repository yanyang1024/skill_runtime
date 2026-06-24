import type { ChatMessage, PendingPermission, PendingQuestion } from "../types/chat";
interface SSEActions {
    setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
    setPendingPermissions: React.Dispatch<React.SetStateAction<PendingPermission[]>>;
    setPendingQuestions: React.Dispatch<React.SetStateAction<PendingQuestion[]>>;
    setStreaming: React.Dispatch<React.SetStateAction<boolean>>;
    setError: React.Dispatch<React.SetStateAction<string | undefined>>;
}
export declare function useSSE(runId: string | null, stageId: string | null, attempt: number, sessionId: string | null, actions: SSEActions): {
    close: () => void;
};
export {};
//# sourceMappingURL=useSSE.d.ts.map