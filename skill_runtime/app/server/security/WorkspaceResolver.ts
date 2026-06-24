/**
 * Workspace Resolver / Path Guard — 标识符消毒、路径穿越防御、symlink 解析。
 */

export {
  assertSafeIdentifier,
  sanitizePathComponent,
  resolveContainedPath,
  assertContainedPath,
  safeResolve,
  PathSecurityError,
} from "../../shared/utils/security.js";
