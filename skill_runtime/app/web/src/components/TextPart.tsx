import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

interface TextPartProps {
  content: string;
}

export function TextPart({ content }: TextPartProps) {
  return (
    <div className="text-part">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
        {content || " "}
      </ReactMarkdown>
    </div>
  );
}
