import { useState, useCallback, useRef, useEffect } from "react";
import type { ChatMessage, PendingPermission, PendingQuestion } from "../types/chat";
import * as chatApi from "../services/chatApi";
import { useSSE } from "./useSSE";
import { getRuntimeStatus } from "../services/api";

export interface TokenStats {
  input: number;
  output: number;
  limit: number;
}

export interface UseChatSessionResult {
  messages: ChatMessage[];
  streaming: boolean;
  error?: string;
  pendingPermissions: PendingPermission[];
  pendingQuestions: PendingQuestion[];
  sessionId: string | null;
  tokenStats: TokenStats;
  createSession: () => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  abort: () => Promise<void>;
  replyQuestion: (questionId: string, answer: unknown) => Promise<void>;
  replyPermission: (requestId: string, allowed: boolean) => Promise<void>;
  clearError: () => void;
}

export function useChatSession(
  runId: string | null,
  stageId: string | null,
  attempt: number,
): UseChatSessionResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [pendingPermissions, setPendingPermissions] = useState<PendingPermission[]>([]);
  const [pendingQuestions, setPendingQuestions] = useState<PendingQuestion[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [tokenStats, setTokenStats] = useState<TokenStats>({ input: 0, output: 0, limit: 131072 });
  const abortingRef = useRef(false);
  const tokenTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sseActions = {
    setMessages,
    setPendingPermissions,
    setPendingQuestions,
    setStreaming,
    setError,
  };

  const { close: closeSSE } = useSSE(runId, stageId, attempt, sessionId, sseActions);

  // Token 预算轮询：每 30s 检查 session token 使用量
  useEffect(() => {
    if (!runId || !stageId || !sessionId) {
      setTokenStats({ input: 0, output: 0, limit: 131072 });
      return;
    }
    const poll = () => {
      chatApi.getSession(runId, stageId, attempt, sessionId).then((data: unknown) => {
        const s = data as Record<string, unknown>;
        const tokens = s?.tokens as Record<string, number> | undefined;
        if (tokens) {
          setTokenStats({
            input: tokens.input ?? 0,
            output: tokens.output ?? 0,
            limit: (s?.context_limit as number) ?? 131072,
          });
        }
      }).catch(() => {});
    };
    poll();
    tokenTimerRef.current = setInterval(poll, 30000);
    return () => {
      if (tokenTimerRef.current) { clearInterval(tokenTimerRef.current); tokenTimerRef.current = null; }
    };
  }, [runId, stageId, attempt, sessionId]);

  const createSession = useCallback(async () => {
    if (!runId || !stageId) return;
    try {
      const session = await chatApi.createSession(runId, stageId, attempt, `${stageId} session`);
      setSessionId(session.id);
      setMessages([]);
      setPendingPermissions([]);
      setPendingQuestions([]);
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [runId, stageId, attempt]);

  const sendMessage = useCallback(
    async (text: string, attachment?: { name: string; path: string }) => {
      if (!runId || !stageId || (!text.trim() && !attachment)) return;
      try {
        let sid = sessionId;
        if (!sid) {
          // 门控：检查 runtime 是否就绪
          const runtimeStatus = await getRuntimeStatus(runId, stageId, attempt);
          if (!runtimeStatus.registered || runtimeStatus.status !== "running" || !runtimeStatus.healthy) {
            setError(
              runtimeStatus.error
                ? `Stage runtime 未就绪: ${runtimeStatus.error}`
                : `Stage runtime 未就绪 (status: ${runtimeStatus.status})`,
            );
            return;
          }

          const session = await chatApi.createSession(runId, stageId, attempt, `${stageId} session`);
          sid = session.id;
          setSessionId(sid);
        }

        // 构建消息内容（包含附件信息）
        let messageText = text.trim();
        if (attachment) {
          const fileInfo = `\n[附件: ${attachment.name} 已上传到 ${attachment.path}]`;
          messageText = messageText ? messageText + fileInfo : `请处理上传的文件 ${attachment.name}`;
        }

        // 首次消息自动注入上下文概览（减少模型探索开销）
        const isFirstMessage = messages.length === 0;
        if (isFirstMessage && sid) {
          try {
            const ctxResp = await fetch(`/api/runs/${runId}/stage/${stageId}/context?attempt=${attempt}`);
            if (ctxResp.ok) {
              const ctx = await ctxResp.json() as { skill_source: string; inputs: Record<string, string[]>; output_templates: string[] };
              const lines: string[] = [
                `[系统上下文 — 请直接使用 read_file 工具读取需要的文件]`,
                `- Skill: ${ctx.skill_source}`,
              ];
              const prev = ctx.inputs?.previous_stage_output;
              if (prev && prev.length > 0) lines.push(`- 上一阶段输出: ${prev.join(", ")}`);
              const sl = ctx.inputs?.session_log;
              if (sl && sl.length > 0) lines.push(`- 会话日志: ${sl.join(", ")}`);
              const ad = ctx.inputs?.api_docs;
              if (ad && ad.length > 0) lines.push(`- API 文档: ${ad.join(", ")}`);
              const tmpl = ctx.output_templates;
              if (tmpl && tmpl.length > 0) lines.push(`- Output 模板: ${tmpl.join(", ")}`);
              lines.push("");
              messageText = lines.join("\n") + messageText;
            }
          } catch { /* best-effort */ }
        }

        // 先加入用户消息（乐观更新）
        const userMessage: ChatMessage = {
          id: `user-${Date.now()}`,
          role: "user",
          parts: [{ type: "text", id: `user-part-${Date.now()}`, content: messageText }],
          createdAt: Date.now(),
        };
        setMessages((prev) => [...prev, userMessage]);

        try {
          // 构建发送的 parts
          const parts: unknown[] = [{ type: "text", text: messageText }];
          await chatApi.sendMessage(runId, stageId, attempt, sid!, parts);
          setStreaming(true);
        } catch (sendErr) {
          // 回滚乐观更新的用户消息
          setMessages((prev) => prev.filter((m) => m.id !== userMessage.id));
          throw sendErr;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setStreaming(false);
      }
    },
    [runId, stageId, attempt, sessionId, messages.length],
  );

  const abort = useCallback(async () => {
    if (!runId || !stageId || !sessionId) return;
    abortingRef.current = true;
    closeSSE();
    setStreaming(false);

    try {
      await chatApi.abortSession(runId, stageId, attempt, sessionId);

      // 拒绝所有 pending questions
      for (const q of pendingQuestions) {
        try {
          await chatApi.replyQuestion(runId, stageId, attempt, sessionId, q.questionId, { rejected: true });
        } catch {
          // ignore
        }
      }

      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      // abort 失败不阻塞清理
    } finally {
      // 无论 abort 是否成功，都尝试 delete session
      try {
        await chatApi.deleteSession(runId, stageId, attempt, sessionId);
      } catch {
        // ignore — session 可能已经不存在
      }
      abortingRef.current = false;
      setPendingPermissions([]);
      setPendingQuestions([]);
      setSessionId(null);  // 清除 sessionId 以停止 token 轮询
    }
  }, [runId, stageId, attempt, sessionId, closeSSE, pendingQuestions]);

  const replyQuestion = useCallback(
    async (questionId: string, answer: unknown) => {
      if (!runId || !stageId || !sessionId) return;
      try {
        await chatApi.replyQuestion(runId, stageId, attempt, sessionId, questionId, answer);
        setPendingQuestions((prev) => prev.filter((q) => q.questionId !== questionId));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [runId, stageId, attempt, sessionId],
  );

  const replyPermission = useCallback(
    async (requestId: string, allowed: boolean) => {
      if (!runId || !stageId || !sessionId) return;
      try {
        await chatApi.replyPermission(runId, stageId, attempt, sessionId, requestId, allowed);
        setPendingPermissions((prev) => prev.filter((p) => p.requestId !== requestId));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [runId, stageId, attempt, sessionId],
  );

  const clearError = useCallback(() => setError(undefined), []);

  return {
    messages,
    streaming,
    error,
    pendingPermissions,
    pendingQuestions,
    sessionId,
    tokenStats,
    createSession,
    sendMessage,
    abort,
    replyQuestion,
    replyPermission,
    clearError,
  };
}
