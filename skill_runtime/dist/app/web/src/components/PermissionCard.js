export function PermissionCard({ permission, onReply }) {
    return (<div className="permission-card">
      <div className="permission-title">🔒 权限请求：{permission.title}</div>
      {permission.detail && <div className="permission-detail">{permission.detail}</div>}
      <div className="permission-actions">
        <button className="permission-deny" onClick={() => onReply(permission.requestId, false)}>
          拒绝
        </button>
        <button className="permission-allow" onClick={() => onReply(permission.requestId, true)}>
          允许
        </button>
      </div>
    </div>);
}
//# sourceMappingURL=PermissionCard.js.map