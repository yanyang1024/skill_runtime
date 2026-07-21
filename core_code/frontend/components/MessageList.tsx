import { memo, useEffect, useRef, useState } from "react";
import type {
  ChatMessage,
  MessagePart,
  PendingPermission,
  PendingQuestion,
  TodoItem,
} from "../types";
import MessagePartView from "./MessagePartView";
import QuestionCard from "./QuestionCard";
import PermissionCard from "./PermissionCard";

interface Props {
  messages: ChatMessage[];
  /** 当前流式 assistant 消息的 parts（按 part_id 有序） */
  streamParts: MessagePart[];
  streaming: boolean;
  todos: TodoItem[];
  questions: PendingQuestion[];
  permissions: PendingPermission[];
  error: string | null;
  /** 有失败待重发的消息时显示「重试」按钮 */
  canRetry: boolean;
  onDismissError: () => void;
  onRetry: () => void;
  onQuestionReply: (q: PendingQuestion, answers: string[][]) => void;
  onQuestionReject: (q: PendingQuestion) => void;
  onPermissionReply: (p: PendingPermission, reply: "once" | "always" | "reject") => void;
}

function todoIcon(status?: string): string {
  if (status === "completed") return "☑";
  if (status === "in_progress") return "▶";
  return "☐";
}

/** 生成状态条：spinner + 文案 + 秒级计时，卸载时自动清理定时器 */
function GenerationStatus({ hasOutput }: { hasOutput: boolean }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="gen-status">
      <span className="spinner" />
      <span>{hasOutput ? "正在输出…" : "正在生成…"}</span>
      <span className="gen-elapsed">已用时 {seconds}s</span>
    </div>
  );
}

/** 单条历史消息（memo：流式期间历史消息引用不变，避免每条 delta 全量重渲染） */
const MessageItem = memo(function MessageItem({ message }: { message: ChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="msg msg-user">
        <div className="bubble">
          {message.parts
            .filter((p) => p.type === "text")
            .map((p) => p.text ?? "")
            .join("\n") || "(空消息)"}
        </div>
      </div>
    );
  }
  return (
    <div className="msg msg-assistant">
      <div className="assistant-parts">
        {message.parts.map((p) => (
          <MessagePartView key={p.id} part={p} />
        ))}
      </div>
    </div>
  );
});

export default function MessageList(props: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  // 是否贴底（贴底时内容更新自动滚动；用户上翻后暂停）
  const [stickToBottom, setStickToBottom] = useState(true);

  useEffect(() => {
    const el = listRef.current;
    if (el && stickToBottom) el.scrollTop = el.scrollHeight;
  }, [props.messages, props.streamParts, props.todos, props.questions, props.permissions, props.error, props.streaming, stickToBottom]);

  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    setStickToBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 48);
  };

  const backToBottom = () => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setStickToBottom(true);
  };

  const lastStreamPartId =
    props.streamParts.length > 0 ? props.streamParts[props.streamParts.length - 1].id : null;
  const hasTextOutput = props.streamParts.some((p) => p.type === "text" && p.text);

  return (
    <div className="message-area">
      {props.todos.length > 0 && (
        <div className="todo-bar">
          {props.todos.map((t, i) => (
            <span key={i} className="todo-item" title={String(t.priority ?? "")}>
              {todoIcon(typeof t.status === "string" ? t.status : undefined)}{" "}
              {String(t.content ?? "")}
            </span>
          ))}
        </div>
      )}

      <div className="message-list" ref={listRef} onScroll={handleScroll}>
        {props.messages.length === 0 && props.streamParts.length === 0 && (
          <div className="panel-empty">暂无消息，开始第一轮对话吧</div>
        )}

        {props.messages.map((m) => (
          <MessageItem key={m.id} message={m} />
        ))}

        {/* 流式中的 assistant 消息（最后一个 part 带流式光标） */}
        {props.streamParts.length > 0 && (
          <div className="msg msg-assistant streaming">
            <div className="assistant-parts">
              {props.streamParts.map((p) => (
                <MessagePartView
                  key={p.id}
                  part={p}
                  streaming={props.streaming && p.id === lastStreamPartId}
                />
              ))}
            </div>
          </div>
        )}

        {/* 生成状态条：running 期间显示，done/abort 后消失 */}
        {props.streaming && <GenerationStatus hasOutput={hasTextOutput} />}

        {/* 待处理的 Question / Permission 卡片区 */}
        {props.questions.map((q) => (
          <QuestionCard
            key={q.request_id}
            request={q}
            onReply={(answers) => props.onQuestionReply(q, answers)}
            onReject={() => props.onQuestionReject(q)}
          />
        ))}
        {props.permissions.map((p) => (
          <PermissionCard
            key={p.request_id}
            request={p}
            onReply={(reply) => props.onPermissionReply(p, reply)}
          />
        ))}

        {props.error && (
          <div className="error-bar">
            <span className="error-text">{props.error}</span>
            {props.canRetry && (
              <button className="btn error-retry" onClick={props.onRetry}>
                重试
              </button>
            )}
            <button className="error-close" title="关闭" onClick={props.onDismissError}>
              ×
            </button>
          </div>
        )}
      </div>

      {!stickToBottom && (
        <button className="scroll-bottom-btn" onClick={backToBottom}>
          ↓ 回到底部
        </button>
      )}
    </div>
  );
}
