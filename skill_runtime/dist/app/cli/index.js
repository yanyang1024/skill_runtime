#!/usr/bin/env node
import { spawn } from "cross-spawn";
const args = process.argv.slice(2);
const command = args[0];
function printUsage() {
    console.log(`
Skill Growth Studio CLI

用法:
  skill-growth server          启动 Web UI 控制平面
  skill-growth observe         触发 Observe（开发中）
  skill-growth grow            触发 Grow dry-run / live（开发中）
  skill-growth rehearse        触发 Rehearse（开发中）
  skill-growth stabilize       触发 Stabilize（开发中）
`);
}
async function main() {
    switch (command) {
        case "server": {
            const proc = spawn("tsx", ["app/server/index.ts"], { stdio: "inherit" });
            proc.on("error", (err) => {
                console.error(`启动 server 失败: ${err.message}`);
                if (err.code === "ENOENT") {
                    console.error("提示: tsx 未安装，请运行 pnpm install 或直接使用 pnpm dev");
                }
                process.exit(1);
            });
            proc.on("exit", (code) => process.exit(code ?? 0));
            break;
        }
        case undefined:
        case "--help":
        case "-h":
            printUsage();
            break;
        default:
            console.log(`命令 "${command}" 尚未实现完整逻辑，请先使用 server 模式。`);
            printUsage();
            process.exit(1);
    }
}
main().catch((err) => {
    console.error("CLI 致命错误:", err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map