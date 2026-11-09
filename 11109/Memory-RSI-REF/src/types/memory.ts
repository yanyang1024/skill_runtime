export type Role = 'personal' | 'manager' | 'admin'
export type View =
  | 'overview'
  | 'memories'
  | 'recommendations'
  | 'timeline'
  | 'common'
  | 'user-editor'
  | 'users'
  | 'analytics'
  | 'audit'
  | 'integration'

export type MemoryType = 'skill' | 'document' | 'preference'
export type MemoryStatus = 'active' | 'stale' | 'conflict'

export interface MemoryVersion {
  id: string
  fileId: string
  version: number
  createdAt: string
  author: string
  action: '创建' | '推荐采纳' | '手动编辑' | '管理者迭代' | '版本回滚'
  note: string
  content: string
}

export interface MemoryFile {
  id: string
  title: string
  fileName: string
  type: MemoryType
  skillName?: string
  updatedAt: string
  size: string
  status: MemoryStatus
  tags: string[]
  summary: string
  content: string
  source: string
  usageCount: number
  lastUsedAt: string
}

export interface Recommendation {
  id: string
  title: string
  kind: '偏好沉淀' | '用法学习' | '文件习惯'
  confidence: number
  status: 'pending' | 'accepted' | 'dismissed'
  createdAt: string
  reason: string
  evidence: string[]
  suggestedContent: string
  targetFileId: string
  sourceEvents: number
}

export interface UserMemory {
  id: string
  name: string
  department: string
  role: string
  memoryCount: number
  health: number
  lastActive: string
  preferences: string[]
  memoryContent: string
  memoryVersion: number
}

export interface CommonPattern {
  id: string
  title: string
  category: '输出格式' | '工作流程' | '内容偏好' | '工具用法'
  adoption: number
  users: number
  trend: number
  reason: string
  sample: string
  conflicts: number
}

export interface AuditLog {
  id: string
  time: string
  actor: string
  action: string
  target: string
  result: '成功' | '待复核' | '已忽略'
  detail: string
}

export interface Snapshot {
  files: MemoryFile[]
  versions: MemoryVersion[]
  recommendations: Recommendation[]
  users: UserMemory[]
  patterns: CommonPattern[]
  logs: AuditLog[]
}

export interface ApiSettings {
  mode: 'mock' | 'http'
  baseUrl: string
  userHeader: string
  roleHeader: string
  timeout: number
}
