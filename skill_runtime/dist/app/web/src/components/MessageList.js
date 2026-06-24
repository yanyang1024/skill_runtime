import { useRef, useEffect } from "react";
import { MessageBubble } from "./MessageBubble";
export function MessageList({ messages, streaming }) {
    const bottomRef = useRef(null);
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, streaming]);
    return (<div className="message-list">
      {messages.length === 0 && (<div className="message-empty">还没有消息。在下方输入 prompt 开始对话。</div>)}
      {messages.map((msg) => (<MessageBubble key={msg.id} message={msg}/>))}
      {streaming && (<div className="message-bubble assistant streaming">
          <div className="message-role">OpenCode</div>
          <div className="message-content">
            <span className="typing-indicator">●●●</span>
          </div>
        </div>)}
      <div ref={bottomRef}/>
    </div>);
}
//# sourceMappingURL=MessageList.js.map