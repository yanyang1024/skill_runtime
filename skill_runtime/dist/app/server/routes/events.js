import { Router } from "express";
import { EventEmitter } from "node:events";
const emitter = new EventEmitter();
emitter.setMaxListeners(0);
const router = Router();
router.get("/", (_req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();
    const listener = (data) => {
        if (res.writableEnded)
            return;
        res.write(`event: status\ndata: ${JSON.stringify(data)}\n\n`);
    };
    const artifactListener = (data) => {
        if (res.writableEnded)
            return;
        res.write(`event: artifact_changed\ndata: ${JSON.stringify(data)}\n\n`);
    };
    emitter.on("status", listener);
    emitter.on("artifact_changed", artifactListener);
    const cleanup = () => {
        emitter.off("status", listener);
        emitter.off("artifact_changed", artifactListener);
    };
    _req.on("close", cleanup);
    res.on("close", cleanup);
});
export function emitStatus(text, cls = "idle") {
    emitter.emit("status", { text, class: cls });
}
export function emitArtifactChanged(data) {
    emitter.emit("artifact_changed", data);
}
export default router;
//# sourceMappingURL=events.js.map