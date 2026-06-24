import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import skillsRouter from "./routes/skills.js";
import runsRouter from "./routes/runs.js";
import stagesRouter from "./routes/stages.js";
import chatRouter from "./routes/chat.js";
import artifactsRouter from "./routes/artifacts.js";
import eventsRouter, { emitStatus } from "./routes/events.js";
import { stopAllRuntimes } from "./stageRuntimeManager.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../../..");
async function detectWebRoot() {
    const candidates = [
        path.join(REPO_ROOT, "dist", "web"),
        path.join(REPO_ROOT, "app", "web"),
        path.join(REPO_ROOT, "app", "ui"),
    ];
    for (const candidate of candidates) {
        try {
            await fs.access(path.join(candidate, "index.html"));
            return candidate;
        }
        catch {
            // try next
        }
    }
    return path.join(REPO_ROOT, "app", "ui");
}
const app = express();
const PORT = Number(process.env.SKILL_GROWTH_PORT ?? 3000);
app.use(express.json());
// Mock external API for demonstration/tests
app.get("/mock/api/v2/run-history", (req, res) => {
    res.json({
        lot_id: req.query.lot_id ?? "LOT-001",
        runs: [{ tool_id: "TOOL-A", run_start_time: "2026-06-01T00:00:00Z", recipe_id: "RCP-1" }],
    });
});
// API routes
app.use("/api/skills", skillsRouter);
app.use("/api/runs", runsRouter);
app.use("/api/runs", stagesRouter);
app.use("/api/runs/:runId/stage/:stageId/chat", chatRouter);
app.use("/api/runs", artifactsRouter);
app.use("/api/events", eventsRouter);
app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "skill-growth-studio" });
});
async function startServer() {
    const webRoot = await detectWebRoot();
    // Static SPA
    app.use(express.static(webRoot));
    // SPA fallback
    app.get("*", (_req, res) => {
        res.sendFile(path.join(webRoot, "index.html"));
    });
    const server = app.listen(PORT, () => {
        const address = server.address();
        const actualPort = typeof address === "string" ? PORT : address?.port ?? PORT;
        emitStatus(`监听端口 ${actualPort} (webRoot: ${webRoot})`, "idle");
        console.log(`Skill Growth Studio server listening on http://localhost:${actualPort}`);
    });
    process.on("SIGTERM", async () => {
        await stopAllRuntimes();
        process.exit(0);
    });
    process.on("SIGINT", async () => {
        await stopAllRuntimes();
        process.exit(0);
    });
}
void startServer();
//# sourceMappingURL=index.js.map