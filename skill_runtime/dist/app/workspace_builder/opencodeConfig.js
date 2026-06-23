import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { REPO_ROOT } from "../shared/utils/paths.js";
async function loadLocalV1Config() {
    const configPath = path.join(REPO_ROOT, "configs", "model-providers", "local-v1.yaml");
    try {
        const raw = await fs.readFile(configPath, "utf-8");
        return YAML.parse(raw);
    }
    catch {
        return {};
    }
}
async function loadCustomProviders() {
    const customPath = process.env.SKILL_GROWTH_PROVIDERS_CONFIG ??
        path.join(REPO_ROOT, "configs", "model-providers", "custom.yaml");
    let raw;
    try {
        raw = await fs.readFile(customPath, "utf-8");
    }
    catch {
        return { providers: {} };
    }
    let parsed;
    try {
        parsed = YAML.parse(raw);
    }
    catch {
        return { providers: {} };
    }
    return {
        providers: parsed.providers ?? parsed.provider ?? {},
        default_model: parsed.default_model,
        small_model: parsed.small_model,
    };
}
export async function buildOpencodeConfig(opts) {
    const customProviders = await loadCustomProviders();
    const localV1 = await loadLocalV1Config();
    const localV1BaseURL = process.env.SKILL_GROWTH_LOCAL_V1_URL ?? localV1.endpoint ?? "http://172.24.16.1:11434/v1";
    const localV1ApiKey = localV1.api_key ?? "local";
    const localV1Model = localV1.model ?? "glm4:9b";
    const defaultModel = process.env.SKILL_GROWTH_DEFAULT_MODEL ??
        customProviders.default_model ??
        `local-v1/${localV1Model}`;
    const smallModel = process.env.SKILL_GROWTH_SMALL_MODEL ??
        customProviders.small_model ??
        `local-v1/${localV1Model}`;
    const providers = {
        "local-v1": {
            npm: "@ai-sdk/openai-compatible",
            name: "Local OpenAI-Compatible",
            options: {
                baseURL: localV1BaseURL,
                apiKey: localV1ApiKey,
            },
            models: {
                [localV1Model]: {
                    name: localV1Model,
                    tools: false,
                    capabilities: { input: ["text"], output: ["text"] },
                    limit: { context: 131072, output: 8192 },
                },
                "qwen3.5:9b": {
                    name: "Qwen 3.5 9B",
                    tools: false,
                    capabilities: { input: ["text"], output: ["text"] },
                    limit: { context: 262144, output: 8192 },
                },
            },
        },
        ...customProviders,
    };
    const deepseekApiKey = process.env.DEEPSEEK_API_KEY;
    if (deepseekApiKey) {
        providers.deepseek = {
            npm: "@ai-sdk/openai-compatible",
            name: "DeepSeek API",
            options: {
                baseURL: "https://api.deepseek.com/v1",
                apiKey: deepseekApiKey,
            },
            models: {
                "deepseek-v4-pro": {
                    name: "DeepSeek V4 Pro",
                    tools: true,
                    capabilities: { input: ["text"], output: ["text"] },
                    limit: { context: 64000, output: 8192 },
                },
            },
        };
    }
    return {
        $schema: "https://opencode.ai/config.json",
        model: defaultModel,
        small_model: smallModel,
        server: {
            port: opts.port,
            hostname: "127.0.0.1",
            mdns: false,
            cors: opts.corsOrigins,
        },
        permission: {
            edit: "ask",
            bash: {
                "*": "ask",
                "ls *": "allow",
                "cat *": "allow",
                "grep *": "allow",
                "python *": "ask",
                "rm *": "deny",
                "git push *": "deny",
            },
        },
        agent: {
            build: {
                permission: {
                    edit: "allow",
                    bash: {
                        "ls *": "allow",
                        "cat *": "allow",
                        "python *": "ask",
                        "rm *": "deny",
                    },
                },
            },
            iteration: {
                permission: {
                    edit: "allow",
                    bash: {
                        "ls *": "allow",
                        "cat *": "allow",
                        "python *": "ask",
                        "rm *": "deny",
                    },
                },
            },
        },
        provider: providers,
        // stage-level metadata for OpenCode context
        _skill_growth_stage: opts.stageId,
        _skill_growth_skill: opts.skillId,
    };
}
//# sourceMappingURL=opencodeConfig.js.map