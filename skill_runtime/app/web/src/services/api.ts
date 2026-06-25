export async function apiGet(path: string): Promise<unknown> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

export async function apiPost(path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

export async function apiText(path: string): Promise<string> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.text();
}

export async function createRun(skillId: string, previewId?: string): Promise<{ run_id: string }> {
  return apiPost("/api/runs", { skillId, previewId }) as Promise<{ run_id: string }>;
}

export async function listRuns(): Promise<Array<{ run_id: string; skill_id: string; status: string }>> {
  return apiGet("/api/runs") as Promise<Array<{ run_id: string; skill_id: string; status: string }>>;
}

export async function listSkills(): Promise<string[]> {
  return apiGet("/api/skills") as Promise<string[]>;
}

export async function startStage(runId: string, stageId: string, attempt = 1): Promise<{
  server_id: string;
  port: number;
  open_url: string;
  status: string;
}> {
  return apiPost(`/api/runs/${runId}/stage/${stageId}/start`, { attempt }) as Promise<{
    server_id: string;
    port: number;
    open_url: string;
    status: string;
  }>;
}

export async function stopStage(runId: string, stageId: string, attempt = 1): Promise<unknown> {
  return apiPost(`/api/runs/${runId}/stage/${stageId}/stop`, { attempt });
}

export async function commitStage(runId: string, stageId: string, attempt = 1): Promise<unknown> {
  return apiPost(`/api/runs/${runId}/stage/${stageId}/commit`, { attempt });
}

export async function retryStage(runId: string, stageId: string): Promise<{
  server_id: string;
  attempt: number;
  open_url: string;
}> {
  return apiPost(`/api/runs/${runId}/stage/${stageId}/retry`, {}) as Promise<{
    server_id: string;
    attempt: number;
    open_url: string;
  }>;
}

export async function getStageState(runId: string, stageId: string, attempt = 1): Promise<unknown> {
  return apiGet(`/api/runs/${runId}/stage/${stageId}/state?attempt=${attempt}`);
}

export async function recommendPrompt(
  runId: string,
  stageId: string,
  attempt: number,
  serverId: string,
  opts: Record<string, unknown> = {},
): Promise<{ primary: string; alternatives: string[]; rationale: string; risk_hint?: string }> {
  return apiPost(`/api/runs/${runId}/stage/${stageId}/recommend-prompt`, {
    attempt,
    server_id: serverId,
    ...opts,
  }) as Promise<{ primary: string; alternatives: string[]; rationale: string; risk_hint?: string }>;
}

export async function listArtifacts(runId: string, stageId: string, attempt = 1): Promise<Array<{ name: string }>> {
  return apiGet(`/api/runs/${runId}/stage/${stageId}/artifacts?attempt=${attempt}`) as Promise<
    Array<{ name: string }>
  >;
}

export async function getArtifact(runId: string, stageId: string, name: string, attempt = 1): Promise<string> {
  return apiText(`/api/runs/${runId}/stage/${stageId}/artifact/${encodeURIComponent(name)}?attempt=${attempt}`);
}

export async function getRuntimeStatus(
  runId: string,
  stageId: string,
  attempt = 1,
): Promise<{ registered: boolean; status: string; healthy: boolean; error?: string; port?: number }> {
  return apiGet(`/api/runs/${runId}/stage/${stageId}/status?attempt=${attempt}`) as Promise<{
    registered: boolean;
    status: string;
    healthy: boolean;
    error?: string;
    port?: number;
  }>;
}

export async function saveDirectorReview(runId: string, stageId: string, content: string, attempt = 1): Promise<unknown> {
  return apiPost(`/api/runs/${runId}/stage/${stageId}/director-review`, { attempt, content });
}
