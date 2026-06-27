import { Router, type Request } from "express";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import multer from "multer";
import { stageOutputDir, stageInputDir } from "../../shared/utils/paths.js";
import { safeResolve, PathSecurityError } from "../../shared/utils/security.js";
import {
  validateArtifactParams,
  validateRunStageParams,
  getSafeParams,
} from "../middleware/validateParams.js";

const MAX_ARTIFACT_BYTES = 10 * 1024 * 1024; // 10 MB
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_ARTIFACT_BYTES } });

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
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return res.json([]);
    }
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
  const download = req.query.download === "1";
  try {
    const outDir = stageOutputDir(runId, stageId, attempt);
    const filePath = await safeResolve(outDir, name);
    const stat = fsSync.statSync(filePath);
    if (stat.size > MAX_ARTIFACT_BYTES) {
      return res.status(413).json({ error: `Artifact too large: ${stat.size} bytes (max ${MAX_ARTIFACT_BYTES})` });
    }
    if (download) {
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(name)}"`);
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Length", stat.size);
      const stream = fsSync.createReadStream(filePath);
      stream.pipe(res);
    } else {
      const content = await fs.readFile(filePath, "utf-8");
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.send(content);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return res.status(404).json({ error: "artifact not found" });
    }
    const status = err instanceof PathSecurityError ? 403 : 500;
    res.status(status).json({ error: String(err) });
  }
});

// 文件上传 — 保存到 stage input 目录
router.post(
  "/:runId/stage/:stageId/upload",
  upload.single("file"),
  async (req, res) => {
    const { runId, stageId, attempt } = getSafeParams<{
      runId: string;
      stageId: string;
      attempt: number;
    }>(req);
    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file) {
      res.status(400).json({ error: "no file uploaded" });
      return;
    }
    try {
      const inputDir = stageInputDir(runId, stageId, attempt);
      await fs.mkdir(inputDir, { recursive: true });
      const destPath = path.join(inputDir, file.originalname);
      await fs.writeFile(destPath, file.buffer);
      res.json({
        ok: true,
        filename: file.originalname,
        size: file.size,
        path: destPath,
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  },
);

export default router;
