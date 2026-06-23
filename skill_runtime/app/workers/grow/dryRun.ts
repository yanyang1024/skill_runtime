import path from "node:path";
import { createRunDir, writeYaml, writeMarkdown } from "../../shared/utils/growthRun.js";
import { skillStableDir } from "../../shared/utils/paths.js";
import { utcTimestamp } from "../../shared/utils/time.js";
import type { RuntimeTrace, DryRunPlan, GrowthProposal } from "../../shared/schemas/index.js";

export async function runGrowDryRun(
  skillId: string,
  trace: RuntimeTrace,
): Promise<{ runId: string; plan: DryRunPlan; proposal: GrowthProposal }> {
  const runId = `grow-${Date.now()}`;
  const plan: DryRunPlan = {
    run_id: runId,
    skill_id: skillId,
    mode: "dry-run",
    source_trace: trace.trace_id,
    summary: {
      intent: "基于最新 eval 模拟会话，对 skill 进行生命周期维护",
      risk_level: "medium",
      live_run_requires_snapshot: true,
    },
    planned_operations: [
      {
        op_id: "op-001",
        type: "update_file",
        target: `skills/${skillId}/stable/SKILL.md`,
        reason: "增加‘先完成全量分析、不在中途停顿提问’的正向引导",
        evidence: trace.soft_signals.user_experience,
        dry_run_result: "would_update",
        risk: "low",
      },
      {
        op_id: "op-002",
        type: "create_file",
        target: `skills/${skillId}/stable/references/workflow.md`,
        reason: "补充 Observe / Grow / Rehearse / Stabilize 四阶段工作流",
        dry_run_result: "would_create",
        risk: "low",
      },
      {
        op_id: "op-003",
        type: "create_quality_gate",
        target: `skills/${skillId}/stable/evals/quality_gate_post_edit.yaml`,
        reason: "批量编辑后自动进行交叉一致性检查",
        dry_run_result: "would_create",
        risk: "low",
      },
    ],
    quality_gates_to_run: [
      "skill_consistency_check",
      "tool_registry_check",
      "positive_guidance_check",
      "archive_safety_check",
    ],
    live_run_requirements: [
      "create_snapshot_before_write",
      "never_delete_archive_only",
      "run_quality_gate_after_write",
    ],
  };

  const proposal: GrowthProposal = {
    proposal_id: `proposal-${Date.now()}`,
    run_id: runId,
    skill_id: skillId,
    created_at: utcTimestamp(),
    markdown: buildProposalMarkdown(skillId, trace, plan),
  };

  const { dir } = await createRunDir(skillId);
  await writeYaml(path.join(dir, "dry-run-plan.yaml"), plan);
  await writeMarkdown(path.join(dir, "growth-proposal.md"), proposal.markdown);

  return { runId, plan, proposal };
}

function buildProposalMarkdown(skillId: string, trace: RuntimeTrace, plan: DryRunPlan): string {
  const ops = plan.planned_operations
    .map(
      (op) =>
        `- **${op.op_id}** (${op.type}): \`${op.target}\` — ${op.reason}（风险: ${op.risk}）`,
    )
    .join("\n");

  return [
    "# Growth Proposal",
    "",
    `## 本轮目标`,
    `对 ${skillId} 基于最新会话轨迹进行一次克制生长。`,
    "",
    "## Observe 学到的内容",
    ...trace.soft_signals.user_experience.map((s) => `- ${s}`),
    "",
    "## Grow 的克制判断",
    "- 不直接扩大 SKILL.md，仅补充关键正向引导。",
    "- 流程细节放入 references/workflow.md。",
    "- 不删除任何历史文件。",
    "",
    "## 计划修改",
    ops,
    "",
    "## 一键确认后系统会做什么",
    "1. 创建 .Grow_backups 快照。",
    "2. 应用文件修改到 preview。",
    "3. 运行自动 Quality Gate。",
    "4. 生成 preview skill。",
  ].join("\n");
}
