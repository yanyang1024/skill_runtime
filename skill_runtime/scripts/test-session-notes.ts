import { spawn } from "cross-spawn";

const server = spawn("tsx", ["app/server/index.ts"], { stdio: "ignore" });

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  await sleep(3000);
  const res = await fetch("http://localhost:3000/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ skillId: "tech-doc-didactic-rewriter", label: "Test", version: "stable" }),
  });
  const session = await res.json();
  console.log("session:", session.id, session.proxyUrl);
  const noteRes = await fetch(`http://localhost:3000/api/sessions/${session.id}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      feedback: [{ dimension: "interaction_flow", label: "better", note: "体验更自然" }],
      decisionHint: "revise_minor",
    }),
  });
  console.log("notes:", await noteRes.json());
  await fetch(`http://localhost:3000/api/sessions/${session.id}`, { method: "DELETE" });
  server.kill();
  process.exit(0);
}

main();
