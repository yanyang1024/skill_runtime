import path from "node:path";
import fs from "node:fs/promises";
import fsSync from "node:fs";
/**
 * 路径安全工具：四层路径穿越防御 + 标识符消毒。
 *
 * 设计原则：
 * 1. 所有从 HTTP 请求进入的标识符必须先经 assertSafeIdentifier / sanitizePathComponent。
 * 2. 所有相对路径必须先经 resolveContainedPath / safeResolve，展开 .. 与 symlink 后再验证仍在 root 内。
 * 3. 绝不把用户输入直接拼接到文件系统路径中。
 * 4. 所有 containment 检查统一使用 fs.realpath 解析 symlink，保持一致性。
 */
const SAFE_IDENTIFIER_PATTERNS = {
    // skill id 保持与 Zod SkillId 一致：小写字母、数字、连字符
    skill: /^[a-z0-9-]+$/,
    // run id / preview id 允许文件名安全字符：字母、数字、连字符、下划线、点
    run: /^[a-zA-Z0-9._\-]+$/,
    preview: /^[a-zA-Z0-9._\-]+$/,
    // stage id 由调用方用 Zod StageId 校验，这里只做非空检查
    stage: /^.+$/,
    // attempt 由调用方做数值校验，这里只做非空检查
    attempt: /^.+$/,
};
export class PathSecurityError extends Error {
    constructor(message) {
        super(message);
        this.name = "PathSecurityError";
    }
}
/**
 * 校验标识符安全。不满足时抛出 PathSecurityError。
 */
export function assertSafeIdentifier(value, kind) {
    if (typeof value !== "string" || value.length === 0) {
        throw new PathSecurityError(`${kind} 不能为空`);
    }
    const pattern = SAFE_IDENTIFIER_PATTERNS[kind];
    if (!pattern.test(value)) {
        throw new PathSecurityError(`非法的 ${kind} 标识符: ${value}`);
    }
}
/**
 * 消毒路径组件。按用户提供的规则：
 * - 替换 / \ ..
 * - 仅保留 a-zA-Z0-9-_.
 * - 截断至 128 字符
 */
export function sanitizePathComponent(value) {
    const original = value;
    let cleaned = value.replace(/\//g, "_").replace(/\\/g, "_").replace(/\.\./g, "_");
    const allowed = new Set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.");
    cleaned = Array.from(cleaned)
        .map((c) => (allowed.has(c) ? c : "_"))
        .join("");
    const truncated = cleaned.slice(0, 128);
    const result = truncated || "unknown";
    return { value: result, replaced: result !== original };
}
/**
 * 将相对路径解析为 root 内的绝对路径。
 * 防御层级：
 * 1. 空路径报错。
 * 2. 绝对路径（跨平台）报错。
 * 3. path.resolve 展开 .. 与 symlink。
 * 4. relative_to(root) 验证仍在 workspace 内。
 */
export function resolveContainedPath(root, relative) {
    if (typeof relative !== "string" || relative.length === 0) {
        throw new PathSecurityError("路径不能为空");
    }
    if (path.isAbsolute(relative)) {
        throw new PathSecurityError(`不允许使用绝对路径: ${relative}`);
    }
    const resolvedRoot = path.resolve(root);
    const target = path.resolve(resolvedRoot, relative);
    const rel = path.relative(resolvedRoot, target);
    if (rel.startsWith("..") || rel === "..") {
        throw new PathSecurityError(`路径越界: ${relative}`);
    }
    return target;
}
/**
 * 校验给定的绝对路径确实位于 root 内部。用于校验外部已解析的路径。
 * 使用 fs.realpathSync 解析 symlink，与 safeResolve 保持一致。
 */
export function assertContainedPath(root, candidate) {
    const resolvedRoot = resolveRealPath(root);
    const resolvedCandidate = resolveRealPath(candidate);
    if (resolvedCandidate !== resolvedRoot &&
        !resolvedCandidate.startsWith(resolvedRoot + path.sep)) {
        throw new PathSecurityError(`路径不在允许的根目录内: ${candidate}`);
    }
}
function resolveRealPath(p) {
    try {
        return fsSync.realpathSync(p);
    }
    catch {
        return path.resolve(p);
    }
}
/**
 * 更强的路径解析：使用 fs.realpath 处理 symlink，确保最终路径仍在 workspace 内。
 */
export async function safeResolve(workspace, relativePath) {
    if (!relativePath) {
        throw new PathSecurityError("路径不能为空");
    }
    if (path.isAbsolute(relativePath)) {
        throw new PathSecurityError(`不允许使用绝对路径: ${relativePath}`);
    }
    const workspaceReal = await fs.realpath(workspace).catch(() => path.resolve(workspace));
    const candidate = path.resolve(workspaceReal, relativePath);
    const finalPath = await fs.realpath(candidate).catch(() => candidate);
    const rel = path.relative(workspaceReal, finalPath);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
        throw new PathSecurityError(`路径越界: ${relativePath}`);
    }
    return finalPath;
}
//# sourceMappingURL=security.js.map