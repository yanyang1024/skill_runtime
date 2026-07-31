import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { ArrowUpIcon, StopIcon } from '../icons.jsx'

const TOOL_STATUS_LABEL = {
  pending: '等待',
  running: '执行中…',
  completed: '完成',
  error: '出错',
}

function ToolCalls({ tools }) {
  if (!tools || tools.length === 0) return null
  return (
    <div className="tool-calls">
      {tools.map((t, i) => (
        <details key={t.part_id || i} className={`tool-call status-${t.status}`}>
          <summary>
            <span className="tool-name">{t.tool}</span>
            <span className="tool-title">{t.title || t.input_summary || ''}</span>
            <span className="tool-status">{TOOL_STATUS_LABEL[t.status] || t.status}</span>
          </summary>
          {t.input_summary && <div className="tool-io">输入：{t.input_summary}</div>}
          {t.output_preview && <div className="tool-io">输出：{t.output_preview}</div>}
        </details>
      ))}
    </div>
  )
}

function AssistantMessage({ text, reasoning, tools }) {
  return (
    <div className="message assistant">
      {reasoning && (
        <details className="reasoning-block">
          <summary>思考过程</summary>
          <div className="reasoning-content">{reasoning}</div>
        </details>
      )}
      <ToolCalls tools={tools} />
      <div className="markdown-body">
        <ReactMarkdown>{text}</ReactMarkdown>
      </div>
    </div>
  )
}

function StreamingMessage({ streaming }) {
  const textParts = streaming.parts.filter((p) => p.type === 'text')
  const reasoningParts = streaming.parts.filter((p) => p.type === 'reasoning')
  const text = textParts.map((p) => p.content).join('')
  const reasoning = reasoningParts.map((p) => p.content).join('')
  return (
    <div className="message assistant streaming">
      {reasoning && (
        <div className="reasoning-block">
          <div className="reasoning-content">{reasoning}</div>
        </div>
      )}
      <ToolCalls tools={streaming.tools} />
      <div className="markdown-body">
        <ReactMarkdown>{text}</ReactMarkdown>
      </div>
      <span className="cursor">▍</span>
    </div>
  )
}

export default function ChatView({
  messages,
  streaming,
  status,
  recommendations,
  todos,
  countdown,
  loopActive,
  onSend,
  onStop,
  onCancelCountdown,
}) {
  const [input, setInput] = useState('')
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)
  const busy = status === 'busy'

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streaming])

  // 输入框随内容自动增高（上限 ~8 行）
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }, [input])

  const send = () => {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    onSend(text)
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="chat-view">
      <div className="messages">
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="message user">
              {m.via === 'loop' && (
                <div className="via-loop-badge">Loop{m.round ? ` · 第 ${m.round} 轮` : ''}</div>
              )}
              <div className="user-text">{m.text}</div>
            </div>
          ) : m.role === 'system' ? (
            <div key={i} className="system-divider">{m.text}</div>
          ) : (
            <AssistantMessage key={i} text={m.text} reasoning={m.reasoning} tools={m.tools} />
          )
        )}
        {streaming && <StreamingMessage streaming={streaming} />}
        {busy && !streaming && <div className="thinking">思考中…</div>}
        <div ref={bottomRef} />
      </div>

      {countdown && (
        <div className="loop-countdown-banner">
          <span>
            <b>{countdown.seconds}s</b> 后自动发送：{countdown.prompt}
          </span>
          <button onClick={onCancelCountdown}>取消</button>
        </div>
      )}

      {todos.length > 0 && (
        <div className="todos-bar">
          {todos.map((t, i) => (
            <span key={i} className="todo-item">
              {typeof t === 'string' ? t : t.content || t.text || JSON.stringify(t)}
            </span>
          ))}
        </div>
      )}

      {recommendations.length > 0 && (
        <div className="recommendations">
          {loopActive && <span className="rec-readonly-hint">Loop 候选（自动采用第一条）：</span>}
          {recommendations.map((r, i) =>
            loopActive ? (
              <span key={i} className="recommendation readonly">{r}</span>
            ) : (
              <button key={i} className="recommendation" disabled={busy} onClick={() => onSend(r)}>
                {r}
              </button>
            )
          )}
        </div>
      )}

      <div className="input-area">
        <div className="input-pill">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={busy ? '助手正在回复…' : '输入消息，Enter 发送，Shift+Enter 换行'}
            rows={1}
            disabled={busy}
          />
          {busy ? (
            <button className="send-btn stop" onClick={onStop} title="中断生成">
              <StopIcon size={13} />
            </button>
          ) : (
            <button className="send-btn" onClick={send} disabled={!input.trim()} title="发送">
              <ArrowUpIcon size={16} />
            </button>
          )}
        </div>
        <div className="input-hint">
          <span className={`status-indicator ${busy ? 'busy' : 'idle'}`}>
            {busy ? '思考中' : '空闲'}
          </span>
        </div>
      </div>
    </div>
  )
}
