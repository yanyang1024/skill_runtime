import { useMemo, useState } from 'react'
import { Check, CheckCheck, ChevronDown, Pencil, ShieldQuestion, X } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge, Button, EmptyState, PageHeader, Panel, ProgressBar } from '@/components/app/Ui'
import { useMemoryStore } from '@/store/MemoryStore'
import type { Recommendation } from '@/types/memory'

export function Recommendations() {
  const { recommendations, files, resolveRecommendation, openMemory, busy } = useMemoryStore()
  const [tab, setTab] = useState<'pending' | 'accepted' | 'dismissed'>('pending')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<Recommendation | null>(null)
  const [draft, setDraft] = useState('')
  const visible = useMemo(() => recommendations.filter((item) => item.status === tab), [recommendations, tab])
  const pending = recommendations.filter((item) => item.status === 'pending')

  const resolve = async (id: string, status: 'accepted' | 'dismissed', content?: string) => {
    try { await resolveRecommendation(id, status, content); setSelected((old) => { const next = new Set(old); next.delete(id); return next }) } catch { /* 保留当前选择 */ }
  }
  const acceptSelected = async () => {
    for (const id of selected) {
      try { await resolveRecommendation(id, 'accepted') } catch { break }
    }
    setSelected(new Set())
  }
  const openEdit = (item: Recommendation) => { setEditing(item); setDraft(item.suggestedContent) }

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader eyebrow="Human in the Loop / 推荐确认" title="记忆推荐队列" description="RSI 从近期文件与使用轨迹中发现候选偏好。每条推荐都可查看证据、编辑后采纳或忽略，不会自动修改记忆。" actions={<Button variant="primary" disabled={!selected.size || busy} onClick={() => void acceptSelected()}><CheckCheck size={16} />采纳所选{selected.size ? `（${selected.size}）` : ''}</Button>} />
      <div className="mb-5 grid gap-4 border-y border-[var(--line)] py-5 sm:grid-cols-3">
        <div><div className="font-mono text-2xl text-[var(--accent)]">{pending.length}</div><p className="mt-1 text-xs text-[var(--text-secondary)]">等待人工确认</p></div>
        <div><div className="font-mono text-2xl">{recommendations.filter((item) => item.status === 'accepted').length}</div><p className="mt-1 text-xs text-[var(--text-secondary)]">已采纳并形成新版本</p></div>
        <div><div className="font-mono text-2xl">{recommendations.filter((item) => item.status === 'dismissed').length}</div><p className="mt-1 text-xs text-[var(--text-secondary)]">已忽略，不进入记忆</p></div>
      </div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2 overflow-x-auto" role="tablist" aria-label="推荐状态">
          {([['pending', '待确认'], ['accepted', '已采纳'], ['dismissed', '已忽略']] as const).map(([value, label]) => <Button key={value} role="tab" aria-selected={tab === value} variant={tab === value ? 'primary' : 'secondary'} className="shrink-0" onClick={() => { setTab(value); setSelected(new Set()) }}>{label}<span className="font-mono text-xs opacity-70">{recommendations.filter((item) => item.status === value).length}</span></Button>)}
        </div>
        {tab === 'pending' && <Button variant="ghost" size="small" onClick={() => setSelected(selected.size === pending.length ? new Set() : new Set(pending.map((item) => item.id)))}>{selected.size === pending.length && pending.length ? '取消全选' : '选择全部待确认'}</Button>}
      </div>
      {visible.length ? <div className="space-y-4">{visible.map((item) => {
        const target = files.find((file) => file.id === item.targetFileId)
        const checked = selected.has(item.id)
        return (
          <Panel key={item.id} className="overflow-hidden">
            <div className="flex flex-col gap-4 p-5 lg:flex-row">
              {tab === 'pending' && <label className="flex min-h-11 shrink-0 cursor-pointer items-center gap-2 text-xs text-[var(--text-secondary)]"><input type="checkbox" checked={checked} onChange={() => setSelected((old) => { const next = new Set(old); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next })} className="size-5 accent-[var(--accent)]" />选择</label>}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><Badge tone={item.kind === '偏好沉淀' ? 'amber' : item.kind === '用法学习' ? 'cyan' : 'mint'}>{item.kind}</Badge><span className="font-mono text-xs text-[var(--text-muted)]">{item.id} · {item.createdAt}</span>{item.status === 'accepted' && <Badge tone="mint">已写入</Badge>}{item.status === 'dismissed' && <Badge>已忽略</Badge>}</div>
                <h2 className="mt-3 text-lg font-semibold tracking-[-0.02em]">{item.title}</h2>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">{item.reason}</p>
                <div className="mt-4 grid gap-4 border-y border-[var(--line)] py-4 sm:grid-cols-[160px_1fr]"><div><div className="mb-2 flex justify-between text-xs"><span className="text-[var(--text-muted)]">推荐置信度</span><span className="font-mono text-[var(--accent)]">{item.confidence}%</span></div><ProgressBar value={item.confidence} tone={item.confidence >= 85 ? 'mint' : 'amber'} /><p className="mt-2 text-xs text-[var(--text-muted)]">{item.sourceEvents} 个来源事件</p></div><div className="text-xs leading-5 text-[var(--text-secondary)]">拟写入：<button type="button" className="min-h-11 cursor-pointer break-all text-left font-mono text-[var(--cyan)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]" onClick={() => target && openMemory(target.id)}>{target?.fileName ?? item.targetFileId}</button></div></div>
                <pre className="mt-4 overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-[var(--line)] bg-[var(--code)] p-4 font-mono text-xs leading-6 text-[var(--text-primary)]">{item.suggestedContent}</pre>
                <details className="group mt-3"><summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-xs text-[var(--text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"><ShieldQuestion size={15} />查看推荐依据（{item.evidence.length}）<ChevronDown size={14} className="transition group-open:rotate-180" /></summary><ul className="ml-1 space-y-2 border-l border-[var(--line-strong)] py-2 pl-4">{item.evidence.map((evidence) => <li key={evidence} className="text-xs leading-5 text-[var(--text-secondary)]">{evidence}</li>)}</ul></details>
              </div>
              {tab === 'pending' && <div className="flex shrink-0 flex-wrap gap-2 lg:w-32 lg:flex-col"><Button variant="primary" disabled={busy} onClick={() => void resolve(item.id, 'accepted')}><Check size={16} />采纳</Button><Button disabled={busy} onClick={() => openEdit(item)}><Pencil size={15} />编辑采纳</Button><Button variant="ghost" disabled={busy} onClick={() => void resolve(item.id, 'dismissed')}><X size={16} />忽略</Button></div>}
            </div>
          </Panel>
        )
      })}</div> : <EmptyState title={tab === 'pending' ? '推荐队列已清空' : `暂无${tab === 'accepted' ? '已采纳' : '已忽略'}推荐`} description={tab === 'pending' ? '新的使用轨迹产生候选偏好后，会出现在这里等待你确认。' : '切换其他状态查看推荐记录。'} action={tab !== 'pending' ? <Button onClick={() => setTab('pending')}>返回待确认队列</Button> : undefined} />}
      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null) }}>
        <DialogContent className="max-w-2xl border-[var(--line-strong)] bg-[var(--surface-solid)] text-[var(--text-primary)] sm:max-w-2xl">
          <DialogHeader><DialogTitle>编辑后采纳</DialogTitle><DialogDescription className="text-[var(--text-secondary)]">你正在修改“{editing?.title}”。采纳后会追加到目标文档并创建新版本。</DialogDescription></DialogHeader>
          <label className="block text-sm">写入内容<textarea value={draft} onChange={(event) => setDraft(event.target.value)} className="mt-2 min-h-56 w-full resize-y rounded-lg border border-[var(--line-strong)] bg-[var(--code)] p-4 font-mono text-sm leading-6 outline-none focus:border-[var(--accent)]" /></label>
          <DialogFooter><Button onClick={() => setEditing(null)}>取消</Button><Button variant="primary" disabled={busy || !draft.trim()} onClick={() => { if (editing) void resolve(editing.id, 'accepted', draft).then(() => setEditing(null)) }}><Check size={16} />确认写入记忆</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
