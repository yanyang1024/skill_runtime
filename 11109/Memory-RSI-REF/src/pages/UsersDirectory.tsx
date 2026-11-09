import { useMemo, useState } from 'react'
import { Download, Eye, Search, UserRound } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge, Button, EmptyState, PageHeader, Panel, Stat } from '@/components/app/Ui'
import { exportUsers } from '@/lib/download'
import { useMemoryStore } from '@/store/MemoryStore'
import type { UserMemory } from '@/types/memory'

export function UsersDirectory() {
  const { users } = useMemoryStore()
  const [query, setQuery] = useState('')
  const [department, setDepartment] = useState('全部部门')
  const [selected, setSelected] = useState<UserMemory | null>(null)
  const departments = ['全部部门', ...Array.from(new Set(users.map((user) => user.department)))]
  const filtered = useMemo(() => users.filter((user) => {
    const keyword = query.trim().toLowerCase()
    return (department === '全部部门' || user.department === department) && (!keyword || `${user.id}${user.name}${user.role}`.toLowerCase().includes(keyword))
  }), [users, query, department])
  const average = users.length ? Math.round(users.reduce((sum, user) => sum + user.health, 0) / users.length) : 0
  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader eyebrow="Administrator / 用户目录" title="所有人的记忆库" description="按用户、部门与角色检索记忆库，查看个人健康度、共性偏好与当前长期记忆内容。" actions={<Button variant="primary" onClick={() => exportUsers(filtered)}><Download size={16} />导出用户清单</Button>} />
      <div className="mb-6 grid grid-cols-2 border-y border-[var(--line)] lg:grid-cols-4"><Stat label="平台授权用户" value="242" note="当前展示 6 个演示用户" /><Stat label="记忆条目" value="8,426" note="全平台 Mock 聚合指标" trend="+12%" /><Stat label="平均健康度" value={`${average}%`} note="按当前演示用户计算" /><Stat label="待治理用户" value={users.filter((user) => user.health < 75).length} note="健康度低于 75%" /></div>
      <div className="mb-5 flex flex-col gap-3 border-y border-[var(--line)] py-4 md:flex-row"><label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] px-3 focus-within:ring-2 focus-within:ring-[var(--accent)]"><Search size={16} className="text-[var(--text-muted)]" /><span className="sr-only">搜索用户</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索用户 ID、姓名或角色…" className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none" /></label><label className="flex min-h-11 items-center gap-2 rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-xs text-[var(--text-secondary)]">部门<select value={department} onChange={(event) => setDepartment(event.target.value)} className="h-11 flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none md:w-48">{departments.map((item) => <option key={item}>{item}</option>)}</select></label></div>
      <Panel className="overflow-hidden">
        <div className="hidden grid-cols-[1.1fr_1.2fr_0.7fr_0.6fr_0.8fr_auto] gap-4 border-b border-[var(--line)] px-5 py-3 font-mono text-xs uppercase tracking-wider text-[var(--text-muted)] md:grid"><span>用户</span><span>部门 / 角色</span><span>记忆数</span><span>健康度</span><span>最后活跃</span><span>操作</span></div>
        {filtered.length ? <div className="divide-y divide-[var(--line)]">{filtered.map((user) => <div key={user.id} className="grid gap-4 px-5 py-4 transition hover:bg-[var(--surface-hover)] md:grid-cols-[1.1fr_1.2fr_0.7fr_0.6fr_0.8fr_auto] md:items-center"><div className="flex items-center gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-[var(--line-strong)] bg-[var(--surface-raised)] text-[var(--accent)]"><UserRound size={17} /></span><div><div className="text-sm font-medium">{user.name}</div><div className="mt-0.5 font-mono text-xs text-[var(--text-muted)]">{user.id}</div></div></div><div className="text-xs text-[var(--text-secondary)]"><span className="block">{user.department}</span><span className="mt-1 block text-[var(--text-muted)]">{user.role}</span></div><div className="font-mono text-sm">{user.memoryCount}<span className="ml-1 text-xs text-[var(--text-muted)]">条</span></div><div><Badge tone={user.health >= 85 ? 'mint' : user.health >= 75 ? 'amber' : 'red'}>{user.health}%</Badge></div><div className="text-xs text-[var(--text-secondary)]">{user.lastActive}</div><Button size="small" onClick={() => setSelected(user)}><Eye size={15} />查看记忆</Button><div className="flex flex-wrap gap-2 md:col-span-6">{user.preferences.map((preference) => <Badge key={preference}>{preference}</Badge>)}</div></div>)}</div> : <div className="p-5"><EmptyState title="没有匹配用户" description="调整搜索词或部门筛选后再试。" action={<Button onClick={() => { setQuery(''); setDepartment('全部部门') }}>清除筛选</Button>} /></div>}
      </Panel>
      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null) }}><DialogContent className="max-w-2xl border-[var(--line-strong)] bg-[var(--surface-solid)] text-[var(--text-primary)] sm:max-w-2xl"><DialogHeader><DialogTitle>{selected?.name}的记忆库</DialogTitle><DialogDescription className="text-[var(--text-secondary)]">{selected?.id} · {selected?.department} · 当前 v{selected?.memoryVersion}</DialogDescription></DialogHeader><div className="flex flex-wrap gap-2">{selected?.preferences.map((preference) => <Badge key={preference} tone="amber">{preference}</Badge>)}</div><pre className="max-h-[50dvh] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-[var(--line)] bg-[var(--code)] p-4 font-mono text-sm leading-7">{selected?.memoryContent}</pre><p className="text-xs leading-5 text-[var(--text-muted)]">管理员当前为只读演示；需要修改时，请切换管理者视角并使用“指定用户迭代”。</p></DialogContent></Dialog>
    </div>
  )
}
