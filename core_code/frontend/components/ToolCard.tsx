import type { MessagePart } from "../types";

/** 状态中文标签 */
function statusLabel(status?: string): string {
  switch (status) {
    case "running":
      return "运行中";
    case "completed":
      return "完成";
    case "error":
      return "失败";
    case "pending":
      return "等待";
    default:
      return status ?? "";
  }
}

function formatInput(input: unknown): string {
  if (typeof input === "string") return input;
  try {
    return JSON.stringify(input, null, 2);
  } catch {
    return String(input);
  }
}

/** 工具调用卡片：名称 + 状态 + input/output 折叠 */
export default function ToolCard({ part }: { part: MessagePart }) {
  return (
    <div className={`tool-card tool-status-${part.status ?? "unknown"}`}>
      <div className="tool-head">
        <span className="tool-name">{part.tool ?? "tool"}</span>
        {part.title && <span className="tool-title">{part.title}</span>}
        <span className="tool-status">
          {part.status === "running" && <span className="spinner spinner-sm" />}
          {statusLabel(part.status)}
        </span>
      </div>
      {part.input !== undefined && part.input !== null && (
        <details className="tool-section">
          <summary>输入</summary>
          <pre>{formatInput(part.input)}</pre>
        </details>
      )}
      {(part.output || part.error) && (
        <details className="tool-section">
          <summary>输出</summary>
          <pre>
            {part.error ? `错误：${part.error}${part.output ? `\n${part.output}` : ""}` : part.output}
          </pre>
        </details>
      )}
    </div>
  );
}
