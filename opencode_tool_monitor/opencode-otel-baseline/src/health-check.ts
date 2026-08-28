import { queueSnapshot } from "./collector-metrics.ts"

type Check = {
  ok: boolean
  status?: number
  detail?: unknown
  error?: string
}

const collectorHealth = process.env.OTELCOL_HEALTH_URL || "http://127.0.0.1:13133/"
const collectorMetrics = process.env.OTELCOL_METRICS_URL || "http://127.0.0.1:8888/metrics"
const proxyHealth = process.env.MODEL_PROXY_HEALTH_URL || "http://127.0.0.1:8787/health"
const timeoutMs = Number(process.env.HEALTH_CHECK_TIMEOUT_MS || 3000)
const queueWarningRatio = Number(process.env.OTELCOL_QUEUE_WARNING_RATIO || 0.7)
const queueCriticalRatio = Number(process.env.OTELCOL_QUEUE_CRITICAL_RATIO || 0.9)

async function request(url: string): Promise<{ response: Response; text: string }> {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
  return { response, text: await response.text() }
}

async function httpCheck(url: string, expectJson = false): Promise<Check> {
  try {
    const { response, text } = await request(url)
    let detail: unknown = text.slice(0, 500)
    if (expectJson && text) {
      try {
        detail = JSON.parse(text)
      } catch {
        detail = text.slice(0, 500)
      }
    }
    return { ok: response.ok, status: response.status, detail }
  } catch (error) {
    return { ok: false, error: String((error as Error).message || error) }
  }
}

async function queueCheck(): Promise<Check & { size?: number; capacity?: number; ratio?: number; sendFailures?: number }> {
  try {
    const { response, text } = await request(collectorMetrics)
    if (!response.ok) return { ok: false, status: response.status, detail: text.slice(0, 500) }

    const snapshot = queueSnapshot(text)
    return {
      ok: snapshot.ratio < queueCriticalRatio,
      status: response.status,
      ...snapshot,
      detail: snapshot.ratio >= queueWarningRatio ? "collector export queue is filling" : "collector metrics reachable",
    }
  } catch (error) {
    return { ok: false, error: String((error as Error).message || error) }
  }
}

const [collector, proxy, queue] = await Promise.all([
  httpCheck(collectorHealth),
  httpCheck(proxyHealth, true),
  queueCheck(),
])

const queueRatio = queue.ratio || 0
const status = !collector.ok || !proxy.ok || !queue.ok
  ? "critical"
  : queueRatio >= queueWarningRatio
    ? "warning"
    : "ok"

console.log(JSON.stringify({ status, collector, modelProxy: proxy, exportQueue: queue }, null, 2))
if (status === "critical") process.exitCode = 1
