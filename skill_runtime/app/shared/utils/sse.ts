import type { ChatSSEEvent } from "../../web/src/types/chat.js";

export function parseChatSSEEvent(data: string): ChatSSEEvent | null {
  try {
    return JSON.parse(data) as ChatSSEEvent;
  } catch {
    return null;
  }
}
