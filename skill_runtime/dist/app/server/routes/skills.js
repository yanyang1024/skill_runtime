import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { skillRoot, toPosix, runsDir, skillStableDir, skillPreviewDir, skillReleaseDir, REPO_ROOT } from "../../shared/utils/paths.js";
import { safeResolve, assertSafeIdentifier, PathSecurityError, } from "../../shared/utils/security.js";
import { validateSkillParams, getSafeParams } from "../middleware/validateParams.js";
import { loadRunState } from "../../orchestration/stateMachine.js";
import { createStableSnapshot } from "../../snapshot_manager/snapshot.js";
import { rollbackSkill } from "../../snapshot_manager/rollback.js";
import { archiveFiles } from "../../snapshot_manager/archive.js";
import { filenameTimestamp } from "../../shared/utils/time.js";
const router = Router();
function skillsBaseDir() {
    return path.join(REPO_ROOT, "skills");
}
// GET / — 列出所有 skill 目录（供前端 skill selector 使用）
router.get("/", async (_req, res) => {
    try {
        const baseDir = skillsBaseDir();
        const entries = await fs.readdir(baseDir, { withFileTypes: true });
        const skillNames = entries.filter((e) => e.isDirectory() && !e.name.startsWith(".")).map((e) => e.name);
        res.json(skillNames);
    }
    catch (err) {
        if (err.code === "ENOENT")
            return res.json([]);
        res.status(500).json({ error: String(err) });
    }
});
router.use("/:skillId/*", validateSkillParams());
router.use("/:skillId", validateSkillParams());
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
    const { skillId } = getSafeParams(req);
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
    const { skillId } = getSafeParams(req);
    const raw = req.params[0];
    const rawFilePath = Array.isArray(raw) ? raw.join("/") : (raw ?? "");
    const root = skillRoot(skillId);
    try {
        const absPath = await safeResolve(root, rawFilePath);
        const content = await fs.readFile(absPath, "utf-8");
        const ext = path.extname(absPath).slice(1);
        res.json({ path: rawFilePath, content, ext });
    }
    catch (err) {
        const status = err instanceof PathSecurityError ? 403 : 500;
        res.status(status).json({ error: String(err) });
    }
});
router.get("/:skillId/runs", async (req, res) => {
    const { skillId } = getSafeParams(req);
    try {
        const entries = await fs.readdir(runsDir(), { withFileTypes: true });
        const runs = [];
        for (const entry of entries) {
            if (!entry.isDirectory())
                continue;
            try {
                const state = await loadRunState(entry.name);
                if (state && state.skill_id === skillId) {
                    runs.push(state);
                }
            }
            catch {
                // 单个 run 损坏不影响整个列表
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
    const { skillId } = getSafeParams(req);
    try {
        if (typeof previewId !== "string" || previewId.length === 0) {
            res.status(400).json({ error: "missing previewId" });
            return;
        }
        assertSafeIdentifier(previewId, "preview");
        // 质量门控：如果提供了 runId，检查 grow-quality-review 阶段的最新 attempt 是否已完成
        if (runId) {
            const { loadStageState, loadRunState: loadRun } = await import("../../orchestration/stateMachine.js");
            const { findNextAttempt } = await import("../../orchestration/runLifecycle.js");
            // 找到最新的有状态的 attempt
            const nextAttempt = await findNextAttempt(runId, "grow-quality-review");
            let qualityState = null;
            for (let a = nextAttempt - 1; a >= 1; a--) {
                qualityState = await loadStageState(runId, "grow-quality-review", a);
                if (qualityState)
                    break;
            }
            if (!qualityState || qualityState.status !== "completed") {
                res.status(400).json({
                    error: "Quality gate not passed: grow-quality-review stage must be completed before promote",
                    qualityStatus: qualityState?.status ?? "not_found",
                });
                return;
            }
        }
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
        // 3. archive old stable, then copy preview into stable
        const previewDir = skillPreviewDir(skillId, previewId);
        await archiveFiles(skillId, [{ originalPath: "stable", reason: `promote old stable to release ${releaseVersion}` }], "promote", runId);
        await fs.mkdir(skillStableDir(skillId), { recursive: true });
        try {
            await copyDir(previewDir, skillStableDir(skillId));
        }
        catch (copyErr) {
            // 复制失败：尝试从快照恢复 stable，避免空目录
            const { restoreSnapshot } = await import("../../snapshot_manager/snapshot.js");
            try {
                await restoreSnapshot(snapshot);
            }
            catch (restoreErr) {
                console.error("[skills] promote rollback failed:", restoreErr);
            }
            throw copyErr;
        }
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
    const { skillId } = getSafeParams(req);
    try {
        if (typeof snapshotId !== "string" || snapshotId.length === 0) {
            res.status(400).json({ error: "missing snapshotId" });
            return;
        }
        await rollbackSkill(skillId, snapshotId);
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