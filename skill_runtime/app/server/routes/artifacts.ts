import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import type { StageId } from "../../shared/schemas/index.js";
import { stageOutputDir } from "../../shared/utils/paths.js";

const router: Router = Router();

router.get("/:runId/stage/:stageId/artifacts", async (req, res) => {
  const { runId, stageId } = req.params;
  const { attempt = 1 } = req.query;
  try {
    const outDir = stageOutputDir(runId, stageId as StageId, Number(attempt));
    const entries = await fs.readdir(outDir, { withFileTypes: true });
    const files = entries
      .filter((e) => e.isFile())
      .map((e) => ({ name: e.name, path: path.join(outDir, e.name) }));
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/:runId/stage/:stageId/artifact/:name", async (req, res) => {
  const { runId, stageId, name } = req.params;
  const { attempt = 1 } = req.query;
  try {
    const outDir = stageOutputDir(runId, stageId as StageId, Number(attempt));
    const filePath = path.join(outDir, name);
    if (!filePath.startsWith(outDir)) {
      res.status(403).json({ error: "forbidden" });
      return;
    }
    const content = await fs.readFile(filePath, "utf-8");
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.send(content);
  } catch (err) {
    res.status(404).json({ error: String(err) });
  }
});

export default router;
