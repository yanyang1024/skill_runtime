import { useState } from "react";
import type { Conversation } from "../types";

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
}

/** token 用量格式化：<1000 原数，>=1000 x.xk，>=1e6 x.xM；无值/0 不显示 */
function formatTokens(n?: number): string | null {
  if (!n || n <= 0) return null;
  if (n < 1000) return `${n} tokens`;
  if (n < 1e6) return `${(n / 1000).toFixed(1)}k tokens`;
  return `${(n / 1e6).toFixed(1)}M tokens`;
}

/** 相对时间显示 */
function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  return new Date(t).toLocaleDateString("zh-CN");
}

export default function ConversationList({ conversations, activeId, onSelect, onCreate, onDelete }: Props) {
  // 行内删除确认：点 × 变「确认？」，再点执行删除
  const [confirmId, setConfirmId] = useState<string | null>(null);

  return (
    <div className="conv-list">
      <button className="btn btn-primary new-conv-btn" onClick={onCreate}>
        + 新建会话
      </button>
      {conversations.length === 0 && <div className="panel-empty">暂无会话</div>}
      <ul className="conv-items">
        {conversations.map((c) => (
          <li
            key={c.id}
            className={c.id === activeId ? "conv-item active" : "conv-item"}
            title={c.title || "未命名会话"}
            onClick={() => onSelect(c.id)}
            onMouseLeave={() => setConfirmId((cur) => (cur === c.id ? null : cur))}
          >
            <div className="conv-main">
              <span className="conv-title">{c.title || "未命名会话"}</span>
              <span className="conv-meta">
                <span className="conv-time">{relativeTime(c.updated_at)}</span>
                {formatTokens(c.total_tokens) && (
                  <span className="conv-tokens">{formatTokens(c.total_tokens)}</span>
                )}
              </span>
            </div>
            {confirmId === c.id ? (
              <button
                className="conv-delete confirm"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmId(null);
                  onDelete(c.id);
                }}
              >
                确认？
              </button>
            ) : (
              <button
                className="conv-delete"
                title="删除会话"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmId(c.id);
                }}
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
