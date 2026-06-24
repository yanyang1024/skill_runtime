export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  parts: MessagePart[];
  status?: "streaming" | "done" | "error";
  createdAt?: number;
}

export type MessagePart =
  | { type: "text"; id: string; content: string; status?: "streaming" | "done" }
  | { type: "reasoning"; id: string; content: string; status?: "streaming" | "done" }
  | { type: "tool"; id: string; toolName: string; input?: unknown; output?: unknown; status?: "streaming" | "done" | "error" }
  | { type: "file"; id: string; mime: string; url: string }
  | { type: "error"; id: string; content: string };

export type ChatSSEEvent =
  | { type: "message_start"; message_id: string; role: "assistant" | "user" | "system" }
  | { type: "part_start"; message_id: string; part_id: string; part_type: "text" | "reasoning" | "tool" | "error" }
  | { type: "text_delta"; message_id: string; part_id: string; content: string }
  | { type: "reasoning_delta"; message_id: string; part_id: string; content: string }
  | { type: "tool_start"; message_id: string; part_id: string; tool_name: string; input?: unknown }
  | { type: "tool_delta"; message_id: string; part_id: string; content: string }
  | { type: "tool_end"; message_id: string; part_id: string; output?: unknown; status: "success" | "error" }
  | { type: "permission_request"; message_id: string; request_id: string; title: string; detail?: string; options: Array<{ id: string; label: string }> }
  | { type: "question"; message_id: string; question_id: string; content: string; kind?: "choice" | "multiple" | "text" | "confirm"; options?: Array<{ id: string; label: string }> }
  | { type: "message_end"; message_id: string }
  | { type: "run_status"; status: "running" | "waiting_input" | "completed" | "failed" | "aborted" }
  | { type: "error"; message: string; detail?: unknown };

export interface PendingPermission {
  requestId: string;
  title: string;
  detail?: string;
  options: Array<{ id: string; label: string }>;
  messageId: string;
}

export interface PendingQuestion {
  questionId: string;
  content: string;
  kind?: "choice" | "multiple" | "text" | "confirm";
  options?: Array<{ id: string; label: string }>;
  messageId: string;
}
