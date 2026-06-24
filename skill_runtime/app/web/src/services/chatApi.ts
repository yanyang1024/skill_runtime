import type { ChatSSEEvent } from "../types/chat";
import { parseChatSSEEvent } from "../../../shared/utils/sse.js";

async function apiPost(path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

async function apiGet(path: string): Promise<unknown> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

function chatBase(runId: string, stageId: string, attempt: number): string {
  return `/api/runs/${runId}/stage/${stageId}/chat`;
}

export async function createSession(
  runId: string,
  stageId: string,
  attempt: number,
  title = "stage session",
): Promise<{ id: string }> {
  return apiPost(`${chatBase(runId, stageId, attempt)}/session`, { title }) as Promise<{ id: string }>;
}

export async function getSession(runId: string, stageId: string, attempt: number, sessionId: string): Promise<unknown> {
  return apiGet(`${chatBase(runId, stageId, attempt)}/session/${sessionId}`);
}

export async function deleteSession(
  runId: string,
  stageId: string,
  attempt: number,
  sessionId: string,
): Promise<Response> {
  return fetch(`${chatBase(runId, stageId, attempt)}/session/${sessionId}`, { method: "DELETE" });
}

export async function abortSession(
  runId: string,
  stageId: string,
  attempt: number,
  sessionId: string,
): Promise<Response> {
  return fetch(`${chatBase(runId, stageId, attempt)}/session/${sessionId}/abort`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
}

export async function sendMessage(
  runId: string,
  stageId: string,
  attempt: number,
  sessionId: string,
  parts: unknown[],
  agent?: string,
  model?: string,
): Promise<{ session_id: string }> {
  return apiPost(`${chatBase(runId, stageId, attempt)}/session/${sessionId}/message`, {
    parts,
    agent,
    model,
  }) as Promise<{ session_id: string }>;
}

export async function getMessages(
  runId: string,
  stageId: string,
  attempt: number,
  sessionId: string,
  limit?: number,
): Promise<unknown[]> {
  const qs = limit !== undefined ? `?limit=${limit}` : "";
  return apiGet(`${chatBase(runId, stageId, attempt)}/session/${sessionId}/message${qs}`) as Promise<unknown[]>;
}

export async function replyQuestion(
  runId: string,
  stageId: string,
  attempt: number,
  sessionId: string,
  questionId: string,
  answer: unknown,
): Promise<Response> {
  return fetch(`${chatBase(runId, stageId, attempt)}/session/${sessionId}/question/${questionId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(answer),
  });
}

export async function replyPermission(
  runId: string,
  stageId: string,
  attempt: number,
  sessionId: string,
  permissionId: string,
  allowed: boolean,
): Promise<Response> {
  return fetch(`${chatBase(runId, stageId, attempt)}/session/${sessionId}/permission/${permissionId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ allowed }),
  });
}

export function createEventSource(
  runId: string,
  stageId: string,
  attempt: number,
  sessionId: string,
): EventSource {
  return new EventSource(
    `${chatBase(runId, stageId, attempt)}/events?session_id=${encodeURIComponent(sessionId)}`,
  );
}

export { parseChatSSEEvent as parseSSEEvent };
