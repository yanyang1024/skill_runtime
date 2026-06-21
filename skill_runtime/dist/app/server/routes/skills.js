import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { skillRoot, growthRunsDir, backupsDir, toPosix } from "../../shared/utils/paths.js";
import { runObserve } from "../../workers/observe/index.js";
import { runGrowDryRun } from "../../workers/grow/dryRun.js";
import { runGrowLive } from "../../workers/grow/live.js";
import { runApiScan } from "../../workers/api/scan.js";
import { runApiTest } from "../../workers/api/test.js";
import { runStabilizePromote } from "../../workers/stabilize/promote.js";
import { runRollback } from "../../workers/stabilize/rollback.js";
const router = Router();
async function buildTree(absPath, skillRootPath) {
    const entries = await fs.readdir(absPath, { withFileTypes: true });
    const nodes = [];
    for (const entry of entries) {
        if (entry.name.startsWith("."))
            continue;
        const absChild = path.join(absPath, entry.name);
        const rel = toPosix(path.relative(skillRootPath, absChild));
        if (entry.isDirectory()) {
            nodes.push({
                name: entry.name,
                path: rel,
                type: "dir",
                children: await buildTree(absChild, skillRootPath),
            });
        }
        else {
            nodes.push({ name: entry.name, path: rel, type: "file" });
        }
    }
    return nodes.sort((a, b) => {
        if (a.type === b.type)
            return a.name.localeCompare(b.name);
        return a.type === "dir" ? -1 : 1;
    });
}
router.get("/:skillId/tree", async (req, res) => {
    const skillId = req.params.skillId;
    const root = skillRoot(skillId);
    try {
        const tree = await buildTree(root, root);
        res.json(tree);
    }
    catch (err) {
        res.status(500).json({ error: String(err) });
    }
});
router.get("/:skillId/file/*", async (req, res) => {
    const skillId = req.params.skillId;
    const filePath = (req.params[0] ?? []).join("/");
    const root = skillRoot(skillId);
    const absPath = path.join(root, filePath);
    if (!absPath.startsWith(root)) {
        res.status(403).json({ error: "forbidden" });
        return;
    }
    try {
        const content = await fs.readFile(absPath, "utf-8");
        const ext = path.extname(absPath).slice(1);
        res.json({ path: filePath, content, ext });
    }
    catch (err) {
        res.status(404).json({ error: String(err) });
    }
});
router.post("/:skillId/observe", async (req, res) => {
    try {
        const result = await runObserve(req.params.skillId);
        res.json({ ok: true, runId: result.runId, trace: result.trace });
    }
    catch (err) {
        res.status(500).json({ error: String(err) });
    }
});
async function readLatestTrace(skillId) {
    const runsDir = growthRunsDir(skillId);
    const runs = await fs.readdir(runsDir);
    const traceFiles = [];
    for (const run of runs) {
        const p = path.join(runsDir, run, "runtime-trace.json");
        try {
            const stat = await fs.stat(p);
            traceFiles.push({ run, mtime: stat.mtimeMs });
        }
        catch {
            // ignore
        }
    }
    traceFiles.sort((a, b) => b.mtime - a.mtime);
    if (traceFiles.length === 0)
        return null;
    const latest = traceFiles[0];
    const raw = await fs.readFile(path.join(runsDir, latest.run, "runtime-trace.json"), "utf-8");
    return JSON.parse(raw);
}
router.post("/:skillId/grow/dry-run", async (req, res) => {
    try {
        const trace = await readLatestTrace(req.params.skillId);
        if (!trace) {
            res.status(400).json({ error: "no trace found, run observe first" });
            return;
        }
        const result = await runGrowDryRun(req.params.skillId, trace);
        res.json({ ok: true, runId: result.runId, plan: result.plan, proposal: result.proposal });
    }
    catch (err) {
        res.status(500).json({ error: String(err) });
    }
});
async function readLatestDryRunPlan(skillId) {
    const runsDir = growthRunsDir(skillId);
    const runs = await fs.readdir(runsDir);
    const planFiles = [];
    for (const run of runs) {
        const p = path.join(runsDir, run, "dry-run-plan.yaml");
        try {
            const stat = await fs.stat(p);
            planFiles.push({ run, mtime: stat.mtimeMs });
        }
        catch {
            // ignore
        }
    }
    planFiles.sort((a, b) => b.mtime - a.mtime);
    if (planFiles.length === 0)
        return null;
    const latest = planFiles[0];
    const YAML = await import("yaml");
    const raw = await fs.readFile(path.join(runsDir, latest.run, "dry-run-plan.yaml"), "utf-8");
    return YAML.parse(raw);
}
router.post("/:skillId/grow/live", async (req, res) => {
    try {
        const plan = await readLatestDryRunPlan(req.params.skillId);
        if (!plan) {
            res.status(400).json({ error: "no dry-run plan found, run grow dry-run first" });
            return;
        }
        const result = await runGrowLive(req.params.skillId, plan);
        res.json({
            ok: true,
            preview_id: result.previewId,
            snapshot_id: result.snapshot.snapshot_id,
            archive_id: result.archive?.archive_id ?? null,
            quality_passed: result.qualityReport.overall_passed,
        });
    }
    catch (err) {
        res.status(500).json({ error: String(err) });
    }
});
router.post("/:skillId/api-scan", async (req, res) => {
    try {
        const manifest = await runApiScan(req.params.skillId);
        res.json({ ok: true, endpoints: manifest.endpoints });
    }
    catch (err) {
        res.status(500).json({ error: String(err) });
    }
});
router.post("/:skillId/api-test/:endpointId", async (req, res) => {
    try {
        const results = await runApiTest(req.params.skillId, req.params.endpointId);
        res.json({ ok: true, results });
    }
    catch (err) {
        res.status(500).json({ error: String(err) });
    }
});
router.get("/:skillId/snapshots", async (req, res) => {
    try {
        const files = await fs.readdir(backupsDir(req.params.skillId));
        const snapshots = files
            .filter((f) => f.endsWith(".tar.gz"))
            .map((f) => ({
            filename: f,
            snapshot_id: `snapshot-${f.replace(/\.tar\.gz$/, "")}`,
        }));
        res.json(snapshots);
    }
    catch (err) {
        res.status(500).json({ error: String(err) });
    }
});
router.get("/:skillId/endpoints", async (req, res) => {
    try {
        const manifestPath = path.join(skillRoot(req.params.skillId), "stable", "endpoint_manifest.yaml");
        const raw = await fs.readFile(manifestPath, "utf-8");
        const YAML = await import("yaml");
        const manifest = YAML.parse(raw);
        res.json(manifest);
    }
    catch (err) {
        res.status(500).json({ error: String(err) });
    }
});
router.post("/:skillId/stabilize/promote", async (req, res) => {
    try {
        const { previewId } = req.body;
        const result = await runStabilizePromote(req.params.skillId, previewId);
        res.json({ ok: true, ...result });
    }
    catch (err) {
        res.status(500).json({ error: String(err) });
    }
});
router.post("/:skillId/rollback", async (req, res) => {
    try {
        const { snapshotId } = req.body;
        await runRollback(req.params.skillId, snapshotId);
        res.json({ ok: true });
    }
    catch (err) {
        res.status(500).json({ error: String(err) });
    }
});
export default router;
//# sourceMappingURL=skills.js.map