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
        try {
            res.write(`event: status\ndata: ${JSON.stringify(data)}\n\n`);
        }
        catch {
            cleanup();
        }
    };
    const artifactListener = (data) => {
        if (res.writableEnded)
            return;
        try {
            res.write(`event: artifact_changed\ndata: ${JSON.stringify(data)}\n\n`);
        }
        catch {
            cleanup();
        }
    };
    // 心跳 keep-alive：每 30s 发送 comment，防止代理断开
    const heartbeat = setInterval(() => {
        if (res.writableEnded)
            return;
        try {
            res.write(": heartbeat\n\n");
        }
        catch {
            cleanup();
        }
    }, 30000);
    const stageStatusListener = (data) => {
        if (res.writableEnded)
            return;
        try {
            res.write(`event: stage_status\ndata: ${JSON.stringify(data)}\n\n`);
        }
        catch {
            cleanup();
        }
    };
    emitter.on("status", listener);
    emitter.on("artifact_changed", artifactListener);
    emitter.on("stage_status", stageStatusListener);
    const cleanup = () => {
        clearInterval(heartbeat);
        emitter.off("status", listener);
        emitter.off("artifact_changed", artifactListener);
        emitter.off("stage_status", stageStatusListener);
    };
    _req.on("close", cleanup);
    res.on("close", cleanup);
});
export function emitStatus(text, cls = "idle") {
    emitter.emit("status", { text, class: cls });
}
export function emitStageStatusChanged(data) {
    emitter.emit("stage_status", data);
}
export function emitArtifactChanged(data) {
    emitter.emit("artifact_changed", data);
}
export default router;
//# sourceMappingURL=events.js.map