import { useState, type ReactNode } from 'react'
import { BarChart3, BrainCircuit, Cable, ChevronDown, CircleUserRound, FileClock, Files, History, LayoutDashboard, Menu, Search, ShieldCheck, Sparkles, UserCog, Users, UsersRound } from 'lucide-react'
import AmberCascades from '@/sections/AmberCascades'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { getApiSettings } from '@/services/memoryApi'
import { useMemoryStore } from '@/store/MemoryStore'
import type { Role, View } from '@/types/memory'
import { cn } from '@/lib/utils'
import { ContextRail } from './ContextRail'
import { GlobalSearch } from './GlobalSearch'
import { Badge, Button } from './Ui'

const roleLabels: Record<Role, string> = { personal: '个人视角', manager: '管理者视角', admin: '管理员视角' }
const viewTitles: Record<View, string> = {
  overview: '个人记忆面板', memories: '我的记忆库', recommendations: '记忆推荐队列', timeline: '记忆版本轨迹',
  common: '平台共性记忆', 'user-editor': '指定用户迭代', users: '全部用户记忆库', analytics: '总记忆库分析', audit: '审计日志', integration: '接口与 SSO 对接',
}

const navigation: Record<Role, { view: View; label: string; icon: typeof BrainCircuit; hint?: string }[]> = {
  personal: [
    { view: 'overview', label: '治理总览', icon: LayoutDashboard },
    { view: 'memories', label: '我的记忆库', icon: Files },
    { view: 'recommendations', label: '推荐确认队列', icon: Sparkles, hint: '4' },
    { view: 'timeline', label: '记忆版本轨迹', icon: History },
  ],
  manager: [
    { view: 'common', label: '平台共性记忆', icon: UsersRound },
    { view: 'user-editor', label: '指定用户迭代', icon: UserCog },
    { view: 'audit', label: '治理审计日志', icon: FileClock },
  ],
  admin: [
    { view: 'users', label: '所有用户记忆库', icon: Users },
    { view: 'analytics', label: '总记忆库分布', icon: BarChart3 },
    { view: 'audit', label: '全局审计日志', icon: ShieldCheck },
  ],
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="brand-mark" aria-hidden="true"><BrainCircuit size={20} /></div>
      <div><div className="font-mono text-sm font-semibold tracking-[0.12em] text-[var(--text-primary)]">M·RSI</div><div className="mt-0.5 text-xs text-[var(--text-muted)]">记忆治理控制台</div></div>
    </div>
  )
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const { role, view, navigate, recommendations } = useMemoryStore()
  return (
    <nav className="mt-8 space-y-1" aria-label={`${roleLabels[role]}导航`}>
      <div className="mb-3 px-3 font-mono text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">{roleLabels[role]}</div>
      {navigation[role].map((item) => {
        const Icon = item.icon
        const count = item.view === 'recommendations' ? recommendations.filter((rec) => rec.status === 'pending').length : null
        return (
          <button key={item.view} type="button" onClick={() => { navigate(item.view); onNavigate?.() }} className={cn('nav-item', view === item.view && 'nav-item-active')} aria-current={view === item.view ? 'page' : undefined}>
            <Icon size={18} /><span className="flex-1 text-left">{item.label}</span>
            {count !== null && count > 0 && <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 font-mono text-xs text-[var(--accent)]">{count}</span>}
          </button>
        )
      })}
      <div className="my-5 border-t border-[var(--line)]" />
      <div className="mb-3 px-3 font-mono text-xs uppercase tracking-[0.16em] text-[var(--text-muted)]">系统</div>
      <button type="button" onClick={() => { navigate('integration'); onNavigate?.() }} className={cn('nav-item', view === 'integration' && 'nav-item-active')}>
        <Cable size={18} /><span className="flex-1 text-left">接口与 SSO 对接</span>
      </button>
    </nav>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const { role, setRole, view, setSearchOpen } = useMemoryStore()
  const [mobileOpen, setMobileOpen] = useState(false)
  const mode = getApiSettings().mode
  return (
    <div className="min-h-dvh bg-[var(--page)] text-[var(--text-primary)]">
      <div className="pointer-events-auto fixed inset-0 z-0 opacity-35" aria-hidden="true"><AmberCascades /></div>
      <div className="pointer-events-none fixed inset-0 z-[1] bg-[var(--page-veil)]" aria-hidden="true" />
      <div className="relative z-10 flex min-h-dvh">
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-[var(--line)] bg-[var(--sidebar)] lg:flex">
          <div className="flex h-16 items-center border-b border-[var(--line)] px-5"><Brand /></div>
          <div className="flex-1 overflow-y-auto px-3 pb-5"><NavItems /></div>
          <div className="border-t border-[var(--line)] p-4">
            <div className="mb-3 flex items-center justify-between"><Badge tone={mode === 'mock' ? 'amber' : 'mint'}>{mode === 'mock' ? 'MOCK 数据' : 'HTTP 服务'}</Badge><span className="inline-flex items-center gap-1.5 text-xs text-[var(--mint)]"><i className="status-dot" />适配器就绪</span></div>
            <p className="text-xs leading-5 text-[var(--text-muted)]">演示数据仅存于页面运行时，刷新后恢复初始快照。</p>
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-[var(--line)] bg-[var(--header)] px-3 backdrop-blur-xl sm:px-5">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild><Button variant="ghost" size="icon" className="lg:hidden" aria-label="打开导航"><Menu size={20} /></Button></SheetTrigger>
              <SheetContent side="left" className="w-[86vw] max-w-80 gap-0 border-[var(--line-strong)] bg-[var(--surface-solid)] p-0 text-[var(--text-primary)]">
                <SheetHeader className="h-16 justify-center border-b border-[var(--line)] px-5 py-0"><SheetTitle><Brand /></SheetTitle><SheetDescription className="sr-only">记忆治理台功能导航</SheetDescription></SheetHeader>
                <div className="overflow-y-auto px-3 pb-8"><NavItems onNavigate={() => setMobileOpen(false)} /></div>
              </SheetContent>
            </Sheet>
            <div className="hidden min-w-0 items-center gap-2 text-sm sm:flex"><span className="text-[var(--text-muted)]">Memory / RSI</span><span className="text-[var(--line-strong)]">/</span><span className="truncate">{viewTitles[view]}</span></div>
            <div className="min-w-0 flex-1 sm:hidden"><Brand /></div>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="ghost" className="hidden border border-[var(--line)] px-3 text-[var(--text-muted)] md:inline-flex" onClick={() => setSearchOpen(true)}><Search size={16} /><span className="text-xs">搜索记忆或功能</span><kbd className="ml-3 font-mono text-xs">⌘ K</kbd></Button>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="全局搜索" onClick={() => setSearchOpen(true)}><Search size={19} /></Button>
              <label className="relative hidden items-center sm:flex">
                <CircleUserRound size={16} className="pointer-events-none absolute left-3 text-[var(--text-muted)]" />
                <span className="sr-only">切换演示角色</span>
                <select value={role} onChange={(event) => setRole(event.target.value as Role)} className="h-11 cursor-pointer appearance-none rounded-lg border border-[var(--line-strong)] bg-[var(--surface-raised)] pl-9 pr-8 text-xs text-[var(--text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
                  <option value="personal">个人视角</option><option value="manager">管理者视角</option><option value="admin">管理员视角</option>
                </select>
                <ChevronDown size={14} className="pointer-events-none absolute right-3 text-[var(--text-muted)]" />
              </label>
              <div className="hidden h-8 w-px bg-[var(--line)] xl:block" />
              <div className="hidden items-center gap-2 xl:flex"><div className="flex size-9 items-center justify-center rounded-full border border-[var(--accent-dim)] bg-[var(--accent-soft)] font-mono text-xs text-[var(--accent)]">LC</div><div><div className="text-xs font-medium">林澈</div><div className="font-mono text-xs text-[var(--text-muted)]">u_1027</div></div></div>
            </div>
          </header>
          <div className="xl:hidden"><label className="flex min-h-12 items-center justify-between border-b border-[var(--line)] bg-[var(--surface)] px-4 text-xs text-[var(--text-secondary)] sm:hidden"><span>演示角色</span><select value={role} onChange={(event) => setRole(event.target.value as Role)} className="min-h-11 bg-transparent text-[var(--text-primary)] outline-none"><option value="personal">个人视角</option><option value="manager">管理者视角</option><option value="admin">管理员视角</option></select></label></div>
          <div className="flex min-w-0 flex-1">
            <main className="min-w-0 flex-1 px-4 pb-12 pt-6 sm:px-6 lg:px-8 lg:pt-8">{children}</main>
            <ContextRail />
          </div>
          <footer className="flex flex-col gap-2 border-t border-[var(--line)] px-5 py-4 text-xs text-[var(--text-muted)] sm:flex-row sm:items-center sm:justify-between xl:mr-72">
            <span>Memory RSI · 前端交互参考实现</span><button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="min-h-11 cursor-pointer self-start text-left text-[var(--text-secondary)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] sm:self-auto">返回顶部 ↑</button>
          </footer>
        </div>
      </div>
      <GlobalSearch />
    </div>
  )
}
