import { Router } from "express";
import type { Request, Response } from "express";
import type { ChatSSEEvent } from "../../web/src/types/chat.js";
import { createOpencodeSessionClient } from "../../opencode_client/index.js";
import {
  ensureEventStream,
  getSSEEmitter,
  removeSSEEmitter,
  abortEventStream,
} from "../../opencode_client/sse.js";
import { stageOutputDir } from "../../shared/utils/paths.js";
import { getRuntime, type RunningStage } from "../stageRuntimeManager.js";
import {
  validateRunStageParams,
  getSafeParams,
} from "../middleware/validateParams.js";

const router: Router = Router({ mergeParams: true });

router.use(validateRunStageParams());

function getRuntimeForRequest(req: Request): RunningStage | null {
  const { runId, stageId, attempt } = getSafeParams<{
    runId: string;
    stageId: string;
    attempt: number;
  }>(req);
  const serverId = `${runId}-${stageId}-${attempt}`;
  return getRuntime(serverId) ?? null;
}

function gateRuntime(req: Request, res: Response): RunningStage | null {
  const runtime = getRuntimeForRequest(req);
  if (!runtime) {
    res.status(404).json({ error: "runtime not running" });
    return null;
  }
  if (runtime.status !== "running" || !runtime.healthy) {
    res.status(503).json({
      error: "runtime not ready",
      status: runtime.status,
      healthy: runtime.healthy,
      detail: runtime.error ?? null,
    });
    return null;
  }
  return runtime;
}

function serverError(res: Response, err: unknown): void {
  res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
}

// POST /session -> 创建 session
router.post("/session", async (req, res) => {
  const runtime = gateRuntime(req, res);
  if (!runtime) return;
  const { title } = req.body;
  try {
    const client = createOpencodeSessionClient({ baseUrl: runtime.base_url });
    const session = await client.createSession(runtime.workspace_path, typeof title === "string" ? title : "stage session");
    res.json(session);
  } catch (err) {
    serverError(res, err);
  }
});

// GET /session/:sessionId -> 获取 session 状态（含 token 统计 + 上下文限制）
router.get("/session/:sessionId", async (req, res) => {
  const runtime = gateRuntime(req, res);
  if (!runtime) return;
  try {
    const client = createOpencodeSessionClient({ baseUrl: runtime.base_url });
    const session = await client.getSession(runtime.workspace_path, req.params.sessionId) as Record<string, unknown>;
    // 获取模型上下文限制
    let contextLimit = 131072;
    try {
      const configResp = await fetch(`${runtime.base_url}/config`, {
        headers: { authorization: `Basic ${Buffer.from(`${process.env.OPENCODE_SERVER_USERNAME ?? "opencode"}:${process.env.OPENCODE_SERVER_PASSWORD ?? "skillgrowth"}`).toString("base64")}` },
      });
      if (configResp.ok) {
        const config = await configResp.json() as Record<string, unknown>;
        const model = session?.model as Record<string, unknown> | undefined;
        const pid = (model?.providerID ?? "local-v1") as string;
        const mid = (model?.id ?? "glm4:9b") as string;
        const providers = config?.provider as Record<string, unknown> | undefined;
        const provider = providers?.[pid] as Record<string, unknown> | undefined;
        const models = provider?.models as Record<string, unknown> | undefined;
        const modelCfg = models?.[mid] as Record<string, unknown> | undefined;
        const limit = modelCfg?.limit as Record<string, number> | undefined;
        if (limit?.context) contextLimit = limit.context;
      }
    } catch { /* best-effort */ }
    res.json({ ...session, context_limit: contextLimit });
  } catch (err) {
    serverError(res, err);
  }
});

// DELETE /session/:sessionId -> 删除 session
router.delete("/session/:sessionId", async (req, res) => {
  const runtime = gateRuntime(req, res);
  if (!runtime) return;
  const { runId, stageId, attempt } = getSafeParams<{ runId: string; stageId: string; attempt: number }>(req);
  const sessionId = req.params.sessionId;
  try {
    const client = createOpencodeSessionClient({ baseUrl: runtime.base_url });
    const resp = await client.deleteSession(runtime.workspace_path, sessionId);
    // 清理该 session 的 SSE emitter
    removeSSEEmitter(runId, stageId, attempt, sessionId);
    res.status(resp.status).json({ ok: resp.ok });
  } catch (err) {
    serverError(res, err);
  }
});

// POST /session/:sessionId/abort -> abort
router.post("/session/:sessionId/abort", async (req, res) => {
  const runtime = gateRuntime(req, res);
  if (!runtime) return;
  const { runId, stageId, attempt } = getSafeParams<{ runId: string; stageId: string; attempt: number }>(req);
  const sessionId = req.params.sessionId;
  try {
    const client = createOpencodeSessionClient({ baseUrl: runtime.base_url });
    const resp = await client.abortSession(runtime.workspace_path, sessionId);
    abortEventStream(runId, stageId, attempt, sessionId);
    res.status(resp.status).json({ ok: resp.ok });
  } catch (err) {
    serverError(res, err);
  }
});

// POST /session/:sessionId/message -> 发送 prompt（异步，立即返回）
router.post("/session/:sessionId/message", async (req, res) => {
  const runtime = gateRuntime(req, res);
  if (!runtime) return;
  const { parts, agent, model } = req.body;
  const { runId, stageId, attempt } = getSafeParams<{
    runId: string;
    stageId: string;
    attempt: number;
  }>(req);
  const sessionId = req.params.sessionId;

  try {
    // 跟踪活跃 session，stop 时用于 abort/delete
    runtime.active_session_id = sessionId;
    runtime.abort_event_stream = () => abortEventStream(runId, stageId, attempt, sessionId);

    const client = createOpencodeSessionClient({ baseUrl: runtime.base_url });
    // 先启动后台 SSE 消费，避免错过 prompt_async 触发后的早期事件
    const outputDir = stageOutputDir(runId, stageId, attempt);
    ensureEventStream(runtime.base_url, runtime.workspace_path, outputDir, runId, stageId, attempt, sessionId)
      .catch((err) => console.error("[chat] ensureEventStream failed:", err));

    const resp = await client.sendPromptAsync(runtime.workspace_path, sessionId, {
      parts: Array.isArray(parts) ? parts : [],
      agent,
      model,
    });
    if (![200, 202, 204].includes(resp.status)) {
      const text = await resp.text().catch(() => "");
      throw new Error(`prompt_async failed: ${resp.status} ${text}`);
    }

    res.json({ session_id: sessionId });
  } catch (err) {
    serverError(res, err);
  }
});

// GET /session/:sessionId/message?limit= -> 拉取历史消息
router.get("/session/:sessionId/message", async (req, res) => {
  const runtime = gateRuntime(req, res);
  if (!runtime) return;
  const rawLimit = req.query.limit;
  const limit = rawLimit && !Number.isNaN(Number(rawLimit)) ? Number(rawLimit) : undefined;
  try {
    const client = createOpencodeSessionClient({ baseUrl: runtime.base_url });
    const messages = await client.getMessages(runtime.workspace_path, req.params.sessionId, limit);
    res.json(messages);
  } catch (err) {
    serverError(res, err);
  }
});

// POST /session/:sessionId/question/:questionId -> 回复 question
router.post(
  "/session/:sessionId/question/:questionId",
  async (req, res) => {
    const runtime = gateRuntime(req, res);
    if (!runtime) return;
    try {
      const client = createOpencodeSessionClient({ baseUrl: runtime.base_url });
      const resp = await client.replyQuestion(
        runtime.workspace_path,
        req.params.sessionId,
        req.params.questionId,
        req.body,
      );
      res.status(resp.status).json({ ok: resp.ok });
    } catch (err) {
      serverError(res, err);
    }
  },
);

// POST /session/:sessionId/permission/:permissionId -> 允许/拒绝权限
router.post(
  "/session/:sessionId/permission/:permissionId",
  async (req, res) => {
    const runtime = gateRuntime(req, res);
    if (!runtime) return;
    const { allowed } = req.body;
    try {
      const client = createOpencodeSessionClient({ baseUrl: runtime.base_url });
      const resp = await client.replyPermission(
        runtime.workspace_path,
        req.params.sessionId,
        req.params.permissionId,
        allowed === true,
      );
      res.status(resp.status).json({ ok: resp.ok });
    } catch (err) {
      serverError(res, err);
    }
  },
);

// GET /events?session_id= -> SSE 代理
router.get("/events", async (req, res) => {
  const runtime = gateRuntime(req, res);
  if (!runtime) return;

  const sessionId = req.query.session_id;
  if (typeof sessionId !== "string" || sessionId.length === 0) {
    res.status(400).json({ error: "missing session_id query parameter" });
    return;
  }

  const { runId, stageId, attempt } = getSafeParams<{
    runId: string;
    stageId: string;
    attempt: number;
  }>(req);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  (res as Response & { flushHeaders?: () => void }).flushHeaders?.();

  const emitter = getSSEEmitter(runId, stageId, attempt, sessionId);

  const listener = (event: ChatSSEEvent) => {
    if (res.writableEnded) return;
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch {
      cleanup();
    }
  };

  emitter.on("event", listener);

  // 30s heartbeat 防止代理/load balancer 断开闲置连接
  const heartbeat = setInterval(() => {
    if (res.writableEnded) return;
    try { res.write(": heartbeat\n\n"); } catch { cleanup(); }
  }, 30000);

  const cleanup = () => {
    clearInterval(heartbeat);
    emitter.off("event", listener);
  };
  req.on("close", cleanup);
  res.on("close", cleanup);

  // 确保后台正在消费 OpenCode /event 流
  const outputDir = stageOutputDir(runId, stageId, attempt);
  ensureEventStream(runtime.base_url, runtime.workspace_path, outputDir, runId, stageId, attempt, sessionId)
    .catch((err) => console.error("[chat] ensureEventStream failed:", err));
});

// GET /subscribe?session_id= — 重连已有 session 的 SSE 流（页面刷新恢复）
router.get("/subscribe", async (req, res) => {
  const runtime = gateRuntime(req, res);
  if (!runtime) return;

  const sessionId = req.query.session_id;
  if (typeof sessionId !== "string" || sessionId.length === 0) {
    res.status(400).json({ error: "missing session_id query parameter" });
    return;
  }

  const { runId, stageId, attempt } = getSafeParams<{
    runId: string;
    stageId: string;
    attempt: number;
  }>(req);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  (res as Response & { flushHeaders?: () => void }).flushHeaders?.();

  // 先拉取历史消息，重放为初始事件
  try {
    const client = createOpencodeSessionClient({ baseUrl: runtime.base_url });
    const history = await client.getMessages(runtime.workspace_path, sessionId);
    if (Array.isArray(history)) {
      for (const msg of history) {
        const info = (msg as Record<string, unknown>)?.info as Record<string, unknown> | undefined;
        const parts = (msg as Record<string, unknown>)?.parts as Array<Record<string, unknown>> | undefined;
        if (info?.id) {
          res.write(`data: ${JSON.stringify({ type: "message_start", message_id: info.id, role: (info.role ?? "assistant") as string })}\n\n`);
          if (Array.isArray(parts)) {
            for (const part of parts) {
              const pType = (part.type ?? "text") as string;
              if (part.id) {
                res.write(`data: ${JSON.stringify({ type: "part_start", message_id: info.id, part_id: part.id, part_type: pType === "text" || pType === "reasoning" || pType === "tool" || pType === "error" ? pType : "text" })}\n\n`);
                if (typeof part.text === "string") {
                  res.write(`data: ${JSON.stringify({ type: pType === "reasoning" ? "reasoning_delta" : "text_delta", message_id: info.id, part_id: part.id, content: part.text })}\n\n`);
                }
              }
            }
          }
          res.write(`data: ${JSON.stringify({ type: "message_end", message_id: info.id })}\n\n`);
        }
      }
    }
  } catch {
    // history fetch best-effort
  }

  // 然后连接实时 SSE
  const emitter = getSSEEmitter(runId, stageId, attempt, sessionId);
  const listener = (event: ChatSSEEvent) => {
    if (res.writableEnded) return;
    try { res.write(`data: ${JSON.stringify(event)}\n\n`); } catch { cleanup(); }
  };
  emitter.on("event", listener);
  const cleanup = () => { emitter.off("event", listener); };
  req.on("close", cleanup);
  res.on("close", cleanup);

  const outputDir = stageOutputDir(runId, stageId, attempt);
  ensureEventStream(runtime.base_url, runtime.workspace_path, outputDir, runId, stageId, attempt, sessionId)
    .catch((err) => console.error("[chat] ensureEventStream failed:", err));
});

export default router;
