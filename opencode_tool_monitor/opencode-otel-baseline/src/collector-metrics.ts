export type QueueSnapshot = {
  size: number
  capacity: number
  ratio: number
  sendFailures: number
}

export function metricSamples(text: string, metricName: string) {
  const values: number[] = []
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith(metricName)) continue
    const boundary = line.charAt(metricName.length)
    if (boundary !== "{" && boundary !== " " && boundary !== "\t") continue
    const match = /\s(-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)$/.exec(line)
    if (match?.[1]) values.push(Number(match[1]))
  }
  return values.filter(Number.isFinite)
}

export function queueSnapshot(text: string): QueueSnapshot {
  const sizes = metricSamples(text, "otelcol_exporter_queue_size")
  const capacities = metricSamples(text, "otelcol_exporter_queue_capacity")
  const failures = [
    ...metricSamples(text, "otelcol_exporter_send_failed_spans"),
    ...metricSamples(text, "otelcol_exporter_send_failed_metric_points"),
    ...metricSamples(text, "otelcol_exporter_send_failed_log_records"),
  ]
  const size = sizes.reduce((sum, value) => sum + value, 0)
  const capacity = capacities.reduce((sum, value) => sum + value, 0)
  const ratio = capacity > 0 ? size / capacity : 0
  return {
    size,
    capacity,
    ratio: Number(ratio.toFixed(4)),
    sendFailures: failures.reduce((sum, value) => sum + value, 0),
  }
}
