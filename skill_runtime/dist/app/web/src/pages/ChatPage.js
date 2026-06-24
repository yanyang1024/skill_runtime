import { useEffect } from "react";
import { MessageList } from "../components/MessageList";
import { ChatInput } from "../components/ChatInput";
import { QuestionCard } from "../components/QuestionCard";
import { PermissionCard } from "../components/PermissionCard";
import { useChatSession } from "../hooks/useChatSession";
export function ChatPage({ runId, stageId, attempt, pendingSendText, onPendingSendConsumed }) {
    const { messages, streaming, error, pendingPermissions, pendingQuestions, sendMessage, abort, replyQuestion, replyPermission, clearError, } = useChatSession(runId, stageId, attempt);
    useEffect(() => {
        clearError();
    }, [runId, stageId, attempt, clearError]);
    useEffect(() => {
        if (pendingSendText) {
            sendMessage(pendingSendText);
            onPendingSendConsumed?.();
        }
    }, [pendingSendText, sendMessage, onPendingSendConsumed]);
    return (<div className="chat-page">
      <div className="chat-header">
        <h2>{stageId ?? "未选择阶段"}</h2>
        {streaming && <span className="chat-status">流式输出中…</span>}
      </div>

      {error && (<div className="chat-error">
          {error}
          <button onClick={clearError}>×</button>
        </div>)}

      <div className="chat-interactions">
        {pendingPermissions.map((p) => (<PermissionCard key={p.requestId} permission={p} onReply={replyPermission}/>))}
        {pendingQuestions.map((q) => (<QuestionCard key={q.questionId} question={q} onReply={replyQuestion}/>))}
      </div>

      <MessageList messages={messages} streaming={streaming}/>

      <ChatInput onSend={sendMessage} disabled={!runId || !stageId} onAbort={abort} streaming={streaming}/>
    </div>);
}
//# sourceMappingURL=ChatPage.js.map