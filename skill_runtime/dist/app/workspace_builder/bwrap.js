import path from "node:path";
import { fileURLToPath } from "node:url";
import { REPO_ROOT } from "../shared/utils/paths.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export function buildBwrapCommand(workspacePath, opencodeCommand) {
    const profilePath = path.join(REPO_ROOT, "configs", "bwrap-profiles", "stage.profile");
    // Replace placeholders in profile at runtime, or use inline args
    return [
        "bwrap",
        "--unshare-all",
        "--die-with-parent",
        "--ro-bind",
        REPO_ROOT,
        REPO_ROOT,
        "--bind",
        workspacePath,
        workspacePath,
        "--tmpfs",
        "/tmp",
        "--proc",
        "/proc",
        "--dev",
        "/dev",
        ...opencodeCommand,
    ];
}
export function shouldUseBwrap() {
    return process.env.STAGE_USE_BWRAP === "1";
}
//# sourceMappingURL=bwrap.js.map