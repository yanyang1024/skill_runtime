import fs from "node:fs/promises";
import path from "node:path";
import type { StageId, PromptRecommendRequest, PromptRecommendResponse } from "../shared/schemas/index.js";
import { createLocalV1Client } from "./client.js";
import {
  REPO_ROOT,
  runDir,
  stageDir,
  stageInputDir,
  stageOutputDir,
} from "../shared/utils/paths.js";

const SYSTEM_PROMPT = `你是 Skill Growth Studio 的阶段输入语句推荐器。
你的任务不是直接修改 skill，而是根据当前阶段、已有产物、常用语句库和用户目标，生成一条适合发送给当前 OpenCode server 的自然语言指令。
要求：
1. 不要过度结构化。
2. 不要提出中间确认问题。
3. 优先生成能推动当前阶段完成的完整任务语句。
4. 如果当前阶段是 plan/review，不要要求修改文件。
5. 如果当前阶段是 build/iteration，可以要求更新 preview workspace，但不要修改 stable。
6. 输出一条主推荐语句和最多三条备选语句，并简要说明推荐理由和风险提示。

请严格按以下 JSON 格式输出（不要加 markdown 代码块）：
{
  "primary": "主推荐语句",
  "alternatives": ["备选1", "备选2"],
  "rationale": "推荐理由",
  "risk_hint": "风险提示"
}`;

export async function recommendPrompt(
  req: PromptRecommendRequest,
): Promise<PromptRecommendResponse> {
  const stageId = req.stage_id;
  const attempt = req.attempt ?? 1;
  const promptLibraryPath = path.join(REPO_ROOT, "prompt_library", `${stageId}.md`);
  const runDigestPath = path.join(runDir(req.run_id), "stage-digest.md");
  const stageDigestPath = path.join(stageDir(req.run_id, stageId, attempt), "stage-digest.md");
  const directorReviewPaths = [
    path.join(stageOutputDir(req.run_id, stageId, attempt), "director-review.md"),
    path.join(stageInputDir(req.run_id, stageId, attempt), "director-review.md"),
    path.join(
      stageInputDir(req.run_id, stageId, attempt),
      "previous_stage_output",
      "director-review.md",
    ),
  ];

  const parts: string[] = [];

  try {
    parts.push(`# 当前阶段常用语句库\n${await fs.readFile(promptLibraryPath, "utf-8")}`);
  } catch {
    parts.push(`# 当前阶段\n${stageId}`);
  }

  try {
    parts.push(`# Run 级摘要\n${await fs.readFile(runDigestPath, "utf-8")}`);
  } catch {
    // ignore
  }

  try {
    parts.push(`# 当前 Stage 摘要\n${await fs.readFile(stageDigestPath, "utf-8")}`);
  } catch {
    // ignore
  }

  for (const p of directorReviewPaths) {
    try {
      parts.push(`# Director Review\n${await fs.readFile(p, "utf-8")}`);
      break;
    } catch {
      // try next
    }
  }

  if (req.recent_output_summary) {
    parts.push(`# 上一步输出摘要\n${req.recent_output_summary}`);
  }

  if (req.goal) {
    parts.push(`# 当前目标\n${req.goal}`);
  }

  const userPrompt = parts.join("\n\n---\n\n");

  const client = await createLocalV1Client();
  const resp = await client.chatCompletion({
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.7,
    max_tokens: 1024,
  });

  const content = resp.choices[0]?.message?.content ?? "";

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : content;
    const parsed = JSON.parse(jsonStr) as PromptRecommendResponse;
    return {
      primary: parsed.primary ?? content,
      alternatives: parsed.alternatives ?? [],
      rationale: parsed.rationale ?? "基于阶段目标与常用语句库生成。",
      risk_hint: parsed.risk_hint,
    };
  } catch {
    return {
      primary: content,
      alternatives: [],
      rationale: "模型未按 JSON 格式输出，已回退为原始文本。",
      risk_hint: "请人工检查语句是否合适。",
    };
  }
}
