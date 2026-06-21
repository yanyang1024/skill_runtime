import { z } from "zod";
// ---------------------------------------------------------------------------
// 通用基元
// ---------------------------------------------------------------------------
export const UtcTimestamp = z.string().datetime({ offset: true });
export const FilePath = z.string().min(1);
export const SkillId = z.string().regex(/^[a-z0-9-]+$/);
export const RiskLevel = z.enum(["low", "medium", "high"]);
// ---------------------------------------------------------------------------
// Runtime Trace
// ---------------------------------------------------------------------------
export const UserUtterance = z.object({
    turn_id: z.string(),
    text: z.string(),
});
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
export const GrowthCandidate = z.object({
    type: z.string(),
    summary: z.string(),
    evidence: z.array(z.string()).optional(),
});
export const RuntimeTrace = z.object({
    trace_id: z.string(),
    skill_id: SkillId,
    skill_version: z.string(),
    session_id: z.string(),
    created_at: UtcTimestamp,
    raw_user_utterances: z.array(UserUtterance),
    intent_summary: z.string(),
    runtime_context: z.object({
        skill_files: z.array(FilePath),
        tools_available: z.array(z.string()),
        api_docs_available: z.boolean(),
    }),
    tool_calls: z.array(ToolCall),
    script_calls: z.array(ScriptCall),
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
    growth_candidates: z.array(GrowthCandidate),
});
// ---------------------------------------------------------------------------
// Runtime Replay Card（Markdown 包装对象，便于前后端传递）
// ---------------------------------------------------------------------------
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
// ---------------------------------------------------------------------------
// Growth Opportunities
// ---------------------------------------------------------------------------
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
// ---------------------------------------------------------------------------
// Dry-run Plan
// ---------------------------------------------------------------------------
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
// ---------------------------------------------------------------------------
// Growth Proposal（Markdown 包装对象）
// ---------------------------------------------------------------------------
export const GrowthProposal = z.object({
    proposal_id: z.string(),
    run_id: z.string(),
    skill_id: SkillId,
    created_at: UtcTimestamp,
    markdown: z.string(),
});
// ---------------------------------------------------------------------------
// Archive Manifest
// ---------------------------------------------------------------------------
export const ArchiveManifest = z.object({
    archive_id: z.string(),
    created_at: UtcTimestamp,
    skill_id: SkillId,
    triggered_by: z.string(),
    source_run: z.string(),
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
// Snapshot Manifest
// ---------------------------------------------------------------------------
export const SnapshotManifest = z.object({
    snapshot_id: z.string(),
    created_at: UtcTimestamp,
    skill_id: SkillId,
    path: FilePath,
    included: z.array(FilePath),
    triggered_by: z.string(),
    source_run: z.string(),
    restore_command: z.string(),
});
// ---------------------------------------------------------------------------
// Endpoint Manifest
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
        required_params: z.array(z.string()),
        optional_params: z.array(z.string()).optional(),
        auth: z.object({
            type: z.string(),
            required: z.boolean(),
        }),
        risk_level: z.enum(["read_only", "write", "admin"]),
        added_at: UtcTimestamp,
        tests: z
            .record(z.string(), z.object({
            path: FilePath,
            status: z.enum(["pending", "passed", "failed"]).default("pending"),
        }))
            .optional(),
        skill_usage: z.object({
            allowed: z.boolean(),
            reason: z.string().optional(),
            usage_hint: z.string().optional(),
        }),
    })),
});
// ---------------------------------------------------------------------------
// Director Notes
// ---------------------------------------------------------------------------
export const DirectorFeedback = z.object({
    dimension: z.string(),
    label: z.string(),
    note: z.string(),
});
export const DirectorNotes = z.object({
    preview_id: z.string(),
    rehearse_id: z.string(),
    skill_id: SkillId,
    created_at: UtcTimestamp,
    feedback: z.array(DirectorFeedback),
    decision_hint: z.enum(["promote", "revise_minor", "revise_major", "discard"]).optional(),
});
// ---------------------------------------------------------------------------
// Quality Report
// ---------------------------------------------------------------------------
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