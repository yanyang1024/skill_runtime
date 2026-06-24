async function apiPost(path, body) {
    const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
    });
    if (!res.ok)
        throw new Error(`${res.status}: ${await res.text()}`);
    return res.json();
}
async function apiGet(path) {
    const res = await fetch(path);
    if (!res.ok)
        throw new Error(`${res.status}: ${await res.text()}`);
    return res.json();
}
function chatBase(runId, stageId, attempt) {
    return `/api/runs/${runId}/stage/${stageId}/chat`;
}
export async function createSession(runId, stageId, attempt, title = "stage session") {
    return apiPost(`${chatBase(runId, stageId, attempt)}/session`, { title });
}
export async function getSession(runId, stageId, attempt, sessionId) {
    return apiGet(`${chatBase(runId, stageId, attempt)}/session/${sessionId}`);
}
export async function deleteSession(runId, stageId, attempt, sessionId) {
    return fetch(`${chatBase(runId, stageId, attempt)}/session/${sessionId}`, { method: "DELETE" });
}
export async function abortSession(runId, stageId, attempt, sessionId) {
    return fetch(`${chatBase(runId, stageId, attempt)}/session/${sessionId}/abort`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
    });
}
export async function sendMessage(runId, stageId, attempt, sessionId, parts, agent, model) {
    return apiPost(`${chatBase(runId, stageId, attempt)}/session/${sessionId}/message`, {
        parts,
        agent,
        model,
    });
}
export async function getMessages(runId, stageId, attempt, sessionId, limit) {
    const qs = limit !== undefined ? `?limit=${limit}` : "";
    return apiGet(`${chatBase(runId, stageId, attempt)}/session/${sessionId}/message${qs}`);
}
export async function replyQuestion(runId, stageId, attempt, sessionId, questionId, answer) {
    return fetch(`${chatBase(runId, stageId, attempt)}/session/${sessionId}/question/${questionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(answer),
    });
}
export async function replyPermission(runId, stageId, attempt, sessionId, permissionId, allowed) {
    return fetch(`${chatBase(runId, stageId, attempt)}/session/${sessionId}/permission/${permissionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowed }),
    });
}
export function createEventSource(runId, stageId, attempt, sessionId) {
    return new EventSource(`${chatBase(runId, stageId, attempt)}/events?session_id=${encodeURIComponent(sessionId)}`);
}
export function parseSSEEvent(data) {
    try {
        return JSON.parse(data);
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=chatApi.js.map