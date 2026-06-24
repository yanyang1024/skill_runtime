/**
 * OpenCode Gateway — Headless OpenCode HTTP client.
 *
 * 所有 OpenCode 请求都强制注入 x-opencode-directory header，
 * 确保每个操作都在正确的 workspace 上下文中执行。
 */
export { createOpencodeSessionClient, type OpencodeSessionClient, type CreateOpencodeSessionClientOptions, } from "../../opencode_client/index.js";
//# sourceMappingURL=OpenCodeClient.d.ts.map