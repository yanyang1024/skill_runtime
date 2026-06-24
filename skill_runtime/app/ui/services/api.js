export async function apiGet(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

export async function apiPost(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}

export async function apiText(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.text();
}

export async function createRun(skillId, previewId) {
  return apiPost("/api/runs", { skillId, previewId });
}

export async function listRuns() {
  return apiGet("/api/runs");
}

export async function listSkills() {
  return apiGet("/api/skills");
}

export async function startStage(runId, stageId, opts = {}) {
  return apiPost(`/api/runs/${runId}/stage/${stageId}/start`, opts);
}

export async function stopStage(runId, stageId, attempt = 1) {
  return apiPost(`/api/runs/${runId}/stage/${stageId}/stop`, { attempt });
}

export async function commitStage(runId, stageId, attempt = 1) {
  return apiPost(`/api/runs/${runId}/stage/${stageId}/commit`, { attempt });
}

export async function retryStage(runId, stageId) {
  return apiPost(`/api/runs/${runId}/stage/${stageId}/retry`, {});
}

export async function getStageState(runId, stageId, attempt = 1) {
  return apiGet(`/api/runs/${runId}/stage/${stageId}/state?attempt=${attempt}`);
}

export async function openStage(runId, stageId, attempt = 1) {
  return apiGet(`/api/runs/${runId}/stage/${stageId}/open?attempt=${attempt}`);
}

export async function recommendPrompt(runId, stageId, attempt, serverId, opts = {}) {
  return apiPost(`/api/runs/${runId}/stage/${stageId}/recommend-prompt`, {
    attempt,
    server_id: serverId,
    ...opts,
  });
}

export async function sendPrompt(runId, stageId, parts, sessionId, attempt = 1) {
  return apiPost(`/api/runs/${runId}/stage/${stageId}/message`, {
    attempt,
    parts,
    session_id: sessionId,
  });
}

export async function saveDirectorReview(runId, stageId, content, attempt = 1) {
  return apiPost(`/api/runs/${runId}/stage/${stageId}/director-review`, {
    attempt,
    content,
  });
}

export async function listArtifacts(runId, stageId, attempt = 1) {
  return apiGet(`/api/runs/${runId}/stage/${stageId}/artifacts?attempt=${attempt}`);
}

export async function getArtifact(runId, stageId, name, attempt = 1) {
  return apiText(`/api/runs/${runId}/stage/${stageId}/artifact/${name}?attempt=${attempt}`);
}
