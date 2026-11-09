import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Download, FilePlus2, FileText, Pencil, Save, Search, X } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge, Button, EmptyState, PageHeader, Panel } from '@/components/app/Ui'
import { exportAllMemories, exportMemory } from '@/lib/download'
import { cn } from '@/lib/utils'
import { useMemoryStore } from '@/store/MemoryStore'
import type { MemoryType } from '@/types/memory'

const typeLabels: Record<MemoryType, string> = { skill: 'Skill 生成', document: '其他文件', preference: '个人偏好' }

export function MemoryLibrary() {
  const { files, versions, selectedFileId, selectFile, saveMemory, createMemory, busy } = useMemoryStore()
  const [query, setQuery] = useState('')
  const [type, setType] = useState<'all' | MemoryType>('all')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [note, setNote] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newType, setNewType] = useState<MemoryType>('document')
  const [newContent, setNewContent] = useState('# 新记忆\n\n')
  const [formError, setFormError] = useState('')

  const filtered = useMemo(() => files.filter((file) => {
    const matchesType = type === 'all' || file.type === type
    const keyword = query.trim().toLowerCase()
    return matchesType && (!keyword || `${file.title}${file.fileName}${file.tags.join('')}`.toLowerCase().includes(keyword))
  }), [files, query, type])
  const selected = files.find((file) => file.id === selectedFileId) ?? filtered[0] ?? files[0]

  useEffect(() => {
    setDraft(selected?.content ?? '')
    setEditing(false)
    setNote('')
  }, [selected?.id, selected?.content])

  const submitCreate = async (event: FormEvent) => {
    event.preventDefault()
    if (!newTitle.trim() || !newContent.trim()) { setFormError('请填写记忆标题和内容。'); return }
    try {
      await createMemory({ title: newTitle.trim(), type: newType, content: newContent })
      setCreateOpen(false); setNewTitle(''); setNewContent('# 新记忆\n\n'); setFormError('')
    } catch { /* 错误提示由数据层统一处理 */ }
  }

  const submitSave = async () => {
    if (!draft.trim() || !note.trim()) return
    if (!selected) return
    try { await saveMemory(selected.id, draft, note.trim()); setEditing(false); setNote('') } catch { /* 保留编辑现场 */ }
  }

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader eyebrow="Memory Files / 记忆库" title="我的记忆文件" description="统一管理 Skill 生成文件、个人偏好与其他文档；编辑后自动生成可回滚的新版本。" actions={<><Button onClick={() => exportAllMemories(files)}><Download size={16} />导出全部</Button><Button variant="primary" onClick={() => setCreateOpen(true)}><FilePlus2 size={16} />新建记忆</Button></>} />
      <div className="mb-5 flex flex-col gap-3 border-y border-[var(--line)] py-4 md:flex-row md:items-center">
        <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] px-3 focus-within:ring-2 focus-within:ring-[var(--accent)]"><Search size={16} className="shrink-0 text-[var(--text-muted)]" /><span className="sr-only">搜索记忆文件</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、文件名或标签…" className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--text-muted)]" /></label>
        <div className="flex gap-2 overflow-x-auto pb-1 md:pb-0" role="group" aria-label="按文件类型筛选">
          {([['all', '全部'], ['skill', 'Skill 文件'], ['preference', '个人偏好'], ['document', '其他文件']] as const).map(([value, label]) => <Button key={value} size="small" variant={type === value ? 'primary' : 'secondary'} className="shrink-0" onClick={() => setType(value)}>{label}</Button>)}
        </div>
      </div>
      <div className="grid items-start gap-5 2xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <Panel className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3"><span className="font-mono text-xs text-[var(--text-muted)]">{filtered.length} 份文档</span><span className="text-xs text-[var(--text-muted)]">按更新时间排序</span></div>
          {filtered.length ? <div className="divide-y divide-[var(--line)]">{filtered.map((file) => (
            <button key={file.id} type="button" onClick={() => selectFile(file.id)} className={cn('block min-h-32 w-full cursor-pointer px-4 py-4 text-left transition hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]', selected?.id === file.id && 'bg-[var(--accent-soft)]')}>
              <div className="flex items-start gap-3"><FileText size={18} className={cn('mt-0.5 shrink-0', file.type === 'skill' ? 'text-[var(--cyan)]' : file.type === 'preference' ? 'text-[var(--accent)]' : 'text-[var(--mint)]')} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-medium">{file.title}</h2>{file.status !== 'active' && <Badge tone={file.status === 'conflict' ? 'red' : 'amber'}>{file.status === 'conflict' ? '有冲突' : '待复核'}</Badge>}</div><p className="mt-1 break-all font-mono text-xs text-[var(--text-muted)]">{file.fileName}</p><p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--text-secondary)]">{file.summary}</p><div className="mt-3 flex flex-wrap items-center gap-2"><Badge tone={file.type === 'skill' ? 'cyan' : file.type === 'preference' ? 'amber' : 'mint'}>{typeLabels[file.type]}</Badge><span className="text-xs text-[var(--text-muted)]">调用 {file.usageCount} 次 · {file.lastUsedAt}</span></div></div></div>
            </button>
          ))}</div> : <div className="p-4"><EmptyState title="没有匹配的记忆" description="调整搜索关键词或文件类型后再试。" action={<Button onClick={() => { setQuery(''); setType('all') }}>清除筛选</Button>} /></div>}
        </Panel>
        {selected && <Panel className="overflow-hidden">
          <div className="border-b border-[var(--line)] px-5 py-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge tone={selected.type === 'skill' ? 'cyan' : 'amber'}>{typeLabels[selected.type]}</Badge><span className="font-mono text-xs text-[var(--text-muted)]">{selected.size}</span></div><h2 className="mt-2 break-words text-lg font-semibold">{selected.title}</h2><p className="mt-1 break-all font-mono text-xs text-[var(--text-muted)]">{selected.fileName} · {selected.updatedAt}</p></div><div className="flex shrink-0 flex-wrap gap-2"><Button size="small" onClick={() => exportMemory(selected)}><Download size={15} />导出</Button>{!editing ? <Button size="small" variant="primary" onClick={() => setEditing(true)}><Pencil size={15} />编辑</Button> : <Button size="small" onClick={() => { setEditing(false); setDraft(selected.content); setNote('') }}><X size={15} />取消</Button>}</div></div>
            <div className="mt-4 flex flex-wrap gap-2">{selected.tags.map((tag) => <Badge key={tag}>{tag}</Badge>)}</div>
          </div>
          <dl className="grid grid-cols-2 gap-4 border-b border-[var(--line)] px-5 py-4 text-xs sm:grid-cols-4"><div><dt className="text-[var(--text-muted)]">来源</dt><dd className="mt-1 text-[var(--text-primary)]">{selected.source}</dd></div><div><dt className="text-[var(--text-muted)]">调用次数</dt><dd className="mt-1 font-mono">{selected.usageCount}</dd></div><div><dt className="text-[var(--text-muted)]">版本数</dt><dd className="mt-1 font-mono">{versions.filter((item) => item.fileId === selected.id).length}</dd></div><div><dt className="text-[var(--text-muted)]">最近使用</dt><dd className="mt-1">{selected.lastUsedAt}</dd></div></dl>
          {editing ? <div className="p-5"><label className="text-xs font-medium text-[var(--text-secondary)]" htmlFor="memory-editor">Markdown 内容</label><textarea id="memory-editor" value={draft} onChange={(event) => setDraft(event.target.value)} className="code-editor mt-2 min-h-80 w-full resize-y rounded-lg border border-[var(--line-strong)] bg-[var(--code)] p-4 font-mono text-sm leading-6 text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]" spellCheck={false} /><div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"><label className="text-xs font-medium text-[var(--text-secondary)]">变更原因（必填）<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：统一研究报告的风险表达" className="mt-2 h-11 w-full rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-sm outline-none focus:border-[var(--accent)]" /></label><Button variant="primary" disabled={busy || !draft.trim() || !note.trim()} onClick={() => void submitSave()}><Save size={16} />{busy ? '保存中…' : '保存为新版本'}</Button></div>{(!draft.trim() || !note.trim()) && <p className="mt-2 text-xs text-[var(--text-muted)]">内容与变更原因均填写后才能保存，便于后续审计。</p>}</div> : <pre className="max-h-[42rem] min-h-96 overflow-auto whitespace-pre-wrap break-words bg-[var(--code)] p-5 font-mono text-sm leading-7 text-[var(--text-secondary)]">{selected.content}</pre>}
        </Panel>}
      </div>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl border-[var(--line-strong)] bg-[var(--surface-solid)] text-[var(--text-primary)] sm:max-w-2xl">
          <DialogHeader><DialogTitle>新建个人记忆</DialogTitle><DialogDescription className="text-[var(--text-secondary)]">创建后立即生成 v1 版本。真实接入时由当前 SSO 用户自动归属。</DialogDescription></DialogHeader>
          <form onSubmit={(event) => void submitCreate(event)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_180px]"><label className="text-sm">记忆标题<input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="例如：客户汇报偏好" className="mt-2 h-11 w-full rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] px-3 outline-none focus:border-[var(--accent)]" /></label><label className="text-sm">记忆类型<select value={newType} onChange={(event) => setNewType(event.target.value as MemoryType)} className="mt-2 h-11 w-full rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] px-3 outline-none focus:border-[var(--accent)]"><option value="document">其他文件</option><option value="preference">个人偏好</option><option value="skill">Skill 生成</option></select></label></div>
            <label className="block text-sm">Markdown 内容<textarea value={newContent} onChange={(event) => setNewContent(event.target.value)} className="mt-2 min-h-56 w-full resize-y rounded-lg border border-[var(--line-strong)] bg-[var(--code)] p-3 font-mono text-sm leading-6 outline-none focus:border-[var(--accent)]" /></label>
            {formError && <p role="alert" className="text-sm text-[var(--danger)]">{formError}</p>}
            <DialogFooter><Button onClick={() => setCreateOpen(false)}>取消</Button><Button type="submit" variant="primary" disabled={busy}><FilePlus2 size={16} />创建记忆</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
