import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { skillRoot, skillStableDir, skillPreviewDir, skillReleaseDir } from "../../shared/utils/paths.js";
import { copyDir, readDirNames } from "../../shared/utils/fs.js";
import { createStableSnapshot } from "../../snapshot_manager/snapshot.js";
import { utcTimestamp } from "../../shared/utils/time.js";
export async function runStabilizePromote(skillId, previewId) {
    const root = skillRoot(skillId);
    // 1. snapshot before promote
    const snapshot = await createStableSnapshot(skillId, "stabilize-promote", "stabilize-promote");
    // 2. determine target preview
    const previews = await readDirNames(path.join(root, "previews"));
    if (previews.length === 0)
        throw new Error("no preview to promote");
    const targetPreviewId = previewId ?? previews.sort().reverse()[0];
    if (!targetPreviewId)
        throw new Error("could not determine preview id");
    const previewDir = skillPreviewDir(skillId, targetPreviewId);
    const previewManifestPath = path.join(previewDir, "preview-manifest.json");
    let previewManifest = {};
    try {
        previewManifest = JSON.parse(await fs.readFile(previewManifestPath, "utf-8"));
    }
    catch {
        // ignore
    }
    // 3. determine release version
    const skillYamlPath = path.join(skillStableDir(skillId), "skill.yaml");
    let version = "v0.1.0";
    try {
        const skillYaml = YAML.parse(await fs.readFile(skillYamlPath, "utf-8"));
        version = bumpVersion(String(skillYaml.version ?? "0.1.0"));
    }
    catch {
        // no skill.yaml yet
    }
    // 4. move old stable to releases
    const releaseDir = skillReleaseDir(skillId, version);
    await fs.mkdir(path.dirname(releaseDir), { recursive: true });
    await fs.rename(skillStableDir(skillId), releaseDir);
    // 5. copy preview to stable
    await copyDir(previewDir, skillStableDir(skillId));
    // 6. write stable skill.yaml
    await fs.writeFile(skillYamlPath, YAML.stringify({ name: skillId, version: version.replace(/^v/, ""), promoted_at: utcTimestamp() }), "utf-8");
    // 7. generate changelog
    const changelogPath = path.join(releaseDir, "CHANGELOG.md");
    const changelog = buildChangelog(skillId, version, targetPreviewId, snapshot.snapshot_id, previewManifest);
    await fs.writeFile(changelogPath, changelog, "utf-8");
    // 8. save snapshot manifest in releases
    await fs.writeFile(path.join(releaseDir, "snapshot-manifest.yaml"), YAML.stringify(snapshot), "utf-8");
    return {
        releaseVersion: version,
        oldStableMovedTo: releaseDir,
        changelogPath,
    };
}
function bumpVersion(current) {
    const clean = current.replace(/^v/, "");
    const parts = clean.split(".").map(Number);
    if (parts.length < 3)
        parts.push(0, 0, 0);
    parts[2] = (parts[2] ?? 0) + 1;
    return `v${parts.join(".")}`;
}
function buildChangelog(skillId, version, previewId, snapshotId, previewManifest) {
    return `# ${skillId} ${version} Changelog

- Promoted preview \`${previewId}\` to stable.
- Snapshot before promote: \`${snapshotId}\`.
- Quality report: \`${previewManifest.quality_report_id ?? "n/a"}\`.
- Old stable archived under \`releases/${version}\`.

Generated at ${utcTimestamp()}.
`;
}
//# sourceMappingURL=promote.js.map