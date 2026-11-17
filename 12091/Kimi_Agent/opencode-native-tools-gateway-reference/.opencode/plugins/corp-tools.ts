import { type Plugin, tool } from "@opencode-ai/plugin"
import { basename } from "node:path"

const gateway = (process.env.CORP_TOOL_GATEWAY ?? "http://127.0.0.1:8000").replace(/\/$/, "")
const maxFileBytes = Number(process.env.CORP_TOOL_MAX_FILE_BYTES ?? 15 * 1024 * 1024)

type SessionContext = { sessionID: string; agent: string }

async function callGateway(
  route: string,
  filePath: string,
  fields: Record<string, string>,
  context: SessionContext,
) {
  const userId = process.env.CORP_USER_ID
  if (!userId) throw new Error("missing_corp_user_identity")

  const file = Bun.file(filePath)
  if (!await file.exists()) throw new Error("file_not_found")
  if (file.size === 0 || file.size > maxFileBytes) throw new Error("file_empty_or_too_large")

  const form = new FormData()
  form.append("file", file, basename(filePath))
  for (const [key, value] of Object.entries(fields)) form.append(key, value)

  const response = await fetch(`${gateway}${route}`, {
    method: "POST",
    headers: {
      "X-Corp-User-Id": userId,
      "X-Corp-Device-Id": process.env.CORP_DEVICE_ID ?? "",
      "X-Corp-Client-IP": process.env.CORP_CLIENT_IP ?? "",
      "X-OpenCode-Session-Id": context.sessionID,
      "X-OpenCode-Agent": context.agent,
      "X-Request-Id": crypto.randomUUID(),
    },
    body: form,
    signal: AbortSignal.timeout(120_000),
  })

  const text = await response.text()
  if (!response.ok) throw new Error(`tool_gateway_failed:${response.status}:${text}`)
  return text
}

export const CorpToolsPlugin: Plugin = async () => ({
  tool: {
    corp_ocr: tool({
      description: "Parse a local PDF or image with the central enterprise MinerU service",
      args: {
        filePath: tool.schema.string().describe("Local PDF or image path"),
        tier: tool.schema.string().describe("flash, basic, standard, or advanced"),
      },
      async execute(args, context) {
        return callGateway("/v1/ocr/parse", args.filePath, { tier: args.tier }, context)
      },
    }),
    corp_vision: tool({
      description: "Understand a local image with the central enterprise vision service",
      args: {
        filePath: tool.schema.string().describe("Local PNG, JPEG, or WebP image path"),
        prompt: tool.schema.string().describe("Question or instruction for image understanding"),
      },
      async execute(args, context) {
        return callGateway("/v1/vision/understand", args.filePath, { prompt: args.prompt }, context)
      },
    }),
  },
})
