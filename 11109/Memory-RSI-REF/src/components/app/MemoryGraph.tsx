import { useMemoryStore } from '@/store/MemoryStore'

const positions = [
  { x: 150, y: 60 }, { x: 300, y: 104 }, { x: 320, y: 230 },
  { x: 160, y: 272 }, { x: 58, y: 208 }, { x: 48, y: 102 },
]

export function MemoryGraph() {
  const { files, openMemory } = useMemoryStore()
  const visible = files.slice(0, 6)
  return (
    <div className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 memory-grid opacity-40" />
      <svg viewBox="0 0 380 330" className="relative block h-auto w-full" role="img" aria-label="个人记忆关联图，可选择节点打开记忆文档">
        <defs>
          <radialGradient id="coreGlow">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx="190" cy="165" r="112" fill="url(#coreGlow)" />
        <circle cx="190" cy="165" r="102" fill="none" stroke="var(--line)" strokeDasharray="3 7" />
        <circle cx="190" cy="165" r="65" fill="none" stroke="var(--line)" />
        {visible.map((file, index) => {
          const point = positions[index]
          return <line key={`line-${file.id}`} x1="190" y1="165" x2={point.x} y2={point.y} stroke={file.status === 'conflict' ? 'var(--danger)' : 'var(--accent-dim)'} strokeOpacity={file.status === 'conflict' ? 0.55 : 0.45} strokeWidth="1" />
        })}
        <g>
          <circle cx="190" cy="165" r="40" fill="var(--surface-raised)" stroke="var(--accent)" strokeOpacity="0.7" />
          <circle cx="190" cy="165" r="32" fill="none" stroke="var(--accent)" strokeOpacity="0.25" className="graph-pulse" />
          <text x="190" y="160" textAnchor="middle" fill="var(--text-primary)" fontSize="13" fontWeight="600">林澈</text>
          <text x="190" y="179" textAnchor="middle" fill="var(--accent)" fontSize="10" fontFamily="GeistMono">MEMORY CORE</text>
        </g>
        {visible.map((file, index) => {
          const point = positions[index]
          const label = file.title.length > 9 ? `${file.title.slice(0, 9)}…` : file.title
          return (
            <g
              key={file.id}
              role="button"
              tabIndex={0}
              aria-label={`打开${file.title}`}
              className="cursor-pointer outline-none focus-visible:opacity-80"
              onClick={() => openMemory(file.id)}
              onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openMemory(file.id) } }}
            >
              <circle cx={point.x} cy={point.y} r="25" fill="var(--surface-raised)" stroke={file.status === 'conflict' ? 'var(--danger)' : file.type === 'skill' ? 'var(--cyan)' : file.type === 'preference' ? 'var(--accent)' : 'var(--mint)'} strokeWidth="1.5" />
              <circle cx={point.x} cy={point.y} r="18" fill="transparent" />
              <text x={point.x} y={point.y + 4} textAnchor="middle" fill="var(--text-primary)" fontSize="11" fontFamily="GeistMono">{file.usageCount}</text>
              <text x={point.x} y={point.y + 40} textAnchor="middle" fill="var(--text-secondary)" fontSize="11">{label}</text>
            </g>
          )
        })}
      </svg>
      <div className="absolute bottom-3 left-4 flex flex-wrap gap-3 text-xs text-[var(--text-muted)]">
        <span className="inline-flex items-center gap-1.5"><i className="size-1.5 rounded-full bg-[var(--accent)]" />偏好</span>
        <span className="inline-flex items-center gap-1.5"><i className="size-1.5 rounded-full bg-[var(--cyan)]" />Skill 文件</span>
        <span className="inline-flex items-center gap-1.5"><i className="size-1.5 rounded-full bg-[var(--mint)]" />其他文档</span>
      </div>
    </div>
  )
}
