import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import type { StageId } from "../shared/schemas/index.js";
import { REPO_ROOT } from "../shared/utils/paths.js";

export interface OpencodeConfigOptions {
  port: number;
  corsOrigins: string[];
  skillId: string;
  stageId: StageId;
}

interface CustomProviderFile {
  provider?: Record<string, unknown>;
  providers?: Record<string, unknown>;
  default_model?: string;
  small_model?: string;
}

async function loadCustomProviders(): Promise<Record<string, unknown>> {
  const customPath =
    process.env.SKILL_GROWTH_PROVIDERS_CONFIG ??
    path.join(REPO_ROOT, "configs", "model-providers", "custom.yaml");

  let raw: string;
  try {
    raw = await fs.readFile(customPath, "utf-8");
  } catch {
    return {};
  }

  let parsed: CustomProviderFile;
  try {
    parsed = YAML.parse(raw) as CustomProviderFile;
  } catch {
    return {};
  }

  return parsed.providers ?? parsed.provider ?? {};
}

export async function buildOpencodeConfig(
  opts: OpencodeConfigOptions,
): Promise<Record<string, unknown>> {
  const customProviders = await loadCustomProviders();

  const defaultModel =
    process.env.SKILL_GROWTH_DEFAULT_MODEL ??
    (customProviders.default_model as string | undefined) ??
    "local-v1/glm4:9b";
  const smallModel =
    process.env.SKILL_GROWTH_SMALL_MODEL ??
    (customProviders.small_model as string | undefined) ??
    "local-v1/glm4:9b";

  const providers: Record<string, unknown> = {
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
