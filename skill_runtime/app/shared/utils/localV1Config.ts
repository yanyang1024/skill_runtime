import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { REPO_ROOT } from "./paths.js";

export interface LocalV1Config {
  endpoint: string;
  model: string;
  api_key: string;
}

const DEFAULT_CONFIG: LocalV1Config = {
  endpoint: "http://172.24.16.1:11434/v1",
  model: "glm4:9b",
  api_key: "local",
};

export async function loadLocalV1Config(): Promise<LocalV1Config> {
  const configPath = path.join(REPO_ROOT, "configs", "model-providers", "local-v1.yaml");
  let raw: string;
  try {
    raw = await fs.readFile(configPath, "utf-8");
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === "ENOENT") {
      return { ...DEFAULT_CONFIG };
    }
    throw new Error(`Failed to read model provider config: ${nodeErr.message}`);
  }

  const parsed = YAML.parse(raw);
  if (parsed === null || typeof parsed !== "object") {
    throw new Error(`Invalid model provider config at ${configPath}: expected object, got ${typeof parsed}`);
  }

  const cfg = parsed as Record<string, unknown>;

  return {
    endpoint: typeof cfg.endpoint === "string" && cfg.endpoint.length > 0 ? cfg.endpoint : DEFAULT_CONFIG.endpoint,
    model: typeof cfg.model === "string" && cfg.model.length > 0 ? cfg.model : DEFAULT_CONFIG.model,
    api_key: typeof cfg.api_key === "string" && cfg.api_key.length > 0 ? cfg.api_key : DEFAULT_CONFIG.api_key,
  };
}
