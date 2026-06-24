import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { createRun } from "../../orchestration/runLifecycle.js";
import { loadRunState } from "../../orchestration/stateMachine.js";
import { runsDir } from "../../shared/utils/paths.js";
import { assertSafeIdentifier, PathSecurityError } from "../../shared/utils/security.js";

const router: Router = Router();

router.post("/", async (req, res) => {
  const { skillId, previewId } = req.body;
  try {
    assertSafeIdentifier(skillId, "skill");
    if (previewId !== undefined) assertSafeIdentifier(previewId, "preview");
    const run = await createRun({ skill_id: skillId, preview_id: previewId });
    res.json({ run_id: run.run_id, skill_id: run.skill_id, preview_id: run.preview_id });
  } catch (err) {
    const status = err instanceof PathSecurityError ? 400 : 500;
    res.status(status).json({ error: String(err) });
  }
});

router.get("/:runId", async (req, res) => {
  try {
    const run = await loadRunState(req.params.runId);
    if (!run) {
      res.status(404).json({ error: "run not found" });
      return;
    }
    res.json(run);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/", async (_req, res) => {
  try {
    const dir = runsDir();
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const runs = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const state = await loadRunState(entry.name);
      if (state) runs.push(state);
    }
    res.json(runs);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
