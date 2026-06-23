import fs from "node:fs/promises";
import path from "node:path";
import { skillRoot, skillStableDir, skillPreviewDir } from "../../shared/utils/paths.js";
import { createStableSnapshot } from "../../snapshot_manager/snapshot.js";
import { archiveFiles } from "../../snapshot_manager/archive.js";
import { runQualityGate } from "../quality/index.js";
import { filenameTimestamp } from "../../shared/utils/time.js";
import { writeJson, writeYaml, writeMarkdown } from "../../shared/utils/growthRun.js";
import type { DryRunPlan, SnapshotManifest, ArchiveManifest, QualityReport } from "../../shared/schemas/index.js";

export interface LiveRunResult {
  previewId: string;
  snapshot: SnapshotManifest;
  archive: ArchiveManifest | null;
  qualityReport: QualityReport;
}

export async function runGrowLive(skillId: string, plan: DryRunPlan): Promise<LiveRunResult> {
  if (plan.mode !== "dry-run") {
    throw new Error("live run must be based on a dry-run plan");
  }

  // 1. snapshot
  const snapshot = await createStableSnapshot(skillId, "grow-live-run", plan.run_id);

  // 2. prepare preview
  const previewId = `preview-${filenameTimestamp()}`;
  const previewDir = skillPreviewDir(skillId, previewId);
  await fs.mkdir(previewDir, { recursive: true });
  await copyDir(skillStableDir(skillId), previewDir);

  // 3. apply operations
  const archiveOps: { originalPath: string; reason: string }[] = [];
  for (const op of plan.planned_operations) {
    const target = op.target.replace(`skills/${skillId}/stable/`, "");
    const absTarget = path.join(previewDir, target);

    switch (op.type) {
      case "update_file": {
        await fs.mkdir(path.dirname(absTarget), { recursive: true });
        const existing = await fs.readFile(absTarget, "utf-8").catch(() => "");
        const addition = generateUpdateContent(op.target, skillId);
        await fs.writeFile(absTarget, existing + addition, "utf-8");
        break;
      }
      case "create_file": {
        await fs.mkdir(path.dirname(absTarget), { recursive: true });
        const content = generateCreateContent(op.target, skillId);
        await fs.writeFile(absTarget, content, "utf-8");
        break;
      }
      case "archive_file": {
        archiveOps.push({ originalPath: absTarget, reason: op.reason });
        break;
      }
      case "create_quality_gate": {
        await fs.mkdir(path.dirname(absTarget), { recursive: true });
        await fs.writeFile(absTarget, generateQualityGateYaml(), "utf-8");
        break;
      }
      case "update_endpoint_manifest": {
        // placeholder
        break;
      }
    }
  }

  // 4. archive (move from preview dir)
  let archive: ArchiveManifest | null = null;
  if (archiveOps.length > 0) {
    const archiveResult = await archiveFiles(
      skillId,
      archiveOps.map((o) => ({
        originalPath: path.relative(skillRoot(skillId), o.originalPath),
        reason: o.reason,
      })),
      "grow-live-run",
      plan.run_id,
    );
    archive = archiveResult;
    const archiveManifestPath = path.join(
      skillRoot(skillId),
      ".archive",
      archiveResult.created_at.replace(/:/g, "-"),
      "archive-manifest.yaml",
    );
    await fs.mkdir(path.dirname(archiveManifestPath), { recursive: true });
    await writeYaml(archiveManifestPath, archiveResult);
  }

  // 5. quality gate
  const qualityReport = await runQualityGate(skillId, previewId, "grow-live-run");
  const reportPath = path.join(skillPreviewDir(skillId, previewId), "quality-report.yaml");
  await writeYaml(reportPath, qualityReport);

  // 6. preview metadata
  await writeJson(path.join(skillPreviewDir(skillId, previewId), "preview-manifest.json"), {
    preview_id: previewId,
    source_run: plan.run_id,
    snapshot_id: snapshot.snapshot_id,
    archive_id: archive?.archive_id ?? null,
    quality_report_id: qualityReport.report_id,
  });

  return { previewId, snapshot, archive, qualityReport };
}

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(s, d);
    } else {
      await fs.copyFile(s, d);
    }
  }
}

function generateUpdateContent(target: string, skillId: string): string {
  if (target.endsWith("SKILL.md")) {
    return `\n\n## 正向行为引导（由 Skill Growth Studio 自动补充）\n\n当用户要求“梳理 / 重新梳理 / 检查日志 / 生成修改方案”时：\n- 先完成全量分析，再输出方案。\n- 不在分析中间停顿提问。\n- Growth Proposal 输出后，优先提供一键确认路径。\n`;
  }
  return `\n<!-- updated by Skill Growth Studio -->\n`;
}

function generateCreateContent(target: string, skillId: string): string {
  if (target.includes("workflow.md")) {
    return `# Skill 生命周期工作流\n\n## 1. Observe\n复盘运行轨迹，生成 Runtime Trace 与 Replay Card。\n\n## 2. Grow\n默认 dry-run 生成克制方案；一键确认后 live run，先快照、再修改、后 Quality Gate。\n\n## 3. Rehearse\n在隔离 OpenCode runtime 中测试 preview skill，记录导演反馈。\n\n## 4. Stabilize\n将排练通过的 preview 提升为 stable，生成 release 与 changelog。\n`;
  }
  return `<!-- created by Skill Growth Studio -->\n`;
}

function generateQualityGateYaml(): string {
  return `checks:
  - id: references_exist
    category: consistency
    name: 引用文件存在
  - id: no_delete_operations
    category: archive
    name: 无 delete 操作
  - id: positive_guidance_check
    category: skill_files
    name: 正向引导存在
`;
}
