export function parseChatSSEEvent(data) {
    try {
        return JSON.parse(data);
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=sse.js.map