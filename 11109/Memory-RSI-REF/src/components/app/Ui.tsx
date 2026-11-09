import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import { ArrowUpRight, Inbox, LoaderCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Button({ className, variant = 'secondary', size = 'default', children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'default' | 'small' | 'icon'
}) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--page)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45',
        variant === 'primary' && 'bg-[var(--accent)] text-[var(--accent-ink)] hover:bg-[var(--accent-strong)]',
        variant === 'secondary' && 'border border-[var(--line-strong)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:border-[var(--accent-dim)] hover:bg-[var(--surface-hover)]',
        variant === 'ghost' && 'text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]',
        variant === 'danger' && 'border border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger)] hover:brightness-110',
        size === 'small' && 'min-h-11 px-3 text-xs',
        size === 'icon' && 'size-11 min-h-11 px-0',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export function Panel({ className, children, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cn('panel', className)} {...props}>{children}</section>
}

export function PanelHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b border-[var(--line)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h2>
        {description && <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'amber' | 'mint' | 'cyan' | 'red'; className?: string }) {
  return <span className={cn('badge', `badge-${tone}`, className)}>{children}</span>
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-3xl">
        <div className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-[var(--accent)]">{eyebrow}</div>
        <h1 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--text-primary)] sm:text-3xl">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">{description}</p>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  )
}

export function Stat({ label, value, note, trend }: { label: string; value: string | number; note: string; trend?: string }) {
  return (
    <div className="stat-block">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-[var(--text-muted)]">{label}</span>
        {trend && <span className="inline-flex items-center gap-1 font-mono text-xs text-[var(--mint)]">{trend}<ArrowUpRight size={12} /></span>}
      </div>
      <div className="mt-3 font-mono text-2xl font-medium tracking-[-0.04em] text-[var(--text-primary)]">{value}</div>
      <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{note}</p>
    </div>
  )
}

export function ProgressBar({ value, tone = 'amber' }: { value: number; tone?: 'amber' | 'mint' | 'cyan' }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-hover)]" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn('h-full rounded-full transition-[width] duration-200', tone === 'amber' && 'bg-[var(--accent)]', tone === 'mint' && 'bg-[var(--mint)]', tone === 'cyan' && 'bg-[var(--cyan)]')} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  )
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center border border-dashed border-[var(--line-strong)] px-6 py-10 text-center">
      <Inbox className="mb-3 text-[var(--text-muted)]" size={24} />
      <h3 className="text-sm font-medium text-[var(--text-primary)]">{title}</h3>
      <p className="mt-2 max-w-sm text-xs leading-5 text-[var(--text-secondary)]">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function LoadingState() {
  return (
    <div className="flex min-h-[50dvh] items-center justify-center" role="status">
      <div className="text-center">
        <LoaderCircle className="mx-auto animate-spin text-[var(--accent)]" size={26} />
        <p className="mt-3 font-mono text-xs tracking-wider text-[var(--text-secondary)]">正在装载记忆快照…</p>
      </div>
    </div>
  )
}
