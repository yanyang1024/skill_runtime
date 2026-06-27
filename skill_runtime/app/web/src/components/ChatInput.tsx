import { useState, useRef } from "react";

interface ChatInputProps {
  onSend: (text: string, attachment?: { name: string; path: string }) => void;
  disabled?: boolean;
  onAbort?: () => void;
  streaming?: boolean;
  /** 上传文件的后端端点基础路径 */
  uploadUrl?: string;
}

export function ChatInput({ onSend, disabled, onAbort, streaming, uploadUrl }: ChatInputProps) {
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState<{ name: string; path: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    if ((!text.trim() && !attachment) || disabled || uploading) return;
    onSend(text, attachment ?? undefined);
    setText("");
    setAttachment(null);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadUrl) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const resp = await fetch(uploadUrl, { method: "POST", body: form });
      if (!resp.ok) throw new Error(`${resp.status}: ${await resp.text()}`);
      const result = (await resp.json()) as { ok: boolean; filename: string; path: string };
      setAttachment({ name: result.filename, path: result.path });
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="chat-input">
      {attachment && (
        <div className="chat-attachment">
          📎 {attachment.name}
          <button className="attachment-remove" onClick={() => setAttachment(null)}>×</button>
        </div>
      )}
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
        <input
          ref={fileInputRef}
          type="file"
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
        <button
          className="attach-button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || !uploadUrl}
          title="上传文件到 input 目录"
        >
          {uploading ? "⏳" : "📎"}
        </button>
        {streaming && onAbort ? (
          <button className="abort-button" onClick={onAbort}>
            中止
          </button>
        ) : (
          <button className="send-button" onClick={handleSend} disabled={disabled || (!text.trim() && !attachment)}>
            发送
          </button>
        )}
      </div>
    </div>
  );
}
