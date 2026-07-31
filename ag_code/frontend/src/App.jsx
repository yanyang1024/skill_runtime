import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  listConversations,
  createConversation,
  deleteConversation,
  updateConversation,
  listModels,
  listMessages,
  streamChat,
  subscribeConversation,
  getLoopStatus,
  listConversationAgents,
  abortChat,
  listPendingPermissions,
  replyPermission,
  pauseLoop,
} from './api.js'
import ConversationList from './components/ConversationList.jsx'
import ChatView from './components/ChatView.jsx'
import FilePanel from './components/FilePanel.jsx'
import LoopPanel from './components/LoopPanel.jsx'
import ResourcePanel from './components/ResourcePanel.jsx'
import PermissionRequests from './components/PermissionRequests.jsx'

export default function App() {
  const [conversations, setConversations] = useState([])
  const [currentId, setCurrentId] = useState(null)
  const [messages, setMessages] = useState([])
  const [streaming, setStreaming] = useState(null) // { parts: [{part_id, type, content}] }
  const [status, setStatus] = useState('idle') // 'idle' | 'busy'
  const [recommendations, setRecommendations] = useState([])
  const [loopStatus, setLoopStatus] = useState({ active: false, remaining: 0 })
  const [todos, setTodos] = useState([])
  const [error, setError] = useState(null)
  const [showFiles, setShowFiles] = useState(true)
  const [showLoop, setShowLoop] = useState(false)
  const [showResources, setShowResources] = useState(false)
  const [models, setModels] = useState([])
  const [agents, setAgents] = useState([])
  const [countdown, setCountdown] = useState(null) // {seconds, prompt}
  const [permissions, setPermissions] = useState([]) // 待审批的权限请求

  const eventSourceRef = useRef(null)
  const abortControllerRef = useRef(null)
  const isUserChatActiveRef = useRef(false) // 用户聊天流进行中（subscribe 的 text 事件跳过，避免重复累积）
  // 流式累加器：放在 ref 里同步累加，不依赖 React 渲染节奏。
  // 之前用 streamingRef 镜像 state，存在竞态——最后一个网络 chunk 常把
  // 末尾 text delta 和 done 一起送达，React 18 批量更新尚未渲染，
  // ref 里还是旧值，导致 done 时取不到完整文本、消息丢失（刷新后才从历史看到）。
  const streamAccRef = useRef(null) // { parts: [{part_id, type, content}] } | null

  // 加载可用模型列表（已连接 provider）
  useEffect(() => {
    listModels()
      .then(setModels)
      .catch(() => {}) // 实例未启动时静默失败，下拉只显示"默认"
  }, [])

  // 初始加载会话列表；支持 ?c=<id> 深链（资源库页"使用中的会话"跳转）
  const [searchParams] = useSearchParams()
  useEffect(() => {
    const wantId = searchParams.get('c')
    listConversations()
      .then((list) => {
        setConversations(list)
        if (wantId && list.some((c) => c.id === wantId)) {
          setCurrentId(wantId)
        } else if (list.length > 0) {
          setCurrentId((id) => id ?? list[0].id)
        }
      })
      .catch((e) => setError(e.message))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 切换会话：加载历史消息 + 重建 EventSource + 查询 loop 状态
  useEffect(() => {
    if (currentId == null) return
    setMessages([])
    setStreaming(null)
    setRecommendations([])
    setTodos([])
    setError(null)
    setPermissions([])

    listMessages(currentId)
      .then(setMessages)
      .catch((e) => setError(e.message))

    // 恢复未处理的权限审批卡片（例如挂起时刷新页面）
    listPendingPermissions(currentId)
      .then(setPermissions)
      .catch(() => {})

    getLoopStatus(currentId)
      .then(setLoopStatus)
      .catch(() => {})

    // 该会话可用的 agent 列表（实例未启动时为空，下拉只显示"默认 agent"）
    listConversationAgents(currentId)
      .then(setAgents)
      .catch(() => setAgents([]))

    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
    const es = subscribeConversation(currentId, (ev) => {
      switch (ev.type) {
        case 'session_status':
          setStatus(ev.status === 'busy' ? 'busy' : 'idle')
          break
        case 'recommendations':
          setRecommendations(Array.isArray(ev.items) ? ev.items : [])
          break
        case 'recommendation_started':
          setRecommendations([])
          break
        case 'loop_status':
          setLoopStatus({
            active: !!ev.active,
            mode: ev.mode,
            round: ev.round,
            remaining: ev.remaining,
            reason: ev.reason,
          })
          if (!ev.active) {
            setCountdown(null)
            if (ev.reason) {
              // 停止原因作为系统分隔消息留在聊天流里
              setMessages((prev) => {
                const text = `—— Loop 已停止：${ev.reason} ——`
                return prev[prev.length - 1]?.text === text ? prev : [...prev, { role: 'system', text }]
              })
            }
          }
          break
        case 'loop_countdown':
          setCountdown({ seconds: ev.seconds, prompt: ev.prompt })
          break
        case 'loop_prompt':
          // loop 自动发送的 prompt：插入用户气泡，随后其回复经 subscribe 流入累加器
          setCountdown(null)
          setMessages((prev) => [...prev, { role: 'user', text: ev.text, via: 'loop', round: ev.round }])
          break
        case 'text':
        case 'reasoning':
          // loop 轮次的内容经 subscribe 到达（用户聊天流由 streamChat 自己累积，避免重复）
          if (!isUserChatActiveRef.current) appendDelta(ev)
          break
        case 'tool':
          if (!isUserChatActiveRef.current) appendToolEvent(ev)
          break
        case 'permission_asked':
          setPermissions((prev) =>
            prev.some((p) => p.request_id === ev.request_id) ? prev : [...prev, ev]
          )
          break
        case 'permission_replied':
          // 已批复（本端或其他标签页）：同步撤销卡片
          setPermissions((prev) => prev.filter((p) => p.request_id !== ev.request_id))
          break
        case 'done':
          // loop 一轮结束：落成消息
          if (!isUserChatActiveRef.current) {
            flushStreamToMessage()
            setStreaming(null)
          }
          break
        case 'todos':
          setTodos(Array.isArray(ev.items) ? ev.items : [])
          break
        case 'keepalive':
        default:
          break
      }
    })
    eventSourceRef.current = es
    return () => {
      es.close()
      if (eventSourceRef.current === es) eventSourceRef.current = null
    }
  }, [currentId])

  const handleCreate = useCallback(async () => {
    // 直接创建，首条消息后自动命名（见 handleSend）
    try {
      const conv = await createConversation('')
      setConversations((prev) => [conv, ...prev])
      setCurrentId(conv.id)
    } catch (e) {
      setError(e.message)
    }
  }, [])

  const isDefaultTitle = useCallback((t) => {
    return !t || t === '新会话' || /^会话 \d/.test(t)
  }, [])

  const handleDelete = useCallback(
    async (id) => {
      if (!window.confirm('确定删除该会话？')) return
      try {
        await deleteConversation(id)
        setConversations((prev) => {
          const next = prev.filter((c) => c.id !== id)
          if (id === currentId) setCurrentId(next.length > 0 ? next[0].id : null)
          return next
        })
      } catch (e) {
        setError(e.message)
      }
    },
    [currentId]
  )

  // 会话级模型切换：空字符串 = 回到全局默认
  const handleModelChange = useCallback(
    async (model) => {
      if (currentId == null) return
      try {
        const updated = await updateConversation(currentId, { model })
        setConversations((prev) => prev.map((c) => (c.id === currentId ? updated : c)))
      } catch (e) {
        setError(e.message)
      }
    },
    [currentId]
  )

  // 会话级 agent 切换：空字符串 = opencode 默认 agent
  const handleAgentChange = useCallback(
    async (agent) => {
      if (currentId == null) return
      try {
        const updated = await updateConversation(currentId, { agent })
        setConversations((prev) => prev.map((c) => (c.id === currentId ? updated : c)))
      } catch (e) {
        setError(e.message)
      }
    },
    [currentId]
  )

  const appendDelta = useCallback((ev) => {
    if (!streamAccRef.current) streamAccRef.current = { parts: [] }
    const acc = streamAccRef.current
    const existing = acc.parts.find((p) => p.part_id === ev.part_id && p.type === ev.type)
    if (existing) {
      existing.content += ev.content
    } else {
      acc.parts.push({ part_id: ev.part_id, type: ev.type, content: ev.content })
    }
    // 拷贝一份驱动渲染（ChatView 依赖引用变化）
    setStreaming({
      parts: acc.parts.map((p) => ({ ...p })),
      tools: acc.tools ? Object.values(acc.tools) : [],
    })
  }, [])

  // 把累加器内容落成一条 assistant 消息；返回是否有内容
  const flushStreamToMessage = useCallback(() => {
    const acc = streamAccRef.current
    streamAccRef.current = null
    if (!acc) return false
    const textParts = (acc.parts || [])
      .filter((p) => p.type === 'text')
      .map((p) => p.content)
      .join('')
    const reasoningParts = (acc.parts || [])
      .filter((p) => p.type === 'reasoning')
      .map((p) => p.content)
      .join('')
    const tools = acc.tools ? Object.values(acc.tools) : []
    if (!textParts && !reasoningParts && tools.length === 0) return false
    setMessages((prev) => [
      ...prev,
      {
        role: 'assistant',
        text: textParts,
        reasoning: reasoningParts || undefined,
        tools: tools.length > 0 ? tools : undefined,
      },
    ])
    return true
  }, [])

  // tool 事件按 part_id 去重更新（pending→running→completed 是同一 part）
  const appendToolEvent = useCallback((ev) => {
    if (!streamAccRef.current) streamAccRef.current = { parts: [], tools: {} }
    const acc = streamAccRef.current
    if (!acc.tools) acc.tools = {}
    const key = ev.part_id || `${ev.tool}-${Object.keys(acc.tools).length}`
    acc.tools[key] = ev
    setStreaming({
      parts: (acc.parts || []).map((p) => ({ ...p })),
      tools: Object.values(acc.tools),
    })
  }, [])

  // 轮询兜底：流式通道被缓冲（如系统代理）时，改为轮询历史消息直到回复出现
  const pollUntilReply = useCallback(async () => {
    if (currentId == null) return
    console.warn('[fallback] 进入轮询模式')
    const baseline = (await listMessages(currentId)).filter((m) => m.role === 'assistant').length
    const deadline = Date.now() + 150_000
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2000))
      try {
        const msgs = await listMessages(currentId)
        const assistantCount = msgs.filter((m) => m.role === 'assistant').length
        if (assistantCount > baseline) {
          setMessages(msgs)
          return
        }
      } catch {
        // 轮询失败继续等
      }
    }
    setError('等待回复超时，请刷新页面或检查模型配置')
  }, [currentId])

  const handleSend = useCallback(
    async (text) => {
      if (currentId == null || !text.trim()) return
      setError(null)
      setRecommendations([])
      // 乐观插入用户消息
      setMessages((prev) => [...prev, { role: 'user', text }])
      streamAccRef.current = { parts: [], tools: {} }
      setStreaming(null)
      setStatus('busy')
      isUserChatActiveRef.current = true

      // 默认标题的会话，用首条消息自动命名
      const cur = conversations.find((c) => c.id === currentId)
      if (cur && isDefaultTitle(cur.title)) {
        const autoTitle = text.trim().slice(0, 20)
        updateConversation(currentId, { title: autoTitle })
          .then((updated) =>
            setConversations((prev) => prev.map((c) => (c.id === currentId ? updated : c)))
          )
          .catch(() => {})
      }

      const controller = new AbortController()
      abortControllerRef.current = controller
      let gotAnyEvent = false
      let fallbackStarted = false
      let watchdog = null
      // 拿到响应头后才启动看门狗：此前的等待可能是实例懒启动（可达数十秒），
      // 不能误判为"流被缓冲"而误杀请求
      const armWatchdog = () => {
        watchdog = setTimeout(() => {
          if (!gotAnyEvent && !fallbackStarted) {
            fallbackStarted = true
            controller.abort()
          }
        }, 8000)
      }

      try {
        await streamChat(currentId, text, (ev) => {
          gotAnyEvent = true
          if (ev.type === 'text' || ev.type === 'reasoning') {
            appendDelta(ev)
          } else if (ev.type === 'tool') {
            appendToolEvent(ev)
          } else if (ev.type === 'error') {
            setError(ev.message || '流式响应出错')
          } else if (ev.type === 'done') {
            flushStreamToMessage()
            setStreaming(null)
            setStatus('idle')
          }
        }, controller.signal, armWatchdog)
      } catch (e) {
        if (e.name === 'AbortError' && fallbackStarted) {
          // 传输被缓冲：改轮询直到回复出现在历史里
          await pollUntilReply()
        } else if (e.name !== 'AbortError') {
          setError(e.message)
        }
      } finally {
        clearTimeout(watchdog)
        abortControllerRef.current = null
        isUserChatActiveRef.current = false
        // 流异常中断时，把已收到的部分内容落为一条消息（done 已落过则是无操作）
        flushStreamToMessage()
        setStreaming(null)
        setStatus('idle')
      }
    },
    [currentId, conversations, isDefaultTitle, appendDelta, appendToolEvent, flushStreamToMessage, pollUntilReply]
  )

  // 中断当前生成：通知 opencode abort + 断开本地流，已生成部分落为消息
  const handleStop = useCallback(async () => {
    if (currentId == null) return
    try {
      await abortChat(currentId)
    } catch {
      // 实例侧中断失败也继续本地收尾
    }
    abortControllerRef.current?.abort()
    flushStreamToMessage()
    setStreaming(null)
    setStatus('idle')
  }, [currentId, flushStreamToMessage])

  // 权限审批：回复 opencode（permission.replied 事件会同步撤销卡片，含其他标签页）
  const handleReplyPermission = useCallback(
    async (requestId, reply) => {
      if (currentId == null) return
      // 乐观撤销；失败则恢复并提示
      setPermissions((prev) => prev.filter((p) => p.request_id !== requestId))
      try {
        await replyPermission(currentId, requestId, reply)
      } catch (e) {
        setError(e.message)
        listPendingPermissions(currentId).then(setPermissions).catch(() => {})
      }
    },
    [currentId]
  )

  // 倒计时内取消本轮自动发送（loop 温和暂停）
  const handleCancelCountdown = useCallback(async () => {
    if (currentId == null) return
    setCountdown(null)
    try {
      await pauseLoop(currentId)
    } catch (e) {
      setError(e.message)
    }
  }, [currentId])

  const current = conversations.find((c) => c.id === currentId) || null

  return (
    <div className="app">
      <aside className="sidebar">
        <ConversationList
          conversations={conversations}
          currentId={currentId}
          onSelect={setCurrentId}
          onCreate={handleCreate}
          onDelete={handleDelete}
        />
      </aside>

      <main className="chat-area">
        <header className="chat-header">
          <div className="chat-title">
            {current ? current.title : '请选择或新建会话'}
            {loopStatus.active && (
              <span className="loop-badge">
                {loopStatus.mode === 'ai'
                  ? `Loop · 第 ${loopStatus.round ?? 0} 轮`
                  : `Loop · 剩余 ${loopStatus.remaining ?? 0}`}
              </span>
            )}
          </div>
          <div className="chat-header-actions">
            {current && (
              <>
                <select
                  className="model-select"
                  title="本会话使用的 agent"
                  value={current.agent || ''}
                  onChange={(e) => handleAgentChange(e.target.value)}
                >
                  <option value="">默认 agent</option>
                  {agents.map((a) => (
                    <option key={a.name} value={a.name} title={a.description}>
                      {a.name}
                    </option>
                  ))}
                </select>
                <select
                  className="model-select"
                  title="本会话使用的模型"
                  value={current.model || ''}
                  onChange={(e) => handleModelChange(e.target.value)}
                >
                  <option value="">默认模型</option>
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id}
                    </option>
                  ))}
                </select>
                <button onClick={() => setShowResources((v) => !v)}>资源</button>
                <button onClick={() => setShowLoop((v) => !v)}>Loop</button>
                <button onClick={() => setShowFiles((v) => !v)}>
                  {showFiles ? '隐藏文件' : '文件'}
                </button>
              </>
            )}
          </div>
        </header>

        {showResources && current && (
          <ResourcePanel
            conversationId={current.id}
            onClose={() => setShowResources(false)}
            onError={setError}
            onApplied={() =>
              // 资源变更后重新拉取该会话可用 agent（下拉同步）
              listConversationAgents(current.id).then(setAgents).catch(() => {})
            }
          />
        )}

        {showLoop && current && (
          <LoopPanel
            conversationId={current.id}
            loopStatus={loopStatus}
            countdown={countdown}
            onStatusChange={setLoopStatus}
            onClose={() => setShowLoop(false)}
            onError={setError}
          />
        )}

        {error && (
          <div className="error-bar" onClick={() => setError(null)}>
            {error}（点击关闭）
          </div>
        )}

        <PermissionRequests requests={permissions} onReply={handleReplyPermission} />

        {current ? (
          <ChatView
            messages={messages}
            streaming={streaming}
            status={status}
            recommendations={recommendations}
            todos={todos}
            countdown={countdown}
            loopActive={!!loopStatus.active}
            onSend={handleSend}
            onStop={handleStop}
            onCancelCountdown={handleCancelCountdown}
          />
        ) : (
          <div className="empty-state">在左侧新建一个会话开始聊天</div>
        )}
      </main>

      {showFiles && current && (
        <aside className="file-area">
          <FilePanel conversationId={current.id} onError={setError} />
        </aside>
      )}
    </div>
  )
}
