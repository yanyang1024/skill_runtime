const [name, rawAttributes = "{}"] = process.argv.slice(2)

if (!name) {
  console.error('usage: npm run event -- <event-name> \'{"key":"value"}\'')
  process.exit(2)
}

let attributes: Record<string, unknown>
try {
  attributes = JSON.parse(rawAttributes)
} catch (error) {
  console.error(`invalid attributes JSON: ${String((error as Error).message || error)}`)
  process.exit(2)
}

attributes = {
  "agent.task.id": process.env.AGENT_TASK_ID || undefined,
  "agent.run.id": process.env.AGENT_RUN_ID || undefined,
  "agent.step.id": process.env.AGENT_STEP_ID || undefined,
  "agent.attempt": Number(process.env.AGENT_ATTEMPT || 1),
  "gen_ai.conversation.id": process.env.OPENCODE_SESSION_ID || undefined,
  ...attributes,
}

const endpoint = process.env.AGENT_OBSERVATION_EVENT_URL || `http://127.0.0.1:${process.env.MODEL_PROXY_PORT || 8787}/events`
const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    ...(process.env.AGENT_TRACEPARENT ? { traceparent: process.env.AGENT_TRACEPARENT } : {}),
  },
  body: JSON.stringify({ name, attributes }),
})

if (!response.ok) {
  console.error(`event rejected (${response.status}): ${await response.text()}`)
  process.exit(1)
}

console.log(await response.text())
