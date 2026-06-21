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
        res.write(`event: status\ndata: ${JSON.stringify(data)}\n\n`);
    };
    emitter.on("status", listener);
    _req.on("close", () => {
        emitter.off("status", listener);
    });
});
export function emitStatus(text, cls = "idle") {
    emitter.emit("status", { text, class: cls });
}
export default router;
//# sourceMappingURL=events.js.map