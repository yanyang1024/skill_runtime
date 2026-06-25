import { loadLocalV1Config } from "../shared/utils/localV1Config.js";
export class LocalV1Client {
    baseURL;
    apiKey;
    defaultModel;
    constructor(baseURL, apiKey, defaultModel) {
        this.baseURL = baseURL.replace(/\/$/, "");
        this.apiKey = apiKey;
        this.defaultModel = defaultModel;
    }
    async chatCompletion(opts) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
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
            return (await resp.json());
        }
        finally {
            clearTimeout(timeout);
        }
    }
}
export async function createLocalV1Client() {
    const envURL = process.env.SKILL_GROWTH_RECOMMENDER_URL;
    const envKey = process.env.SKILL_GROWTH_RECOMMENDER_API_KEY;
    const envModel = process.env.SKILL_GROWTH_RECOMMENDER_MODEL;
    if (envURL && envKey && envModel) {
        return new LocalV1Client(envURL, envKey, envModel);
    }
    const cfg = await loadLocalV1Config();
    return new LocalV1Client(envURL ?? cfg.endpoint, envKey ?? cfg.api_key, envModel ?? cfg.model);
}
//# sourceMappingURL=client.js.map