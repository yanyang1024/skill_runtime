import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
export function TextPart({ content }) {
    return (<div className="text-part">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
        {content || " "}
      </ReactMarkdown>
    </div>);
}
//# sourceMappingURL=TextPart.js.map