import fs from "node:fs/promises";
import path from "node:path";
import { skillPreviewDir, skillRoot } from "../../shared/utils/paths.js";
import { utcTimestamp } from "../../shared/utils/time.js";
export async function runQualityGate(skillId, previewId, triggeredBy) {
    const previewDir = skillPreviewDir(skillId, previewId);
    const results = [];
    // 1. SKILL.md frontmatter exists
    const skillMdPath = path.join(previewDir, "SKILL.md");
    let skillMd = "";
    try {
        skillMd = await fs.readFile(skillMdPath, "utf-8");
        results.push({
            check_id: "frontmatter_exists",
            category: "skill_files",
            name: "SKILL.md frontmatter 存在",
            passed: skillMd.startsWith("---"),
            message: skillMd.startsWith("---") ? "frontmatter 存在" : "缺少 frontmatter",
        });
    }
    catch {
        results.push({
            check_id: "frontmatter_exists",
            category: "skill_files",
            name: "SKILL.md frontmatter 存在",
            passed: false,
            message: "SKILL.md 不存在",
        });
    }
    // 2. references exist
    const referencesDir = path.join(previewDir, "references");
    let referencesOk = true;
    try {
        const refs = await fs.readdir(referencesDir);
        for (const ref of refs) {
            const refPath = path.join(referencesDir, ref);
            const stat = await fs.stat(refPath);
            if (!stat.isFile())
                continue;
            const content = await fs.readFile(refPath, "utf-8");
            if (content.trim().length === 0)
                referencesOk = false;
        }
    }
    catch {
        // no references dir is ok
    }
    results.push({
        check_id: "references_exist",
        category: "consistency",
        name: "reference 文件存在且非空",
        passed: referencesOk,
        message: referencesOk ? "references 正常" : "存在空 reference 文件",
    });
    // 3. positive guidance check
    const hasPositiveGuidance = skillMd.includes("先完成全量分析") && skillMd.includes("不在分析中间停顿提问");
    results.push({
        check_id: "positive_guidance_check",
        category: "skill_files",
        name: "正向引导存在",
        passed: hasPositiveGuidance,
        message: hasPositiveGuidance ? "发现全量分析优先规则" : "未找到全量分析优先规则",
    });
    // 4. archive safety
    const archiveDir = path.join(skillRoot(skillId), ".archive");
    const archiveExists = await fileExists(archiveDir);
    results.push({
        check_id: "archive_safety_check",
        category: "archive",
        name: "归档目录存在（无 delete）",
        passed: archiveExists,
        message: archiveExists ? "只归档不删除" : "未发现归档目录",
    });
    const overallPassed = results.every((r) => r.passed);
    return {
        report_id: `qr-${Date.now()}`,
        skill_id: skillId,
        preview_id: previewId,
        created_at: utcTimestamp(),
        triggered_by: triggeredBy,
        overall_passed: overallPassed,
        results,
    };
}
async function fileExists(p) {
    try {
        await fs.access(p);
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=index.js.map