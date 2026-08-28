import { createHash } from "node:crypto"
import { createServer, type IncomingHttpHeaders, type IncomingMessage, type ServerResponse } from "node:http"
import { ROOT_CONTEXT, SpanKind, SpanStatusCode, TraceFlags, trace, type Context, type Span } from "@opentelemetry/api"
import { SeverityNumber } from "@opentelemetry/api-logs"
import { attrs, createTelemetry } from "../.opencode/lib/otel.ts"
import { boundedJson, captureMode, contentFingerprint } from "../.opencode/lib/content.ts"
import { extractFinishReasons, extractUsage, summarizeContext, type Usage } from "./context-summary.ts"

type Identity = {
  taskID?: string
  runID?: string
  stepID?: string
  attempt: number
  sessionID?: string
  agentName?: string
}

type Price = {
  input_per_1m: number
  output_per_1m: number
  cached_input_per_1m?: number
}

const port = Number(process.env.MODEL_PROXY_PORT || 8787)
const upstreamBase = process.env.MODEL_PROXY_UPSTREAM_BASE_URL
const providerName = process.env.MODEL_PROXY_PROVIDER_NAME || "openai"
const content = captureMode()
const telemetry = createTelemetry({
  serviceName: process.env.MODEL_PROXY_SERVICE_NAME || "opencode-model-proxy",
  serviceVersion: "0.2.1",
  scopeName: "opencode.model.proxy",
})

const prices = (() => {
  try {
    return JSON.parse(process.env.MODEL_PRICES_JSON || "{}") as Record<string, Price>
  } catch {
    return {} as Record<string, Price>
  }
})()

function header(headers: IncomingHttpHeaders, name: string) {
  const value = headers[name.toLowerCase()]
  return Array.isArray(value) ? value[0] : value
}

function identity(headers: IncomingHttpHeaders): Identity {
  return {
    taskID: header(headers, "x-agent-task-id"),
    runID: header(headers, "x-agent-run-id"),
    stepID: header(headers, "x-agent-step-id"),
    attempt: Number(header(headers, "x-agent-attempt") || 1),
    sessionID: header(headers, "x-opencode-session-id"),
    agentName: header(headers, "x-agent-name"),
  }
}

function identityAttrs(value: Identity) {
  return {
    "agent.task.id": value.taskID,
    "agent.run.id": value.runID,
    "agent.step.id": value.stepID,
    "agent.attempt": value.attempt,
    "gen_ai.conversation.id": value.sessionID,
    "opencode.session.id": value.sessionID,
    "gen_ai.agent.name": value.agentName,
  }
}

function parseParent(value: string | undefined): Context {
  const match = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i.exec(value || "")
  if (!match?.[1] || !match[2] || !match[3]) return ROOT_CONTEXT
  return trace.setSpanContext(ROOT_CONTEXT, {
    traceId: match[1].toLowerCase(),
    spanId: match[2].toLowerCase(),
    traceFlags: (Number.parseInt(match[3], 16) & TraceFlags.SAMPLED) as TraceFlags,
    isRemote: true,
  })
}

function childTraceparent(span: Span) {
  const value = span.spanContext()
  return `00-${value.traceId}-${value.spanId}-${value.traceFlags.toString(16).padStart(2, "0")}`
}

function joinUpstream(base: string, requestPath: string) {
  const parsed = new URL(base.endsWith("/") ? base : `${base}/`)
  const incoming = new URL(requestPath, "http://proxy.local")
  let prefix = parsed.pathname.replace(/\/$/, "")
  let suffix = incoming.pathname
  if (prefix.endsWith("/v1") && suffix.startsWith("/v1/")) suffix = suffix.slice(3)
  parsed.pathname = `${prefix}${suffix}`.replace(/\/+/g, "/")
  parsed.search = incoming.search
  return parsed
}

const hopByHop = new Set([
  "connection",
  "content-length",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
])

function outgoingHeaders(input: IncomingHttpHeaders, span?: Span) {
  const output = new Headers()
  for (const [key, value] of Object.entries(input)) {
    if (hopByHop.has(key) || key.startsWith("x-agent-") || key === "x-opencode-session-id") continue
    if (key === "traceparent" || key === "tracestate" || key === "baggage") continue
    if (Array.isArray(value)) value.forEach((item) => output.append(key, item))
    else if (value !== undefined) output.set(key, value)
  }
  const upstreamKey = process.env.MODEL_PROXY_UPSTREAM_API_KEY
  if (upstreamKey) output.set("authorization", `Bearer ${upstreamKey}`)
  if (span) output.set("traceparent", childTraceparent(span))
  return output
}

async function readBody(req: IncomingMessage, limit = 20 * 1024 * 1024) {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > limit) throw new Error("request_too_large")
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}

function copyResponseHeaders(source: Headers, target: ServerResponse) {
  source.forEach((value, key) => {
    if (!hopByHop.has(key.toLowerCase()) && key.toLowerCase() !== "content-encoding") target.setHeader(key, value)
  })
}

function calculateCost(model: string, usage: Usage) {
  const price = prices[model]
  if (!price) return undefined
  const cached = Math.min(usage.cachedInput, usage.input)
  const regularInput = usage.input - cached
  return (
    (regularInput * price.input_per_1m +
      cached * (price.cached_input_per_1m ?? price.input_per_1m) +
      usage.output * price.output_per_1m) /
    1_000_000
  )
}

function responseSummaryFromSse(raw: string) {
  const payloads: any[] = []
  let usage: Usage = { input: 0, output: 0, total: 0, cachedInput: 0, reasoningOutput: 0 }
  const finishReasons = new Set<string>()
  let text = ""
  const toolCalls = new Map<number, { id?: string; name?: string; arguments: string }>()
  for (const line of raw.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue
    const data = line.slice(5).trim()
    if (!data || data === "[DONE]") continue
    try {
      const payload = JSON.parse(data)
      payloads.push(payload)
      const found = extractUsage(payload)
      if (found.total > 0) usage = found
      for (const reason of extractFinishReasons(payload)) finishReasons.add(reason)
      for (const choice of payload.choices || []) {
        const delta = choice.delta || {}
        if (typeof delta.content === "string") text += delta.content
        for (const call of delta.tool_calls || []) {
          const index = Number(call.index || 0)
          const existing = toolCalls.get(index) || { arguments: "" }
          if (call.id) existing.id = call.id
          if (call.function?.name) existing.name = call.function.name
          if (call.function?.arguments) existing.arguments += call.function.arguments
          toolCalls.set(index, existing)
        }
      }
    } catch {
      // Ignore non-JSON SSE fields; they are still represented by the body hash.
    }
  }
  const parts: unknown[] = []
  if (text) parts.push({ type: "text", content: text })
  for (const call of toolCalls.values()) {
    parts.push({ type: "tool_call", id: call.id, name: call.name, arguments: call.arguments })
  }
  return {
    usage,
    finishReasons: [...finishReasons],
    outputMessages: [{ role: "assistant", parts, finish_reason: [...finishReasons][0] }],
    payloads,
  }
}

function emitContextSummary(requestBody: any, id: Identity, runContext: Context, authoritativeInputTokens: number) {
  const sources = summarizeContext(
    Array.isArray(requestBody.messages) ? requestBody.messages : [],
    Array.isArray(requestBody.tools) ? requestBody.tools : [],
  )
  telemetry.emitEvent(
    "agent.context.summary",
    {
      ...identityAttrs(id),
      "agent.context.sources": sources,
      "agent.context.source_count": sources.length,
      "agent.context.estimated_tokens": sources.reduce((sum, source) => sum + source.estimated_tokens, 0),
      "gen_ai.usage.input_tokens": authoritativeInputTokens || undefined,
      "agent.context.token_method": authoritativeInputTokens > 0 ? "provider_total+chars_per_source" : "chars_per_source",
    },
    runContext,
  )
}

function finishModelSpan(args: {
  span: Span
  spanContext: Context
  startedAt: number
  requestBody: any
  responseBody: unknown
  responseBytes: number
  responseHash: string
  statusCode: number
  id: Identity
  model: string
  usage: Usage
  finishReasons: string[]
  outputMessages?: unknown
  errorType?: string
}) {
  const duration = (Date.now() - args.startedAt) / 1000
  const cost = calculateCost(args.model, args.usage)
  args.span.setAttributes(
    attrs({
      "http.response.status_code": args.statusCode,
      "gen_ai.response.model": args.model,
      "gen_ai.response.finish_reasons": args.finishReasons,
      "gen_ai.usage.input_tokens": args.usage.input,
      "gen_ai.usage.output_tokens": args.usage.output,
      "gen_ai.usage.cache_read.input_tokens": args.usage.cachedInput || undefined,
      "gen_ai.usage.reasoning.output_tokens": args.usage.reasoningOutput || undefined,
      "gen_ai.output.messages": boundedJson(args.outputMessages, content),
      "agent.model.response.sha256": args.responseHash,
      "agent.model.response.bytes": args.responseBytes,
      "agent.cost.usd": cost,
      "agent.cost.source": cost === undefined ? undefined : "price_config",
      "error.type": args.errorType,
    }),
  )
  if (args.errorType) args.span.setStatus({ code: SpanStatusCode.ERROR, message: args.errorType })
  else args.span.setStatus({ code: SpanStatusCode.OK })

  const metricAttrs = attrs({
    "gen_ai.operation.name": "chat",
    "gen_ai.provider.name": providerName,
    "gen_ai.request.model": args.model,
    "error.type": args.errorType,
  })
  telemetry.metrics.modelDuration.record(duration, metricAttrs, args.spanContext)
  if (args.usage.input > 0) {
    telemetry.metrics.tokenUsage.record(
      args.usage.input,
      attrs({ ...metricAttrs, "gen_ai.token.type": "input" }),
      args.spanContext,
    )
  }
  if (args.usage.output > 0) {
    telemetry.metrics.tokenUsage.record(
      args.usage.output,
      attrs({ ...metricAttrs, "gen_ai.token.type": "output" }),
      args.spanContext,
    )
  }
  if (cost !== undefined) telemetry.metrics.cost.add(cost, attrs({ "agent.cost.source": "price_config" }), args.spanContext)
  if (args.errorType) {
    telemetry.metrics.failures.add(1, attrs({ "agent.failure.reason": args.errorType }), args.spanContext)
  }
  emitContextSummary(args.requestBody, args.id, args.spanContext, args.usage.input)
  telemetry.emitEvent(
    "gen_ai.client.inference.operation.details",
    {
      ...identityAttrs(args.id),
      "gen_ai.operation.name": "chat",
      "gen_ai.provider.name": providerName,
      "gen_ai.request.model": args.model,
      "gen_ai.input.messages": boundedJson(args.requestBody.messages, content),
      "gen_ai.tool.definitions": boundedJson(args.requestBody.tools, content),
      "gen_ai.output.messages": boundedJson(args.outputMessages || args.responseBody, content),
      "gen_ai.usage.input_tokens": args.usage.input,
      "gen_ai.usage.output_tokens": args.usage.output,
      "agent.cost.usd": cost,
      "error.type": args.errorType,
    },
    args.spanContext,
    args.errorType ? SeverityNumber.ERROR : SeverityNumber.INFO,
  )
  args.span.end()
}

function failureType(error: unknown) {
  const value = String((error as Error)?.message || error).toLowerCase()
  if (value.includes("abort") || value.includes("cancel")) return "cancelled"
  if (value.includes("timeout")) return "timeout"
  if (value.includes("request_too_large")) return "request_too_large"
  return "proxy_error"
}

async function emitExternalEvent(req: IncomingMessage, res: ServerResponse) {
  try {
    const body = JSON.parse((await readBody(req, 1024 * 1024)).toString("utf8")) as {
      name?: string
      attributes?: Record<string, unknown>
    }
    if (!body.name || !/^(agent\.|gen_ai\.evaluation\.result$)/.test(body.name)) {
      res.writeHead(400, { "content-type": "application/json" })
      res.end(JSON.stringify({ error: "name must start with agent. or equal gen_ai.evaluation.result" }))
      return
    }
    const parent = parseParent(header(req.headers, "traceparent"))
    telemetry.emitEvent(body.name, body.attributes || {}, parent)
    res.writeHead(202, { "content-type": "application/json" })
    res.end(JSON.stringify({ accepted: true }))
  } catch (error) {
    res.writeHead(400, { "content-type": "application/json" })
    res.end(JSON.stringify({ error: String((error as Error).message || error) }))
  }
}

async function passthrough(req: IncomingMessage, res: ServerResponse) {
  if (!upstreamBase) {
    res.writeHead(503, { "content-type": "application/json" })
    res.end(JSON.stringify({ error: "MODEL_PROXY_UPSTREAM_BASE_URL is required" }))
    return
  }
  const body = await readBody(req)
  const upstream = await fetch(joinUpstream(upstreamBase, req.url || "/"), {
    method: req.method,
    headers: outgoingHeaders(req.headers),
    body: body.length ? body : undefined,
    redirect: "manual",
  })
  res.statusCode = upstream.status
  copyResponseHeaders(upstream.headers, res)
  if (!upstream.body) {
    res.end()
    return
  }
  const reader = upstream.body.getReader()
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    res.write(Buffer.from(value))
  }
  res.end()
}

async function proxy(req: IncomingMessage, res: ServerResponse) {
  if (!upstreamBase) {
    res.writeHead(503, { "content-type": "application/json" })
    res.end(JSON.stringify({ error: "MODEL_PROXY_UPSTREAM_BASE_URL is required" }))
    return
  }
  const bodyBuffer = await readBody(req)
  const requestFingerprint = contentFingerprint(bodyBuffer)
  let requestBody: any = {}
  try {
    requestBody = bodyBuffer.length ? JSON.parse(bodyBuffer.toString("utf8")) : {}
  } catch {
    requestBody = {}
  }
  const model = String(requestBody.model || "unknown")
  const id = identity(req.headers)
  const parent = parseParent(header(req.headers, "traceparent"))
  const target = joinUpstream(upstreamBase, req.url || "/")
  const span = telemetry.tracer.startSpan(
    `chat ${model}`,
    {
      kind: SpanKind.CLIENT,
      attributes: attrs({
        ...identityAttrs(id),
        "gen_ai.operation.name": "chat",
        "gen_ai.provider.name": providerName,
        "gen_ai.request.model": model,
        "server.address": target.hostname,
        "server.port": target.port ? Number(target.port) : undefined,
        "gen_ai.input.messages": boundedJson(requestBody.messages, content),
        "gen_ai.tool.definitions": boundedJson(requestBody.tools, content),
        "agent.model.request.sha256": requestFingerprint.sha256,
        "agent.model.request.bytes": requestFingerprint.bytes,
      }),
    },
    parent,
  )
  const currentContext = trace.setSpan(parent, span)
  const startedAt = Date.now()
  let ended = false
  const endWithError = (error: unknown, statusCode = 502) => {
    if (ended) return
    ended = true
    const errorType = failureType(error)
    span.recordException(error as Error)
    finishModelSpan({
      span,
      spanContext: currentContext,
      startedAt,
      requestBody,
      responseBody: { error: String((error as Error)?.message || error) },
      responseBytes: 0,
      responseHash: createHash("sha256").digest("hex"),
      statusCode,
      id,
      model,
      usage: { input: 0, output: 0, total: 0, cachedInput: 0, reasoningOutput: 0 },
      finishReasons: [],
      errorType,
    })
  }

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers: outgoingHeaders(req.headers, span),
      body: bodyBuffer.length ? bodyBuffer : undefined,
      redirect: "manual",
    })
    res.statusCode = upstream.status
    copyResponseHeaders(upstream.headers, res)
    const errorType = upstream.status >= 500 ? "provider_http_5xx" : upstream.status >= 400 ? "provider_http_4xx" : undefined
    const responseHash = createHash("sha256")
    let responseBytes = 0
    const chunks: Buffer[] = []
    let capturedBytes = 0
    const captureLimit = Number(process.env.AGENT_OTEL_MAX_CONTENT_CHARS || 65_536) * 4
    const reader = upstream.body?.getReader()
    if (reader) {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        const chunk = Buffer.from(value)
        responseHash.update(chunk)
        responseBytes += chunk.length
        if (capturedBytes < captureLimit) {
          const remaining = captureLimit - capturedBytes
          const capturedChunk = chunk.length <= remaining ? chunk : chunk.subarray(0, remaining)
          chunks.push(capturedChunk)
          capturedBytes += capturedChunk.length
        }
        res.write(chunk)
      }
    }
    res.end()
    const captured = Buffer.concat(chunks).toString("utf8")
    const isSse = upstream.headers.get("content-type")?.includes("text/event-stream") || requestBody.stream === true
    let responseBody: any = captured
    let usage: Usage = { input: 0, output: 0, total: 0, cachedInput: 0, reasoningOutput: 0 }
    let finishReasons: string[] = []
    let outputMessages: unknown = undefined
    if (isSse) {
      const summary = responseSummaryFromSse(captured)
      usage = summary.usage
      finishReasons = summary.finishReasons
      outputMessages = summary.outputMessages
      responseBody = summary.payloads
    } else {
      try {
        responseBody = JSON.parse(captured)
      } catch {
        responseBody = captured
      }
      usage = extractUsage(responseBody)
      finishReasons = extractFinishReasons(responseBody)
      outputMessages = responseBody?.choices?.map((choice: any) => ({
        role: choice.message?.role || "assistant",
        parts: choice.message?.content ? [{ type: "text", content: choice.message.content }] : [],
        finish_reason: choice.finish_reason,
      }))
    }
    ended = true
    finishModelSpan({
      span,
      spanContext: currentContext,
      startedAt,
      requestBody,
      responseBody,
      responseBytes,
      responseHash: responseHash.digest("hex"),
      statusCode: upstream.status,
      id,
      model,
      usage,
      finishReasons,
      outputMessages,
      errorType,
    })
  } catch (error) {
    endWithError(error)
    if (!res.headersSent) res.writeHead(502, { "content-type": "application/json" })
    if (!res.writableEnded) res.end(JSON.stringify({ error: { type: "proxy_error", message: String((error as Error).message) } }))
  }
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" })
      res.end(JSON.stringify({ ok: true, upstreamConfigured: Boolean(upstreamBase) }))
      return
    }
    if (req.method === "POST" && req.url === "/events") {
      await emitExternalEvent(req, res)
      return
    }
    const pathname = new URL(req.url || "/", "http://proxy.local").pathname
    if (!pathname.endsWith("/chat/completions")) {
      await passthrough(req, res)
      return
    }
    await proxy(req, res)
  } catch (error) {
    res.writeHead(500, { "content-type": "application/json" })
    res.end(JSON.stringify({ error: String((error as Error).message || error) }))
  }
})

server.listen(port, "127.0.0.1", () => {
  console.log(`OpenCode model proxy listening on http://127.0.0.1:${port}`)
})

async function close() {
  server.close()
  await telemetry.shutdown()
}

process.once("SIGINT", () => void close())
process.once("SIGTERM", () => void close())
