import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import skillsRouter from "./routes/skills.js";
import runsRouter from "./routes/runs.js";
import stagesRouter from "./routes/stages.js";
import artifactsRouter from "./routes/artifacts.js";
import eventsRouter, { emitStatus } from "./routes/events.js";
import { stopAllRuntimes } from "./stageRuntimeManager.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "../../..");
const app = express();
const PORT = Number(process.env.SKILL_GROWTH_PORT ?? 3000);
app.use(express.json());
// Serve marked from node_modules for the UI
app.use("/marked", express.static(path.join(REPO_ROOT, "node_modules/marked")));
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
app.use("/api/runs", artifactsRouter);
app.use("/api/events", eventsRouter);
app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "skill-growth-studio" });
});
// Static SPA
app.use(express.static(path.join(__dirname, "../../app/ui")));
// SPA fallback
app.get("*", (_req, res) => {
    res.sendFile(path.join(__dirname, "../../app/ui/index.html"));
});
const server = app.listen(PORT, () => {
    const address = server.address();
    const actualPort = typeof address === "string" ? PORT : address?.port ?? PORT;
    emitStatus(`监听端口 ${actualPort}`, "idle");
    console.log(`Skill Growth Studio server listening on http://localhost:${actualPort}`);
});
process.on("SIGTERM", () => {
    stopAllRuntimes();
    process.exit(0);
});
process.on("SIGINT", () => {
    stopAllRuntimes();
    process.exit(0);
});
//# sourceMappingURL=index.js.map