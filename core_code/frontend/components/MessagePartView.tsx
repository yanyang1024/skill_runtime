import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { MessagePart } from "../types";
import ToolCard from "./ToolCard";

/** 渲染消息中的单个 part；streaming 时 text 末尾显示闪烁光标 */
export default function MessagePartView({
  part,
  streaming = false,
}: {
  part: MessagePart;
  streaming?: boolean;
}) {
  switch (part.type) {
    case "text":
      return (
        <div className={streaming ? "part-text markdown-body streaming" : "part-text markdown-body"}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{part.text ?? ""}</ReactMarkdown>
        </div>
      );
    case "reasoning":
      return (
        <details className="part-reasoning">
          <summary>思考过程</summary>
          <div className="reasoning-body">{part.text ?? ""}</div>
        </details>
      );
    case "tool":
      return <ToolCard part={part} />;
    case "file":
      return <div className="part-file">📄 {part.filename ?? part.title ?? "文件"}</div>;
    default:
      // step-start / step-finish 等不渲染
      return null;
  }
}
