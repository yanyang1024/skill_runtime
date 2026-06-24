import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createOpencodeSessionClient } from "../app/opencode_client/index.js";
import { normalizeOpenCodeEvent } from "../app/opencode_client/sse.js";
import { parseChatSSEEvent } from "../app/shared/utils/sse.js";
describe("opencode client: x-opencode-directory header", () => {
    let server;
    let port;
    let receivedHeaders = [];
    before(async () => {
        server = http.createServer((req, res) => {
            receivedHeaders.push({ ...req.headers });
            const sessionMatch = req.url?.match(/\/session\/([^/]+)/);
            const sessionId = sessionMatch?.[1];
            if (req.url === "/session" && req.method === "POST") {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ id: "sess-123" }));
            }
            else if (sessionId && req.method === "GET" && req.url?.endsWith("/message")) {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify([{ id: "msg-1", role: "assistant" }]));
            }
            else if (sessionId && req.method === "GET") {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ id: sessionId, title: "test" }));
            }
            else if (sessionId && req.method === "POST" && req.url?.endsWith("/prompt_async")) {
                res.writeHead(202);
                res.end(JSON.stringify({ ok: true }));
            }
            else if (sessionId && req.method === "POST" && req.url?.endsWith("/abort")) {
                res.writeHead(200);
                res.end(JSON.stringify({ ok: true }));
            }
            else if (sessionId && req.method === "POST" && req.url?.includes("/question/")) {
                res.writeHead(200);
                res.end(JSON.stringify({ ok: true }));
            }
            else if (sessionId && req.method === "POST" && req.url?.includes("/permissions/")) {
                res.writeHead(200);
                res.end(JSON.stringify({ ok: true }));
            }
            else if (sessionId && req.method === "DELETE") {
                res.writeHead(204);
                res.end();
            }
            else if (req.url === "/event" && req.method === "GET") {
                res.writeHead(200, {
                    "Content-Type": "text/event-stream",
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                });
                res.write('data: {"type":"session.idle","properties":{}}\n\n');
                res.end();
            }
            else {
                res.writeHead(404);
                res.end();
            }
        });
        await new Promise((resolve) => {
            server.listen(0, "127.0.0.1", () => {
                const addr = server.address();
                port = typeof addr === "object" && addr ? addr.port : 0;
                resolve();
            });
        });
    });
    after(() => {
        server.close();
    });
    function lastHeader(name) {
        return receivedHeaders[receivedHeaders.length - 1]?.[name];
    }
    it("sends x-opencode-directory on createSession", async () => {
        receivedHeaders = [];
        const client = createOpencodeSessionClient({ baseUrl: `http://127.0.0.1:${port}` });
        const workspace = "/tmp/sg-test-workspace";
        await client.createSession(workspace, "test");
        assert.equal(lastHeader("x-opencode-directory"), encodeURIComponent(workspace));
    });
    it("sends x-opencode-directory on getSession", async () => {
        receivedHeaders = [];
        const client = createOpencodeSessionClient({ baseUrl: `http://127.0.0.1:${port}` });
        const workspace = "/tmp/sg-test-workspace";
        await client.getSession(workspace, "sess-123");
        assert.equal(lastHeader("x-opencode-directory"), encodeURIComponent(workspace));
    });
    it("sends x-opencode-directory on getMessages", async () => {
        receivedHeaders = [];
        const client = createOpencodeSessionClient({ baseUrl: `http://127.0.0.1:${port}` });
        const workspace = "/tmp/sg-test-workspace";
        await client.getMessages(workspace, "sess-123", 10);
        assert.equal(lastHeader("x-opencode-directory"), encodeURIComponent(workspace));
    });
    it("sends x-opencode-directory on sendPromptAsync", async () => {
        receivedHeaders = [];
        const client = createOpencodeSessionClient({ baseUrl: `http://127.0.0.1:${port}` });
        const workspace = "/tmp/sg-test-workspace";
        await client.sendPromptAsync(workspace, "sess-123", { parts: [{ type: "text", text: "hi" }] });
        assert.equal(lastHeader("x-opencode-directory"), encodeURIComponent(workspace));
    });
    it("sends x-opencode-directory on abortSession", async () => {
        receivedHeaders = [];
        const client = createOpencodeSessionClient({ baseUrl: `http://127.0.0.1:${port}` });
        const workspace = "/tmp/sg-test-workspace";
        await client.abortSession(workspace, "sess-123");
        assert.equal(lastHeader("x-opencode-directory"), encodeURIComponent(workspace));
    });
    it("sends x-opencode-directory on replyQuestion", async () => {
        receivedHeaders = [];
        const client = createOpencodeSessionClient({ baseUrl: `http://127.0.0.1:${port}` });
        const workspace = "/tmp/sg-test-workspace";
        await client.replyQuestion(workspace, "sess-123", "q-1", "yes");
        assert.equal(lastHeader("x-opencode-directory"), encodeURIComponent(workspace));
    });
    it("sends x-opencode-directory on replyPermission", async () => {
        receivedHeaders = [];
        const client = createOpencodeSessionClient({ baseUrl: `http://127.0.0.1:${port}` });
        const workspace = "/tmp/sg-test-workspace";
        await client.replyPermission(workspace, "sess-123", "p-1", true);
        assert.equal(lastHeader("x-opencode-directory"), encodeURIComponent(workspace));
    });
    it("sends x-opencode-directory on deleteSession", async () => {
        receivedHeaders = [];
        const client = createOpencodeSessionClient({ baseUrl: `http://127.0.0.1:${port}` });
        const workspace = "/tmp/sg-test-workspace";
        await client.deleteSession(workspace, "sess-123");
        assert.equal(lastHeader("x-opencode-directory"), encodeURIComponent(workspace));
    });
    it("sends x-opencode-directory on streamEvents", async () => {
        receivedHeaders = [];
        const client = createOpencodeSessionClient({ baseUrl: `http://127.0.0.1:${port}` });
        const workspace = "/tmp/sg-test-workspace";
        const controller = new AbortController();
        const stream = await client.streamEvents(workspace, "sess-123", controller.signal);
        const reader = stream.getReader();
        await reader.read();
        reader.releaseLock();
        assert.equal(lastHeader("x-opencode-directory"), encodeURIComponent(workspace));
    });
});
describe("chatApi: SSE event parsing", () => {
    it("parses text_delta", () => {
        const event = parseChatSSEEvent(JSON.stringify({ type: "text_delta", message_id: "m1", part_id: "p1", content: "hi" }));
        assert.equal(event?.type, "text_delta");
        if (event?.type === "text_delta") {
            assert.equal(event.message_id, "m1");
            assert.equal(event.part_id, "p1");
            assert.equal(event.content, "hi");
        }
    });
    it("returns null for invalid json", () => {
        const event = parseChatSSEEvent("not json");
        assert.equal(event, null);
    });
});
describe("sse normalizer: OpenCode raw → ChatSSEEvent", () => {
    function emptyState() {
        return {
            currentMessageId: undefined,
            partTypes: new Map(),
            pendingDeltas: new Map(),
            fallbackIdCounter: 0,
        };
    }
    it("message.created → message_start", () => {
        const state = emptyState();
        const events = normalizeOpenCodeEvent("message.created", { messageID: "m1", role: "assistant" }, state);
        assert.ok(events);
        const arr = Array.isArray(events) ? events : [events];
        assert.equal(arr.length, 1);
        assert.equal(arr[0]?.type, "message_start");
        if (arr[0]?.type === "message_start") {
            assert.equal(arr[0].message_id, "m1");
            assert.equal(arr[0].role, "assistant");
        }
    });
    it("message.part.created → part_start", () => {
        const state = emptyState();
        state.currentMessageId = "m1";
        const events = normalizeOpenCodeEvent("message.part.created", { part: { id: "p1", type: "text" } }, state);
        assert.ok(events);
        const arr = Array.isArray(events) ? events : [events];
        assert.equal(arr[0]?.type, "part_start");
        if (arr[0]?.type === "part_start") {
            assert.equal(arr[0].message_id, "m1");
            assert.equal(arr[0].part_id, "p1");
            assert.equal(arr[0].part_type, "text");
        }
    });
    it("message.part.delta → text_delta with tracked part type", () => {
        const state = emptyState();
        state.currentMessageId = "m1";
        state.partTypes.set("p1", "text");
        const events = normalizeOpenCodeEvent("message.part.delta", { partID: "p1", delta: "hello" }, state);
        assert.ok(events);
        const arr = Array.isArray(events) ? events : [events];
        assert.equal(arr[0]?.type, "text_delta");
        if (arr[0]?.type === "text_delta") {
            assert.equal(arr[0].message_id, "m1");
            assert.equal(arr[0].part_id, "p1");
            assert.equal(arr[0].content, "hello");
        }
    });
    it("message.part.delta → reasoning_delta", () => {
        const state = emptyState();
        state.currentMessageId = "m1";
        state.partTypes.set("p2", "reasoning");
        const events = normalizeOpenCodeEvent("message.part.delta", { partID: "p2", delta: "think" }, state);
        assert.ok(events);
        const arr = Array.isArray(events) ? events : [events];
        assert.equal(arr[0]?.type, "reasoning_delta");
    });
    it("tool.start / tool.delta / tool.end → tool events", () => {
        const state = emptyState();
        state.currentMessageId = "m1";
        const start = normalizeOpenCodeEvent("tool.start", { id: "t1", toolName: "edit_file", input: { path: "x.md" } }, state);
        assert.ok(start);
        const startArr = Array.isArray(start) ? start : [start];
        assert.equal(startArr[0]?.type, "tool_start");
        const delta = normalizeOpenCodeEvent("tool.delta", { id: "t1", delta: "..." }, state);
        assert.ok(delta);
        const deltaArr = Array.isArray(delta) ? delta : [delta];
        assert.equal(deltaArr[0]?.type, "tool_delta");
        const end = normalizeOpenCodeEvent("tool.end", { id: "t1", output: "ok" }, state);
        assert.ok(end);
        const endArr = Array.isArray(end) ? end : [end];
        assert.equal(endArr[0]?.type, "tool_end");
    });
    it("permission.updated → permission_request", () => {
        const state = emptyState();
        state.currentMessageId = "m1";
        const events = normalizeOpenCodeEvent("permission.updated", {
            id: "perm-1",
            title: "允许编辑文件？",
            detail: "将修改 /workspace/x.md",
            options: [
                { id: "allow", label: "允许" },
                { id: "deny", label: "拒绝" },
            ],
        }, state);
        assert.ok(events);
        const arr = Array.isArray(events) ? events : [events];
        assert.equal(arr[0]?.type, "permission_request");
        if (arr[0]?.type === "permission_request") {
            assert.equal(arr[0].request_id, "perm-1");
            assert.equal(arr[0].title, "允许编辑文件？");
            assert.equal(arr[0].options.length, 2);
        }
    });
    it("question.asked → question", () => {
        const state = emptyState();
        state.currentMessageId = "m1";
        const events = normalizeOpenCodeEvent("question.asked", { id: "q-1", content: "选择模型", kind: "choice", options: [{ id: "a", label: "A" }] }, state);
        assert.ok(events);
        const arr = Array.isArray(events) ? events : [events];
        assert.equal(arr[0]?.type, "question");
        if (arr[0]?.type === "question") {
            assert.equal(arr[0].question_id, "q-1");
            assert.equal(arr[0].content, "选择模型");
            assert.equal(arr[0].kind, "choice");
        }
    });
    it("session.idle → message_end + run_status completed", () => {
        const state = emptyState();
        state.currentMessageId = "m1";
        const events = normalizeOpenCodeEvent("session.idle", {}, state);
        assert.ok(events);
        const arr = Array.isArray(events) ? events : [events];
        assert.equal(arr.length, 2);
        assert.equal(arr[0]?.type, "message_end");
        assert.equal(arr[1]?.type, "run_status");
        if (arr[1]?.type === "run_status") {
            assert.equal(arr[1].status, "completed");
        }
    });
    it("error event → error", () => {
        const state = emptyState();
        const events = normalizeOpenCodeEvent("error", { message: "boom" }, state);
        assert.ok(events);
        const arr = Array.isArray(events) ? events : [events];
        assert.equal(arr[0]?.type, "error");
        if (arr[0]?.type === "error") {
            assert.equal(arr[0].message, "boom");
        }
    });
    it("unknown event returns null", () => {
        const state = emptyState();
        const events = normalizeOpenCodeEvent("something.random", { foo: "bar" }, state);
        assert.equal(events, null);
    });
});
//# sourceMappingURL=chat-api.test.js.map