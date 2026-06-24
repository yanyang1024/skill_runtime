import path from "node:path";
import fs from "node:fs/promises";
import YAML from "yaml";
import { REPO_ROOT } from "../shared/utils/paths.js";
import { assertContainedPath, PathSecurityError, } from "../shared/utils/security.js";
/**
 * 是否使用 bwrap。默认启用，可通过 STAGE_USE_BWRAP=0 关闭。
 * 写 stage（work_writable）强烈建议启用；只读 stage 在禁用时会发出警告。
 */
export function shouldUseBwrap() {
    const env = process.env.STAGE_USE_BWRAP;
    if (env === "0" || env === "false")
        return false;
    return true;
}
function getNodeModulesDir() {
    return path.join(REPO_ROOT, "node_modules");
}
async function loadMountsConfig() {
    const mountsPath = path.join(REPO_ROOT, "configs", "bwrap-profiles", "mounts.yaml");
    try {
        const raw = await fs.readFile(mountsPath, "utf-8");
        return YAML.parse(raw);
    }
    catch {
        return {};
    }
}
function expandBwrapTemplate(template, ctx) {
    const attemptPad = String(ctx.attempt).padStart(3, "0");
    return template
        .replace(/\{\{REPO_ROOT\}\}/g, REPO_ROOT)
        .replace(/\{\{WORKSPACE_DIR\}\}/g, ctx.workspacePath)
        .replace(/\{\{NODE_MODULES_DIR\}\}/g, getNodeModulesDir())
        .replace(/\{\{SKILL_ID\}\}/g, ctx.skillId)
        .replace(/\{\{PREVIEW_ID\}\}/g, ctx.previewId ?? "")
        .replace(/\{\{RUN_ID\}\}/g, ctx.runId)
        .replace(/\{\{STAGE_ID\}\}/g, ctx.stageId)
        .replace(/\{\{ATTEMPT\}\}/g, String(ctx.attempt))
        .replace(/\{\{ATTEMPT_PAD\}\}/g, attemptPad);
}
function containsTemplateVar(value) {
    return /\{\{[^}]+\}\}/.test(value);
}
/**
 * 读取 bwrap profile 模板并生成完整命令。
 * workspacePath 必须先经 path 安全校验。
 */
export async function buildBwrapCommand(ctx, opencodeCommand) {
    // 验证 workspacePath 确实在项目根下，防止注入
    assertContainedPath(REPO_ROOT, ctx.workspacePath);
    const profilePath = path.join(REPO_ROOT, "configs", "bwrap-profiles", "stage.profile");
    let profileLines = [];
    try {
        const raw = await fs.readFile(profilePath, "utf-8");
        profileLines = raw
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line.length > 0 && !line.startsWith("#"));
    }
    catch {
        // profile 不存在则回退到 inline 默认参数
        profileLines = [
            "--unshare-all",
            "--die-with-parent",
            `--ro-bind ${REPO_ROOT} ${REPO_ROOT}`,
            `--bind ${ctx.workspacePath} ${ctx.workspacePath}`,
            "--tmpfs /tmp",
            "--proc /proc",
            "--dev /dev",
        ];
    }
    const expandedProfile = profileLines.map((line) => expandBwrapTemplate(line, ctx));
    // 读取按域预配置的挂载
    const mounts = await loadMountsConfig();
    const mountArgs = [];
    function pushMount(mount, mode) {
        const source = expandBwrapTemplate(mount.source, ctx);
        const target = expandBwrapTemplate(mount.target, ctx);
        // 如果展开后仍包含模板变量（如 PREVIEW_ID 为空），则跳过该挂载
        if (containsTemplateVar(source) || containsTemplateVar(target)) {
            return;
        }
        mountArgs.push(`--${mode}`, source, target);
    }
    for (const mount of mounts.read_only ?? []) {
        pushMount(mount, "ro-bind");
    }
    for (const mount of mounts.bind ?? []) {
        pushMount(mount, "bind");
    }
    // preview 目录根据 skill_mount 动态决定可写或只读
    if (ctx.previewId && ctx.skillMount !== "none" && mounts.preview_mount) {
        const mode = ctx.skillMount === "preview-writable" ? "bind" : "ro-bind";
        pushMount(mounts.preview_mount, mode);
    }
    return ["bwrap", ...expandedProfile, ...mountArgs, ...opencodeCommand];
}
export { PathSecurityError };
//# sourceMappingURL=bwrap.js.map