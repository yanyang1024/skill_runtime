export interface ChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}
export interface ChatCompletionOptions {
    messages: ChatMessage[];
    model?: string;
    temperature?: number;
    max_tokens?: number;
    stream?: boolean;
}
export interface ChatCompletionResponse {
    choices: {
        message: {
            content: string;
        };
    }[];
}
export declare class LocalV1Client {
    private baseURL;
    private apiKey;
    constructor(baseURL?: string, apiKey?: string);
    chatCompletion(opts: ChatCompletionOptions): Promise<ChatCompletionResponse>;
}
//# sourceMappingURL=client.d.ts.map