import fs from "node:fs/promises";
import path from "node:path";

/**
 * 基于原生 fetch 的 OpenCode serve HTTP 客户端。
 *
 * 不使用 @opencode-ai/sdk，因为 SDK 会把 GET/HEAD 的 x-opencode-directory
 * 头改写成 query 参数，而我们希望统一通过 header 传递 workspace 目录。
 */
export interface OpencodeSessionClient {
  createSession(workspacePath: string, title: string): Promise<{ id: string }>;
  getSession(workspacePath: string, sessionId: string): Promise<unknown>;
  deleteSession(workspacePath: string, sessionId: string): Promise<Response>;
  getMessages(
    workspacePath: string,
    sessionId: string,
    limit?: number,
  ): Promise<unknown[]>;
  sendPromptAsync(
    workspacePath: string,
    sessionId: string,
    body: { parts: unknown[]; agent?: string; model?: string },
  ): Promise<Response>;
  abortSession(workspacePath: string, sessionId: string): Promise<Response>;
  replyQuestion(
    workspacePath: string,
    sessionId: string,
    questionId: string,
    answer: unknown,
  ): Promise<Response>;
  replyPermission(
    workspacePath: string,
    sessionId: string,
    permissionId: string,
    allowed: boolean,
  ): Promise<Response>;
  streamEvents(
    workspacePath: string,
    sessionId: string,
    signal: AbortSignal,
  ): Promise<ReadableStream<Uint8Array>>;
}

export interface CreateOpencodeSessionClientOptions {
  baseUrl: string;
  username?: string;
  password?: string;
}

function getAuth(
  username?: string,
  password?: string,
): { username: string; password: string; header: string } {
  const u = username ?? process.env.OPENCODE_SERVER_USERNAME ?? "opencode";
  const p = password ?? process.env.OPENCODE_SERVER_PASSWORD ?? "skillgrowth";
  return {
    username: u,
    password: p,
    header: `Basic ${Buffer.from(`${u}:${p}`).toString("base64")}`,
  };
}

function headers(
  workspacePath: string,
  authHeader: string,
  extra?: Record<string, string>,
): Record<string, string> {
  return {
    authorization: authHeader,
    "x-opencode-directory": encodeURIComponent(workspacePath),
    ...extra,
  };
}

async function ensureWorkspaceReadable(workspacePath: string): Promise<void> {
  try {
    await fs.access(path.join(workspacePath, "opencode.json"));
  } catch {
    // 目录可能尚未创建或 opencode.json 不存在；这里不阻塞，实际错误会在请求时暴露。
  }
}

export function createOpencodeSessionClient(
  opts: CreateOpencodeSessionClientOptions,
): OpencodeSessionClient {
  const baseUrl = opts.baseUrl.replace(/\/$/, "");
  const auth = getAuth(opts.username, opts.password);

  async function json<T>(
    workspacePath: string,
    method: string,
    urlPath: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<T> {
    await ensureWorkspaceReadable(workspacePath);
    const resp = await fetch(`${baseUrl}${urlPath}`, {
      method,
      headers: headers(workspacePath, auth.header, {
        "Content-Type": "application/json",
        ...extraHeaders,
      }),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`OpenCode ${method} ${urlPath} failed: ${resp.status} ${text}`);
    }
    return (await resp.json()) as T;
  }

  async function raw(
    workspacePath: string,
    method: string,
    urlPath: string,
    body?: unknown,
    extraHeaders?: Record<string, string>,
  ): Promise<Response> {
    await ensureWorkspaceReadable(workspacePath);
    return fetch(`${baseUrl}${urlPath}`, {
      method,
      headers: headers(workspacePath, auth.header, {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...extraHeaders,
      }),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  return {
    async createSession(workspacePath, title) {
      return json<{ id: string }>(workspacePath, "POST", "/session", { title });
    },

    async getSession(workspacePath, sessionId) {
      return json<unknown>(workspacePath, "GET", `/session/${encodeURIComponent(sessionId)}`);
    },

    async deleteSession(workspacePath, sessionId) {
      return raw(workspacePath, "DELETE", `/session/${encodeURIComponent(sessionId)}`);
    },

    async getMessages(workspacePath, sessionId, limit) {
      const qs = limit !== undefined ? `?limit=${encodeURIComponent(String(limit))}` : "";
      return json<unknown[]>(workspacePath, "GET", `/session/${encodeURIComponent(sessionId)}/message${qs}`);
    },

    async sendPromptAsync(workspacePath, sessionId, body) {
      return raw(
        workspacePath,
        "POST",
        `/session/${encodeURIComponent(sessionId)}/prompt_async`,
        body,
      );
    },

    async abortSession(workspacePath, sessionId) {
      return raw(workspacePath, "POST", `/session/${encodeURIComponent(sessionId)}/abort`, {});
    },

    async replyQuestion(workspacePath, sessionId, questionId, answer) {
      return raw(
        workspacePath,
        "POST",
        `/session/${encodeURIComponent(sessionId)}/question/${encodeURIComponent(questionId)}/reply`,
        { answers: answer },
      );
    },

    async replyPermission(workspacePath, sessionId, permissionId, allowed) {
      return raw(
        workspacePath,
        "POST",
        `/session/${encodeURIComponent(sessionId)}/permissions/${encodeURIComponent(permissionId)}`,
        { response: allowed ? "once" : "reject" },
      );
    },

    async streamEvents(workspacePath, sessionId, signal) {
      await ensureWorkspaceReadable(workspacePath);
      const resp = await fetch(`${baseUrl}/event`, {
        method: "GET",
        headers: headers(workspacePath, auth.header, {
          Accept: "text/event-stream",
        }),
        signal,
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        throw new Error(`OpenCode event stream failed: ${resp.status} ${text}`);
      }
      if (!resp.body) {
        throw new Error("OpenCode event stream has no body");
      }
      return resp.body;
    },
  };
}
