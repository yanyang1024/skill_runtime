import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import path from "node:path";
import type { ChatSSEEvent } from "../web/src/types/chat.js";
import { createOpencodeSessionClient } from "./index.js";

/**
 * OpenCode SSE 归一化层。
 *
 * 职责：
 * 1. 消费 OpenCode /event SSE 流。
 * 2. 将 OpenCode 原始事件转换为前端可识别的 ChatSSEEvent 协议。
 * 3. 写入 session-stream*.md 审计日志。
 * 4. 通过 EventEmitter 派发标准化事件。
 *
 * 设计原则：
 * - OpenCode 原始事件结构只应出现在本文件；前端永远看不到原始事件。
 * - 所有 delta 事件必须携带 message_id + part_id，供前端按 part 增量追加。
 * - 未知事件尽量忽略或降级为 error，不阻塞流。
 */

const emitters = new Map<string, EventEmitter>();
const streamControllers = new Map<string, AbortController>();
const activeConsumers = new Set<string>();

function scopeKey(
  runId: string,
  stageId: string,
  attempt: number,
  sessionId: string,
): string {
  return `${runId}|${stageId}|${attempt}|${sessionId}`;
}

export function getSSEEmitter(
  runId: string,
  stageId: string,
  attempt: number,
  sessionId: string,
): EventEmitter {
  const key = scopeKey(runId, stageId, attempt, sessionId);
  let emitter = emitters.get(key);
  if (!emitter) {
    emitter = new EventEmitter();
    emitter.setMaxListeners(0);
    emitters.set(key, emitter);
  }
  return emitter;
}

export function removeSSEEmitter(
  runId: string,
  stageId: string,
  attempt: number,
  sessionId: string,
): void {
  const key = scopeKey(runId, stageId, attempt, sessionId);
  const emitter = emitters.get(key);
  if (emitter) {
    emitter.removeAllListeners();
    emitters.delete(key);
  }
}

export function abortEventStream(
  runId: string,
  stageId: string,
  attempt: number,
  sessionId: string,
): void {
  const key = scopeKey(runId, stageId, attempt, sessionId);
  const controller = streamControllers.get(key);
  if (controller) {
    controller.abort();
  }
}

function emit(
  emitter: EventEmitter,
  runId: string,
  stageId: string,
  attempt: number,
  sessionId: string,
  event: ChatSSEEvent,
): void {
  emitter.emit("event", event, { runId, stageId, attempt, sessionId });
}

/**
 * 消费 OpenCode /event SSE 流，解析事件并：
 * 1. 写入 session-stream.md（原始事件）。
 * 2. 写入 session-stream-reasoning.md / session-stream-content.md。
 * 3. 通过 EventEmitter 派发标准化 ChatSSEEvent。
 *
 * 同一 scope 同时只会存在一个活跃 consumer；重复调用将直接返回。
 */
export async function ensureEventStream(
  baseUrl: string,
  workspacePath: string,
  outputDir: string,
  runId: string,
  stageId: string,
  attempt: number,
  sessionId: string,
): Promise<void> {
  const key = scopeKey(runId, stageId, attempt, sessionId);
  if (activeConsumers.has(key)) {
    return;
  }
  activeConsumers.add(key);

  const controller = new AbortController();
  streamControllers.set(key, controller);
  const emitter = getSSEEmitter(runId, stageId, attempt, sessionId);

  try {
    const client = createOpencodeSessionClient({ baseUrl });
    const stream = await client.streamEvents(workspacePath, sessionId, controller.signal);
    await processEventStream(stream, outputDir, sessionId, emitter, controller.signal, {
      onEvent: (event) => emit(emitter, runId, stageId, attempt, sessionId, event),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emit(emitter, runId, stageId, attempt, sessionId, { type: "error", message });
  } finally {
    activeConsumers.delete(key);
    streamControllers.delete(key);
  }
}

interface ProcessOptions {
  onEvent: (event: ChatSSEEvent) => void;
}

interface NormalizerState {
  currentMessageId?: string;
  partTypes: Map<string, "text" | "reasoning" | "tool" | "error">;
  pendingDeltas: Map<string, string[]>;
  fallbackIdCounter: number;
}

function firstString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === "string") {
    return value[0];
  }
  return undefined;
}

function getMessageId(props: Record<string, unknown>): string | undefined {
  return (
    firstString(props.messageID) ??
    firstString(props.messageId) ??
    firstString(props.message_id) ??
    firstString(props.id)
  );
}

function getPartId(props: Record<string, unknown>): string | undefined {
  return (
    firstString(props.partID) ??
    firstString(props.partId) ??
    firstString(props.part_id) ??
    firstString(props.id)
  );
}

function getPermissionId(props: Record<string, unknown>): string | undefined {
  return (
    firstString(props.permissionID) ??
    firstString(props.permissionId) ??
    firstString(props.permission_id) ??
    firstString(props.id)
  );
}

function getQuestionId(props: Record<string, unknown>): string | undefined {
  return (
    firstString(props.questionID) ??
    firstString(props.questionId) ??
    firstString(props.question_id) ??
    firstString(props.id)
  );
}

function mapPartType(raw: unknown): "text" | "reasoning" | "tool" | "error" {
  const t = typeof raw === "string" ? raw.toLowerCase() : "";
  if (t === "text") return "text";
  if (t === "reasoning") return "reasoning";
  if (t === "tool" || t === "tool_call" || t === "toolcall") return "tool";
  if (t === "error") return "error";
  // 未知类型默认按 text 处理，避免把正常 part 渲染为 error
  return "text";
}

function extractPermissionOptions(
  props: Record<string, unknown>,
): Array<{ id: string; label: string }> {
  const raw = props.options ?? props.choices;
  if (Array.isArray(raw)) {
    return raw
      .map((o) => {
        if (typeof o === "string") return { id: o, label: o };
        if (o && typeof o === "object") {
          const obj = o as Record<string, unknown>;
          const id = firstString(obj.id) ?? firstString(obj.value) ?? "";
          const label = firstString(obj.label) ?? firstString(obj.title) ?? id;
          return { id, label };
        }
        return { id: String(o), label: String(o) };
      })
      .filter((o) => o.id.length > 0);
  }
  return [
    { id: "allow", label: "允许" },
    { id: "deny", label: "拒绝" },
  ];
}

function extractQuestionOptions(
  props: Record<string, unknown>,
): Array<{ id: string; label: string }> | undefined {
  const raw = props.options ?? props.choices;
  if (!Array.isArray(raw)) return undefined;
  return raw
    .map((o) => {
      if (typeof o === "string") return { id: o, label: o };
      if (o && typeof o === "object") {
        const obj = o as Record<string, unknown>;
        const id = firstString(obj.id) ?? firstString(obj.value) ?? "";
        const label = firstString(obj.label) ?? firstString(obj.title) ?? id;
        return { id, label };
      }
      return { id: String(o), label: String(o) };
    })
    .filter((o) => o.id.length > 0);
}

/**
 * 将单个 OpenCode 原始事件归一化为 ChatSSEEvent。
 * 状态对象用于追踪当前 message / part 类型。
 */
export function normalizeOpenCodeEvent(
  eventType: string,
  props: Record<string, unknown>,
  state: NormalizerState,
): ChatSSEEvent | ChatSSEEvent[] | null {
  switch (eventType) {
    case "message.created": {
      const messageId = getMessageId(props);
      if (!messageId) return null;
      state.currentMessageId = messageId;
      const roleRaw = firstString(props.role) ?? "assistant";
      const role = roleRaw === "user" || roleRaw === "system" ? roleRaw : "assistant";
      return { type: "message_start", message_id: messageId, role };
    }

    case "message.part.created": {
      const messageId = state.currentMessageId ?? getMessageId(props);
      if (!messageId) return null;
      const part = props.part as Record<string, unknown> | undefined;
      const partId = getPartId(part ?? {}) ?? getPartId(props);
      const partType = mapPartType(part?.type ?? props.partType);
      if (!partId) return null;
      state.partTypes.set(partId, partType);
      state.currentMessageId = messageId;
      return { type: "part_start", message_id: messageId, part_id: partId, part_type: partType };
    }

    case "message.part.updated": {
      const messageId = state.currentMessageId ?? getMessageId(props);
      if (!messageId) return null;
      const part = props.part as Record<string, unknown> | undefined;
      const partId = getPartId(part ?? {}) ?? getPartId(props);
      const partType = mapPartType(part?.type ?? props.partType);
      const text = firstString(part?.text) ?? firstString(props.text);
      if (!partId) return null;
      state.partTypes.set(partId, partType);
      state.currentMessageId = messageId;
      if (!text) return null;
      if (partType === "text" || partType === "reasoning") {
        return { type: `${partType}_delta`, message_id: messageId, part_id: partId, content: text };
      }
      if (partType === "tool") {
        return { type: "tool_delta", message_id: messageId, part_id: partId, content: text };
      }
      return null;
    }

    case "message.part.delta": {
      const messageId = state.currentMessageId ?? getMessageId(props);
      if (!messageId) return null;
      const partId = getPartId(props);
      const delta = firstString(props.delta);
      if (!partId || delta === undefined) return null;
      const type = state.partTypes.get(partId);
      if (type === "text" || type === "reasoning") {
        return { type: `${type}_delta`, message_id: messageId, part_id: partId, content: delta };
      }
      if (type === "tool") {
        return { type: "tool_delta", message_id: messageId, part_id: partId, content: delta };
      }
      // 尚未收到 part_start，先缓冲
      const list = state.pendingDeltas.get(partId) ?? [];
      list.push(delta);
      state.pendingDeltas.set(partId, list);
      return null;
    }

    case "message.part.completed":
    case "message.part.stopped": {
      const messageId = state.currentMessageId ?? getMessageId(props);
      if (!messageId) return null;
      const partId = getPartId(props);
      if (!partId) return null;
      const partType = state.partTypes.get(partId);
      if (partType === "tool") {
        const output = props.output ?? props.result;
        const statusRaw = firstString(props.status) ?? "success";
        const status = statusRaw === "error" || statusRaw === "failure" ? "error" : "success";
        return { type: "tool_end", message_id: messageId, part_id: partId, output, status };
      }
      return null;
    }

    case "tool.start": {
      const messageId = state.currentMessageId ?? getMessageId(props);
      if (!messageId) return null;
      const partId = getPartId(props) ?? `tool-${++state.fallbackIdCounter}`;
      const toolName = firstString(props.toolName) ?? firstString(props.name) ?? "tool";
      const input = props.input ?? props.arguments;
      state.partTypes.set(partId, "tool");
      return { type: "tool_start", message_id: messageId, part_id: partId, tool_name: toolName, input };
    }

    case "tool.delta": {
      const messageId = state.currentMessageId ?? getMessageId(props);
      if (!messageId) return null;
      const partId = getPartId(props);
      const delta = firstString(props.delta) ?? "";
      if (!partId) return null;
      return { type: "tool_delta", message_id: messageId, part_id: partId, content: delta };
    }

    case "tool.end":
    case "tool.stop": {
      const messageId = state.currentMessageId ?? getMessageId(props);
      if (!messageId) return null;
      const partId = getPartId(props);
      if (!partId) return null;
      const output = props.output ?? props.result;
      const statusRaw = firstString(props.status) ?? "success";
      const status = statusRaw === "error" || statusRaw === "failure" ? "error" : "success";
      return { type: "tool_end", message_id: messageId, part_id: partId, output, status };
    }

    case "permission.updated": {
      const messageId = state.currentMessageId ?? getMessageId(props);
      if (!messageId) return null;
      const requestId = getPermissionId(props) ?? `perm-${++state.fallbackIdCounter}`;
      const title = firstString(props.title) ?? firstString(props.message) ?? "权限请求";
      const detail = firstString(props.detail) ?? firstString(props.description);
      const options = extractPermissionOptions(props);
      return { type: "permission_request", message_id: messageId, request_id: requestId, title, detail, options };
    }

    case "question.asked": {
      const messageId = state.currentMessageId ?? getMessageId(props);
      if (!messageId) return null;
      const questionId = getQuestionId(props) ?? `q-${++state.fallbackIdCounter}`;
      const content = firstString(props.content) ?? firstString(props.text) ?? firstString(props.message) ?? "";
      const kindRaw = firstString(props.kind) ?? firstString(props.type);
      const kind =
        kindRaw === "choice" || kindRaw === "multiple" || kindRaw === "text" || kindRaw === "confirm"
          ? kindRaw
          : undefined;
      const options = extractQuestionOptions(props);
      return { type: "question", message_id: messageId, question_id: questionId, content, kind, options };
    }

    case "session.idle": {
      const events: ChatSSEEvent[] = [];
      if (state.currentMessageId) {
        events.push({ type: "message_end", message_id: state.currentMessageId });
      }
      events.push({ type: "run_status", status: "completed" });
      return events;
    }

    case "error": {
      const message =
        firstString(props.message) ??
        firstString(props.error) ??
        JSON.stringify(props);
      return { type: "error", message };
    }

    default:
      return null;
  }
}

async function processEventStream(
  stream: ReadableStream<Uint8Array>,
  outputDir: string,
  sessionId: string,
  emitter: EventEmitter,
  signal: AbortSignal,
  opts: ProcessOptions,
): Promise<void> {
  let rawFile: fs.FileHandle | undefined;
  await fs.mkdir(outputDir, { recursive: true });

  const rawPath = path.join(outputDir, "session-stream.md");
  const reasoningPath = path.join(outputDir, "session-stream-reasoning.md");
  const contentPath = path.join(outputDir, "session-stream-content.md");

  rawFile = await fs.open(rawPath, "w");
  await rawFile.writeFile(`# Event Stream for session ${sessionId}\n\n`);

  const state: NormalizerState = {
    partTypes: new Map(),
    pendingDeltas: new Map(),
    fallbackIdCounter: 0,
  };

  async function appendToStream(type: "text" | "reasoning", text: string) {
    const target = type === "reasoning" ? reasoningPath : contentPath;
    await fs.appendFile(target, text);
  }

  async function flushPending(partId: string, type: "text" | "reasoning") {
    const deltas = state.pendingDeltas.get(partId);
    if (!deltas) return;
    for (const d of deltas) await appendToStream(type, d);
    state.pendingDeltas.delete(partId);
  }

  async function flushAllPending() {
    for (const [partId, deltas] of state.pendingDeltas) {
      const type = state.partTypes.get(partId);
      const targetType = type === "reasoning" ? "reasoning" : "text";
      for (const d of deltas) await appendToStream(targetType, d);
      // 尽可能发出这些被缓冲的 delta，让前端不丢内容
      if (state.currentMessageId) {
        opts.onEvent({
          type: targetType === "reasoning" ? "reasoning_delta" : "text_delta",
          message_id: state.currentMessageId,
          part_id: partId,
          content: deltas.join(""),
        });
      }
    }
    state.pendingDeltas.clear();
  }

  function emitTerminal(status: "completed" | "aborted") {
    const events: ChatSSEEvent[] = [];
    if (state.currentMessageId) {
      events.push({ type: "message_end", message_id: state.currentMessageId });
    }
    events.push({ type: "run_status", status });
    for (const ev of events) opts.onEvent(ev);
  }

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let idle = false;
  let endedNormally = false;
  let lastDeltaTime = Date.now();

  try {
    while (!idle && !signal.aborted) {
      const { done, value } = await reader.read();
      if (done) {
        endedNormally = true;
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const json = line.slice("data: ".length);
        let event: unknown;
        try {
          event = JSON.parse(json);
        } catch {
          continue;
        }

        const e = event as { type?: string; properties?: Record<string, unknown> };
        const props = e.properties ?? {};
        const eventSessionId =
          props.sessionID ?? props.sessionId ?? props.session_id;
        if (eventSessionId && eventSessionId !== sessionId) continue;

        await rawFile.appendFile(
          `## ${e.type ?? "unknown"}\n\`\`\`json\n${JSON.stringify(props, null, 2)}\n\`\`\`\n\n`,
        );

        const isSessionIdle = e.type === "session.idle";
        if (isSessionIdle) {
          try {
            await flushAllPending();
          } catch (flushErr) {
            console.error("[sse] flushAllPending on session.idle failed:", flushErr);
          }
          idle = true;
        }

        const pendingBefore = state.pendingDeltas.size;
        const normalized = normalizeOpenCodeEvent(e.type ?? "unknown", props, state);
        if (state.pendingDeltas.size > pendingBefore) lastDeltaTime = Date.now();
        if (!normalized) continue;

        const events = Array.isArray(normalized) ? normalized : [normalized];
        for (const ne of events) {
          // 审计日志：text / reasoning 追加到可读文件
          if (ne.type === "text_delta" || ne.type === "reasoning_delta") {
            const t = ne.type === "text_delta" ? "text" : "reasoning";
            await appendToStream(t, ne.content);
            await flushPending(ne.part_id, t);
          }
          opts.onEvent(ne);
        }

        // Delta 缓冲超时保护：若 5 秒内未收到 part_start，强制 flush 所有缓冲
        if (state.pendingDeltas.size > 0 && Date.now() - lastDeltaTime > 5000) {
          await flushAllPending();
        }
      }
    }

    // 处理 buffer 中残留的最后一行（流结束时可能没有尾随 \n）
    if (buffer.trim()) {
      const line = buffer.trim();
      if (line.startsWith("data: ")) {
        try {
          const json = line.slice("data: ".length);
          const event = JSON.parse(json) as { type?: string; properties?: Record<string, unknown> };
          const props = event.properties ?? {};
          const normalized = normalizeOpenCodeEvent(event.type ?? "unknown", props, state);
          if (normalized) {
            const events = Array.isArray(normalized) ? normalized : [normalized];
            for (const ne of events) opts.onEvent(ne);
          }
        } catch { /* ignore parse errors on final chunk */ }
      }
    }

    // 流正常结束但没有收到 session.idle：补发终端事件并 flush 残留 delta
    try {
      await flushAllPending();
    } catch (flushErr) {
      console.error("[sse] flushAllPending failed:", flushErr);
    }
    // 无论 flush 是否成功，都必须发终端事件（避免前端永久 streaming）
    if (endedNormally && !idle) {
      emitTerminal("completed");
    } else if (signal.aborted) {
      emitTerminal("aborted");
    }
  } finally {
    await reader.cancel().catch(() => null);
    await rawFile?.close();
  }
}
