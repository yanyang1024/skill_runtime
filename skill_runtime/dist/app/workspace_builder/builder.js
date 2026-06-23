import fs from "node:fs/promises";
import path from "node:path";
import { getStageContract } from "../orchestration/stageContracts.js";
import { stageDir, stageWorkspaceDir, stageInputDir, stageOutputDir, stageWorkDir, skillStableDir, skillPreviewDir, toPosix, } from "../shared/utils/paths.js";
import { buildOpencodeConfig } from "./opencodeConfig.js";
import { utcTimestamp } from "../shared/utils/time.js";
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
async function copySkillSnapshot(skillId, sourceVersion, destDir) {
    const srcDir = sourceVersion === "stable" ? skillStableDir(skillId) : skillPreviewDir(skillId, sourceVersion);
    await copyDir(srcDir, destDir);
}
export async function buildStageWorkspace(opts) {
    const { runState, stageState, port, corsOrigins, previousStageId, previousAttempt } = opts;
    const { run_id, skill_id, preview_id } = runState;
    const { stage_id, attempt } = stageState;
    const contract = getStageContract(stage_id);
    const baseDir = stageDir(run_id, stage_id, attempt);
    const workspaceDir = stageWorkspaceDir(run_id, stage_id, attempt);
    const inputDir = stageInputDir(run_id, stage_id, attempt);
    const outputDir = stageOutputDir(run_id, stage_id, attempt);
    await fs.mkdir(workspaceDir, { recursive: true });
    await fs.mkdir(inputDir, { recursive: true });
    await fs.mkdir(outputDir, { recursive: true });
    // 1. opencode.json at workspace root
    const config = await buildOpencodeConfig({ port, corsOrigins, skillId: skill_id, stageId: stage_id });
    await fs.writeFile(path.join(workspaceDir, "opencode.json"), JSON.stringify(config, null, 2), "utf-8");
    // 2. .opencode/ extensions
    const opencodeDir = path.join(workspaceDir, ".opencode");
    const skillMountDir = path.join(opencodeDir, "skills", skill_id);
    await fs.mkdir(skillMountDir, { recursive: true });
    // 3. Determine source skill version
    let sourceSkillVersion = "stable";
    if (contract.skill_mount === "preview-readonly" || contract.skill_mount === "preview-writable") {
        if (!preview_id) {
            throw new Error(`Stage ${stage_id} requires preview_id but run ${run_id} has none`);
        }
        sourceSkillVersion = preview_id;
    }
    // 4. Copy skill snapshot to input/
    const snapshotDir = path.join(inputDir, "skill_snapshot");
    await copySkillSnapshot(skill_id, sourceSkillVersion, snapshotDir);
    // 5. Copy skill to .opencode/skills/<skill_id>/ for OpenCode discovery
    await copySkillSnapshot(skill_id, sourceSkillVersion, skillMountDir);
    // 6. Copy previous stage outputs
    if (previousStageId) {
        const prevOutputDir = stageOutputDir(run_id, previousStageId, previousAttempt ?? 1);
        const prevInputDir = path.join(inputDir, "previous_stage_output");
        try {
            await fs.access(prevOutputDir);
            await copyDir(prevOutputDir, prevInputDir);
        }
        catch {
            // previous stage may not have outputs yet
        }
    }
    // 7. Create work/ if writable
    if (contract.work_writable) {
        const workDir = stageWorkDir(run_id, stage_id, attempt);
        await fs.mkdir(workDir, { recursive: true });
        // For build/iteration, copy preview skill into work/ for actual editing
        if (contract.skill_mount === "preview-writable" && sourceSkillVersion !== "stable") {
            await copySkillSnapshot(skill_id, sourceSkillVersion, workDir);
        }
    }
    // 8. Write server.json metadata
    const serverMeta = {
        server_id: stageState.server_id ?? `${run_id}-${stage_id}-${attempt}`,
        stage_id,
        run_id,
        skill_id,
        runtime_mode: contract.runtime_mode,
        port,
        base_url: `http://127.0.0.1:${port}`,
        open_url: `http://127.0.0.1:${port}`,
        workspace_path: toPosix(workspaceDir),
        opencode_config_dir: toPosix(opencodeDir),
        created_at: utcTimestamp(),
    };
    await fs.writeFile(path.join(baseDir, "server.json"), JSON.stringify(serverMeta, null, 2), "utf-8");
    // 9. Write stage-digest.md template
    const digestPath = path.join(baseDir, "stage-digest.md");
    await fs.writeFile(digestPath, `# Stage Digest\n\n## Stage\n${stage_id}\n## Attempt\n${attempt}\n## Current Goal\n${contract.agent_role}\n## Completed Outputs\n\n## Key Findings\n\n## Next Recommended Action\n\n`, "utf-8");
    return workspaceDir;
}
export async function syncWorkToPreview(skillId, runId, stageId, attempt, previewId) {
    const workDir = stageWorkDir(runId, stageId, attempt);
    const previewDir = skillPreviewDir(skillId, previewId);
    await fs.mkdir(previewDir, { recursive: true });
    await copyDir(workDir, previewDir);
}
//# sourceMappingURL=builder.js.map