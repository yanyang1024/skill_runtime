import { createHash } from "node:crypto"

export type CaptureMode = "off" | "redacted" | "full"

const SECRET_KEY = /authorization|api[-_]?key|access[-_]?token|refresh[-_]?token|password|passwd|secret|cookie/i
const SECRET_TEXT = /(bearer\s+)[a-z0-9._~+/=-]+|(sk-[a-z0-9_-]{12,})/gi

export function captureMode(): CaptureMode {
  const value = (process.env.AGENT_OTEL_CAPTURE_CONTENT || "redacted").toLowerCase()
  if (value === "full" || value === "off") return value
  return "redacted"
}

export function maxContentChars() {
  return Math.max(1024, Number(process.env.AGENT_OTEL_MAX_CONTENT_CHARS || 65_536))
}

export function sha256(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex")
}

function redactString(value: string) {
  return value.replace(SECRET_TEXT, (_match, bearerPrefix: string | undefined) =>
    bearerPrefix ? `${bearerPrefix}[REDACTED]` : "[REDACTED]",
  )
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 12) return "[MAX_DEPTH]"
  if (typeof value === "string") return redactString(value)
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1))
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value)) {
      output[key] = SECRET_KEY.test(key) ? "[REDACTED]" : redact(child, depth + 1)
    }
    return output
  }
  return value
}

export function boundedJson(value: unknown, mode = captureMode()) {
  if (mode === "off") return undefined
  const prepared = mode === "full" ? value : redact(value)
  const json = JSON.stringify(prepared)
  if (json === undefined) return undefined
  const limit = maxContentChars()
  return json.length <= limit ? json : `${json.slice(0, limit)}…[TRUNCATED]`
}

export function contentFingerprint(value: unknown) {
  if (value instanceof Uint8Array) return { bytes: value.byteLength, sha256: sha256(value) }
  const json = typeof value === "string" ? value : JSON.stringify(value) ?? "undefined"
  return { bytes: Buffer.byteLength(json), sha256: sha256(json) }
}
