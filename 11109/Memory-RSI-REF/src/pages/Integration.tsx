import { useState } from 'react'
import { Braces, CheckCircle2, Clipboard, Cable, Download, RefreshCw, Server, ShieldCheck, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Badge, Button, PageHeader, Panel, PanelHeader } from '@/components/app/Ui'
import { downloadFile } from '@/lib/download'
import { apiContracts, getApiSettings, saveApiSettings, testApiConnection } from '@/services/memoryApi'
import { useMemoryStore } from '@/store/MemoryStore'
import type { ApiSettings } from '@/types/memory'

export function Integration() {
  const { refresh, loading } = useMemoryStore()
  const [settings, setSettings] = useState<ApiSettings>(getApiSettings)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [error, setError] = useState('')
  const update = <K extends keyof ApiSettings>(key: K, value: ApiSettings[K]) => setSettings((old) => ({ ...old, [key]: value }))

  const save = async () => {
    if (settings.mode === 'http' && !settings.baseUrl.trim()) { setError('HTTP 模式需要填写内网服务地址。'); return }
    setError(''); saveApiSettings(settings); toast.success('适配器配置已保存到当前浏览器'); await refresh()
  }
  const test = async () => {
    setTesting(true); setTestResult(null)
    const result = await testApiConnection(settings)
    setTestResult(result); setTesting(false)
  }
  const contractText = apiContracts.map(([method, path, description]) => `${method.padEnd(6)} ${path.padEnd(36)} ${description}`).join('\n')
  const copyContracts = async () => {
    try { await navigator.clipboard.writeText(contractText); toast.success('接口清单已复制') } catch { downloadFile('memory-rsi-api-contract.txt', contractText); toast.info('剪贴板不可用，已改为下载接口清单') }
  }

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader eyebrow="Integration / 内网移植" title="接口与 SSO 对接" description="默认使用完整 Mock 数据流。迁入内网时，只需实现同一组接口并切换 HTTP 适配器，页面与交互无需重写。" actions={<Button variant="primary" onClick={() => void save()} disabled={loading}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} />保存并重载快照</Button>} />
      <div className="mb-6 flex gap-3 border border-[var(--accent-dim)] bg-[var(--accent-soft)] p-4 text-sm leading-6 text-[var(--text-secondary)]"><Cable size={19} className="mt-1 shrink-0 text-[var(--accent)]" /><p><strong className="text-[var(--text-primary)]">当前为纯前端参考实现。</strong>Mock 数据只保存在页面运行时，刷新后重置；本页适配器设置仅保存于当前浏览器，不会同步到其他设备。</p></div>
      <div className="grid items-start gap-6 2xl:grid-cols-[1fr_1fr]">
        <Panel>
          <PanelHeader title="服务适配器" description="选择数据来源，并配置内网 REST 服务。" action={<Badge tone={settings.mode === 'mock' ? 'amber' : 'mint'}>{settings.mode.toUpperCase()}</Badge>} />
          <div className="space-y-5 p-5">
            <div className="grid grid-cols-2 gap-3" role="group" aria-label="数据源模式"><button type="button" onClick={() => update('mode', 'mock')} className={`min-h-20 cursor-pointer rounded-lg border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${settings.mode === 'mock' ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--line-strong)] bg-[var(--surface)]'}`}><Braces size={18} className="text-[var(--accent)]" /><span className="mt-2 block text-sm font-medium">Mock 演示</span><span className="mt-1 block text-xs text-[var(--text-muted)]">无需服务，完整交互</span></button><button type="button" onClick={() => update('mode', 'http')} className={`min-h-20 cursor-pointer rounded-lg border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${settings.mode === 'http' ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--line-strong)] bg-[var(--surface)]'}`}><Server size={18} className="text-[var(--cyan)]" /><span className="mt-2 block text-sm font-medium">HTTP 内网服务</span><span className="mt-1 block text-xs text-[var(--text-muted)]">同一数据契约</span></button></div>
            <label className="block text-sm">服务 Base URL<input value={settings.baseUrl} onChange={(event) => update('baseUrl', event.target.value)} disabled={settings.mode === 'mock'} placeholder="https://memory-rsi.internal.example/api" className="mt-2 h-11 w-full rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] px-3 font-mono text-xs outline-none focus:border-[var(--accent)] disabled:opacity-50" /></label>
            <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">SSO 用户头<input value={settings.userHeader} onChange={(event) => update('userHeader', event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] px-3 font-mono text-xs outline-none focus:border-[var(--accent)]" /></label><label className="text-sm">SSO 角色头<input value={settings.roleHeader} onChange={(event) => update('roleHeader', event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] px-3 font-mono text-xs outline-none focus:border-[var(--accent)]" /></label></div>
            <label className="block text-sm">请求超时（毫秒）<input type="number" min={1000} max={60000} step={1000} value={settings.timeout} onChange={(event) => update('timeout', Number(event.target.value))} className="mt-2 h-11 w-full rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] px-3 font-mono text-xs outline-none focus:border-[var(--accent)]" /></label>
            {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
            <div className="flex flex-wrap gap-2 border-t border-[var(--line)] pt-4"><Button onClick={() => void test()} disabled={testing}><Cable size={16} />{testing ? '正在测试…' : '测试连接'}</Button><Button variant="primary" onClick={() => void save()} disabled={loading}>应用配置</Button></div>
            {testResult && <div role="status" className={`flex gap-2 rounded-lg border p-3 text-xs leading-5 ${testResult.ok ? 'border-[var(--mint)] bg-[var(--mint-soft)] text-[var(--mint)]' : 'border-[var(--danger-line)] bg-[var(--danger-soft)] text-[var(--danger)]'}`}>{testResult.ok ? <CheckCircle2 size={17} className="shrink-0" /> : <XCircle size={17} className="shrink-0" />}{testResult.message}</div>}
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="SSO 与权限接入约定" description="前端不伪造登录态，生产环境由网关完成认证与鉴权。" action={<ShieldCheck size={18} className="text-[var(--mint)]" />} />
          <div className="space-y-5 p-5 text-sm leading-6 text-[var(--text-secondary)]">
            <div><h3 className="font-medium text-[var(--text-primary)]">1. 身份透传</h3><p className="mt-1">HTTP 请求携带 Cookie（credentials: include）以及可配置的用户/角色头。个人面板默认读取当前身份，无需前端输入用户 ID。</p></div>
            <div><h3 className="font-medium text-[var(--text-primary)]">2. 服务端鉴权</h3><p className="mt-1">管理者迭代和管理员全量查询必须在服务端再次校验权限；角色切换器只用于预览界面，不构成安全边界。</p></div>
            <div><h3 className="font-medium text-[var(--text-primary)]">3. 快照返回</h3><p className="mt-1">所有读操作与写操作统一返回 Snapshot，保证记忆、版本、推荐和审计在页面内一致更新。迁移时可拆接口，再收敛为适配层。</p></div>
            <div><h3 className="font-medium text-[var(--text-primary)]">4. 文件导出</h3><p className="mt-1">当前由浏览器直接生成 Markdown、JSON 与 CSV。若需保留导出审计或服务端大文件，可将下载逻辑替换为受签 URL。</p></div>
          </div>
        </Panel>
      </div>
      <Panel className="mt-6 overflow-hidden">
        <PanelHeader title="REST 接口契约" description="这些路径与 src/services/memoryApi.ts 中的 HTTP 适配器一一对应。" action={<div className="flex gap-2"><Button size="small" onClick={() => void copyContracts()}><Clipboard size={14} />复制</Button><Button size="small" onClick={() => downloadFile('memory-rsi-api-contract.json', JSON.stringify(apiContracts.map(([method, path, description]) => ({ method, path, description })), null, 2), 'application/json;charset=utf-8')}><Download size={14} />JSON</Button></div>} />
        <div className="divide-y divide-[var(--line)]">{apiContracts.map(([method, path, description]) => <div key={`${method}-${path}`} className="grid gap-3 px-5 py-4 sm:grid-cols-[80px_minmax(0,0.9fr)_minmax(0,1.1fr)] sm:items-center"><div><Badge tone={method === 'GET' ? 'mint' : method === 'POST' ? 'amber' : 'cyan'}>{method}</Badge></div><div className="break-all font-mono text-xs text-[var(--text-primary)]">{path}</div><div className="text-xs leading-5 text-[var(--text-secondary)]">{description}</div></div>)}</div>
      </Panel>
      <Panel className="mt-6"><PanelHeader title="内网移植时的最小改动范围" description="业务组件不直接依赖 fetch，统一通过 MemoryApi 访问数据。" /><div className="grid gap-5 px-5 py-5 md:grid-cols-3"><div><div className="font-mono text-xs text-[var(--accent)]">ADAPTER</div><h3 className="mt-2 text-sm font-medium">替换服务适配层</h3><p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">调整请求路径、字段映射与错误处理，保留 Snapshot 类型。</p></div><div><div className="font-mono text-xs text-[var(--accent)]">IDENTITY</div><h3 className="mt-2 text-sm font-medium">接入真实身份</h3><p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">将演示用户与角色切换替换为 SSO 返回的身份和权限集合。</p></div><div><div className="font-mono text-xs text-[var(--accent)]">POLICY</div><h3 className="mt-2 text-sm font-medium">补充企业治理</h3><p className="mt-2 text-xs leading-5 text-[var(--text-secondary)]">接入审批、脱敏、审计留存和组织级记忆发布策略。</p></div></div></Panel>
    </div>
  )
}
