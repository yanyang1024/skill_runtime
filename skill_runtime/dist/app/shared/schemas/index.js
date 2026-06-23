import { z } from "zod";
// ---------------------------------------------------------------------------
// 通用基元
// ---------------------------------------------------------------------------
export const UtcTimestamp = z.string().datetime({ offset: true });
export const FilePath = z.string().min(1);
export const SkillId = z.string().regex(/^[a-z0-9-]+$/);
export const StageId = z.enum([
    "observe-log-review",
    "observe-api-scan",
    "grow-plan",
    "grow-build",
    "grow-quality-review",
    "rehearse-preview",
    "rehearse-iteration",
    "stabilize-release",
]);
export const RiskLevel = z.enum(["low", "medium", "high"]);
// ---------------------------------------------------------------------------
// Stage Runtime Contract
// ---------------------------------------------------------------------------
export const StageRuntimeContract = z.object({
    stage_id: StageId,
    runtime_mode: z.enum(["web", "serve"]),
    agent_role: z.enum(["observe", "plan", "build", "review", "preview", "iteration", "release"]),
    skill_mount: z.enum(["stable-readonly", "preview-readonly", "preview-writable", "none"]),
    work_writable: z.boolean(),
    requires_snapshot_before_start: z.boolean(),
    requires_quality_after_complete: z.boolean(),
    expected_outputs: z.array(z.string()),
    human_role: z.enum(["watch", "experience", "write-review", "none"]),
});
// ---------------------------------------------------------------------------
// Run / Stage 状态
// ---------------------------------------------------------------------------
export const RunState = z.object({
    run_id: z.string(),
    skill_id: SkillId,
    preview_id: z.string().optional(),
    current_stage: StageId.optional(),
    status: z.enum(["idle", "running", "waiting_director", "completed", "failed"]),
    created_at: UtcTimestamp,
    updated_at: UtcTimestamp,
});
export const StageState = z.object({
    stage_id: StageId,
    run_id: z.string(),
    status: z.enum(["pending", "running", "waiting_input", "completed", "failed"]),
    attempt: z.number().int().min(1),
    server_id: z.string().optional(),
    workspace_path: FilePath,
    outputs: z.array(z.string()),
    digest_path: FilePath,
    created_at: UtcTimestamp,
    updated_at: UtcTimestamp,
});
export const StageTransition = z.object({
    from: StageId,
    to: StageId,
    reason: z.enum(["normal", "fix", "rescan", "retry", "manual"]),
    carry_outputs: z.array(z.string()),
    created_at: UtcTimestamp,
});
// ---------------------------------------------------------------------------
// OpenCode Runtime 进程信息
// ---------------------------------------------------------------------------
export const OpencodeRuntime = z.object({
    server_id: z.string(),
    stage_id: StageId,
    run_id: z.string(),
    skill_id: SkillId,
    runtime_mode: z.enum(["web", "serve"]),
    port: z.number().int(),
    base_url: z.string().url(),
    open_url: z.string().url(),
    proxy_url: z.string(),
    workspace_path: FilePath,
    opencode_config_dir: FilePath,
    process_pid: z.number().int().optional(),
    status: z.enum(["starting", "running", "stopped", "error"]),
});
// ---------------------------------------------------------------------------
// Prompt Recommender
// ---------------------------------------------------------------------------
export const PromptRecommendRequest = z.object({
    stage_id: StageId,
    run_id: z.string(),
    server_id: z.string(),
    recent_output_summary: z.string().optional(),
    director_review: z.string().optional(),
    goal: z.string().optional(),
});
export const PromptRecommendResponse = z.object({
    primary: z.string(),
    alternatives: z.array(z.string()),
    rationale: z.string(),
    risk_hint: z.string().optional(),
});
// ---------------------------------------------------------------------------
// Director Review
// ---------------------------------------------------------------------------
export const DirectorReview = z.object({
    review_id: z.string(),
    run_id: z.string(),
    stage_id: StageId,
    skill_id: SkillId,
    preview_id: z.string(),
    content: z.string(),
    created_at: UtcTimestamp,
});
// ---------------------------------------------------------------------------
// 快照与归档
// ---------------------------------------------------------------------------
export const SnapshotManifest = z.object({
    snapshot_id: z.string(),
    created_at: UtcTimestamp,
    skill_id: SkillId,
    preview_id: z.string().optional(),
    path: FilePath,
    included: z.array(FilePath),
    triggered_by: z.string(),
    source_run: z.string().optional(),
    restore_command: z.string(),
});
export const ArchiveManifest = z.object({
    archive_id: z.string(),
    created_at: UtcTimestamp,
    skill_id: SkillId,
    triggered_by: z.string(),
    source_run: z.string().optional(),
    archived_files: z.array(z.object({
        original_path: FilePath,
        archive_path: FilePath,
        reason: z.string(),
        replacement: z.array(FilePath).optional(),
    })),
    policy: z.object({
        never_delete: z.literal(true),
        can_restore: z.boolean(),
    }),
});
// ---------------------------------------------------------------------------
// 轻量 Runtime Trace（由脚本从 eval prompt / session log 提取）
// ---------------------------------------------------------------------------
export const RuntimeTrace = z.object({
    trace_id: z.string(),
    skill_id: SkillId,
    skill_version: z.string(),
    session_id: z.string(),
    created_at: UtcTimestamp,
    raw_user_utterances: z.array(z.object({
        turn_id: z.string(),
        text: z.string(),
    })),
    intent_summary: z.string(),
    runtime_context: z.object({
        skill_files: z.array(FilePath),
        tools_available: z.array(z.string()),
        api_docs_available: z.boolean(),
    }),
    hard_signals: z.object({
        tool_failures: z.array(z.string()),
        api_failures: z.array(z.string()),
        schema_errors: z.array(z.string()),
        quality_gate_failures: z.array(z.string()),
    }),
    soft_signals: z.object({
        user_experience: z.array(z.string()),
        director_notes: z.array(z.string()),
    }),
    growth_candidates: z.array(z.object({
        type: z.string(),
        summary: z.string(),
        evidence: z.array(z.string()).optional(),
    })),
});
// ---------------------------------------------------------------------------
// Endpoint Manifest（保留但放宽）
// ---------------------------------------------------------------------------
export const EndpointStatus = z.enum([
    "discovered",
    "candidate",
    "verified",
    "active",
    "deprecated",
    "archived",
]);
export const EndpointManifest = z.object({
    skill_id: SkillId,
    updated_at: UtcTimestamp,
    endpoints: z.array(z.object({
        id: z.string(),
        name: z.string(),
        status: EndpointStatus,
        source: FilePath,
        method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
        path: z.string(),
        description: z.string(),
        required_params: z.array(z.string()).optional(),
        optional_params: z.array(z.string()).optional(),
        auth: z
            .object({
            type: z.string(),
            required: z.boolean(),
        })
            .optional(),
        risk_level: z.enum(["read_only", "write", "admin"]).optional(),
        added_at: UtcTimestamp.optional(),
        tests: z
            .record(z.string(), z.object({
            path: FilePath,
            status: z.enum(["pending", "passed", "failed"]).default("pending"),
        }))
            .optional(),
        skill_usage: z
            .object({
            allowed: z.boolean(),
            reason: z.string().optional(),
            usage_hint: z.string().optional(),
        })
            .optional(),
    })),
});
// ---------------------------------------------------------------------------
// 向下兼容的 schema（v0.2 重构期间保留，供旧 workers / 旧测试编译通过）
// 这些 schema 在新架构中不再作为核心依赖，后续将逐步移除或重写对应代码。
// ---------------------------------------------------------------------------
export const ToolCall = z.object({
    tool_name: z.string(),
    status: z.enum(["success", "failure", "pending"]),
    summary: z.string().optional(),
});
export const ScriptCall = z.object({
    script_name: z.string(),
    status: z.enum(["success", "failure", "pending"]),
    summary: z.string().optional(),
});
export const RuntimeReplayCard = z.object({
    card_id: z.string(),
    trace_id: z.string(),
    skill_id: SkillId,
    created_at: UtcTimestamp,
    markdown: z.string(),
    sections: z.object({
        learned: z.string(),
        evidence: z.array(z.string()),
        behavior_observations: z.array(z.string()),
        success_signals: z.array(z.string()),
        growth_directions: z.array(z.string()),
        preliminary_suggestions: z.array(z.string()),
    }),
});
export const GrowthOpportunity = z.object({
    id: z.string(),
    type: z.enum([
        "positive_guidance",
        "quality_gate",
        "api_endpoint_flow",
        "tool_gap",
        "workflow",
        "archive",
        "experience",
    ]),
    summary: z.string(),
    evidence: z.array(z.string()),
    priority: z.enum(["low", "medium", "high"]).default("medium"),
    proposed_action: z.string().optional(),
});
export const GrowthOpportunities = z.object({
    opportunities_id: z.string(),
    trace_id: z.string(),
    skill_id: SkillId,
    created_at: UtcTimestamp,
    opportunities: z.array(GrowthOpportunity),
});
export const PlannedOperation = z.discriminatedUnion("type", [
    z.object({
        op_id: z.string(),
        type: z.literal("update_file"),
        target: FilePath,
        reason: z.string(),
        evidence: z.array(z.string()).optional(),
        dry_run_result: z.literal("would_update"),
        risk: RiskLevel,
    }),
    z.object({
        op_id: z.string(),
        type: z.literal("create_file"),
        target: FilePath,
        reason: z.string(),
        dry_run_result: z.literal("would_create"),
        risk: RiskLevel,
    }),
    z.object({
        op_id: z.string(),
        type: z.literal("archive_file"),
        target: FilePath,
        archive_to: FilePath,
        reason: z.string(),
        dry_run_result: z.literal("would_archive"),
        risk: RiskLevel,
    }),
    z.object({
        op_id: z.string(),
        type: z.literal("update_endpoint_manifest"),
        target: FilePath,
        reason: z.string(),
        dry_run_result: z.literal("would_update"),
        risk: RiskLevel,
    }),
    z.object({
        op_id: z.string(),
        type: z.literal("create_quality_gate"),
        target: FilePath,
        reason: z.string(),
        dry_run_result: z.literal("would_create"),
        risk: RiskLevel,
    }),
]);
export const DryRunPlan = z.object({
    run_id: z.string(),
    skill_id: SkillId,
    mode: z.literal("dry-run"),
    source_trace: z.string(),
    summary: z.object({
        intent: z.string(),
        risk_level: RiskLevel,
        live_run_requires_snapshot: z.boolean(),
    }),
    planned_operations: z.array(PlannedOperation),
    quality_gates_to_run: z.array(z.string()),
    live_run_requirements: z.array(z.string()),
});
export const GrowthProposal = z.object({
    proposal_id: z.string(),
    run_id: z.string(),
    skill_id: SkillId,
    created_at: UtcTimestamp,
    markdown: z.string(),
});
export const QualityCheckResult = z.object({
    check_id: z.string(),
    category: z.enum(["skill_files", "consistency", "api", "archive", "experience"]),
    name: z.string(),
    passed: z.boolean(),
    message: z.string(),
    details: z.array(z.string()).optional(),
});
export const QualityReport = z.object({
    report_id: z.string(),
    skill_id: SkillId,
    preview_id: z.string().optional(),
    created_at: UtcTimestamp,
    triggered_by: z.string(),
    overall_passed: z.boolean(),
    results: z.array(QualityCheckResult),
});
//# sourceMappingURL=index.js.map