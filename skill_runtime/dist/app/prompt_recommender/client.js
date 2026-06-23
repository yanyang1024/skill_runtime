export class LocalV1Client {
    baseURL;
    apiKey;
    defaultModel;
    constructor(baseURL = process.env.SKILL_GROWTH_RECOMMENDER_URL ?? "http://172.24.16.1:11434/v1", apiKey = process.env.SKILL_GROWTH_RECOMMENDER_API_KEY ?? "local", defaultModel = process.env.SKILL_GROWTH_RECOMMENDER_MODEL ?? "glm4:9b") {
        this.baseURL = baseURL.replace(/\/$/, "");
        this.apiKey = apiKey;
        this.defaultModel = defaultModel;
    }
    async chatCompletion(opts) {
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
        });
        if (!resp.ok) {
            const text = await resp.text();
            throw new Error(`Local v1 API error ${resp.status}: ${text}`);
        }
        return (await resp.json());
    }
}
//# sourceMappingURL=client.js.map