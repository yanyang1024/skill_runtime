import {
  ROOT_CONTEXT,
  SpanKind,
  context,
  trace,
  type Attributes,
  type AttributeValue,
  type Context,
  type Span,
} from "@opentelemetry/api"
import { logs, SeverityNumber } from "@opentelemetry/api-logs"
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http"
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { resourceFromAttributes } from "@opentelemetry/resources"
import { BatchLogRecordProcessor, LoggerProvider } from "@opentelemetry/sdk-logs"
import { AggregationType, MeterProvider, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics"
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base"
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node"

export type TelemetryOptions = {
  serviceName: string
  serviceVersion?: string
  scopeName?: string
}

export type Telemetry = ReturnType<typeof createTelemetry>

function endpoint(path: "traces" | "metrics" | "logs") {
  const base = (process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://127.0.0.1:4318").replace(/\/$/, "")
  return `${base}/v1/${path}`
}

function toAttribute(value: unknown): AttributeValue | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value
  if (Array.isArray(value)) {
    if (value.every((item) => typeof item === "string")) return value as string[]
    if (value.every((item) => typeof item === "number")) return value as number[]
    if (value.every((item) => typeof item === "boolean")) return value as boolean[]
  }
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function attrs(input: Record<string, unknown>): Attributes {
  const output: Attributes = {}
  for (const [key, value] of Object.entries(input)) {
    const converted = toAttribute(value)
    if (converted !== undefined) output[key] = converted
  }
  return output
}

export function spanContext(span: Span, parent: Context = ROOT_CONTEXT) {
  return trace.setSpan(parent, span)
}

export function createTelemetry(options: TelemetryOptions) {
  const scopeName = options.scopeName || "opencode.otel.baseline"
  const resource = resourceFromAttributes(
    attrs({
      "service.name": options.serviceName,
      "service.version": options.serviceVersion || "0.2.1",
      "deployment.environment.name": process.env.DEPLOYMENT_ENVIRONMENT || "development",
    }),
  )

  const tracerProvider = new NodeTracerProvider({
    resource,
    spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter({ url: endpoint("traces") }))],
  })
  const meterProvider = new MeterProvider({
    resource,
    views: [
      {
        instrumentName: "gen_ai.client.operation.duration",
        aggregation: {
          type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM,
          options: { boundaries: [0.01, 0.02, 0.04, 0.08, 0.16, 0.32, 0.64, 1.28, 2.56, 5.12, 10.24, 20.48, 40.96, 81.92] },
        },
        aggregationCardinalityLimit: 500,
      },
      {
        instrumentName: "gen_ai.execute_tool.duration",
        aggregation: {
          type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM,
          options: { boundaries: [0.01, 0.02, 0.04, 0.08, 0.16, 0.32, 0.64, 1.28, 2.56, 5.12, 10.24, 20.48, 40.96, 81.92] },
        },
        aggregationCardinalityLimit: 500,
      },
      {
        instrumentName: "gen_ai.invoke_agent.duration",
        aggregation: {
          type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM,
          options: { boundaries: [0.1, 0.2, 0.4, 0.8, 1.6, 3.2, 6.4, 12.8, 25.6, 51.2, 102.4, 204.8, 409.6] },
        },
        aggregationCardinalityLimit: 500,
      },
      {
        instrumentName: "gen_ai.client.token.usage",
        aggregation: {
          type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM,
          options: { boundaries: [1, 4, 16, 64, 256, 1024, 4096, 16384, 65536, 262144, 1048576] },
        },
        aggregationCardinalityLimit: 500,
      },
    ],
    readers: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({ url: endpoint("metrics") }),
        exportIntervalMillis: Number(process.env.OTEL_METRIC_EXPORT_INTERVAL || 10_000),
      }),
    ],
  })
  const loggerProvider = new LoggerProvider({
    resource,
    processors: [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter({ url: endpoint("logs") }) })],
  })

  const tracer = tracerProvider.getTracer(scopeName, options.serviceVersion || "0.2.1")
  const meter = meterProvider.getMeter(scopeName, options.serviceVersion || "0.2.1")
  const logger = loggerProvider.getLogger(scopeName, options.serviceVersion || "0.2.1")

  const metrics = {
    modelDuration: meter.createHistogram("gen_ai.client.operation.duration", {
      unit: "s",
      description: "GenAI model client operation duration",
    }),
    tokenUsage: meter.createHistogram("gen_ai.client.token.usage", {
      unit: "{token}",
      description: "Input and output tokens used by a GenAI operation",
    }),
    runDuration: meter.createHistogram("gen_ai.invoke_agent.duration", {
      unit: "s",
      description: "End-to-end agent invocation duration",
    }),
    runToolCalls: meter.createHistogram("gen_ai.invoke_agent.tool_calls", {
      unit: "{tool_call}",
      description: "Tool calls made by one agent invocation",
    }),
    runModelCalls: meter.createHistogram("gen_ai.invoke_agent.inference_calls", {
      unit: "{inference_call}",
      description: "Inference calls made by one agent invocation",
    }),
    toolDuration: meter.createHistogram("gen_ai.execute_tool.duration", {
      unit: "s",
      description: "Tool execution duration",
    }),
    cost: meter.createCounter("agent.cost", {
      unit: "USD",
      description: "Estimated or provider-reported cost in US dollars",
    }),
    failures: meter.createCounter("agent.failures", {
      unit: "{failure}",
      description: "Low-cardinality agent failure count",
    }),
  }

  function emitEvent(
    name: string,
    attributes: Record<string, unknown> = {},
    eventContext: Context = context.active(),
    severityNumber = SeverityNumber.INFO,
  ) {
    logger.emit({
      eventName: name,
      body: name,
      attributes: attrs(attributes),
      context: eventContext,
      severityNumber,
      severityText: severityNumber >= SeverityNumber.ERROR ? "ERROR" : "INFO",
    })
  }

  async function forceFlush() {
    await Promise.all([tracerProvider.forceFlush(), meterProvider.forceFlush(), loggerProvider.forceFlush()])
  }

  async function shutdown() {
    await Promise.all([tracerProvider.shutdown(), meterProvider.shutdown(), loggerProvider.shutdown()])
  }

  return {
    tracer,
    meter,
    logger,
    metrics,
    emitEvent,
    forceFlush,
    shutdown,
    SpanKind,
  }
}
