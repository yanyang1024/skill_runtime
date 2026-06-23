import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { skillRoot, toPosix, runsDir, skillStableDir, skillPreviewDir, skillReleaseDir } from "../../shared/utils/paths.js";
import { loadRunState } from "../../orchestration/stateMachine.js";
import { createStableSnapshot } from "../../snapshot_manager/snapshot.js";
import { rollbackSkill } from "../../snapshot_manager/rollback.js";
import { archiveFiles } from "../../snapshot_manager/archive.js";
import { filenameTimestamp } from "../../shared/utils/time.js";
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
router.get("/:skillId/runs", async (req, res) => {
    try {
        const entries = await fs.readdir(runsDir(), { withFileTypes: true });
        const runs = [];
        for (const entry of entries) {
            if (!entry.isDirectory())
                continue;
            const state = await loadRunState(entry.name);
            if (state && state.skill_id === req.params.skillId) {
                runs.push(state);
            }
        }
        res.json(runs);
    }
    catch (err) {
        res.status(500).json({ error: String(err) });
    }
});
async function copyDir(src, dest) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
        const s = path.join(src, entry.name);
        const d = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            await copyDir(s, d);
        }
        else {
            await fs.copyFile(s, d);
        }
    }
}
router.post("/:skillId/promote", async (req, res) => {
    const { previewId, runId } = req.body;
    const skillId = req.params.skillId;
    try {
        // 1. snapshot stable
        const snapshot = await createStableSnapshot(skillId, "promote", runId);
        // 2. move old stable to releases
        const ts = filenameTimestamp();
        let releaseVersion = `v0.1-${ts}`;
        try {
            const skillYaml = YAML.parse(await fs.readFile(path.join(skillStableDir(skillId), "skill.yaml"), "utf-8"));
            releaseVersion = bumpVersion(String(skillYaml.version ?? "0.1.0"));
        }
        catch {
            // no skill.yaml yet, fall back to timestamped version
        }
        const releaseDir = skillReleaseDir(skillId, releaseVersion);
        await copyDir(skillStableDir(skillId), releaseDir);
        // 3. archive old stable instead of deleting, then recreate empty stable and copy preview
        const previewDir = skillPreviewDir(skillId, previewId);
        await archiveFiles(skillId, [{ originalPath: "stable", reason: `promote old stable to release ${releaseVersion}` }], "promote", runId);
        await fs.mkdir(skillStableDir(skillId), { recursive: true });
        await copyDir(previewDir, skillStableDir(skillId));
        // 4. write changelog
        const changelogPath = path.join(skillStableDir(skillId), "CHANGELOG.md");
        await fs.writeFile(changelogPath, `# Changelog\n\n## ${releaseVersion}\n\n- Promoted from preview ${previewId}\n- Run: ${runId ?? "N/A"}\n- Snapshot: ${snapshot.snapshot_id}\n`, "utf-8");
        res.json({ ok: true, release_version: releaseVersion, snapshot_id: snapshot.snapshot_id });
    }
    catch (err) {
        res.status(500).json({ error: String(err) });
    }
});
router.post("/:skillId/rollback", async (req, res) => {
    const { snapshotId } = req.body;
    try {
        await rollbackSkill(req.params.skillId, snapshotId);
        res.json({ ok: true });
    }
    catch (err) {
        res.status(500).json({ error: String(err) });
    }
});
function bumpVersion(current) {
    const clean = current.replace(/^v/, "");
    const parts = clean.split(".").map(Number);
    if (parts.length < 3) {
        while (parts.length < 3)
            parts.push(0);
    }
    parts[2] = (parts[2] ?? 0) + 1;
    return `v${parts.join(".")}`;
}
export default router;
//# sourceMappingURL=skills.js.map