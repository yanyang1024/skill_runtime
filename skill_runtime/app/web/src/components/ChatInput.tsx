import { useState, useRef } from "react";

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
  onAbort?: () => void;
  streaming?: boolean;
}

export function ChatInput({ onSend, disabled, onAbort, streaming }: ChatInputProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    if (!text.trim() || disabled) return;
    onSend(text);
    setText("");
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="chat-input">
      <textarea
        ref={textareaRef}
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="输入 prompt，按 Enter 发送，Shift+Enter 换行..."
        disabled={disabled}
      />
      <div className="chat-input-actions">
        {streaming && onAbort ? (
          <button className="abort-button" onClick={onAbort}>
            中止
          </button>
        ) : (
          <button className="send-button" onClick={handleSend} disabled={disabled || !text.trim()}>
            发送
          </button>
        )}
      </div>
    </div>
  );
}
