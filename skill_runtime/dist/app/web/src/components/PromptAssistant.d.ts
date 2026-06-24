interface PromptAssistantProps {
    runId: string | null;
    stageId: string | null;
    attempt: number;
    serverId: string | null;
    onSend: (text: string) => void;
}
export declare function PromptAssistant({ runId, stageId, attempt, serverId, onSend }: PromptAssistantProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=PromptAssistant.d.ts.map