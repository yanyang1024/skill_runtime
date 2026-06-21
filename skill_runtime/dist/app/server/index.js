import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import skillsRouter from "./routes/skills.js";
import sessionsRouter from "./routes/sessions.js";
import eventsRouter, { emitStatus } from "./routes/events.js";
import { stopAllSessions } from "./sessionManager.js";
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
app.use("/api/sessions", sessionsRouter);
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
app.listen(PORT, () => {
    emitStatus(`监听端口 ${PORT}`, "idle");
    console.log(`Skill Growth Studio server listening on http://localhost:${PORT}`);
});
process.on("SIGTERM", () => {
    stopAllSessions();
    process.exit(0);
});
process.on("SIGINT", () => {
    stopAllSessions();
    process.exit(0);
});
//# sourceMappingURL=index.js.map