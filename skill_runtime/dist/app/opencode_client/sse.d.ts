import { EventEmitter } from "node:events";
import type { ChatSSEEvent } from "../web/src/types/chat.js";
export declare function getSSEEmitter(runId: string, stageId: string, attempt: number, sessionId: string): EventEmitter;
export declare function removeSSEEmitter(runId: string, stageId: string, attempt: number, sessionId: string): void;
export declare function abortEventStream(runId: string, stageId: string, attempt: number, sessionId: string): void;
/**
 * 消费 OpenCode /event SSE 流，解析事件并：
 * 1. 写入 session-stream.md（原始事件）。
 * 2. 写入 session-stream-reasoning.md / session-stream-content.md。
 * 3. 通过 EventEmitter 派发标准化 ChatSSEEvent。
 *
 * 同一 scope 同时只会存在一个活跃 consumer；重复调用将直接返回。
 */
export declare function ensureEventStream(baseUrl: string, workspacePath: string, outputDir: string, runId: string, stageId: string, attempt: number, sessionId: string): Promise<void>;
interface NormalizerState {
    currentMessageId?: string;
    partTypes: Map<string, "text" | "reasoning" | "tool" | "error">;
    pendingDeltas: Map<string, string[]>;
    fallbackIdCounter: number;
}
/**
 * 将单个 OpenCode 原始事件归一化为 ChatSSEEvent。
 * 状态对象用于追踪当前 message / part 类型。
 */
export declare function normalizeOpenCodeEvent(eventType: string, props: Record<string, unknown>, state: NormalizerState): ChatSSEEvent | ChatSSEEvent[] | null;
export {};
//# sourceMappingURL=sse.d.ts.map