import assert from "node:assert/strict"
import test from "node:test"
import { boundedJson, contentFingerprint, redact } from "../.opencode/lib/content.ts"
import { extractUsage, summarizeContext } from "../src/context-summary.ts"

test("context sources distinguish system, skill and ordinary tool results", () => {
  const result = summarizeContext([
    { role: "system", content: "rules" },
    {
      role: "assistant",
      content: "",
      tool_calls: [
        { id: "call_skill", function: { name: "skill", arguments: '{"name":"review-code"}' } },
        { id: "call_read", function: { name: "read", arguments: '{"filePath":"README.md"}' } },
      ],
    },
    { role: "tool", tool_call_id: "call_skill", content: "skill body" },
    { role: "tool", tool_call_id: "call_read", content: "file body" },
  ])

  assert.equal(result.find((item) => item.source === "system_instructions")?.chars, 5)
  assert.equal(result.find((item) => item.source === "skill")?.name, "review-code")
  assert.equal(result.find((item) => item.source === "tool_result")?.name, "read")
})

test("provider token usage is normalized", () => {
  assert.deepEqual(
    extractUsage({
      usage: {
        prompt_tokens: 100,
        completion_tokens: 20,
        total_tokens: 120,
        prompt_tokens_details: { cached_tokens: 40 },
        completion_tokens_details: { reasoning_tokens: 5 },
      },
    }),
    { input: 100, output: 20, total: 120, cachedInput: 40, reasoningOutput: 5 },
  )
})

test("content capture redacts secrets and hashes raw bytes", () => {
  const value = redact({ authorization: "Bearer abc", text: "use sk-1234567890abcdef" }) as Record<string, string>
  assert.equal(value.authorization, "[REDACTED]")
  assert.equal(value.text, "use [REDACTED]")
  assert.match(boundedJson({ password: "secret" }, "redacted") || "", /REDACTED/)
  assert.equal(boundedJson(undefined, "redacted"), undefined)
  assert.equal(contentFingerprint(Buffer.from("abc")).sha256, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
})
