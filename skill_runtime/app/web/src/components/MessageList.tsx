import { useRef, useEffect } from "react";
import type { ChatMessage } from "../types/chat";
import { MessageBubble } from "./MessageBubble";

interface MessageListProps {
  messages: ChatMessage[];
  streaming?: boolean;
}

export function MessageList({ messages, streaming }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  return (
    <div className="message-list">
      {messages.length === 0 && !streaming && (
        <div className="message-empty">还没有消息。请先启动 Stage，然后在下方输入 prompt 开始对话。</div>
      )}
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      {streaming && (
        <div className="message-bubble assistant streaming">
          <div className="message-role">OpenCode</div>
          <div className="message-content">
            <span className="typing-indicator">●●●</span>
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
