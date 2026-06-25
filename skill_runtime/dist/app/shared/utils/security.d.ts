export declare class PathSecurityError extends Error {
    constructor(message: string);
}
export interface SanitizeResult {
    value: string;
    replaced: boolean;
}
/**
 * 校验标识符安全。不满足时抛出 PathSecurityError。
 */
export declare function assertSafeIdentifier(value: unknown, kind: "skill" | "run" | "stage" | "attempt" | "preview"): asserts value is string;
/**
 * 消毒路径组件。按用户提供的规则：
 * - 替换 / \ ..
 * - 仅保留 a-zA-Z0-9-_.
 * - 截断至 128 字符
 */
export declare function sanitizePathComponent(value: string): SanitizeResult;
/**
 * 将相对路径解析为 root 内的绝对路径。
 * 防御层级：
 * 1. 空路径报错。
 * 2. 绝对路径（跨平台）报错。
 * 3. path.resolve 展开 .. 与 symlink。
 * 4. relative_to(root) 验证仍在 workspace 内。
 */
export declare function resolveContainedPath(root: string, relative: string): string;
/**
 * 校验给定的绝对路径确实位于 root 内部。用于校验外部已解析的路径。
 * 使用 fs.realpathSync 解析 symlink，与 safeResolve 保持一致。
 */
export declare function assertContainedPath(root: string, candidate: string): void;
/**
 * 更强的路径解析：使用 fs.realpath 处理 symlink，确保最终路径仍在 workspace 内。
 */
export declare function safeResolve(workspace: string, relativePath: string): Promise<string>;
//# sourceMappingURL=security.d.ts.map