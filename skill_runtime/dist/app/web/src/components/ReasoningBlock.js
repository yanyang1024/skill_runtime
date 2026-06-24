import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
export function ReasoningBlock({ content }) {
    const [expanded, setExpanded] = useState(true);
    return (<div className="reasoning-block">
      <button className="reasoning-toggle" onClick={() => setExpanded((v) => !v)}>
        {expanded ? "▼" : "▶"} 推理过程
      </button>
      {expanded && (<div className="reasoning-content">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{content || " "}</ReactMarkdown>
        </div>)}
    </div>);
}
//# sourceMappingURL=ReasoningBlock.js.map