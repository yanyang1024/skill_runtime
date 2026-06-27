import { useState, useRef } from "react";
import type { TokenStats } from "../hooks/useChatSession";

interface ChatInputProps {
  onSend: (text: string, attachment?: { name: string; path: string }) => void;
  disabled?: boolean;
  onAbort?: () => void;
  streaming?: boolean;
  /** 上传文件的后端端点基础路径 */
  uploadUrl?: string;
  tokenStats?: TokenStats;
}

export function ChatInput({ onSend, disabled, onAbort, streaming, uploadUrl, tokenStats }: ChatInputProps) {
  const [text, setText] = useState("");
  const [attachment, setAttachment] = useState<{ name: string; path: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
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
      setUploadError(err instanceof Error ? err.message : "上传失败");
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
      {uploadError && (
        <div className="chat-attachment error">{uploadError}</div>
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
      {tokenStats && tokenStats.limit > 0 && tokenStats.input > 0 && (
        (() => {
          const pct = Math.round(tokenStats.input / tokenStats.limit * 100);
          const level = pct > 100 ? "critical" : pct > 80 ? "warning" : pct > 60 ? "caution" : "ok";
          return (
            <div className={`token-bar token-${level}`}>
              <div className="token-fill" style={{ width: `${Math.min(100, pct)}%` }} />
              <span className="token-text">
                {level === "critical" ? "⚠ 已超出限制！建议中止并简化 prompt。" :
                 level === "warning" ? `⚠ 上下文 ${pct}% 已用，建议精简 prompt` :
                 `${pct}% (${Math.round(tokenStats.input / 1000)}K / ${Math.round(tokenStats.limit / 1000)}K)`}
              </span>
            </div>
          );
        })()
      )}
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
