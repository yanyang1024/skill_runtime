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
    private defaultModel;
    constructor(baseURL: string, apiKey: string, defaultModel: string);
    chatCompletion(opts: ChatCompletionOptions): Promise<ChatCompletionResponse>;
}
export declare function createLocalV1Client(): Promise<LocalV1Client>;
//# sourceMappingURL=client.d.ts.map