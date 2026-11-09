import { useEffect, useMemo, useState } from 'react'
import { diffLines } from 'diff'
import { AlertTriangle, Search, ShieldCheck, UserCog } from 'lucide-react'
import { Badge, Button, PageHeader, Panel, PanelHeader, Stat } from '@/components/app/Ui'
import { cn } from '@/lib/utils'
import { useMemoryStore } from '@/store/MemoryStore'

export function UserMemoryEditor() {
  const { users, updateUserMemory, busy } = useMemoryStore()
  const [query, setQuery] = useState('u_1132')
  const [selectedId, setSelectedId] = useState('u_1132')
  const [draft, setDraft] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [showDiff, setShowDiff] = useState(false)
  const user = users.find((item) => item.id === selectedId)
  const changes = useMemo(() => user ? diffLines(user.memoryContent, draft) : [], [user, draft])
  const changed = !!user && user.memoryContent !== draft

  useEffect(() => { setDraft(user?.memoryContent ?? ''); setNote(''); setShowDiff(false) }, [user?.id, user?.memoryVersion])

  const loadUser = () => {
    const target = users.find((item) => item.id === query.trim())
    if (!target) { setError('未找到该用户 ID。演示环境可尝试 u_1132、u_1219 或 u_1306。'); return }
    setError(''); setSelectedId(target.id)
  }

  const save = async () => {
    if (!user || !note.trim() || !draft.trim()) return
    try { await updateUserMemory(user.id, draft, note.trim()) } catch { /* 保留编辑现场 */ }
  }

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader eyebrow="Manager / 指定用户" title="手动迭代用户记忆" description="通过用户 ID 定位记忆库，查看当前版本并提交变更。所有管理者修改都需要原因，并进入全局审计。" />
      <Panel className="mb-6 p-5">
        <div className="flex flex-col gap-3 md:flex-row"><label className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] px-4 focus-within:ring-2 focus-within:ring-[var(--accent)]"><UserCog size={18} className="text-[var(--accent)]" /><span className="sr-only">输入用户 ID</span><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') loadUser() }} placeholder="输入用户 ID，例如 u_1132" className="h-12 min-w-0 flex-1 bg-transparent font-mono text-sm outline-none" /></label><Button variant="primary" onClick={loadUser}><Search size={16} />载入用户记忆</Button></div>
        {error && <p role="alert" className="mt-3 text-sm text-[var(--danger)]">{error}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-2"><span className="text-xs text-[var(--text-muted)]">快速示例：</span>{users.slice(2, 5).map((item) => <button key={item.id} type="button" onClick={() => { setQuery(item.id); setSelectedId(item.id); setError('') }} className="min-h-11 cursor-pointer rounded-lg border border-[var(--line)] px-3 font-mono text-xs text-[var(--text-secondary)] hover:border-[var(--accent-dim)] hover:text-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">{item.id} · {item.name}</button>)}</div>
      </Panel>
      {user && <>
        <div className="mb-6 grid grid-cols-2 border-y border-[var(--line)] lg:grid-cols-4"><Stat label="目标用户" value={user.name} note={`${user.id} · ${user.department}`} /><Stat label="记忆版本" value={`v${user.memoryVersion}`} note={`${user.memoryCount} 条记忆条目`} /><Stat label="健康度" value={`${user.health}%`} note="时效、来源与冲突综合评分" /><Stat label="最后活跃" value={user.lastActive} note={user.role} /></div>
        <Panel className="overflow-hidden">
          <PanelHeader title={`${user.name}的长期记忆文档`} description="管理者视角可编辑；真实环境应再次校验服务端权限。" action={<div className="flex flex-wrap gap-2"><Badge tone="mint"><ShieldCheck size={12} />已通过 Mock 权限</Badge><Button variant={showDiff ? 'primary' : 'secondary'} size="small" onClick={() => setShowDiff((value) => !value)}>{showDiff ? '返回编辑' : '预览差异'}</Button></div>} />
          <div className="border-b border-[var(--line)] px-5 py-3"><div className="flex flex-wrap gap-2">{user.preferences.map((preference) => <Badge key={preference} tone="amber">{preference}</Badge>)}</div></div>
          {showDiff ? <div className="max-h-[36rem] min-h-80 overflow-auto bg-[var(--code)] py-3 font-mono text-xs leading-6">{changes.map((change, index) => <pre key={index} className={cn('whitespace-pre-wrap break-words border-l-2 px-4 py-1', change.added && 'border-[var(--mint)] bg-[var(--mint-soft)] text-[var(--mint)]', change.removed && 'border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)]', !change.added && !change.removed && 'border-transparent text-[var(--text-secondary)]')}>{change.added ? '+ ' : change.removed ? '- ' : '  '}{change.value}</pre>)}</div> : <textarea aria-label={`编辑 ${user.name} 的记忆`} value={draft} onChange={(event) => setDraft(event.target.value)} className="min-h-96 w-full resize-y bg-[var(--code)] p-5 font-mono text-sm leading-7 text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--accent)]" spellCheck={false} />}
          <div className="border-t border-[var(--line)] p-5"><div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end"><label className="text-xs font-medium text-[var(--text-secondary)]">迭代原因（必填，进入审计日志）<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：根据部门规范统一数据来源标注" className="mt-2 h-11 w-full rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-sm outline-none focus:border-[var(--accent)]" /></label><Button variant="primary" disabled={busy || !changed || !note.trim() || !draft.trim()} onClick={() => void save()}>提交新版本</Button></div><div className="mt-4 flex gap-2 text-xs leading-5 text-[var(--text-muted)]"><AlertTriangle size={15} className="mt-0.5 shrink-0 text-[var(--accent)]" /><p>{!changed ? '修改内容后才能提交。' : '提交后会生成新版本并通知目标用户；当前 Mock 仅模拟界面与数据流。'}</p></div></div>
        </Panel>
      </>}
    </div>
  )
}
