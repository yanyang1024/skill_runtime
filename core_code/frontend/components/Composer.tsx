import { useEffect, useRef } from "react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onAbort: () => void;
  /** session_status === running 时发送按钮变为「中止」，输入框保持可编辑 */
  running: boolean;
  disabled: boolean;
}

/** 底部输入区：Enter 发送，Shift+Enter 换行 */
export default function Composer({ value, onChange, onSend, onAbort, running, disabled }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // textarea 高度自适应（上限 200px）
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  const handleSend = () => {
    if (disabled || running || !value.trim()) return;
    onSend();
    // 发送后聚焦回输入框
    ref.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // isComposing 防止中文输入法候选确认时误发送
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="composer">
      <div className="composer-row">
        <textarea
          ref={ref}
          value={value}
          rows={1}
          disabled={disabled}
          placeholder="输入消息…"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        {running ? (
          <button className="btn btn-danger composer-btn" onClick={onAbort}>
            中止
          </button>
        ) : (
          <button
            className="btn btn-primary composer-btn"
            onClick={handleSend}
            disabled={disabled || !value.trim()}
          >
            发送
          </button>
        )}
      </div>
      <div className="composer-hint">Enter 发送 · Shift+Enter 换行</div>
    </div>
  );
}
