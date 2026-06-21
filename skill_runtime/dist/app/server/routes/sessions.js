import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { createProxyMiddleware } from "http-proxy-middleware";
import { startSession, stopSession, listSessions, getSession, } from "../sessionManager.js";
import { utcTimestamp } from "../../shared/utils/time.js";
const router = Router();
router.post("/", async (req, res) => {
    const { skillId, label, version = "stable" } = req.body;
    try {
        const session = await startSession({ skillId, label, version });
        res.json({
            id: session.id,
            skillId: session.skillId,
            label: session.label,
            version: session.version,
            port: session.port,
            url: session.url,
            proxyUrl: session.proxyUrl,
        });
    }
    catch (err) {
        res.status(500).json({ error: String(err) });
    }
});
router.get("/", (_req, res) => {
    res.json(listSessions());
});
router.delete("/:id", (req, res) => {
    const ok = stopSession(req.params.id);
    res.json({ ok });
});
router.post("/:id/notes", async (req, res) => {
    const session = getSession(req.params.id);
    if (!session) {
        res.status(404).json({ error: "session not found" });
        return;
    }
    const { feedback, decisionHint } = req.body;
    const notesPath = path.join(session.workspaceDir, "..", "director-notes.yaml");
    const doc = {
        preview_id: session.version,
        rehearse_id: path.basename(path.dirname(session.workspaceDir)),
        skill_id: session.skillId,
        created_at: utcTimestamp(),
        feedback: feedback || [],
        decision_hint: decisionHint || undefined,
    };
    await fs.writeFile(notesPath, YAML.stringify(doc), "utf-8");
    res.json({ ok: true, path: notesPath });
});
// Proxy middleware for session UI
router.use("/:id/view", (req, res, next) => {
    const session = getSession(req.params.id);
    if (!session) {
        res.status(404).json({ error: "session not found" });
        return;
    }
    const proxy = createProxyMiddleware({
        target: session.url,
        changeOrigin: true,
        ws: true,
        onProxyRes: (proxyRes) => {
            // Allow embedding in iframe
            delete proxyRes.headers["x-frame-options"];
            delete proxyRes.headers["content-security-policy"];
        },
    });
    proxy(req, res, next);
});
export default router;
//# sourceMappingURL=sessions.js.map