import { runRollback } from "../app/workers/stabilize/rollback.js";

const snapshotId = process.argv[2] ?? "snapshot-2026-06-21T17-42-59.452Z";
await runRollback("tech-doc-didactic-rewriter", snapshotId);
console.log("rolled back to", snapshotId);
