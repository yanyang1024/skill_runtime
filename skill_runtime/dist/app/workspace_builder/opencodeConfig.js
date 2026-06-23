import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { REPO_ROOT } from "../shared/utils/paths.js";
async function loadCustomProviders() {
    const customPath = process.env.SKILL_GROWTH_PROVIDERS_CONFIG ??
        path.join(REPO_ROOT, "configs", "model-providers", "custom.yaml");
    let raw;
    try {
        raw = await fs.readFile(customPath, "utf-8");
    }
    catch {
        return {};
    }
    let parsed;
    try {
        parsed = YAML.parse(raw);
    }
    catch {
        return {};
    }
    return parsed.providers ?? parsed.provider ?? {};
}
export async function buildOpencodeConfig(opts) {
    const customProviders = await loadCustomProviders();
    const defaultModel = process.env.SKILL_GROWTH_DEFAULT_MODEL ??
        customProviders.default_model ??
        "local-v1/glm4:9b";
    const smallModel = process.env.SKILL_GROWTH_SMALL_MODEL ??
        customProviders.small_model ??
        "local-v1/glm4:9b";
    const providers = {
        "local-v1": {
            npm: "@ai-sdk/openai-compatible",
            name: "Local OpenAI-Compatible",
            options: {
                baseURL: "http://172.24.16.1:11434/v1",
                apiKey: "local",
            },
            models: {
                "glm4:9b": {
                    name: "GLM4 9B",
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