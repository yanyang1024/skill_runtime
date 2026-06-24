import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { REPO_ROOT } from "./paths.js";
const DEFAULT_CONFIG = {
    endpoint: "http://172.24.16.1:11434/v1",
    model: "glm4:9b",
    api_key: "local",
};
export async function loadLocalV1Config() {
    const configPath = path.join(REPO_ROOT, "configs", "model-providers", "local-v1.yaml");
    try {
        const raw = await fs.readFile(configPath, "utf-8");
        const parsed = YAML.parse(raw);
        return {
            endpoint: parsed.endpoint ?? DEFAULT_CONFIG.endpoint,
            model: parsed.model ?? DEFAULT_CONFIG.model,
            api_key: parsed.api_key ?? DEFAULT_CONFIG.api_key,
        };
    }
    catch {
        return { ...DEFAULT_CONFIG };
    }
}
//# sourceMappingURL=localV1Config.js.map