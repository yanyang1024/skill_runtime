import { Activity, ArrowRight, CircleAlert, Fingerprint, ShieldCheck } from 'lucide-react'
import { useMemoryStore } from '@/store/MemoryStore'
import { Badge, Button, ProgressBar } from './Ui'

export function ContextRail() {
  const { recommendations, files, logs, openMemory, navigate, role } = useMemoryStore()
  const pending = recommendations.filter((item) => item.status === 'pending')
  const issues = files.filter((file) => file.status !== 'active')
  return (
    <aside className="hidden w-72 shrink-0 border-l border-[var(--line)] bg-[var(--rail)] xl:block">
      <div className="sticky top-16 max-h-[calc(100dvh-4rem)] overflow-y-auto p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">治理上下文</h2>
          <Badge tone="mint">实时快照</Badge>
        </div>
        <div className="mt-5 border-y border-[var(--line)] py-5">
          <div className="flex items-center gap-2 text-sm font-medium"><Fingerprint size={17} className="text-[var(--accent)]" />SSO 身份上下文</div>
          <dl className="mt-4 space-y-3 text-xs">
            <div className="flex justify-between gap-3"><dt className="text-[var(--text-muted)]">用户</dt><dd className="font-mono">u_1027 / 林澈</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[var(--text-muted)]">当前角色</dt><dd>{role === 'personal' ? '个人用户' : role === 'manager' ? '平台管理者' : '系统管理员'}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-[var(--text-muted)]">认证来源</dt><dd className="inline-flex items-center gap-1"><ShieldCheck size={13} className="text-[var(--mint)]" />Mock SSO</dd></div>
          </dl>
        </div>
        {role === 'personal' ? (
          <>
            <div className="py-5">
              <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-medium">待确认推荐</h3><span className="font-mono text-lg text-[var(--accent)]">{pending.length}</span></div>
              <div className="space-y-3">
                {pending.slice(0, 3).map((item) => (
                  <button key={item.id} type="button" onClick={() => navigate('recommendations')} className="group block min-h-11 w-full cursor-pointer border-b border-[var(--line)] pb-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
                    <div className="flex items-start justify-between gap-2"><span className="text-xs leading-5 text-[var(--text-primary)] group-hover:text-[var(--accent)]">{item.title}</span><ArrowRight size={13} className="mt-1 shrink-0 text-[var(--text-muted)]" /></div>
                    <span className="mt-1 block font-mono text-xs text-[var(--text-muted)]">置信度 {item.confidence}%</span>
                  </button>
                ))}
              </div>
              <Button variant="ghost" size="small" className="mt-3 w-full" onClick={() => navigate('recommendations')}>进入推荐队列<ArrowRight size={14} /></Button>
            </div>
            <div className="border-t border-[var(--line)] py-5">
              <h3 className="text-sm font-medium">记忆健康提醒</h3>
              {issues.length ? issues.map((file) => (
                <button key={file.id} type="button" onClick={() => openMemory(file.id)} className="mt-3 flex min-h-11 w-full cursor-pointer items-start gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
                  <CircleAlert size={15} className="mt-0.5 shrink-0 text-[var(--danger)]" />
                  <span><span className="block text-xs leading-5 text-[var(--text-primary)]">{file.title}</span><span className="text-xs text-[var(--text-muted)]">{file.status === 'conflict' ? '存在口径冲突，建议复核' : '长期未确认，建议更新'}</span></span>
                </button>
              )) : <p className="mt-3 text-xs text-[var(--text-secondary)]">当前没有待处理的健康问题。</p>}
            </div>
          </>
        ) : (
          <div className="py-5">
            <h3 className="text-sm font-medium">最近治理动作</h3>
            <div className="mt-4 space-y-4">
              {logs.slice(0, 5).map((log) => <div key={log.id} className="border-b border-[var(--line)] pb-3"><div className="flex items-center gap-2 text-xs"><Activity size={13} className="text-[var(--cyan)]" /><span>{log.action}</span></div><p className="mt-1 break-all font-mono text-xs text-[var(--text-muted)]">{log.target}</p><p className="mt-1 text-xs text-[var(--text-secondary)]">{log.actor} · {log.time.slice(5, 16)}</p></div>)}
            </div>
            <Button variant="ghost" size="small" className="mt-3 w-full" onClick={() => navigate('audit')}>查看全部审计<ArrowRight size={14} /></Button>
          </div>
        )}
        <div className="border-t border-[var(--line)] pt-5">
          <div className="mb-2 flex justify-between text-xs"><span className="text-[var(--text-muted)]">治理覆盖率</span><span className="font-mono text-[var(--mint)]">86%</span></div>
          <ProgressBar value={86} tone="mint" />
          <p className="mt-3 text-xs leading-5 text-[var(--text-muted)]">演示指标来自本地快照，接入后由真实治理服务返回。</p>
        </div>
      </div>
    </aside>
  )
}
