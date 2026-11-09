import { useMemo, useState } from 'react'
import { diffLines } from 'diff'
import { Download, GitBranch, RotateCcw } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge, Button, EmptyState, PageHeader, Panel } from '@/components/app/Ui'
import { exportTrajectory } from '@/lib/download'
import { cn } from '@/lib/utils'
import { useMemoryStore } from '@/store/MemoryStore'

export function MemoryTimeline() {
  const { versions, files, rollbackMemory, busy } = useMemoryStore()
  const [selectedId, setSelectedId] = useState(versions[0]?.id ?? '')
  const [rollbackOpen, setRollbackOpen] = useState(false)
  const [note, setNote] = useState('')
  const selected = versions.find((version) => version.id === selectedId) ?? versions[0]
  const file = files.find((item) => item.id === selected?.fileId)
  const changes = useMemo(() => selected && file ? diffLines(selected.content, file.content) : [], [selected, file])
  const isCurrent = selected?.content === file?.content

  const confirmRollback = async () => {
    if (!selected || !note.trim()) return
    try { await rollbackMemory(selected.fileId, selected.id, note.trim()); setRollbackOpen(false); setNote('') } catch { /* 保留确认窗口 */ }
  }

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader eyebrow="Version Lineage / 版本治理" title="记忆版本轨迹" description="每次创建、推荐采纳、手动编辑和回滚都会追加版本。选择历史节点可对比当前内容并安全恢复。" actions={<><Button onClick={() => exportTrajectory(versions, 'md')}><Download size={16} />轨迹 Markdown</Button><Button variant="primary" onClick={() => exportTrajectory(versions, 'json')}><Download size={16} />轨迹 JSON</Button></>} />
      <div className="grid items-start gap-5 2xl:grid-cols-[minmax(0,0.75fr)_minmax(0,1.25fr)]">
        <Panel className="overflow-hidden">
          <div className="border-b border-[var(--line)] px-5 py-4"><h2 className="text-sm font-semibold">版本节点</h2><p className="mt-1 text-xs text-[var(--text-muted)]">共 {versions.length} 次可追溯变更</p></div>
          {versions.length ? <div className="relative divide-y divide-[var(--line)]">{versions.map((version) => {
            const versionFile = files.find((item) => item.id === version.fileId)
            return <button key={version.id} type="button" onClick={() => setSelectedId(version.id)} className={cn('relative block min-h-28 w-full cursor-pointer px-5 py-4 pl-14 text-left transition hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]', selected?.id === version.id && 'bg-[var(--accent-soft)]')}><span className="absolute left-5 top-5 flex size-7 items-center justify-center rounded-full border border-[var(--accent-dim)] bg-[var(--surface-raised)] font-mono text-xs text-[var(--accent)]">{version.version}</span><div className="flex flex-wrap items-center gap-2"><Badge tone={version.action === '推荐采纳' ? 'cyan' : version.action === '版本回滚' ? 'amber' : 'neutral'}>{version.action}</Badge><span className="font-mono text-xs text-[var(--text-muted)]">{version.createdAt}</span></div><h3 className="mt-2 text-sm font-medium">{version.note}</h3><p className="mt-1 truncate text-xs text-[var(--text-secondary)]">{versionFile?.title ?? version.fileId} · {version.author}</p></button>
          })}</div> : <div className="p-5"><EmptyState title="暂无版本记录" description="创建或编辑记忆后，版本轨迹会显示在这里。" /></div>}
        </Panel>
        {selected && <Panel className="overflow-hidden">
          <div className="flex flex-col gap-4 border-b border-[var(--line)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><GitBranch size={17} className="text-[var(--accent)]" /><h2 className="text-sm font-semibold">{file?.title} · v{selected.version}</h2>{isCurrent && <Badge tone="mint">当前内容</Badge>}</div><p className="mt-1 text-xs text-[var(--text-muted)]">对比历史版本与当前文档，红色为历史内容，绿色为当前新增。</p></div><Button variant="primary" disabled={isCurrent} onClick={() => setRollbackOpen(true)}><RotateCcw size={15} />恢复此版本</Button></div>
          <dl className="grid grid-cols-2 gap-4 border-b border-[var(--line)] px-5 py-4 text-xs sm:grid-cols-4"><div><dt className="text-[var(--text-muted)]">操作者</dt><dd className="mt-1">{selected.author}</dd></div><div><dt className="text-[var(--text-muted)]">动作</dt><dd className="mt-1">{selected.action}</dd></div><div><dt className="text-[var(--text-muted)]">文件 ID</dt><dd className="mt-1 break-all font-mono">{selected.fileId}</dd></div><div><dt className="text-[var(--text-muted)]">版本 ID</dt><dd className="mt-1 break-all font-mono">{selected.id}</dd></div></dl>
          <div className="max-h-[46rem] overflow-auto bg-[var(--code)] py-3 font-mono text-xs leading-6">
            {changes.map((change, index) => <pre key={`${index}-${change.value.slice(0, 12)}`} className={cn('whitespace-pre-wrap break-words border-l-2 px-4 py-1', change.added && 'border-[var(--mint)] bg-[var(--mint-soft)] text-[var(--mint)]', change.removed && 'border-[var(--danger)] bg-[var(--danger-soft)] text-[var(--danger)]', !change.added && !change.removed && 'border-transparent text-[var(--text-secondary)]')}>{change.added ? '+ ' : change.removed ? '- ' : '  '}{change.value}</pre>)}
          </div>
        </Panel>}
      </div>
      <Dialog open={rollbackOpen} onOpenChange={setRollbackOpen}>
        <DialogContent className="border-[var(--line-strong)] bg-[var(--surface-solid)] text-[var(--text-primary)]">
          <DialogHeader><DialogTitle>确认恢复到 v{selected?.version}？</DialogTitle><DialogDescription className="leading-6 text-[var(--text-secondary)]">不会删除现有历史。系统会复制该版本内容并生成一个新版本，同时记录你的恢复原因。</DialogDescription></DialogHeader>
          <label className="block text-sm">恢复原因（必填）<textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：新版输出结构不适合当前工作流" className="mt-2 min-h-28 w-full resize-y rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] p-3 text-sm leading-6 outline-none focus:border-[var(--accent)]" /></label>
          <DialogFooter><Button onClick={() => setRollbackOpen(false)}>取消</Button><Button variant="primary" disabled={!note.trim() || busy} onClick={() => void confirmRollback()}><RotateCcw size={16} />确认回滚</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
