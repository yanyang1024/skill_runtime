import { Download, Lightbulb, TriangleAlert } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge, Button, PageHeader, Panel, PanelHeader, ProgressBar, Stat } from '@/components/app/Ui'
import { exportPatterns } from '@/lib/download'
import { useMemoryStore } from '@/store/MemoryStore'

const distribution = [
  { name: '输出与表达偏好', value: 34, color: 'var(--accent)' },
  { name: 'Skill 生成文件', value: 29, color: 'var(--cyan)' },
  { name: '工作流程与模板', value: 23, color: 'var(--mint)' },
  { name: '样例与其他文档', value: 14, color: 'var(--text-muted)' },
]

export function AdminAnalytics() {
  const { patterns, users } = useMemoryStore()
  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader eyebrow="Administrator / 全局洞察" title="总记忆库共性分布与原因" description="从全平台视角观察记忆类型、共性偏好增长与冲突来源，帮助判断哪些模式值得沉淀为组织模板。" actions={<Button variant="primary" onClick={() => exportPatterns(patterns)}><Download size={16} />导出分布报告</Button>} />
      <div className="mb-6 grid grid-cols-2 border-y border-[var(--line)] lg:grid-cols-4"><Stat label="总记忆条目" value="8,426" note="跨 242 位授权用户" trend="+12%" /><Stat label="共性记忆簇" value="36" note="去重、聚合后的长期模式" /><Stat label="高共性偏好" value={patterns.filter((item) => item.adoption >= 60).length} note="当前 Top 5 中覆盖率 ≥60%" /><Stat label="冲突待复核" value={patterns.reduce((sum, item) => sum + item.conflicts, 0)} note="共性模板与个人记忆不一致" /></div>
      <div className="grid gap-6 2xl:grid-cols-2">
        <Panel><PanelHeader title="总记忆库类型分布" description="按当前生效的记忆条目归类，演示数据。" /><div className="grid items-center gap-2 px-5 py-5 sm:grid-cols-[1fr_0.9fr]"><div className="h-64"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={distribution} dataKey="value" nameKey="name" innerRadius={58} outerRadius={90} paddingAngle={3} stroke="var(--surface)" isAnimationActive={false}>{distribution.map((item) => <Cell key={item.name} fill={item.color} />)}</Pie><Tooltip contentStyle={{ background: 'var(--surface-solid)', border: '1px solid var(--line-strong)', borderRadius: 8 }} /></PieChart></ResponsiveContainer></div><div className="space-y-4">{distribution.map((item) => <div key={item.name}><div className="mb-2 flex items-center justify-between gap-3 text-xs"><span className="inline-flex items-center gap-2 text-[var(--text-secondary)]"><i className="size-2 rounded-full" style={{ background: item.color }} />{item.name}</span><span className="font-mono">{item.value}%</span></div><ProgressBar value={item.value} tone={item.name.includes('Skill') ? 'cyan' : item.name.includes('工作') ? 'mint' : 'amber'} /></div>)}</div></div></Panel>
        <Panel><PanelHeader title="Top 共性偏好覆盖与增长" description="覆盖率（%）与近 14 天增长对照。" /><div className="h-80 px-3 py-5 sm:px-5"><ResponsiveContainer width="100%" height="100%"><BarChart data={patterns} margin={{ top: 8, right: 8, left: -22, bottom: 44 }}><CartesianGrid stroke="var(--line)" vertical={false} /><XAxis dataKey="title" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} interval={0} angle={-20} textAnchor="end" axisLine={false} tickLine={false} /><YAxis tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: 'var(--surface-solid)', border: '1px solid var(--line-strong)', borderRadius: 8 }} /><Bar dataKey="adoption" name="覆盖率" fill="var(--accent)" barSize={22} radius={[4, 4, 0, 0]} isAnimationActive={false} /><Bar dataKey="trend" name="14 天增长" fill="var(--cyan)" barSize={12} radius={[4, 4, 0, 0]} isAnimationActive={false} /></BarChart></ResponsiveContainer></div></Panel>
      </div>
      <Panel className="mt-6"><PanelHeader title="共性形成原因与治理判断" description="不仅看分布，也保留模式为何出现、是否适合组织化的解释。" /><div className="divide-y divide-[var(--line)]">{patterns.map((pattern) => <div key={pattern.id} className="grid gap-4 px-5 py-5 lg:grid-cols-[0.7fr_1.3fr_auto] lg:items-start"><div><Badge tone={pattern.adoption >= 60 ? 'mint' : 'amber'}>{pattern.category}</Badge><h3 className="mt-2 text-sm font-semibold">{pattern.title}</h3><p className="mt-1 font-mono text-xs text-[var(--text-muted)]">覆盖 {pattern.users} 人 · +{pattern.trend}%</p></div><p className="text-sm leading-6 text-[var(--text-secondary)]">{pattern.reason}</p><div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">{pattern.conflicts > 3 ? <TriangleAlert size={16} className="text-[var(--danger)]" /> : <Lightbulb size={16} className="text-[var(--accent)]" />}<span>{pattern.conflicts > 3 ? '建议先解决冲突再模板化' : '可进入组织模板评估'}</span></div></div>)}</div></Panel>
      <Panel className="mt-6"><PanelHeader title="部门记忆健康度" description="按当前演示用户计算，真实环境可由聚合接口返回。" /><div className="grid gap-5 px-5 py-5 sm:grid-cols-2 lg:grid-cols-3">{users.map((user) => <div key={user.id}><div className="mb-2 flex items-center justify-between text-xs"><span>{user.department}</span><span className="font-mono text-[var(--text-muted)]">{user.health}%</span></div><ProgressBar value={user.health} tone={user.health >= 80 ? 'mint' : 'amber'} /><p className="mt-2 text-xs text-[var(--text-muted)]">样本：{user.name} · {user.memoryCount} 条记忆</p></div>)}</div></Panel>
    </div>
  )
}
