import { Router, type Request } from "express";
import fs from "node:fs/promises";
import { stageOutputDir } from "../../shared/utils/paths.js";
import { safeResolve, PathSecurityError } from "../../shared/utils/security.js";
import {
  validateArtifactParams,
  validateRunStageParams,
  getSafeParams,
} from "../middleware/validateParams.js";

const router: Router = Router();

router.use("/:runId/stage/:stageId/*", validateRunStageParams());

router.get("/:runId/stage/:stageId/artifacts", async (req, res) => {
  const { runId, stageId, attempt } = getSafeParams<{
    runId: string;
    stageId: string;
    attempt: number;
  }>(req);
  try {
    const outDir = stageOutputDir(runId, stageId, attempt);
    const entries = await fs.readdir(outDir, { withFileTypes: true });
    const files = entries
      .filter((e) => e.isFile())
      .map((e) => ({ name: e.name }));
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/:runId/stage/:stageId/artifact/:name", validateArtifactParams(), async (req, res) => {
  const { runId, stageId, attempt, name } = getSafeParams<{
    runId: string;
    stageId: string;
    attempt: number;
    name: string;
  }>(req);
  try {
    const outDir = stageOutputDir(runId, stageId, attempt);
    const filePath = await safeResolve(outDir, name);
    const content = await fs.readFile(filePath, "utf-8");
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.send(content);
  } catch (err) {
    const status = err instanceof PathSecurityError ? 403 : 500;
    res.status(status).json({ error: String(err) });
  }
});

export default router;
