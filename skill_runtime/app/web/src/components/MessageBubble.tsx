import type { ChatMessage, MessagePart } from "../types/chat";
import { TextPart } from "./TextPart";
import { ReasoningBlock } from "./ReasoningBlock";

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div className={`message-bubble ${isUser ? "user" : "assistant"}`}>
      <div className="message-role">{isUser ? "导演" : "OpenCode"}</div>
      <div className="message-content">
        {message.parts.map((part) => (
          <PartRenderer key={part.id} part={part} />
        ))}
      </div>
    </div>
  );
}

function PartRenderer({ part }: { part: MessagePart }) {
  switch (part.type) {
    case "text":
      return <TextPart content={part.content} />;
    case "reasoning":
      return <ReasoningBlock content={part.content} />;
    case "tool":
      return (
        <div className="tool-part">
          <div className="tool-name">🔧 {part.toolName || "tool"}</div>
          {part.input && (
            <pre className="tool-input">{JSON.stringify(part.input, null, 2)}</pre>
          )}
          {part.content && <pre className="tool-output">{part.content}</pre>}
          {part.output && (
            <pre className="tool-output">{JSON.stringify(part.output, null, 2)}</pre>
          )}
          {part.status === "error" && <div className="tool-error">执行失败</div>}
        </div>
      );
    case "file":
      return (
        <div className="file-part">
          📎 {part.mime}: <code>{part.url}</code>
        </div>
      );
    case "error":
      return <div className="error-part">{part.content}</div>;
    default:
      return null;
  }
}
