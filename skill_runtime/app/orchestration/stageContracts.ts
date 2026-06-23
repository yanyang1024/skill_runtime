import type { StageRuntimeContract, StageId } from "../shared/schemas/index.js";

export const STAGE_CONTRACTS: Record<StageId, StageRuntimeContract> = {
  "observe-log-review": {
    stage_id: "observe-log-review",
    runtime_mode: "web",
    agent_role: "observe",
    skill_mount: "stable-readonly",
    work_writable: false,
    requires_snapshot_before_start: false,
    requires_quality_after_complete: false,
    expected_outputs: [
      "replay-card.md",
      "growth-opportunities.md",
      "completion-report.md",
    ],
    human_role: "watch",
  },
  "observe-api-scan": {
    stage_id: "observe-api-scan",
    runtime_mode: "web",
    agent_role: "observe",
    skill_mount: "stable-readonly",
    work_writable: true,
    requires_snapshot_before_start: false,
    requires_quality_after_complete: false,
    expected_outputs: [
      "api-endpoint-diff.md",
      "api-test-plan.md",
      "api-test-report.md",
      "api-skill-growth-plan.md",
      "tool-wrapper-suggestions.md",
    ],
    human_role: "watch",
  },
  "grow-plan": {
    stage_id: "grow-plan",
    runtime_mode: "web",
    agent_role: "plan",
    skill_mount: "stable-readonly",
    work_writable: false,
    requires_snapshot_before_start: false,
    requires_quality_after_complete: false,
    expected_outputs: [
      "growth-plan.md",
      "planned-file-changes.md",
      "archive-plan.md",
      "risk-notes.md",
    ],
    human_role: "watch",
  },
  "grow-build": {
    stage_id: "grow-build",
    runtime_mode: "web",
    agent_role: "build",
    skill_mount: "preview-writable",
    work_writable: true,
    requires_snapshot_before_start: true,
    requires_quality_after_complete: true,
    expected_outputs: [
      "patch-notes.md",
      "changed-files.md",
      "completion-report.md",
    ],
    human_role: "watch",
  },
  "grow-quality-review": {
    stage_id: "grow-quality-review",
    runtime_mode: "web",
    agent_role: "review",
    skill_mount: "preview-readonly",
    work_writable: false,
    requires_snapshot_before_start: false,
    requires_quality_after_complete: false,
    expected_outputs: [
      "quality-review.md",
      "stale-content-report.md",
      "coupling-issues.md",
      "followup-fix-plan.md",
    ],
    human_role: "watch",
  },
  "rehearse-preview": {
    stage_id: "rehearse-preview",
    runtime_mode: "web",
    agent_role: "preview",
    skill_mount: "preview-readonly",
    work_writable: true,
    requires_snapshot_before_start: false,
    requires_quality_after_complete: false,
    expected_outputs: ["preview-session-log", "director-review.md"],
    human_role: "experience",
  },
  "rehearse-iteration": {
    stage_id: "rehearse-iteration",
    runtime_mode: "web",
    agent_role: "iteration",
    skill_mount: "preview-writable",
    work_writable: true,
    requires_snapshot_before_start: true,
    requires_quality_after_complete: true,
    expected_outputs: [
      "iteration-plan.md",
      "iteration-patch-notes.md",
      "iteration-review.md",
    ],
    human_role: "watch",
  },
  "stabilize-release": {
    stage_id: "stabilize-release",
    runtime_mode: "web",
    agent_role: "release",
    skill_mount: "preview-readonly",
    work_writable: false,
    requires_snapshot_before_start: false,
    requires_quality_after_complete: false,
    expected_outputs: [
      "release-review.md",
      "changelog-draft.md",
      "remaining-work.md",
    ],
    human_role: "write-review",
  },
};

export function getStageContract(stageId: StageId): StageRuntimeContract {
  const contract = STAGE_CONTRACTS[stageId];
  if (!contract) {
    throw new Error(`Unknown stage: ${stageId}`);
  }
  return contract;
}
