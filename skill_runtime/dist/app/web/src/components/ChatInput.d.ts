interface ChatInputProps {
    onSend: (text: string) => void;
    disabled?: boolean;
    onAbort?: () => void;
    streaming?: boolean;
}
export declare function ChatInput({ onSend, disabled, onAbort, streaming }: ChatInputProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=ChatInput.d.ts.map