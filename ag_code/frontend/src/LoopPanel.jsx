import { useState } from 'react'
import { startLoop, stopLoop } from '../api.js'

export default function LoopPanel({ conversationId, loopStatus, countdown, onStatusChange, onClose, onError }) {
  const [mode, setMode] = useState('ai') // 'ai' | 'queue'
  const [goal, setGoal] = useState('')
  const [maxRounds, setMaxRounds] = useState(10)
  const [text, setText] = useState('')

  const start = async () => {
    try {
      let options
      if (mode === 'queue') {
        const prompts = text.split('\n').map((s) => s.trim()).filter(Boolean)
        if (prompts.length === 0) return onError('队列模式：请至少输入一行 prompt')
        options = { mode: 'queue', prompts }
      } else {
        options = { mode: 'ai', goal: goal.trim(), max_rounds: maxRounds }
      }
      const res = await startLoop(conversationId, options)
      if (!res.active) return onError(res.reason || 'loop 启动失败')
      onStatusChange({ active: true, mode, round: 0, remaining: options.prompts?.length })
      setText('')
    } catch (e) {
      onError(e.message)
    }
  }

  const stop = async () => {
    try {
      await stopLoop(conversationId)
      onStatusChange({ active: false })
    } catch (e) {
      onError(e.message)
    }
  }

  const statusText = () => {
    if (!loopStatus.active) return loopStatus.reason ? `已停止：${loopStatus.reason}` : '未运行'
    if (loopStatus.mode === 'ai') return `AI 推进中 · 第 ${loopStatus.round ?? 0} 轮`
    return `队列播放中 · 剩余 ${loopStatus.remaining ?? 0}`
  }

  return (
    <div className="loop-panel">
      <div className="loop-panel-header">
        <span>
          Loop 自动推进
          <span className={`loop-status ${loopStatus.active ? 'active' : ''}`}>{statusText()}</span>
        </span>
        <button onClick={onClose}>✕</button>
      </div>

      {!loopStatus.active && (
        <>
          <div className="loop-mode-tabs">
            <button className={mode === 'ai' ? 'active' : ''} onClick={() => setMode('ai')}>
              AI 自动推进
            </button>
            <button className={mode === 'queue' ? 'active' : ''} onClick={() => setMode('queue')}>
              队列播放
            </button>
          </div>
          {mode === 'ai' ? (
            <div className="loop-ai-form">
              <input
                type="text"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="目标（可空，AI 会从对话上下文推断），例如：把这个项目跑通并通过测试"
              />
              <label className="loop-rounds">
                最大轮数
                <input
                  type="text"
                  value={maxRounds}
                  onChange={(e) => setMaxRounds(parseInt(e.target.value) || 10)}
                />
              </label>
            </div>
          ) : (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={'每行一条 prompt，将依次自动发送'}
              rows={4}
            />
          )}
        </>
      )}

      <div className="loop-actions">
        {!loopStatus.active && <button onClick={start}>开始 loop</button>}
        {loopStatus.active && <button onClick={stop}>停止 loop</button>}
      </div>
    </div>
  )
}
