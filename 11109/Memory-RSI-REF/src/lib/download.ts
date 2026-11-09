import type { AuditLog, CommonPattern, MemoryFile, MemoryVersion, UserMemory } from '@/types/memory'

export function downloadFile(name: string, content: string, type = 'text/plain;charset=utf-8') {
  const blob = new Blob(['\ufeff', content], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function exportMemory(file: MemoryFile) {
  downloadFile(file.fileName, file.content, 'text/markdown;charset=utf-8')
}

export function exportAllMemories(files: MemoryFile[]) {
  const content = files.map((file) => `<!-- id: ${file.id} | updated: ${file.updatedAt} -->\n\n${file.content}`).join('\n\n---\n\n')
  downloadFile('我的记忆库.md', `# 我的记忆库\n\n> 导出时间：${new Date().toLocaleString('zh-CN')}\n\n${content}`, 'text/markdown;charset=utf-8')
}

export function exportTrajectory(versions: MemoryVersion[], format: 'json' | 'md') {
  if (format === 'json') {
    downloadFile('记忆版本轨迹.json', JSON.stringify(versions, null, 2), 'application/json;charset=utf-8')
    return
  }
  const content = versions.map((version) => `## v${version.version} · ${version.action}\n\n- 记忆 ID：${version.fileId}\n- 时间：${version.createdAt}\n- 操作者：${version.author}\n- 说明：${version.note}\n\n\`\`\`markdown\n${version.content}\n\`\`\``).join('\n\n')
  downloadFile('记忆版本轨迹.md', `# 记忆版本轨迹\n\n${content}`, 'text/markdown;charset=utf-8')
}

const csvCell = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`

export function exportUsers(users: UserMemory[]) {
  const rows = ['用户ID,姓名,部门,角色,记忆数,健康度,最后活跃', ...users.map((user) => [user.id, user.name, user.department, user.role, user.memoryCount, user.health, user.lastActive].map(csvCell).join(','))]
  downloadFile('用户记忆库清单.csv', rows.join('\n'), 'text/csv;charset=utf-8')
}

export function exportPatterns(patterns: CommonPattern[]) {
  const rows = ['共性记忆,分类,覆盖率,用户数,近14天变化,冲突数,形成原因', ...patterns.map((pattern) => [pattern.title, pattern.category, `${pattern.adoption}%`, pattern.users, `+${pattern.trend}%`, pattern.conflicts, pattern.reason].map(csvCell).join(','))]
  downloadFile('共性记忆治理报告.csv', rows.join('\n'), 'text/csv;charset=utf-8')
}

export function exportLogs(logs: AuditLog[]) {
  downloadFile('记忆治理审计日志.json', JSON.stringify(logs, null, 2), 'application/json;charset=utf-8')
}
