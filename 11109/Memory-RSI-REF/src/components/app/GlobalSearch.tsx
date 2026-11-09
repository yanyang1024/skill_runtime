import { useMemo, useState } from 'react'
import { ArrowRight, FileText, Search, Sparkles } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useMemoryStore } from '@/store/MemoryStore'
import type { View } from '@/types/memory'

const destinations: { id: View; title: string; description: string }[] = [
  { id: 'overview', title: '个人记忆面板', description: '治理总览与记忆分布' },
  { id: 'memories', title: '我的记忆库', description: '浏览、编辑和导出记忆' },
  { id: 'recommendations', title: '记忆推荐队列', description: '确认或忽略 RSI 推荐' },
  { id: 'timeline', title: '记忆版本轨迹', description: '差异对比与版本回滚' },
  { id: 'common', title: '平台共性记忆', description: '跨用户偏好与形成原因' },
  { id: 'user-editor', title: '指定用户记忆迭代', description: '按用户 ID 手动迭代' },
  { id: 'users', title: '全部用户记忆库', description: '管理员用户目录' },
  { id: 'analytics', title: '总记忆库分析', description: '共性分布与治理洞察' },
  { id: 'audit', title: '审计日志', description: '操作留痕与导出' },
  { id: 'integration', title: '接口与 SSO 对接', description: 'Mock / HTTP 适配器配置' },
]

export function GlobalSearch() {
  const { searchOpen, setSearchOpen, files, openMemory, navigate } = useMemoryStore()
  const [query, setQuery] = useState('')
  const results = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    const fileResults = files.filter((file) => !keyword || `${file.title}${file.fileName}${file.tags.join('')}`.toLowerCase().includes(keyword)).slice(0, 5)
    const pageResults = destinations.filter((page) => !keyword || `${page.title}${page.description}`.toLowerCase().includes(keyword)).slice(0, 5)
    return { fileResults, pageResults }
  }, [files, query])

  const close = () => { setSearchOpen(false); setQuery('') }
  return (
    <Dialog open={searchOpen} onOpenChange={(open) => { setSearchOpen(open); if (!open) setQuery('') }}>
      <DialogContent className="top-[12%] max-w-2xl translate-y-0 gap-0 overflow-hidden border-[var(--line-strong)] bg-[var(--surface-solid)] p-0 text-[var(--text-primary)] sm:max-w-2xl">
        <DialogHeader className="sr-only">
          <DialogTitle>全局搜索</DialogTitle>
          <DialogDescription>搜索记忆文档或功能页面</DialogDescription>
        </DialogHeader>
        <label className="flex min-h-16 items-center gap-3 border-b border-[var(--line)] px-5">
          <Search size={19} className="shrink-0 text-[var(--accent)]" />
          <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索记忆、文件或功能…" className="h-16 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-[var(--text-muted)]" />
          <kbd className="hidden rounded border border-[var(--line-strong)] px-2 py-1 font-mono text-xs text-[var(--text-muted)] sm:block">ESC</kbd>
        </label>
        <div className="max-h-[60dvh] overflow-y-auto p-3">
          {results.fileResults.length > 0 && <div className="px-2 pb-2 pt-1 font-mono text-xs uppercase tracking-wider text-[var(--text-muted)]">记忆文档</div>}
          {results.fileResults.map((file) => (
            <button key={file.id} type="button" onClick={() => { openMemory(file.id); close() }} className="flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-lg px-3 text-left transition hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
              <FileText size={18} className="shrink-0 text-[var(--cyan)]" />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm">{file.title}</span><span className="block truncate font-mono text-xs text-[var(--text-muted)]">{file.fileName}</span></span>
              <ArrowRight size={16} className="text-[var(--text-muted)]" />
            </button>
          ))}
          {results.pageResults.length > 0 && <div className="px-2 pb-2 pt-3 font-mono text-xs uppercase tracking-wider text-[var(--text-muted)]">功能页面</div>}
          {results.pageResults.map((page) => (
            <button key={page.id} type="button" onClick={() => { navigate(page.id); close() }} className="flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-lg px-3 text-left transition hover:bg-[var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]">
              <Sparkles size={18} className="shrink-0 text-[var(--accent)]" />
              <span className="min-w-0 flex-1"><span className="block text-sm">{page.title}</span><span className="block text-xs text-[var(--text-muted)]">{page.description}</span></span>
              <ArrowRight size={16} className="text-[var(--text-muted)]" />
            </button>
          ))}
          {results.fileResults.length === 0 && results.pageResults.length === 0 && <p className="px-4 py-10 text-center text-sm text-[var(--text-secondary)]">没有匹配结果，试试“偏好”或“版本”。</p>}
        </div>
      </DialogContent>
    </Dialog>
  )
}
