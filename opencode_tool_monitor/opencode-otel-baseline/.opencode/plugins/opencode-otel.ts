import { randomUUID } from "node:crypto"
import type { Plugin } from "@opencode-ai/plugin"
import { SpanKind, SpanStatusCode, trace, type Context, type Span } from "@opentelemetry/api"
import { SeverityNumber } from "@opentelemetry/api-logs"
import { createTelemetry, attrs, spanContext } from "../lib/otel.ts"
import { boundedJson, captureMode, contentFingerprint } from "../lib/content.ts"

type RunState = {
  sessionID: string
  taskID: string
  runID: string
  span: Span
  context: Context
  startedAt: number
  step: number
  modelCalls: number
  toolCalls: number
  inputTokens: number
  outputTokens: number
  cost: number
  loadedSkills: Set<string>
  completedMessages: Set<string>
}

type ToolState = {
  sessionID: string
  runID: string
  stepID: string
  tool: string
  span: Span
  context: Context
  startedAt: number
  args: unknown
}

const telemetry = createTelemetry({
  serviceName: process.env.OTEL_SERVICE_NAME || "opencode-agent",
  serviceVersion: process.env.OPENCODE_VERSION || "unknown",
  scopeName: "opencode.plugin.observability",
})

const runs = new Map<string, RunState>()
const tools = new Map<string, ToolState>()
const content = captureMode()

function traceparent(span: Span) {
  const value = span.spanContext()
  const flags = value.traceFlags.toString(16).padStart(2, "0")
  return `00-${value.traceId}-${value.spanId}-${flags}`
}

function identity(run: RunState, stepID?: string) {
  return {
    "agent.task.id": run.taskID,
    "agent.run.id": run.runID,
    "agent.step.id": stepID,
    "agent.attempt": Number(process.env.AGENT_ATTEMPT || 1),
    "gen_ai.conversation.id": run.sessionID,
    "opencode.session.id": run.sessionID,
  }
}

function startRun(sessionID: string, userMessageID?: string) {
  const existing = runs.get(sessionID)
  if (existing) endRun(sessionID, "superseded")
  const taskID = process.env.AGENT_TASK_ID || sessionID
  const runID = randomUUID()
  const span = telemetry.tracer.startSpan("invoke_agent opencode", {
    kind: SpanKind.INTERNAL,
    attributes: attrs({
      "gen_ai.operation.name": "invoke_agent",
      "gen_ai.agent.name": process.env.AGENT_NAME || "opencode",
      "gen_ai.conversation.id": sessionID,
      "agent.task.id": taskID,
      "agent.run.id": runID,
      "agent.attempt": Number(process.env.AGENT_ATTEMPT || 1),
      "opencode.session.id": sessionID,
      "opencode.user_message.id": userMessageID,
    }),
  })
  const state: RunState = {
    sessionID,
    taskID,
    runID,
    span,
    context: spanContext(span),
    startedAt: Date.now(),
    step: 0,
    modelCalls: 0,
    toolCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cost: 0,
    loadedSkills: new Set(),
    completedMessages: new Set(),
  }
  runs.set(sessionID, state)
  telemetry.emitEvent("agent.run.started", identity(state), state.context)
  return state
}

function ensureRun(sessionID: string) {
  return runs.get(sessionID) || startRun(sessionID)
}

function nextStep(run: RunState) {
  run.step += 1
  return `${run.runID}:${run.step}`
}

function unloadSkills(run: RunState, reason: "compaction" | "run_end") {
  for (const skill of run.loadedSkills) {
    const eventAttrs = { ...identity(run), "agent.skill.name": skill, "agent.skill.unload.reason": reason }
    run.span.addEvent("agent.skill.unloaded", attrs(eventAttrs))
    telemetry.emitEvent("agent.skill.unloaded", eventAttrs, run.context)
  }
  run.loadedSkills.clear()
}

function endRun(sessionID: string, reason: string, errorType?: string) {
  const run = runs.get(sessionID)
  if (!run) return
  for (const [callID, tool] of tools) {
    if (tool.sessionID === sessionID) finishTool(callID, { reason: "run_ended_before_tool_after" }, errorType || "cancelled")
  }
  unloadSkills(run, "run_end")
  const duration = (Date.now() - run.startedAt) / 1000
  run.span.setAttributes(
    attrs({
      "agent.run.end_reason": reason,
      "agent.run.model_calls": run.modelCalls,
      "agent.run.tool_calls": run.toolCalls,
      "gen_ai.usage.input_tokens": run.inputTokens,
      "gen_ai.usage.output_tokens": run.outputTokens,
      "agent.cost.usd": run.cost,
      "error.type": errorType,
    }),
  )
  if (errorType) run.span.setStatus({ code: SpanStatusCode.ERROR, message: errorType })
  else run.span.setStatus({ code: SpanStatusCode.OK })
  const metricAttrs = attrs({
    "gen_ai.agent.name": process.env.AGENT_NAME || "opencode",
    "agent.run.end_reason": reason,
    "error.type": errorType,
  })
  telemetry.metrics.runDuration.record(duration, metricAttrs, run.context)
  telemetry.metrics.runToolCalls.record(run.toolCalls, metricAttrs, run.context)
  telemetry.metrics.runModelCalls.record(run.modelCalls, metricAttrs, run.context)
  if (run.cost > 0) telemetry.metrics.cost.add(run.cost, attrs({ "agent.cost.source": "opencode" }), run.context)
  telemetry.emitEvent("agent.run.finished", { ...identity(run), "agent.run.duration_s": duration, "error.type": errorType }, run.context)
  run.span.end()
  runs.delete(sessionID)
}

function sessionIDFrom(event: any): string | undefined {
  const props = event?.properties || {}
  return (
    props.sessionID ||
    props.sessionId ||
    props.info?.sessionID ||
    props.info?.sessionId ||
    props.part?.sessionID ||
    props.permission?.sessionID
  )
}

function errorTypeFrom(value: unknown, fallback = "unknown") {
  const text = JSON.stringify(value || "").toLowerCase()
  if (text.includes("permission") || text.includes("denied")) return "permission_denied"
  if (text.includes("timeout")) return "timeout"
  if (text.includes("cancel") || text.includes("abort")) return "cancelled"
  if (text.includes("sandbox") || text.includes("bwrap")) return "sandbox_denied"
  return fallback
}

function finishTool(callID: string, output: unknown, errorType?: string) {
  const state = tools.get(callID)
  if (!state) return
  const run = runs.get(state.sessionID)
  const duration = (Date.now() - state.startedAt) / 1000
  const fingerprint = contentFingerprint(output)
  state.span.setAttributes(
    attrs({
      "gen_ai.tool.call.result": boundedJson(output, content),
      "agent.tool.result.sha256": fingerprint.sha256,
      "agent.tool.result.bytes": fingerprint.bytes,
      "error.type": errorType,
    }),
  )
  if (errorType) {
    state.span.setStatus({ code: SpanStatusCode.ERROR, message: errorType })
    telemetry.metrics.failures.add(1, attrs({ "agent.failure.reason": errorType, "gen_ai.tool.name": state.tool }))
  } else {
    state.span.setStatus({ code: SpanStatusCode.OK })
  }
  telemetry.metrics.toolDuration.record(
    duration,
    attrs({ "gen_ai.operation.name": "execute_tool", "gen_ai.tool.name": state.tool, "error.type": errorType }),
    state.context,
  )
  if (run && state.tool === "skill" && !errorType) {
    const skill = String((state.args as any)?.name || "unknown")
    run.loadedSkills.add(skill)
    const eventAttrs = { ...identity(run, state.stepID), "agent.skill.name": skill }
    run.span.addEvent("agent.skill.loaded", attrs(eventAttrs))
    telemetry.emitEvent("agent.skill.loaded", eventAttrs, run.context)
  }
  if (run && ["write", "edit", "apply_patch"].includes(state.tool) && !errorType) {
    const path = String((state.args as any)?.filePath || (state.args as any)?.path || "unknown")
    const pathFingerprint = contentFingerprint(path)
    telemetry.emitEvent(
      "agent.artifact.changed",
      {
        ...identity(run, state.stepID),
        "artifact.id": pathFingerprint.sha256,
        "artifact.name": path.split(/[\\/]/).pop(),
        "artifact.path": content === "off" ? undefined : path,
        "artifact.action": "updated",
        "artifact.source": `tool:${state.tool}`,
      },
      run.context,
    )
  }
  state.span.end()
  tools.delete(callID)
}

process.once("beforeExit", () => {
  void telemetry.shutdown()
})

export const OpenCodeOtelBaseline: Plugin = async () => {
  return {
    "chat.headers": async (input, output) => {
      const run = ensureRun(input.sessionID)
      const stepID = nextStep(run)
      run.modelCalls += 1
      output.headers.traceparent = traceparent(run.span)
      if (process.env.AGENT_OTEL_INJECT_PRIVATE_HEADERS === "1") {
        output.headers["x-agent-task-id"] = run.taskID
        output.headers["x-agent-run-id"] = run.runID
        output.headers["x-agent-step-id"] = stepID
        output.headers["x-agent-attempt"] = String(process.env.AGENT_ATTEMPT || 1)
        output.headers["x-opencode-session-id"] = run.sessionID
        output.headers["x-agent-name"] = input.agent
      }
      telemetry.emitEvent(
        "agent.model.request.prepared",
        {
          ...identity(run, stepID),
          "gen_ai.request.model": (input.model as any)?.id || (input.model as any)?.modelID,
          "gen_ai.provider.name": (input.model as any)?.providerID,
        },
        run.context,
      )
    },

    "tool.execute.before": async (input, output) => {
      const run = ensureRun(input.sessionID)
      const stepID = nextStep(run)
      run.toolCalls += 1
      const fingerprint = contentFingerprint(output.args)
      const span = telemetry.tracer.startSpan(
        `execute_tool ${input.tool}`,
        {
          kind: SpanKind.INTERNAL,
          attributes: attrs({
            ...identity(run, stepID),
            "gen_ai.operation.name": "execute_tool",
            "gen_ai.tool.name": input.tool,
            "gen_ai.tool.call.id": input.callID,
            "gen_ai.tool.call.arguments": boundedJson(output.args, content),
            "agent.tool.arguments.sha256": fingerprint.sha256,
            "agent.tool.arguments.bytes": fingerprint.bytes,
          }),
        },
        run.context,
      )
      const toolContext = trace.setSpan(run.context, span)
      tools.set(input.callID, {
        sessionID: input.sessionID,
        runID: run.runID,
        stepID,
        tool: input.tool,
        span,
        context: toolContext,
        startedAt: Date.now(),
        args: output.args,
      })
      if (input.tool === "skill") {
        telemetry.emitEvent(
          "agent.skill.load.requested",
          { ...identity(run, stepID), "agent.skill.name": String((output.args as any)?.name || "unknown") },
          toolContext,
        )
      }
    },

    "tool.execute.after": async (input, output) => {
      finishTool(input.callID, output)
    },

    "permission.ask": async (input, output) => {
      const sessionID = (input as any).sessionID
      if (!sessionID) return
      const run = ensureRun(sessionID)
      telemetry.emitEvent(
        "agent.permission.decision",
        {
          ...identity(run),
          "agent.permission.name": (input as any).permission,
          "agent.permission.patterns": (input as any).patterns,
          "agent.permission.decision": output.status,
        },
        run.context,
        output.status === "deny" ? SeverityNumber.WARN : SeverityNumber.INFO,
      )
    },

    "shell.env": async (input, output) => {
      if (!input.sessionID) return
      const run = runs.get(input.sessionID)
      if (!run) return
      const tool = input.callID ? tools.get(input.callID) : undefined
      output.env.AGENT_TASK_ID = run.taskID
      output.env.AGENT_RUN_ID = run.runID
      output.env.AGENT_STEP_ID = tool?.stepID || ""
      output.env.AGENT_ATTEMPT = String(process.env.AGENT_ATTEMPT || 1)
      output.env.OPENCODE_SESSION_ID = run.sessionID
      output.env.AGENT_TRACEPARENT = traceparent(tool?.span || run.span)
      output.env.AGENT_OBSERVATION_EVENT_URL =
        process.env.AGENT_OBSERVATION_EVENT_URL || `http://127.0.0.1:${process.env.MODEL_PROXY_PORT || 8787}/events`
    },

    event: async ({ event }) => {
      const raw = event as any
      const type = raw.type as string
      const props = raw.properties || {}
      const sessionID = sessionIDFrom(raw)

      if (type === "message.updated") {
        const info = props.info || {}
        if (info.role === "user" && sessionID) startRun(sessionID, info.id)
        if (info.role === "assistant" && sessionID) {
          const run = ensureRun(sessionID)
          const completed = info.time?.completed || info.finish || info.finishReason
          if (completed && !run.completedMessages.has(info.id)) {
            run.completedMessages.add(info.id)
            const tokenInfo = info.tokens || info.usage || {}
            const inputTokens = Number(tokenInfo.input ?? tokenInfo.prompt ?? tokenInfo.input_tokens ?? 0)
            const outputTokens = Number(tokenInfo.output ?? tokenInfo.completion ?? tokenInfo.output_tokens ?? 0)
            const cost = Number(info.cost || 0)
            run.inputTokens += inputTokens
            run.outputTokens += outputTokens
            run.cost += cost
            telemetry.emitEvent(
              "agent.model.response.summary",
              {
                ...identity(run),
                "gen_ai.response.model": info.modelID,
                "gen_ai.provider.name": info.providerID,
                "gen_ai.usage.input_tokens": inputTokens,
                "gen_ai.usage.output_tokens": outputTokens,
                "gen_ai.response.finish_reasons": [String(info.finish || info.finishReason || "unknown")],
                "agent.cost.usd": cost,
              },
              run.context,
            )
          }
        }
      }

      if (type === "message.part.updated") {
        const part = props.part || {}
        if (part.type === "tool" && part.callID && part.state?.status === "error") {
          finishTool(part.callID, part.state, errorTypeFrom(part.state, "tool_error"))
        }
      }

      if (type === "permission.asked" || type === "permission.replied") {
        if (!sessionID) return
        const run = ensureRun(sessionID)
        telemetry.emitEvent(
          type === "permission.asked" ? "agent.permission.asked" : "agent.permission.replied",
          { ...identity(run), "opencode.event.properties": props },
          run.context,
        )
      }

      if (type === "file.edited" && sessionID) {
        const run = ensureRun(sessionID)
        const path = String(props.file || props.path || props.info?.path || "unknown")
        const pathFingerprint = contentFingerprint(path)
        telemetry.emitEvent(
          "agent.artifact.changed",
          {
            ...identity(run),
            "artifact.id": pathFingerprint.sha256,
            "artifact.name": path.split(/[\\/]/).pop(),
            "artifact.path": content === "off" ? undefined : path,
            "artifact.action": "updated",
          },
          run.context,
        )
      }

      if (type === "session.compacted" && sessionID) {
        const run = runs.get(sessionID)
        if (run) unloadSkills(run, "compaction")
      }

      if (type === "session.error" && sessionID) {
        const reason = errorTypeFrom(props.error, "session_error")
        telemetry.metrics.failures.add(1, attrs({ "agent.failure.reason": reason }))
        endRun(sessionID, "error", reason)
      }

      if (type === "session.idle" && sessionID) endRun(sessionID, "idle")
    },
  }
}
