import type { Request, Response, NextFunction, RequestHandler } from "express";
import { z } from "zod";
import { StageId } from "../../shared/schemas/index.js";
import {
  assertSafeIdentifier,
  sanitizePathComponent,
  PathSecurityError,
} from "../../shared/utils/security.js";

const AttemptSchema = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v) => {
    if (v === undefined) return 1;
    return typeof v === "number" ? v : Number.parseInt(v, 10);
  })
  .pipe(z.number().int().min(1));

function handleValidationError(
  res: Response,
  next: NextFunction,
  err: unknown,
): void {
  if (err instanceof PathSecurityError || err instanceof z.ZodError) {
    res.status(400).json({ error: err.message });
    return;
  }
  next(err);
}

function firstString(value: unknown): string {
  if (Array.isArray(value)) return String(value[0] ?? "");
  return String(value ?? "");
}

export interface SafeSkillParams {
  skillId: string;
}

export function getSafeParams<T>(req: Request): T {
  return (req as unknown as { safeParams: T }).safeParams;
}

export function validateSkillParams(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const skillId = firstString(req.params.skillId);
      assertSafeIdentifier(skillId, "skill");
      (req as unknown as { safeParams: SafeSkillParams }).safeParams = { skillId };
      next();
    } catch (err) {
      handleValidationError(res, next, err);
    }
  };
}

export interface SafeRunStageParams {
  runId: string;
  stageId: StageId;
  attempt: number;
}

export function validateRunStageParams(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const rawAttempt = req.body?.attempt ?? req.query?.attempt;
      const attempt = AttemptSchema.parse(rawAttempt);
      const runId = firstString(req.params.runId);
      const stageId = StageId.parse(firstString(req.params.stageId));
      assertSafeIdentifier(runId, "run");
      assertSafeIdentifier(stageId, "stage");
      assertSafeIdentifier(String(attempt), "attempt");
      (req as unknown as { safeParams: SafeRunStageParams }).safeParams = {
        runId,
        stageId,
        attempt,
      };
      next();
    } catch (err) {
      handleValidationError(res, next, err);
    }
  };
}

export interface SafeArtifactParams extends SafeRunStageParams {
  name: string;
}

export function validateArtifactParams(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const rawAttempt = req.query?.attempt;
      const attempt = AttemptSchema.parse(rawAttempt);
      const runId = firstString(req.params.runId);
      const stageId = StageId.parse(firstString(req.params.stageId));
      const name = sanitizePathComponent(firstString(req.params.name));
      assertSafeIdentifier(runId, "run");
      assertSafeIdentifier(stageId, "stage");
      assertSafeIdentifier(String(attempt), "attempt");
      if (name.length === 0) {
        throw new PathSecurityError("artifact name 不能为空");
      }
      (req as unknown as { safeParams: SafeArtifactParams }).safeParams = {
        runId,
        stageId,
        attempt,
        name,
      };
      next();
    } catch (err) {
      handleValidationError(res, next, err);
    }
  };
}
