import { useState, useCallback, useRef } from "react";
import * as chatApi from "../services/chatApi";
import { useSSE } from "./useSSE";
export function useChatSession(runId, stageId, attempt) {
    const [messages, setMessages] = useState([]);
    const [streaming, setStreaming] = useState(false);
    const [error, setError] = useState();
    const [pendingPermissions, setPendingPermissions] = useState([]);
    const [pendingQuestions, setPendingQuestions] = useState([]);
    const [sessionId, setSessionId] = useState(null);
    const abortingRef = useRef(false);
    const sseActions = {
        setMessages,
        setPendingPermissions,
        setPendingQuestions,
        setStreaming,
        setError,
    };
    const { close: closeSSE } = useSSE(runId, stageId, attempt, sessionId, sseActions);
    const createSession = useCallback(async () => {
        if (!runId || !stageId)
            return;
        try {
            const session = await chatApi.createSession(runId, stageId, attempt, `${stageId} session`);
            setSessionId(session.id);
            setMessages([]);
            setPendingPermissions([]);
            setPendingQuestions([]);
            setError(undefined);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
    }, [runId, stageId, attempt]);
    const sendMessage = useCallback(async (text) => {
        if (!runId || !stageId || !text.trim())
            return;
        try {
            let sid = sessionId;
            if (!sid) {
                const session = await chatApi.createSession(runId, stageId, attempt, `${stageId} session`);
                sid = session.id;
                setSessionId(sid);
            }
            // 先加入用户消息
            const userMessage = {
                id: `user-${Date.now()}`,
                role: "user",
                parts: [{ type: "text", id: `user-part-${Date.now()}`, content: text }],
                createdAt: Date.now(),
            };
            setMessages((prev) => [...prev, userMessage]);
            await chatApi.sendMessage(runId, stageId, attempt, sid, [{ type: "text", text }]);
            setStreaming(true);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setStreaming(false);
        }
    }, [runId, stageId, attempt, sessionId]);
    const abort = useCallback(async () => {
        if (!runId || !stageId || !sessionId)
            return;
        abortingRef.current = true;
        closeSSE();
        setStreaming(false);
        try {
            await chatApi.abortSession(runId, stageId, attempt, sessionId);
            // 拒绝所有 pending questions
            for (const q of pendingQuestions) {
                try {
                    await chatApi.replyQuestion(runId, stageId, attempt, sessionId, q.questionId, { rejected: true });
                }
                catch {
                    // ignore
                }
            }
            await new Promise((r) => setTimeout(r, 500));
            await chatApi.deleteSession(runId, stageId, attempt, sessionId);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
        finally {
            abortingRef.current = false;
            setPendingPermissions([]);
            setPendingQuestions([]);
        }
    }, [runId, stageId, attempt, sessionId, closeSSE, pendingQuestions]);
    const replyQuestion = useCallback(async (questionId, answer) => {
        if (!runId || !stageId || !sessionId)
            return;
        try {
            await chatApi.replyQuestion(runId, stageId, attempt, sessionId, questionId, answer);
            setPendingQuestions((prev) => prev.filter((q) => q.questionId !== questionId));
        }
        catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
    }, [runId, stageId, attempt, sessionId]);
    const replyPermission = useCallback(async (requestId, allowed) => {
        if (!runId || !stageId || !sessionId)
            return;
        try {
            await chatApi.replyPermission(runId, stageId, attempt, sessionId, requestId, allowed);
            setPendingPermissions((prev) => prev.filter((p) => p.requestId !== requestId));
        }
        catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        }
    }, [runId, stageId, attempt, sessionId]);
    const clearError = useCallback(() => setError(undefined), []);
    return {
        messages,
        streaming,
        error,
        pendingPermissions,
        pendingQuestions,
        sessionId,
        createSession,
        sendMessage,
        abort,
        replyQuestion,
        replyPermission,
        clearError,
    };
}
//# sourceMappingURL=useChatSession.js.map