import { z } from "zod";
import { StageId } from "../../shared/schemas/index.js";
import { assertSafeIdentifier, PathSecurityError, } from "../../shared/utils/security.js";
const AttemptSchema = z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => {
    if (v === undefined)
        return 1;
    return typeof v === "number" ? v : Number.parseInt(v, 10);
})
    .pipe(z.number().int().min(1));
function handleValidationError(res, next, err) {
    if (err instanceof PathSecurityError || err instanceof z.ZodError) {
        res.status(400).json({ error: err.message });
        return;
    }
    next(err);
}
function firstString(value) {
    if (Array.isArray(value))
        return String(value[0] ?? "");
    return String(value ?? "");
}
export function getSafeParams(req) {
    return req.safeParams;
}
export function validateSkillParams() {
    return (req, res, next) => {
        try {
            const skillId = firstString(req.params.skillId);
            assertSafeIdentifier(skillId, "skill");
            req.safeParams = { skillId };
            next();
        }
        catch (err) {
            handleValidationError(res, next, err);
        }
    };
}
export function validateRunStageParams() {
    return (req, res, next) => {
        try {
            const rawAttempt = req.body?.attempt ?? req.query?.attempt;
            const attempt = AttemptSchema.parse(rawAttempt);
            const runId = firstString(req.params.runId);
            const stageId = StageId.parse(firstString(req.params.stageId));
            assertSafeIdentifier(runId, "run");
            assertSafeIdentifier(stageId, "stage");
            assertSafeIdentifier(String(attempt), "attempt");
            req.safeParams = {
                runId,
                stageId,
                attempt,
            };
            next();
        }
        catch (err) {
            handleValidationError(res, next, err);
        }
    };
}
export function validateArtifactParams() {
    return (req, res, next) => {
        try {
            const rawAttempt = req.query?.attempt;
            const attempt = AttemptSchema.parse(rawAttempt);
            const runId = firstString(req.params.runId);
            const stageId = StageId.parse(firstString(req.params.stageId));
            const name = firstString(req.params.name);
            assertSafeIdentifier(runId, "run");
            assertSafeIdentifier(stageId, "stage");
            assertSafeIdentifier(String(attempt), "attempt");
            if (name.length === 0) {
                throw new PathSecurityError("artifact name 不能为空");
            }
            req.safeParams = {
                runId,
                stageId,
                attempt,
                name,
            };
            next();
        }
        catch (err) {
            handleValidationError(res, next, err);
        }
    };
}
//# sourceMappingURL=validateParams.js.map