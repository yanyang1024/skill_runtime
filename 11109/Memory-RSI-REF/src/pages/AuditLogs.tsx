import { useMemo, useState } from 'react'
import { Download, Search, ShieldCheck } from 'lucide-react'
import { Badge, Button, EmptyState, PageHeader, Panel, Stat } from '@/components/app/Ui'
import { exportLogs } from '@/lib/download'
import { useMemoryStore } from '@/store/MemoryStore'

export function AuditLogs() {
  const { logs } = useMemoryStore()
  const [query, setQuery] = useState('')
  const [result, setResult] = useState('全部结果')
  const filtered = useMemo(() => logs.filter((log) => {
    const keyword = query.trim().toLowerCase()
    return (result === '全部结果' || log.result === result) && (!keyword || `${log.actor}${log.action}${log.target}${log.detail}`.toLowerCase().includes(keyword))
  }), [logs, query, result])
  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader eyebrow="Audit / 操作留痕" title="记忆治理审计日志" description="检索推荐、编辑、回滚与管理者迭代的完整留痕。导出文件可用于内网审计系统的字段映射。" actions={<Button variant="primary" onClick={() => exportLogs(filtered)}><Download size={16} />导出审计 JSON</Button>} />
      <div className="mb-6 grid grid-cols-3 border-y border-[var(--line)]"><Stat label="当前事件" value={logs.length} note="本地演示快照" /><Stat label="成功" value={logs.filter((log) => log.result === '成功').length} note="已完成写入或导出" /><Stat label="待复核" value={logs.filter((log) => log.result === '待复核').length} note="推荐或冲突待处理" /></div>
      <div className="mb-5 flex flex-col gap-3 border-y border-[var(--line)] py-4 md:flex-row"><label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] px-3 focus-within:ring-2 focus-within:ring-[var(--accent)]"><Search size={16} className="text-[var(--text-muted)]" /><span className="sr-only">搜索审计日志</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索操作者、对象、动作或详情…" className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none" /></label><div className="flex gap-2 overflow-x-auto">{['全部结果', '成功', '待复核', '已忽略'].map((item) => <Button key={item} size="small" variant={result === item ? 'primary' : 'secondary'} className="shrink-0" onClick={() => setResult(item)}>{item}</Button>)}</div></div>
      <Panel className="overflow-hidden">
        {filtered.length ? <div className="divide-y divide-[var(--line)]">{filtered.map((log) => <div key={log.id} className="grid gap-3 px-5 py-4 lg:grid-cols-[170px_130px_1fr_auto] lg:items-start"><div className="font-mono text-xs leading-5 text-[var(--text-muted)]">{log.time}</div><div><div className="text-sm">{log.actor}</div><div className="mt-1 text-xs text-[var(--text-secondary)]">{log.action}</div></div><div><div className="break-all font-mono text-xs text-[var(--cyan)]">{log.target}</div><p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{log.detail}</p></div><Badge tone={log.result === '成功' ? 'mint' : log.result === '待复核' ? 'amber' : 'neutral'}>{log.result === '成功' && <ShieldCheck size={12} />}{log.result}</Badge></div>)}</div> : <div className="p-5"><EmptyState title="没有匹配日志" description="调整关键词或结果状态后再试。" action={<Button onClick={() => { setQuery(''); setResult('全部结果') }}>清除筛选</Button>} /></div>}
      </Panel>
    </div>
  )
}
