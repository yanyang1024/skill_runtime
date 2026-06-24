interface ChatPageProps {
    runId: string | null;
    stageId: string | null;
    attempt: number;
    pendingSendText?: string | null;
    onPendingSendConsumed?: () => void;
}
export declare function ChatPage({ runId, stageId, attempt, pendingSendText, onPendingSendConsumed }: ChatPageProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=ChatPage.d.ts.map