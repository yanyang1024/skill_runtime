import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { skillRoot } from "../../shared/utils/paths.js";
import { utcTimestamp } from "../../shared/utils/time.js";
import { EndpointManifest } from "../../shared/schemas/index.js";

export interface TestResult {
  test_id: string;
  type: string;
  passed: boolean;
  message: string;
}

export async function runApiTest(
  skillId: string,
  endpointId: string,
  baseURL = process.env.SKILL_GROWTH_API_BASE_URL ?? "http://localhost:3000/mock",
): Promise<TestResult[]> {
  const manifestPath = path.join(skillRoot(skillId), "stable", "endpoint_manifest.yaml");
  const raw = await fs.readFile(manifestPath, "utf-8");
  const manifest = EndpointManifest.parse(YAML.parse(raw));
  const ep = manifest.endpoints.find((e) => e.id === endpointId);
  if (!ep) throw new Error(`endpoint ${endpointId} not found`);

  const results: TestResult[] = [];

  // existence test
  const relativePath = ep.path.replace(/^\//, "");
  const normalizedBase = baseURL.endsWith("/") ? baseURL : `${baseURL}/`;
  const url = new URL(relativePath, normalizedBase);
  if (ep.required_params?.includes("lot_id")) url.searchParams.set("lot_id", "LOT-001");
  const res = await fetch(url.toString());
  results.push({
    test_id: `${endpointId}_existence`,
    type: "existence",
    passed: res.status === 200,
    message: `GET ${url} returned ${res.status}`,
  });

  // schema test
  let schemaPassed = false;
  let schemaMessage = "";
  try {
    const body = await res.json();
    schemaPassed = body && typeof body.lot_id === "string" && Array.isArray(body.runs);
    schemaMessage = schemaPassed ? "schema matches" : `body: ${JSON.stringify(body).slice(0, 200)}`;
  } catch (err) {
    schemaMessage = `failed to parse JSON: ${err}`;
  }
  results.push({
    test_id: `${endpointId}_schema`,
    type: "schema",
    passed: schemaPassed,
    message: schemaMessage,
  });

  // update manifest
  const tests = ep.tests as Record<string, { status: string }> | undefined;
  if (tests) {
    const existence = tests["existence_test"];
    const schema = tests["schema_test"];
    if (existence) existence.status = results[0]!.passed ? "passed" : "failed";
    if (schema) schema.status = results[1]!.passed ? "passed" : "failed";
  }
  if (results.every((r) => r.passed)) {
    ep.status = "verified";
    ep.skill_usage = {
      allowed: true,
      usage_hint: `当用户提供 lot_id 时，优先调用 ${ep.id}。`,
    };
  }
  manifest.updated_at = utcTimestamp();
  await fs.writeFile(manifestPath, YAML.stringify(manifest), "utf-8");

  return results;
}
