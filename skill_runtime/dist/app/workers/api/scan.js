import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { apiDocsDir, skillRoot } from "../../shared/utils/paths.js";
import { utcTimestamp } from "../../shared/utils/time.js";
import { writeYaml } from "../../shared/utils/growthRun.js";
import { EndpointManifest } from "../../shared/schemas/index.js";
export async function runApiScan(skillId) {
    const rawDir = path.join(apiDocsDir(skillId), "raw");
    const normalizedDir = path.join(apiDocsDir(skillId), "normalized");
    const testsDir = path.join(apiDocsDir(skillId), "endpoint_tests");
    await fs.mkdir(normalizedDir, { recursive: true });
    await fs.mkdir(testsDir, { recursive: true });
    const files = await fs.readdir(rawDir);
    const discovered = [];
    for (const file of files) {
        if (!file.endsWith(".md"))
            continue;
        const content = await fs.readFile(path.join(rawDir, file), "utf-8");
        const eps = parseEndpoints(content, file);
        discovered.push(...eps);
    }
    const manifestPath = path.join(skillRoot(skillId), "stable", "endpoint_manifest.yaml");
    let manifest = {
        skill_id: skillId,
        updated_at: utcTimestamp(),
        endpoints: [],
    };
    try {
        const existing = await fs.readFile(manifestPath, "utf-8");
        manifest = EndpointManifest.parse(YAML.parse(existing));
    }
    catch {
        // no existing manifest
    }
    for (const ep of discovered) {
        const existing = manifest.endpoints.find((e) => e.id === ep.id);
        if (!existing) {
            manifest.endpoints.push({
                id: ep.id,
                name: ep.name,
                status: "candidate",
                source: `api_docs/raw/${ep.sourceFile}`,
                method: ep.method,
                path: ep.path,
                description: ep.description,
                required_params: ep.required_params,
                optional_params: ep.optional_params,
                auth: { type: "bearer", required: true },
                risk_level: "read_only",
                added_at: utcTimestamp(),
                tests: {
                    existence_test: {
                        path: `api_docs/${skillId}/endpoint_tests/${ep.id}_existence.yaml`,
                        status: "pending",
                    },
                    schema_test: {
                        path: `api_docs/${skillId}/endpoint_tests/${ep.id}_schema.yaml`,
                        status: "pending",
                    },
                },
                skill_usage: { allowed: false, reason: "尚未通过基础测试" },
            });
            await writeYaml(path.join(testsDir, `${ep.id}_existence.yaml`), {
                endpoint_id: ep.id,
                type: "existence",
                method: ep.method,
                path: ep.path,
                expected_status: 200,
                required_params: ep.required_params,
            });
            await writeYaml(path.join(testsDir, `${ep.id}_schema.yaml`), {
                endpoint_id: ep.id,
                type: "schema",
                required_fields: ["lot_id", "runs"],
            });
        }
    }
    manifest.updated_at = utcTimestamp();
    await fs.mkdir(path.dirname(manifestPath), { recursive: true });
    await writeYaml(manifestPath, manifest);
    await writeYaml(path.join(normalizedDir, "latest.yaml"), {
        skill_id: skillId,
        generated_at: utcTimestamp(),
        endpoints: discovered,
    });
    return manifest;
}
function parseEndpoints(content, sourceFile) {
    const eps = [];
    const methodPathRe = /##\s+(GET|POST|PUT|PATCH|DELETE)\s+(\S+)/g;
    let match;
    while ((match = methodPathRe.exec(content)) !== null) {
        const method = match[1];
        const p = match[2];
        if (!p)
            continue;
        const id = p
            .replace(/\//g, "_")
            .replace(/^_/, "")
            .replace(/[^a-z0-9_]/gi, "_")
            .toLowerCase();
        const nextHeading = content.indexOf("##", match.index + 1);
        const section = content.slice(match.index, nextHeading === -1 ? content.length : nextHeading);
        const required = extractList(section, "Required Parameters");
        const optional = extractList(section, "Optional Parameters");
        eps.push({
            id,
            name: `${method} ${p}`,
            method,
            path: p,
            description: section.split("\n").slice(1, 3).join(" ").trim() || `${method} ${p}`,
            required_params: required,
            optional_params: optional,
            sourceFile,
        });
    }
    return eps;
}
function extractList(section, heading) {
    const re = new RegExp(`###\\s+${heading}\\s*\\n([\\s\\S]*?)(?=\\n###|\\n##|$)`);
    const m = section.match(re);
    if (!m || !m[1])
        return [];
    return m[1]
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.startsWith("- "))
        .map((l) => l.replace(/^-\s+`?([^`:]+).*$/, "$1").trim())
        .filter(Boolean);
}
//# sourceMappingURL=scan.js.map