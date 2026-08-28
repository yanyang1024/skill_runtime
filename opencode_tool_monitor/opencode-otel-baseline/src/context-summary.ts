export type ContextSource = {
  source: string
  name?: string
  chars: number
  estimated_tokens: number
}

type ChatMessage = {
  role?: string
  name?: string
  content?: unknown
  tool_call_id?: string
  tool_calls?: Array<{
    id?: string
    function?: { name?: string; arguments?: string }
  }>
}

function textLength(value: unknown): number {
  if (typeof value === "string") return value.length
  if (Array.isArray(value)) return value.reduce((sum, item) => sum + textLength(item), 0)
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    if (typeof record.text === "string") return record.text.length
    return Object.values(record).reduce<number>((sum, item) => sum + textLength(item), 0)
  }
  return 0
}

function safeArgs(value: string | undefined) {
  if (!value) return undefined
  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch {
    return undefined
  }
}

export function summarizeContext(messages: ChatMessage[] = [], toolDefinitions: unknown[] = []): ContextSource[] {
  const toolNames = new Map<string, { tool: string; detail?: string }>()
  for (const message of messages) {
    for (const call of message.tool_calls || []) {
      if (!call.id || !call.function?.name) continue
      const args = safeArgs(call.function.arguments)
      const detail = call.function.name === "skill" && typeof args?.name === "string" ? args.name : undefined
      toolNames.set(call.id, { tool: call.function.name, detail })
    }
  }

  const grouped = new Map<string, ContextSource>()
  for (const message of messages) {
    const role = message.role || "unknown"
    const tool = message.tool_call_id ? toolNames.get(message.tool_call_id) : undefined
    let source = `conversation.${role}`
    let name = message.name
    if (role === "system") source = "system_instructions"
    if (role === "tool") {
      source = tool?.tool === "skill" ? "skill" : "tool_result"
      name = tool?.detail || tool?.tool || name
    }
    const chars = textLength(message.content)
    const key = `${source}:${name || ""}`
    const existing = grouped.get(key) || { source, name, chars: 0, estimated_tokens: 0 }
    existing.chars += chars
    existing.estimated_tokens = Math.ceil(existing.chars / 4)
    grouped.set(key, existing)
  }
  if (toolDefinitions.length > 0) {
    const chars = JSON.stringify(toolDefinitions).length
    grouped.set("tool_definitions:", {
      source: "tool_definitions",
      chars,
      estimated_tokens: Math.ceil(chars / 4),
    })
  }
  return [...grouped.values()]
}

export type Usage = {
  input: number
  output: number
  total: number
  cachedInput: number
  reasoningOutput: number
}

export function extractUsage(payload: unknown): Usage {
  const body = (payload || {}) as Record<string, any>
  const usage = (body.usage || body.response?.usage || {}) as Record<string, any>
  const input = Number(usage.input_tokens ?? usage.prompt_tokens ?? 0)
  const output = Number(usage.output_tokens ?? usage.completion_tokens ?? 0)
  return {
    input,
    output,
    total: Number(usage.total_tokens ?? input + output),
    cachedInput: Number(usage.input_tokens_details?.cached_tokens ?? usage.prompt_tokens_details?.cached_tokens ?? 0),
    reasoningOutput: Number(
      usage.output_tokens_details?.reasoning_tokens ?? usage.completion_tokens_details?.reasoning_tokens ?? 0,
    ),
  }
}

export function extractFinishReasons(payload: unknown): string[] {
  const body = (payload || {}) as Record<string, any>
  if (Array.isArray(body.choices)) {
    return body.choices.map((choice: any) => choice.finish_reason).filter((item: unknown): item is string => !!item)
  }
  const status = body.status
  return typeof status === "string" ? [status] : []
}
