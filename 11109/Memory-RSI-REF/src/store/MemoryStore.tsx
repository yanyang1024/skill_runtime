import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { getMemoryApi, type CreateMemoryInput } from '@/services/memoryApi'
import type { Role, Snapshot, View } from '@/types/memory'

const views: View[] = ['overview', 'memories', 'recommendations', 'timeline', 'common', 'user-editor', 'users', 'analytics', 'audit', 'integration']
const emptySnapshot: Snapshot = { files: [], versions: [], recommendations: [], users: [], patterns: [], logs: [] }
const roleForView = (view: View): Role | undefined => {
  if (['overview', 'memories', 'recommendations', 'timeline'].includes(view)) return 'personal'
  if (['common', 'user-editor'].includes(view)) return 'manager'
  if (['users', 'analytics'].includes(view)) return 'admin'
  return undefined
}

interface MemoryStore extends Snapshot {
  loading: boolean
  busy: boolean
  error: string | null
  role: Role
  view: View
  selectedFileId: string
  searchOpen: boolean
  setSearchOpen: (open: boolean) => void
  setRole: (role: Role) => void
  navigate: (view: View) => void
  openMemory: (id: string) => void
  selectFile: (id: string) => void
  refresh: () => Promise<void>
  createMemory: (input: CreateMemoryInput) => Promise<void>
  saveMemory: (fileId: string, content: string, note: string) => Promise<void>
  resolveRecommendation: (id: string, status: 'accepted' | 'dismissed', content?: string) => Promise<void>
  rollbackMemory: (fileId: string, versionId: string, note: string) => Promise<void>
  updateUserMemory: (userId: string, content: string, note: string) => Promise<void>
}

const StoreContext = createContext<MemoryStore | null>(null)

export function MemoryProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot>(emptySnapshot)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [role, setRoleState] = useState<Role>('personal')
  const [view, setView] = useState<View>(() => {
    const hash = window.location.hash.replace('#/', '') as View
    return views.includes(hash) ? hash : 'overview'
  })
  const [selectedFileId, setSelectedFileId] = useState('mem-001')
  const [searchOpen, setSearchOpen] = useState(false)

  const navigate = useCallback((next: View) => {
    setView(next)
    const nextRole = roleForView(next)
    if (nextRole) setRoleState(nextRole)
    window.history.replaceState(null, '', `#/${next}`)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const setRole = useCallback((next: Role) => {
    setRoleState(next)
    navigate(next === 'personal' ? 'overview' : next === 'manager' ? 'common' : 'users')
    toast.info(`已切换为${next === 'personal' ? '个人' : next === 'manager' ? '管理者' : '管理员'}演示视角`)
  }, [navigate])

  useEffect(() => {
    const onHash = () => {
      const next = window.location.hash.replace('#/', '') as View
      if (views.includes(next)) {
        setView(next)
        const nextRole = roleForView(next)
        if (nextRole) setRoleState(nextRole)
      }
    }
    onHash()
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setSnapshot(await getMemoryApi().getSnapshot())
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '记忆服务加载失败'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const execute = useCallback(async (action: () => Promise<Snapshot>, success: string) => {
    setBusy(true)
    try {
      setSnapshot(await action())
      toast.success(success)
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : '操作未完成')
      throw cause
    } finally {
      setBusy(false)
    }
  }, [])

  const value = useMemo<MemoryStore>(() => ({
    ...snapshot, loading, busy, error, role, view, selectedFileId, searchOpen, setSearchOpen, setRole, navigate,
    openMemory: (id) => { setSelectedFileId(id); navigate('memories') },
    selectFile: setSelectedFileId,
    refresh,
    createMemory: async (input) => { await execute(() => getMemoryApi().createMemory(input), '记忆已创建，并生成 v1 版本') },
    saveMemory: async (fileId, content, note) => { await execute(() => getMemoryApi().saveMemory(fileId, content, note), '记忆已保存，版本轨迹已更新') },
    resolveRecommendation: async (id, status, content) => { await execute(() => getMemoryApi().resolveRecommendation(id, status, content), status === 'accepted' ? '推荐已采纳并写入记忆' : '推荐已忽略，不会写入记忆') },
    rollbackMemory: async (fileId, versionId, note) => { await execute(() => getMemoryApi().rollbackMemory(fileId, versionId, note), '已回滚，并保留新的审计版本') },
    updateUserMemory: async (userId, content, note) => { await execute(() => getMemoryApi().updateUserMemory(userId, content, note), `已迭代 ${userId} 的记忆`) },
  }), [snapshot, loading, busy, error, role, view, selectedFileId, searchOpen, setRole, navigate, refresh, execute])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useMemoryStore() {
  const store = useContext(StoreContext)
  if (!store) throw new Error('useMemoryStore 必须在 MemoryProvider 内使用')
  return store
}
