import { useEffect, useRef, useCallback } from "react";
import type { ChatSSEEvent, ChatMessage, MessagePart, PendingPermission, PendingQuestion } from "../types/chat";
import * as chatApi from "../services/chatApi";

interface SSEActions {
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setPendingPermissions: React.Dispatch<React.SetStateAction<PendingPermission[]>>;
  setPendingQuestions: React.Dispatch<React.SetStateAction<PendingQuestion[]>>;
  setStreaming: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string | undefined>>;
}

export function useSSE(
  runId: string | null,
  stageId: string | null,
  attempt: number,
  sessionId: string | null,
  actions: SSEActions,
) {
  const { setMessages, setPendingPermissions, setPendingQuestions, setStreaming, setError } = actions;
  const eventSourceRef = useRef<EventSource | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingDeltasRef = useRef<ChatSSEEvent[]>([]);
  const partTypesRef = useRef<Map<string, "text" | "reasoning" | "tool" | "error">>(new Map());
  const mountedRef = useRef(true);
  const retryCountRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushPendingDeltas = useCallback(() => {
    if (pendingDeltasRef.current.length === 0) return;
    const deltas = pendingDeltasRef.current.splice(0, pendingDeltasRef.current.length);

    setMessages((prev) => {
      const next = [...prev];
      for (const event of deltas) {
        applyEvent(next, event, partTypesRef.current, setPendingPermissions, setPendingQuestions);
      }
      return next;
    });
  }, [setMessages, setPendingPermissions, setPendingQuestions]);

  const scheduleFlush = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      flushPendingDeltas();
    });
  }, [flushPendingDeltas]);

  useEffect(() => {
    if (!runId || !stageId || !sessionId) return;

    mountedRef.current = true;
    retryCountRef.current = 0;
    setError(undefined);
    partTypesRef.current.clear();
    pendingDeltasRef.current = [];

    function connect() {
      if (!mountedRef.current) return;

      let es: EventSource;
      try {
        es = chatApi.createEventSource(runId!, stageId!, attempt, sessionId!);
      } catch (err) {
        setError(`无法创建 SSE 连接: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
      eventSourceRef.current = es;

      es.onmessage = (e) => {
        if (!mountedRef.current) return;
        const event = chatApi.parseSSEEvent(e.data);
        if (!event) return;

        if (event.type === "text_delta" || event.type === "reasoning_delta" || event.type === "tool_delta") {
          pendingDeltasRef.current.push(event);
          scheduleFlush();
        } else {
          flushPendingDeltas();
          setMessages((prev) => {
            const next = [...prev];
            applyEvent(next, event, partTypesRef.current, setPendingPermissions, setPendingQuestions);
            return next;
          });

          if (
            event.type === "message_end" ||
            event.type === "error" ||
            (event.type === "run_status" &&
              (event.status === "completed" || event.status === "failed" || event.status === "aborted"))
          ) {
            setStreaming(false);
          }
        }
      };

      es.onerror = () => {
        if (!mountedRef.current) return;
        es.close();
        eventSourceRef.current = null;
        setStreaming(false);

        retryCountRef.current++;
        if (retryCountRef.current <= 5) {
          const delay = Math.min(1000 * Math.pow(2, retryCountRef.current - 1), 10000);
          timerRef.current = setTimeout(() => {
            if (mountedRef.current) connect();
          }, delay);
        } else {
          setError(`SSE 连接失败（已重试 5 次），请刷新页面`);
        }
      };
    }

    connect();

    return () => {
      mountedRef.current = false;
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      flushPendingDeltas();
    };
  }, [runId, stageId, attempt, sessionId, setStreaming, setError, setMessages, setPendingPermissions, setPendingQuestions, scheduleFlush, flushPendingDeltas]);

  const close = useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    flushPendingDeltas();
  }, [flushPendingDeltas]);

  return { close };
}

function applyEvent(
  messages: ChatMessage[],
  event: ChatSSEEvent,
  partTypes: Map<string, "text" | "reasoning" | "tool" | "error">,
  setPendingPermissions: React.Dispatch<React.SetStateAction<PendingPermission[]>>,
  setPendingQuestions: React.Dispatch<React.SetStateAction<PendingQuestion[]>>,
): void {
  switch (event.type) {
    case "message_start": {
      messages.push({
        id: event.message_id,
        role: event.role,
        parts: [],
        status: "streaming",
        createdAt: Date.now(),
      });
      break;
    }
    case "part_start": {
      partTypes.set(event.part_id, event.part_type);
      const msg = findMessage(messages, event.message_id);
      if (msg) {
        msg.parts.push(createEmptyPart(event.part_id, event.part_type));
      }
      break;
    }
    case "text_delta":
    case "reasoning_delta":
    case "tool_delta": {
      const msg = findMessage(messages, event.message_id);
      if (!msg) return;
      const part = findPart(msg.parts, event.part_id);
      if (part && (part.type === "text" || part.type === "reasoning" || part.type === "tool")) {
        part.content += event.content;
        part.status = "streaming";
      }
      break;
    }
    case "tool_start": {
      partTypes.set(event.part_id, "tool");
      const msg = findMessage(messages, event.message_id);
      if (msg) {
        const existing = findPart(msg.parts, event.part_id);
        if (existing && existing.type === "tool") {
          existing.toolName = event.tool_name;
          existing.input = event.input;
        } else {
          msg.parts.push({
            type: "tool",
            id: event.part_id,
            toolName: event.tool_name,
            input: event.input,
            content: "",
            status: "streaming",
          });
        }
      }
      break;
    }
    case "tool_end": {
      const msg = findMessage(messages, event.message_id);
      if (!msg) return;
      const part = findPart(msg.parts, event.part_id);
      if (part && part.type === "tool") {
        part.output = event.output;
        part.status = event.status === "success" ? "done" : event.status;
      }
      break;
    }
    case "run_status": {
      if (event.status === "completed" || event.status === "failed" || event.status === "aborted") {
        const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
        if (lastAssistant && lastAssistant.status === "streaming") {
          lastAssistant.status = event.status === "completed" ? "done" : "error";
        }
      }
      break;
    }
    case "permission_request": {
      setPendingPermissions((prev) => [
        ...prev,
        {
          requestId: event.request_id,
          title: event.title,
          detail: event.detail,
          options: event.options,
          messageId: event.message_id,
        },
      ]);
      break;
    }
    case "question": {
      setPendingQuestions((prev) => [
        ...prev,
        {
          questionId: event.question_id,
          content: event.content,
          kind: event.kind,
          options: event.options,
          messageId: event.message_id,
        },
      ]);
      break;
    }
    case "message_end": {
      const msg = findMessage(messages, event.message_id);
      if (msg) msg.status = "done";
      break;
    }
    case "error": {
      messages.push({
        id: `error-${Date.now()}`,
        role: "assistant",
        parts: [{ type: "error", id: `error-part-${Date.now()}`, content: event.message }],
        status: "error",
        createdAt: Date.now(),
      });
      break;
    }
  }
}

function findMessage(messages: ChatMessage[], id: string): ChatMessage | undefined {
  return messages.find((m) => m.id === id);
}

function findPart(parts: MessagePart[], id: string): MessagePart | undefined {
  return parts.find((p) => p.id === id);
}

function createEmptyPart(id: string, partType: "text" | "reasoning" | "tool" | "error"): MessagePart {
  switch (partType) {
    case "text":
      return { type: "text", id, content: "", status: "streaming" };
    case "reasoning":
      return { type: "reasoning", id, content: "", status: "streaming" };
    case "tool":
      return { type: "tool", id, toolName: "", content: "", status: "streaming" };
    case "error":
      return { type: "error", id, content: "" };
  }
}
