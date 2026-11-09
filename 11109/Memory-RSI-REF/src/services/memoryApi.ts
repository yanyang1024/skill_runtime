import { initialSnapshot } from '@/data/mockData'
import type { ApiSettings, MemoryType, Snapshot } from '@/types/memory'

export interface CreateMemoryInput {
  title: string
  type: MemoryType
  content: string
}

export interface MemoryApi {
  getSnapshot(): Promise<Snapshot>
  createMemory(input: CreateMemoryInput): Promise<Snapshot>
  saveMemory(fileId: string, content: string, note: string): Promise<Snapshot>
  resolveRecommendation(id: string, status: 'accepted' | 'dismissed', content?: string): Promise<Snapshot>
  rollbackMemory(fileId: string, versionId: string, note: string): Promise<Snapshot>
  updateUserMemory(userId: string, content: string, note: string): Promise<Snapshot>
}

const SETTINGS_KEY = 'memory-rsi-api-settings'
const defaultSettings: ApiSettings = {
  mode: import.meta.env.VITE_API_MODE === 'http' ? 'http' : 'mock',
  baseUrl: import.meta.env.VITE_API_BASE_URL || '/api/memory-rsi',
  userHeader: 'X-User-Id',
  roleHeader: 'X-User-Role',
  timeout: 8000,
}

export function getApiSettings(): ApiSettings {
  try {
    return { ...defaultSettings, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }
  } catch {
    return defaultSettings
  }
}

export function saveApiSettings(settings: ApiSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

export async function testApiConnection(settings: ApiSettings) {
  if (settings.mode === 'mock') {
    await new Promise((resolve) => setTimeout(resolve, 420))
    return { ok: true, message: 'Mock 适配器正常，已返回本地演示快照。' }
  }
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), settings.timeout)
  try {
    const response = await fetch(`${settings.baseUrl.replace(/\/$/, '')}/health`, {
      headers: { [settings.userHeader]: 'u_1027', [settings.roleHeader]: 'admin' },
      credentials: 'include',
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return { ok: true, message: `连接成功（HTTP ${response.status}），SSO 身份头已发送。` }
  } catch (error) {
    return { ok: false, message: `连接失败：${error instanceof Error ? error.message : '未知错误'}。请检查内网地址、网关与 CORS。` }
  } finally {
    window.clearTimeout(timer)
  }
}

let mockDb = structuredClone(initialSnapshot)
const clone = () => structuredClone(mockDb)
const wait = async () => new Promise((resolve) => setTimeout(resolve, 160))
const stamp = () => new Date().toLocaleString('zh-CN', { hour12: false }).replaceAll('/', '-')
const sizeOf = (content: string) => `${Math.max(0.1, new Blob([content]).size / 1024).toFixed(1)} KB`

function appendLog(action: string, target: string, detail: string, result: '成功' | '待复核' | '已忽略' = '成功') {
  mockDb.logs.unshift({ id: `log-${Date.now()}`, time: stamp(), actor: '林澈', action, target, result, detail })
}

const mockApi: MemoryApi = {
  async getSnapshot() { await wait(); return clone() },
  async createMemory({ title, type, content }) {
    await wait()
    const id = `mem-${Date.now()}`
    const versionId = `v-${Date.now()}`
    const fileName = `${title.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')}.md`
    mockDb.files.unshift({
      id, title, fileName, type, updatedAt: stamp(), size: sizeOf(content), status: 'active',
      tags: ['手动创建'], summary: '由个人面板手动创建的记忆文档。', content,
      source: '个人面板', usageCount: 0, lastUsedAt: '尚未使用',
    })
    mockDb.versions.unshift({ id: versionId, fileId: id, version: 1, createdAt: stamp(), author: '林澈', action: '创建', note: '在个人面板创建记忆', content })
    const user = mockDb.users.find((item) => item.id === 'u_1027')
    if (user) user.memoryCount += 1
    appendLog('创建记忆', `${fileName} · v1`, '通过个人面板创建')
    return clone()
  },
  async saveMemory(fileId, content, note) {
    await wait()
    const file = mockDb.files.find((item) => item.id === fileId)
    if (!file) throw new Error('未找到目标记忆')
    const version = Math.max(0, ...mockDb.versions.filter((item) => item.fileId === fileId).map((item) => item.version)) + 1
    file.content = content
    file.updatedAt = stamp()
    file.size = sizeOf(content)
    file.status = 'active'
    mockDb.versions.unshift({ id: `v-${Date.now()}`, fileId, version, createdAt: stamp(), author: '林澈', action: '手动编辑', note, content })
    appendLog('编辑记忆', `${file.fileName} · v${version}`, note)
    return clone()
  },
  async resolveRecommendation(id, status, content) {
    await wait()
    const recommendation = mockDb.recommendations.find((item) => item.id === id)
    if (!recommendation) throw new Error('未找到推荐项')
    recommendation.status = status
    if (status === 'accepted') {
      const file = mockDb.files.find((item) => item.id === recommendation.targetFileId)
      if (!file) throw new Error('目标记忆文档不存在')
      const addition = content?.trim() || recommendation.suggestedContent
      file.content = `${file.content.trim()}\n\n${addition.trim()}\n`
      file.updatedAt = stamp()
      file.size = sizeOf(file.content)
      const version = Math.max(0, ...mockDb.versions.filter((item) => item.fileId === file.id).map((item) => item.version)) + 1
      mockDb.versions.unshift({ id: `v-${Date.now()}`, fileId: file.id, version, createdAt: stamp(), author: '林澈', action: '推荐采纳', note: recommendation.title, content: file.content })
      appendLog('采纳推荐', `${file.fileName} · v${version}`, `${recommendation.id}；${recommendation.title}`)
    } else {
      appendLog('忽略推荐', recommendation.id, recommendation.title, '已忽略')
    }
    return clone()
  },
  async rollbackMemory(fileId, versionId, note) {
    await wait()
    const file = mockDb.files.find((item) => item.id === fileId)
    const target = mockDb.versions.find((item) => item.id === versionId && item.fileId === fileId)
    if (!file || !target) throw new Error('未找到可回滚版本')
    const version = Math.max(0, ...mockDb.versions.filter((item) => item.fileId === fileId).map((item) => item.version)) + 1
    file.content = target.content
    file.updatedAt = stamp()
    file.size = sizeOf(file.content)
    mockDb.versions.unshift({ id: `v-${Date.now()}`, fileId, version, createdAt: stamp(), author: '林澈', action: '版本回滚', note: note || `恢复至 v${target.version}`, content: target.content })
    appendLog('版本回滚', `${file.fileName} · v${version}`, `恢复自 v${target.version}；${note || '未填写原因'}`)
    return clone()
  },
  async updateUserMemory(userId, content, note) {
    await wait()
    const user = mockDb.users.find((item) => item.id === userId)
    if (!user) throw new Error('未找到该用户，请检查用户 ID')
    user.memoryContent = content
    user.memoryVersion += 1
    user.lastActive = '刚刚'
    mockDb.logs.unshift({ id: `log-${Date.now()}`, time: stamp(), actor: '周砚', action: '迭代用户记忆', target: `${userId} · v${user.memoryVersion}`, result: '成功', detail: note })
    return clone()
  },
}

function createHttpApi(): MemoryApi {
  const request = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
    const settings = getApiSettings()
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), settings.timeout)
    try {
      const response = await fetch(`${settings.baseUrl.replace(/\/$/, '')}${path}`, {
        ...init,
        credentials: 'include',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          [settings.userHeader]: 'u_1027',
          [settings.roleHeader]: 'personal',
          ...init.headers,
        },
      })
      if (!response.ok) throw new Error(`接口请求失败：HTTP ${response.status}`)
      return await response.json() as T
    } finally {
      window.clearTimeout(timer)
    }
  }
  const body = (value: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(value) })
  return {
    getSnapshot: () => request<Snapshot>('/snapshot'),
    createMemory: (input) => request<Snapshot>('/memories', body(input)),
    saveMemory: (fileId, content, note) => request<Snapshot>(`/memories/${fileId}`, { method: 'PATCH', body: JSON.stringify({ content, note }) }),
    resolveRecommendation: (id, status, content) => request<Snapshot>(`/recommendations/${id}`, { method: 'PATCH', body: JSON.stringify({ status, content }) }),
    rollbackMemory: (fileId, versionId, note) => request<Snapshot>(`/memories/${fileId}/rollback`, body({ versionId, note })),
    updateUserMemory: (userId, content, note) => request<Snapshot>(`/users/${userId}/memory`, { method: 'PATCH', body: JSON.stringify({ content, note }) }),
  }
}

export const getMemoryApi = (): MemoryApi => getApiSettings().mode === 'http' ? createHttpApi() : mockApi

export const apiContracts = [
  ['GET', '/snapshot', '当前身份的个人记忆、版本、推荐与治理快照'],
  ['POST', '/memories', '创建个人记忆文档'],
  ['PATCH', '/memories/:fileId', '保存记忆内容并生成新版本'],
  ['PATCH', '/recommendations/:id', '采纳、编辑采纳或忽略推荐'],
  ['POST', '/memories/:fileId/rollback', '按版本回滚并记录审计原因'],
  ['PATCH', '/users/:userId/memory', '管理者迭代指定用户记忆'],
  ['GET', '/health', 'SSO、网关与服务健康检查'],
]
