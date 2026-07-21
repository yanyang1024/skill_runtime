import type { PendingPermission } from "../types";

interface Props {
  request: PendingPermission;
  onReply: (reply: "once" | "always" | "reject") => void;
}

/** 权限请求卡片：允许一次 / 总是允许 / 拒绝 */
export default function PermissionCard({ request, onReply }: Props) {
  return (
    <div className="card permission-card">
      <div className="card-title">权限请求</div>
      <div className="permission-text">
        OpenCode 请求权限：<code>{request.permission ?? "未知权限"}</code>
      </div>
      <div className="card-actions">
        <button className="btn btn-primary" onClick={() => onReply("once")}>
          允许一次
        </button>
        <button className="btn" onClick={() => onReply("always")}>
          总是允许
        </button>
        <button className="btn btn-danger" onClick={() => onReply("reject")}>
          拒绝
        </button>
      </div>
    </div>
  );
}
