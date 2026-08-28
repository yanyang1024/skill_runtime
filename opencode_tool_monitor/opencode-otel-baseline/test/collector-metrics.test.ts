import assert from "node:assert/strict"
import test from "node:test"
import { metricSamples, queueSnapshot } from "../src/collector-metrics.ts"

const fixture = `
# TYPE otelcol_exporter_queue_size gauge
otelcol_exporter_queue_size{exporter="otlphttp/upstream",service_instance_id="a"} 7000
otelcol_exporter_queue_capacity{exporter="otlphttp/upstream",service_instance_id="a"} 10000
otelcol_exporter_send_failed_spans{exporter="otlphttp/upstream"} 3
otelcol_exporter_queue_size_total{exporter="ignored"} 999
`

test("collector queue metrics produce a stable saturation ratio", () => {
  assert.deepEqual(metricSamples(fixture, "otelcol_exporter_queue_size"), [7000])
  assert.deepEqual(queueSnapshot(fixture), {
    size: 7000,
    capacity: 10000,
    ratio: 0.7,
    sendFailures: 3,
  })
})

test("file-export mode without a sending queue is healthy at zero utilization", () => {
  assert.deepEqual(queueSnapshot("otelcol_process_uptime 42"), {
    size: 0,
    capacity: 0,
    ratio: 0,
    sendFailures: 0,
  })
})
