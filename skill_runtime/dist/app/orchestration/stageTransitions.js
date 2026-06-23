import { utcTimestamp } from "../shared/utils/time.js";
export const RECOMMENDED_TRANSITIONS = [
    {
        from: "observe-log-review",
        to: "grow-plan",
        reason: "normal",
        carry_outputs: ["replay-card.md", "growth-opportunities.md"],
        label: "生成增长计划",
    },
    {
        from: "observe-api-scan",
        to: "grow-plan",
        reason: "normal",
        carry_outputs: ["api-skill-growth-plan.md"],
        label: "纳入 API 增长计划",
    },
    {
        from: "grow-plan",
        to: "grow-build",
        reason: "normal",
        carry_outputs: ["growth-plan.md", "planned-file-changes.md", "archive-plan.md"],
        label: "执行修改",
    },
    {
        from: "grow-build",
        to: "grow-quality-review",
        reason: "normal",
        carry_outputs: ["patch-notes.md", "changed-files.md"],
        label: "质量 review",
    },
    {
        from: "grow-quality-review",
        to: "grow-build",
        reason: "fix",
        carry_outputs: ["quality-review.md", "followup-fix-plan.md"],
        label: "修复质量问题",
    },
    {
        from: "grow-quality-review",
        to: "rehearse-preview",
        reason: "normal",
        carry_outputs: [],
        label: "进入排练体验",
    },
    {
        from: "rehearse-preview",
        to: "rehearse-iteration",
        reason: "normal",
        carry_outputs: ["director-review.md", "preview-session-log"],
        label: "基于反馈迭代",
    },
    {
        from: "rehearse-iteration",
        to: "rehearse-preview",
        reason: "normal",
        carry_outputs: [],
        label: "再次体验",
    },
    {
        from: "rehearse-preview",
        to: "stabilize-release",
        reason: "normal",
        carry_outputs: ["director-review.md"],
        label: "准备发布",
    },
    {
        from: "rehearse-iteration",
        to: "stabilize-release",
        reason: "normal",
        carry_outputs: ["iteration-review.md"],
        label: "准备发布",
    },
];
export function getRecommendedNextStages(from) {
    return RECOMMENDED_TRANSITIONS.filter((t) => t.from === from);
}
export function createStageTransition(from, to, reason = "normal", carry_outputs = []) {
    return {
        from,
        to,
        reason,
        carry_outputs,
        created_at: utcTimestamp(),
    };
}
export function getDefaultPreviousStage(current) {
    const incoming = RECOMMENDED_TRANSITIONS.filter((t) => t.to === current);
    return incoming[0]?.from;
}
//# sourceMappingURL=stageTransitions.js.map