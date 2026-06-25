import fs from "node:fs/promises";
import path from "node:path";
function getAuth(username, password) {
    const u = username ?? process.env.OPENCODE_SERVER_USERNAME ?? "opencode";
    const p = password ?? process.env.OPENCODE_SERVER_PASSWORD ?? "skillgrowth";
    return {
        username: u,
        password: p,
        header: `Basic ${Buffer.from(`${u}:${p}`).toString("base64")}`,
    };
}
function headers(workspacePath, authHeader, extra) {
    return {
        authorization: authHeader,
        "x-opencode-directory": encodeURIComponent(workspacePath),
        ...extra,
    };
}
async function ensureWorkspaceReadable(workspacePath) {
    try {
        await fs.access(path.join(workspacePath, "opencode.json"));
    }
    catch (err) {
        const nodeErr = err;
        if (nodeErr.code === "ENOENT") {
            console.error(`[opencode_client] workspace not ready — opencode.json missing at ${workspacePath}`);
        }
        else {
            console.error(`[opencode_client] workspace access error:`, nodeErr.message);
        }
    }
}
export function createOpencodeSessionClient(opts) {
    const baseUrl = opts.baseUrl.replace(/\/$/, "");
    const auth = getAuth(opts.username, opts.password);
    async function json(workspacePath, method, urlPath, body, extraHeaders) {
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
        return (await resp.json());
    }
    async function raw(workspacePath, method, urlPath, body, extraHeaders) {
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
            return json(workspacePath, "POST", "/session", { title });
        },
        async getSession(workspacePath, sessionId) {
            return json(workspacePath, "GET", `/session/${encodeURIComponent(sessionId)}`);
        },
        async deleteSession(workspacePath, sessionId) {
            return raw(workspacePath, "DELETE", `/session/${encodeURIComponent(sessionId)}`);
        },
        async getMessages(workspacePath, sessionId, limit) {
            const qs = limit !== undefined ? `?limit=${encodeURIComponent(String(limit))}` : "";
            return json(workspacePath, "GET", `/session/${encodeURIComponent(sessionId)}/message${qs}`);
        },
        async sendPromptAsync(workspacePath, sessionId, body) {
            return raw(workspacePath, "POST", `/session/${encodeURIComponent(sessionId)}/prompt_async`, body);
        },
        async abortSession(workspacePath, sessionId) {
            return raw(workspacePath, "POST", `/session/${encodeURIComponent(sessionId)}/abort`, {});
        },
        async replyQuestion(workspacePath, sessionId, questionId, answer) {
            return raw(workspacePath, "POST", `/session/${encodeURIComponent(sessionId)}/question/${encodeURIComponent(questionId)}/reply`, { answers: answer });
        },
        async replyPermission(workspacePath, sessionId, permissionId, allowed) {
            return raw(workspacePath, "POST", `/session/${encodeURIComponent(sessionId)}/permissions/${encodeURIComponent(permissionId)}`, { response: allowed ? "once" : "reject" });
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
//# sourceMappingURL=index.js.map