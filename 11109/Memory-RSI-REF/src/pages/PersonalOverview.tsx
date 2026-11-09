import { ArrowRight, CheckCircle2, Download, FileText, GitBranch, ShieldCheck, Sparkles } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { MemoryGraph } from '@/components/app/MemoryGraph'
import { Badge, Button, PageHeader, Panel, PanelHeader, ProgressBar, Stat } from '@/components/app/Ui'
import { exportAllMemories } from '@/lib/download'
import { useMemoryStore } from '@/store/MemoryStore'

const activity = [
  { day: '11/02', calls: 12, accepted: 2 }, { day: '11/03', calls: 18, accepted: 1 },
  { day: '11/04', calls: 16, accepted: 3 }, { day: '11/05', calls: 26, accepted: 2 },
  { day: '11/06', calls: 22, accepted: 1 }, { day: '11/07', calls: 31, accepted: 4 },
  { day: '11/08', calls: 28, accepted: 3 },
]

export function PersonalOverview() {
  const { files, versions, recommendations, users, navigate, openMemory } = useMemoryStore()
  const pending = recommendations.filter((item) => item.status === 'pending')
  const me = users.find((user) => user.id === 'u_1027')
  return (
    <div className="mx-auto max-w-[1400px]">
      <div className="mission-band mb-7">
        <div className="relative z-10 flex h-full flex-col justify-between p-5 sm:p-7">
          <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-[var(--accent)]"><span className="status-dot" />SSO 已识别 · u_1027</div>
          <div><p className="max-w-xl text-2xl font-semibold tracking-[-0.04em] text-[var(--text-primary)] sm:text-3xl">让每一次确认，都成为可追溯的记忆。</p><p className="mt-2 max-w-xl text-sm leading-6 text-[var(--text-secondary)]">你的文件、偏好与 Skill 使用轨迹在此汇合。推荐只有经过你的确认，才会进入长期记忆。</p></div>
        </div>
      </div>
      <PageHeader eyebrow="Personal Memory / 个人面板" title="我的记忆治理总览" description="查看个人记忆库的结构与健康度，处理推荐，并追踪每一次内容变化。" actions={<><Button onClick={() => exportAllMemories(files)}><Download size={16} />导出记忆 Markdown</Button><Button variant="primary" onClick={() => navigate('recommendations')}>处理 {pending.length} 条推荐<ArrowRight size={16} /></Button></>} />
      <div className="mb-6 grid grid-cols-2 border-y border-[var(--line)] lg:grid-cols-4">
        <Stat label="记忆条目" value={me?.memoryCount ?? files.length} note={`${files.length} 份核心文档正在治理`} trend="+3 本周" />
        <Stat label="记忆健康度" value={`${me?.health ?? 86}%`} note="来源、时效与冲突综合评分" />
        <Stat label="待确认推荐" value={pending.length} note="不会自动写入长期记忆" />
        <Stat label="近 7 天调用" value="153" note="偏好与 Skill 文件总调用次数" trend="+18%" />
      </div>
      <div className="grid gap-6 2xl:grid-cols-[1.15fr_0.85fr]">
        <Panel>
          <PanelHeader title="个人记忆库长什么样" description="节点数字代表近期调用次数；选择节点可进入对应文档。" action={<Button variant="ghost" size="small" onClick={() => navigate('memories')}>查看全部<ArrowRight size={14} /></Button>} />
          <MemoryGraph />
        </Panel>
        <Panel>
          <PanelHeader title="推荐确认队列" description="按证据强度排序，采纳前可编辑内容。" action={<Badge tone="amber">{pending.length} 待处理</Badge>} />
          <div className="divide-y divide-[var(--line)]">
            {pending.slice(0, 4).map((item) => (
              <button key={item.id} type="button" onClick={() => navigate('recommendations')} className="group block min-h-24 w-full cursor-pointer px-5 py-4 text-left transition hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)]">
                <div className="flex items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><Badge tone={item.confidence >= 85 ? 'mint' : 'neutral'}>{item.kind}</Badge><span className="font-mono text-xs text-[var(--text-muted)]">{item.confidence}% 置信度</span></div><h3 className="mt-2 text-sm font-medium leading-6 group-hover:text-[var(--accent)]">{item.title}</h3></div><ArrowRight size={16} className="mt-2 shrink-0 text-[var(--text-muted)]" /></div>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--text-secondary)]">{item.reason}</p>
              </button>
            ))}
          </div>
        </Panel>
      </div>
      <div className="mt-6 grid gap-6 2xl:grid-cols-[1.15fr_0.85fr]">
        <Panel>
          <PanelHeader title="记忆使用与采纳趋势" description="近 7 天个人记忆调用和推荐采纳次数。" action={<Badge tone="cyan">近 7 天</Badge>} />
          <div className="h-64 px-3 py-5 sm:px-5">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={activity} margin={{ top: 8, right: 12, left: -22, bottom: 0 }}>
                <defs><linearGradient id="calls" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} /><stop offset="100%" stopColor="var(--accent)" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid stroke="var(--line)" vertical={false} /><XAxis dataKey="day" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: 'var(--surface-solid)', border: '1px solid var(--line-strong)', borderRadius: 8, color: 'var(--text-primary)' }} />
                <Area type="monotone" dataKey="calls" name="记忆调用" stroke="var(--accent)" strokeWidth={2} fill="url(#calls)" isAnimationActive={false} /><Area type="monotone" dataKey="accepted" name="推荐采纳" stroke="var(--cyan)" strokeWidth={1.5} fill="transparent" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="最近版本轨迹" description="每次变更都保留作者、原因和完整内容。" action={<Button variant="ghost" size="small" onClick={() => navigate('timeline')}>完整轨迹<ArrowRight size={14} /></Button>} />
          <div className="divide-y divide-[var(--line)]">
            {versions.slice(0, 5).map((version) => {
              const file = files.find((item) => item.id === version.fileId)
              return <button key={version.id} type="button" onClick={() => openMemory(version.fileId)} className="flex min-h-16 w-full cursor-pointer items-center gap-3 px-5 py-3 text-left transition hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"><span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-[var(--line-strong)] font-mono text-xs text-[var(--accent)]">v{version.version}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm">{version.note}</span><span className="mt-1 block text-xs text-[var(--text-muted)]">{file?.title ?? version.fileId} · {version.author}</span></span><GitBranch size={15} className="shrink-0 text-[var(--text-muted)]" /></button>
            })}
          </div>
        </Panel>
      </div>
      <Panel className="mt-6">
        <PanelHeader title="治理原则" description="当前前端参考实现默认采用以下约束。" />
        <div className="grid gap-5 px-5 py-5 md:grid-cols-3">
          <div className="flex gap-3"><Sparkles size={18} className="shrink-0 text-[var(--accent)]" /><div><h3 className="text-sm font-medium">推荐不自动生效</h3><p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">每条推荐展示证据和置信度，由用户手动确认。</p></div></div>
          <div className="flex gap-3"><ShieldCheck size={18} className="shrink-0 text-[var(--mint)]" /><div><h3 className="text-sm font-medium">完整版本留痕</h3><p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">编辑、采纳与管理者迭代均追加新版本，不覆盖历史。</p></div></div>
          <div className="flex gap-3"><CheckCircle2 size={18} className="shrink-0 text-[var(--cyan)]" /><div><h3 className="text-sm font-medium">记忆随时可带走</h3><p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">核心文档导出为 Markdown，轨迹支持 JSON 与 Markdown。</p></div></div>
        </div>
        <div className="border-t border-[var(--line)] px-5 py-4"><div className="mb-2 flex items-center justify-between text-xs"><span className="inline-flex items-center gap-2"><FileText size={14} />核心文档治理覆盖</span><span className="font-mono text-[var(--mint)]">86%</span></div><ProgressBar value={86} tone="mint" /></div>
      </Panel>
    </div>
  )
}
