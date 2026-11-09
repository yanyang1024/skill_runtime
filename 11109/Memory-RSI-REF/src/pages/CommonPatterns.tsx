import { useState } from 'react'
import { Download, Eye, TrendingUp, UsersRound } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge, Button, PageHeader, Panel, PanelHeader, ProgressBar, Stat } from '@/components/app/Ui'
import { exportPatterns } from '@/lib/download'
import { useMemoryStore } from '@/store/MemoryStore'
import type { CommonPattern } from '@/types/memory'

export function CommonPatterns() {
  const { patterns } = useMemoryStore()
  const [selected, setSelected] = useState<CommonPattern | null>(null)
  const totalUsers = patterns.reduce((sum, item) => sum + item.users, 0)
  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader eyebrow="Manager / 共性治理" title="平台共性记忆与偏好" description="查看跨用户重复出现的记忆模式、形成原因与潜在冲突。共性洞察仅作为治理参考，不直接覆盖个人记忆。" actions={<Button variant="primary" onClick={() => exportPatterns(patterns)}><Download size={16} />导出共性报告</Button>} />
      <div className="mb-6 grid grid-cols-2 border-y border-[var(--line)] lg:grid-cols-4"><Stat label="活跃共性模式" value={patterns.length} note="经过去重与跨用户聚合" /><Stat label="覆盖用户" value="242" note="平台已授权记忆用户" /><Stat label="累计采纳关系" value={totalUsers} note="同一用户可命中多种模式" /><Stat label="待处理冲突" value={patterns.reduce((sum, item) => sum + item.conflicts, 0)} note="共性与个人偏好不一致" /></div>
      <Panel className="mb-6">
        <PanelHeader title="共性偏好覆盖率" description="近 14 天按确认中的用户记忆计算，演示数据。" action={<Badge tone="mint"><TrendingUp size={12} />整体上升</Badge>} />
        <div className="h-72 px-3 py-5 sm:px-5"><ResponsiveContainer width="100%" height="100%"><BarChart data={patterns} layout="vertical" margin={{ top: 0, right: 24, left: 20, bottom: 0 }}><CartesianGrid stroke="var(--line)" horizontal={false} /><XAxis type="number" domain={[0, 100]} tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={false} tickLine={false} unit="%" /><YAxis type="category" dataKey="title" width={130} tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} axisLine={false} tickLine={false} /><Tooltip cursor={{ fill: 'var(--surface-hover)' }} contentStyle={{ background: 'var(--surface-solid)', border: '1px solid var(--line-strong)', borderRadius: 8 }} /><Bar dataKey="adoption" name="覆盖率" fill="var(--accent)" radius={[0, 4, 4, 0]} barSize={18} isAnimationActive={false} /></BarChart></ResponsiveContainer></div>
      </Panel>
      <div className="space-y-4">{patterns.map((pattern, index) => <Panel key={pattern.id} className="p-5"><div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_220px_auto] lg:items-center"><div><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs text-[var(--accent)]">P{String(index + 1).padStart(2, '0')}</span><Badge tone={pattern.category === '内容偏好' ? 'amber' : pattern.category === '工具用法' ? 'cyan' : 'neutral'}>{pattern.category}</Badge>{pattern.conflicts > 3 && <Badge tone="red">{pattern.conflicts} 个冲突</Badge>}</div><h2 className="mt-3 text-lg font-semibold">{pattern.title}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">{pattern.reason}</p></div><div><div className="mb-2 flex items-center justify-between text-xs"><span className="inline-flex items-center gap-1 text-[var(--text-muted)]"><UsersRound size={13} />{pattern.users} 位用户</span><span className="font-mono text-[var(--text-primary)]">{pattern.adoption}%</span></div><ProgressBar value={pattern.adoption} tone={pattern.adoption > 60 ? 'mint' : 'amber'} /><p className="mt-2 font-mono text-xs text-[var(--mint)]">近 14 天 +{pattern.trend}%</p></div><Button className="lg:ml-2" onClick={() => setSelected(pattern)}><Eye size={16} />查看样本</Button></div></Panel>)}</div>
      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null) }}><DialogContent className="border-[var(--line-strong)] bg-[var(--surface-solid)] text-[var(--text-primary)]"><DialogHeader><DialogTitle>{selected?.title}</DialogTitle><DialogDescription className="text-[var(--text-secondary)]">共性样本已脱敏，仅用于判断模式是否具备治理价值。</DialogDescription></DialogHeader><div className="space-y-4"><div className="flex flex-wrap gap-2"><Badge tone="amber">{selected?.category}</Badge><Badge tone="mint">覆盖率 {selected?.adoption}%</Badge><Badge>{selected?.users} 位用户</Badge></div><pre className="whitespace-pre-wrap break-words rounded-lg border border-[var(--line)] bg-[var(--code)] p-4 font-mono text-sm leading-6">{selected?.sample}</pre><div><h3 className="text-sm font-medium">形成原因</h3><p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{selected?.reason}</p></div><p className="border-t border-[var(--line)] pt-4 text-xs leading-5 text-[var(--text-muted)]">如需推广为组织级模板，应在内网接入独立的审批与发布接口；本参考界面不自动写入任何用户记忆。</p></div></DialogContent></Dialog>
    </div>
  )
}
