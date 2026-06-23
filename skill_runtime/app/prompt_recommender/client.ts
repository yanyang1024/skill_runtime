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

export class LocalV1Client {
  private baseURL: string;
  private apiKey: string;

  constructor(baseURL = "http://172.24.16.1:11434/v1", apiKey = "local") {
    this.baseURL = baseURL.replace(/\/$/, "");
    this.apiKey = apiKey;
  }

  async chatCompletion(opts: ChatCompletionOptions): Promise<ChatCompletionResponse> {
    const resp = await fetch(`${this.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: opts.model ?? "glm4:9b",
        messages: opts.messages,
        temperature: opts.temperature ?? 0.7,
        max_tokens: opts.max_tokens ?? 512,
        stream: opts.stream ?? false,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Local v1 API error ${resp.status}: ${text}`);
    }

    return (await resp.json()) as ChatCompletionResponse;
  }
}
