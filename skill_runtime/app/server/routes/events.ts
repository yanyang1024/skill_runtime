import { Router, type Request, type Response } from "express";
import { EventEmitter } from "node:events";

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

const router: Router = Router();

router.get("/", (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  (res as Response & { flushHeaders?: () => void }).flushHeaders?.();

  const listener = (data: unknown) => {
    res.write(`event: status\ndata: ${JSON.stringify(data)}\n\n`);
  };

  emitter.on("status", listener);

  _req.on("close", () => {
    emitter.off("status", listener);
  });
});

export function emitStatus(text: string, cls = "idle") {
  emitter.emit("status", { text, class: cls });
}

export default router;
