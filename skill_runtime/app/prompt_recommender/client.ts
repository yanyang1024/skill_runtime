import { loadLocalV1Config } from "../shared/utils/localV1Config.js";

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
  private defaultModel: string;

  constructor(baseURL: string, apiKey: string, defaultModel: string) {
    this.baseURL = baseURL.replace(/\/$/, "");
    this.apiKey = apiKey;
    this.defaultModel = defaultModel;
  }

  async chatCompletion(opts: ChatCompletionOptions): Promise<ChatCompletionResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
      const resp = await fetch(`${this.baseURL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: opts.model ?? this.defaultModel,
          messages: opts.messages,
          temperature: opts.temperature ?? 0.7,
          max_tokens: opts.max_tokens ?? 512,
          stream: opts.stream ?? false,
        }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`Local v1 API error ${resp.status}: ${text}`);
      }

      return (await resp.json()) as ChatCompletionResponse;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new Error("Prompt recommender timed out (60s). The model might be busy — try again or use SKILL_GROWTH_RECOMMENDER_MODEL to specify a faster model.");
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}

export async function createLocalV1Client(): Promise<LocalV1Client> {
  const envURL = process.env.SKILL_GROWTH_RECOMMENDER_URL;
  const envKey = process.env.SKILL_GROWTH_RECOMMENDER_API_KEY;
  const envModel = process.env.SKILL_GROWTH_RECOMMENDER_MODEL;

  if (envURL && envKey && envModel) {
    return new LocalV1Client(envURL, envKey, envModel);
  }

  const cfg = await loadLocalV1Config();
  return new LocalV1Client(
    envURL ?? cfg.endpoint,
    envKey ?? cfg.api_key,
    envModel ?? cfg.model,
  );
}
