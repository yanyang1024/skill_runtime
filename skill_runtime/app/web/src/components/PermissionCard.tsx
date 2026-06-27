import { useState } from "react";
import type { PendingPermission } from "../types/chat";

interface PermissionCardProps {
  permission: PendingPermission;
  onReply: (requestId: string, allowed: boolean) => void;
}

export function PermissionCard({ permission, onReply }: PermissionCardProps) {
  const [replying, setReplying] = useState(false);

  const handleReply = (allowed: boolean) => {
    if (replying) return;
    setReplying(true);
    onReply(permission.requestId, allowed);
    // 安全网：2s 后无论如何复位（防止回调永不返回）
    setTimeout(() => setReplying(false), 2000);
  };

  return (
    <div className="permission-card">
      <div className="permission-title">🔒 权限请求：{permission.title}</div>
      {permission.detail && <div className="permission-detail">{permission.detail}</div>}
      <div className="permission-actions">
        <button className="permission-deny" onClick={() => handleReply(false)} disabled={replying}>
          拒绝
        </button>
        <button className="permission-allow" onClick={() => handleReply(true)} disabled={replying}>
          允许
        </button>
      </div>
    </div>
  );
}
