import { z } from "zod";
export declare const UtcTimestamp: z.ZodString;
export declare const FilePath: z.ZodString;
export declare const SkillId: z.ZodString;
export declare const RiskLevel: z.ZodEnum<{
    low: "low";
    medium: "medium";
    high: "high";
}>;
export declare const UserUtterance: z.ZodObject<{
    turn_id: z.ZodString;
    text: z.ZodString;
}, z.core.$strip>;
export declare const ToolCall: z.ZodObject<{
    tool_name: z.ZodString;
    status: z.ZodEnum<{
        success: "success";
        failure: "failure";
        pending: "pending";
    }>;
    summary: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const ScriptCall: z.ZodObject<{
    script_name: z.ZodString;
    status: z.ZodEnum<{
        success: "success";
        failure: "failure";
        pending: "pending";
    }>;
    summary: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const GrowthCandidate: z.ZodObject<{
    type: z.ZodString;
    summary: z.ZodString;
    evidence: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export declare const RuntimeTrace: z.ZodObject<{
    trace_id: z.ZodString;
    skill_id: z.ZodString;
    skill_version: z.ZodString;
    session_id: z.ZodString;
    created_at: z.ZodString;
    raw_user_utterances: z.ZodArray<z.ZodObject<{
        turn_id: z.ZodString;
        text: z.ZodString;
    }, z.core.$strip>>;
    intent_summary: z.ZodString;
    runtime_context: z.ZodObject<{
        skill_files: z.ZodArray<z.ZodString>;
        tools_available: z.ZodArray<z.ZodString>;
        api_docs_available: z.ZodBoolean;
    }, z.core.$strip>;
    tool_calls: z.ZodArray<z.ZodObject<{
        tool_name: z.ZodString;
        status: z.ZodEnum<{
            success: "success";
            failure: "failure";
            pending: "pending";
        }>;
        summary: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    script_calls: z.ZodArray<z.ZodObject<{
        script_name: z.ZodString;
        status: z.ZodEnum<{
            success: "success";
            failure: "failure";
            pending: "pending";
        }>;
        summary: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    hard_signals: z.ZodObject<{
        tool_failures: z.ZodArray<z.ZodString>;
        api_failures: z.ZodArray<z.ZodString>;
        schema_errors: z.ZodArray<z.ZodString>;
        quality_gate_failures: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
    soft_signals: z.ZodObject<{
        user_experience: z.ZodArray<z.ZodString>;
        director_notes: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
    growth_candidates: z.ZodArray<z.ZodObject<{
        type: z.ZodString;
        summary: z.ZodString;
        evidence: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type RuntimeTrace = z.infer<typeof RuntimeTrace>;
export declare const RuntimeReplayCard: z.ZodObject<{
    card_id: z.ZodString;
    trace_id: z.ZodString;
    skill_id: z.ZodString;
    created_at: z.ZodString;
    markdown: z.ZodString;
    sections: z.ZodObject<{
        learned: z.ZodString;
        evidence: z.ZodArray<z.ZodString>;
        behavior_observations: z.ZodArray<z.ZodString>;
        success_signals: z.ZodArray<z.ZodString>;
        growth_directions: z.ZodArray<z.ZodString>;
        preliminary_suggestions: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type RuntimeReplayCard = z.infer<typeof RuntimeReplayCard>;
export declare const GrowthOpportunity: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodEnum<{
        positive_guidance: "positive_guidance";
        quality_gate: "quality_gate";
        api_endpoint_flow: "api_endpoint_flow";
        tool_gap: "tool_gap";
        workflow: "workflow";
        archive: "archive";
        experience: "experience";
    }>;
    summary: z.ZodString;
    evidence: z.ZodArray<z.ZodString>;
    priority: z.ZodDefault<z.ZodEnum<{
        low: "low";
        medium: "medium";
        high: "high";
    }>>;
    proposed_action: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const GrowthOpportunities: z.ZodObject<{
    opportunities_id: z.ZodString;
    trace_id: z.ZodString;
    skill_id: z.ZodString;
    created_at: z.ZodString;
    opportunities: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        type: z.ZodEnum<{
            positive_guidance: "positive_guidance";
            quality_gate: "quality_gate";
            api_endpoint_flow: "api_endpoint_flow";
            tool_gap: "tool_gap";
            workflow: "workflow";
            archive: "archive";
            experience: "experience";
        }>;
        summary: z.ZodString;
        evidence: z.ZodArray<z.ZodString>;
        priority: z.ZodDefault<z.ZodEnum<{
            low: "low";
            medium: "medium";
            high: "high";
        }>>;
        proposed_action: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type GrowthOpportunities = z.infer<typeof GrowthOpportunities>;
export declare const PlannedOperation: z.ZodDiscriminatedUnion<[z.ZodObject<{
    op_id: z.ZodString;
    type: z.ZodLiteral<"update_file">;
    target: z.ZodString;
    reason: z.ZodString;
    evidence: z.ZodOptional<z.ZodArray<z.ZodString>>;
    dry_run_result: z.ZodLiteral<"would_update">;
    risk: z.ZodEnum<{
        low: "low";
        medium: "medium";
        high: "high";
    }>;
}, z.core.$strip>, z.ZodObject<{
    op_id: z.ZodString;
    type: z.ZodLiteral<"create_file">;
    target: z.ZodString;
    reason: z.ZodString;
    dry_run_result: z.ZodLiteral<"would_create">;
    risk: z.ZodEnum<{
        low: "low";
        medium: "medium";
        high: "high";
    }>;
}, z.core.$strip>, z.ZodObject<{
    op_id: z.ZodString;
    type: z.ZodLiteral<"archive_file">;
    target: z.ZodString;
    archive_to: z.ZodString;
    reason: z.ZodString;
    dry_run_result: z.ZodLiteral<"would_archive">;
    risk: z.ZodEnum<{
        low: "low";
        medium: "medium";
        high: "high";
    }>;
}, z.core.$strip>, z.ZodObject<{
    op_id: z.ZodString;
    type: z.ZodLiteral<"update_endpoint_manifest">;
    target: z.ZodString;
    reason: z.ZodString;
    dry_run_result: z.ZodLiteral<"would_update">;
    risk: z.ZodEnum<{
        low: "low";
        medium: "medium";
        high: "high";
    }>;
}, z.core.$strip>, z.ZodObject<{
    op_id: z.ZodString;
    type: z.ZodLiteral<"create_quality_gate">;
    target: z.ZodString;
    reason: z.ZodString;
    dry_run_result: z.ZodLiteral<"would_create">;
    risk: z.ZodEnum<{
        low: "low";
        medium: "medium";
        high: "high";
    }>;
}, z.core.$strip>], "type">;
export declare const DryRunPlan: z.ZodObject<{
    run_id: z.ZodString;
    skill_id: z.ZodString;
    mode: z.ZodLiteral<"dry-run">;
    source_trace: z.ZodString;
    summary: z.ZodObject<{
        intent: z.ZodString;
        risk_level: z.ZodEnum<{
            low: "low";
            medium: "medium";
            high: "high";
        }>;
        live_run_requires_snapshot: z.ZodBoolean;
    }, z.core.$strip>;
    planned_operations: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
        op_id: z.ZodString;
        type: z.ZodLiteral<"update_file">;
        target: z.ZodString;
        reason: z.ZodString;
        evidence: z.ZodOptional<z.ZodArray<z.ZodString>>;
        dry_run_result: z.ZodLiteral<"would_update">;
        risk: z.ZodEnum<{
            low: "low";
            medium: "medium";
            high: "high";
        }>;
    }, z.core.$strip>, z.ZodObject<{
        op_id: z.ZodString;
        type: z.ZodLiteral<"create_file">;
        target: z.ZodString;
        reason: z.ZodString;
        dry_run_result: z.ZodLiteral<"would_create">;
        risk: z.ZodEnum<{
            low: "low";
            medium: "medium";
            high: "high";
        }>;
    }, z.core.$strip>, z.ZodObject<{
        op_id: z.ZodString;
        type: z.ZodLiteral<"archive_file">;
        target: z.ZodString;
        archive_to: z.ZodString;
        reason: z.ZodString;
        dry_run_result: z.ZodLiteral<"would_archive">;
        risk: z.ZodEnum<{
            low: "low";
            medium: "medium";
            high: "high";
        }>;
    }, z.core.$strip>, z.ZodObject<{
        op_id: z.ZodString;
        type: z.ZodLiteral<"update_endpoint_manifest">;
        target: z.ZodString;
        reason: z.ZodString;
        dry_run_result: z.ZodLiteral<"would_update">;
        risk: z.ZodEnum<{
            low: "low";
            medium: "medium";
            high: "high";
        }>;
    }, z.core.$strip>, z.ZodObject<{
        op_id: z.ZodString;
        type: z.ZodLiteral<"create_quality_gate">;
        target: z.ZodString;
        reason: z.ZodString;
        dry_run_result: z.ZodLiteral<"would_create">;
        risk: z.ZodEnum<{
            low: "low";
            medium: "medium";
            high: "high";
        }>;
    }, z.core.$strip>], "type">>;
    quality_gates_to_run: z.ZodArray<z.ZodString>;
    live_run_requirements: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type DryRunPlan = z.infer<typeof DryRunPlan>;
export type PlannedOperation = z.infer<typeof PlannedOperation>;
export declare const GrowthProposal: z.ZodObject<{
    proposal_id: z.ZodString;
    run_id: z.ZodString;
    skill_id: z.ZodString;
    created_at: z.ZodString;
    markdown: z.ZodString;
}, z.core.$strip>;
export type GrowthProposal = z.infer<typeof GrowthProposal>;
export declare const ArchiveManifest: z.ZodObject<{
    archive_id: z.ZodString;
    created_at: z.ZodString;
    skill_id: z.ZodString;
    triggered_by: z.ZodString;
    source_run: z.ZodString;
    archived_files: z.ZodArray<z.ZodObject<{
        original_path: z.ZodString;
        archive_path: z.ZodString;
        reason: z.ZodString;
        replacement: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
    policy: z.ZodObject<{
        never_delete: z.ZodLiteral<true>;
        can_restore: z.ZodBoolean;
    }, z.core.$strip>;
}, z.core.$strip>;
export type ArchiveManifest = z.infer<typeof ArchiveManifest>;
export declare const SnapshotManifest: z.ZodObject<{
    snapshot_id: z.ZodString;
    created_at: z.ZodString;
    skill_id: z.ZodString;
    path: z.ZodString;
    included: z.ZodArray<z.ZodString>;
    triggered_by: z.ZodString;
    source_run: z.ZodString;
    restore_command: z.ZodString;
}, z.core.$strip>;
export type SnapshotManifest = z.infer<typeof SnapshotManifest>;
export declare const EndpointStatus: z.ZodEnum<{
    discovered: "discovered";
    candidate: "candidate";
    verified: "verified";
    active: "active";
    deprecated: "deprecated";
    archived: "archived";
}>;
export declare const EndpointManifest: z.ZodObject<{
    skill_id: z.ZodString;
    updated_at: z.ZodString;
    endpoints: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        status: z.ZodEnum<{
            discovered: "discovered";
            candidate: "candidate";
            verified: "verified";
            active: "active";
            deprecated: "deprecated";
            archived: "archived";
        }>;
        source: z.ZodString;
        method: z.ZodEnum<{
            GET: "GET";
            POST: "POST";
            PUT: "PUT";
            PATCH: "PATCH";
            DELETE: "DELETE";
        }>;
        path: z.ZodString;
        description: z.ZodString;
        required_params: z.ZodArray<z.ZodString>;
        optional_params: z.ZodOptional<z.ZodArray<z.ZodString>>;
        auth: z.ZodObject<{
            type: z.ZodString;
            required: z.ZodBoolean;
        }, z.core.$strip>;
        risk_level: z.ZodEnum<{
            read_only: "read_only";
            write: "write";
            admin: "admin";
        }>;
        added_at: z.ZodString;
        tests: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
            path: z.ZodString;
            status: z.ZodDefault<z.ZodEnum<{
                pending: "pending";
                passed: "passed";
                failed: "failed";
            }>>;
        }, z.core.$strip>>>;
        skill_usage: z.ZodObject<{
            allowed: z.ZodBoolean;
            reason: z.ZodOptional<z.ZodString>;
            usage_hint: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type EndpointManifest = z.infer<typeof EndpointManifest>;
export declare const DirectorFeedback: z.ZodObject<{
    dimension: z.ZodString;
    label: z.ZodString;
    note: z.ZodString;
}, z.core.$strip>;
export declare const DirectorNotes: z.ZodObject<{
    preview_id: z.ZodString;
    rehearse_id: z.ZodString;
    skill_id: z.ZodString;
    created_at: z.ZodString;
    feedback: z.ZodArray<z.ZodObject<{
        dimension: z.ZodString;
        label: z.ZodString;
        note: z.ZodString;
    }, z.core.$strip>>;
    decision_hint: z.ZodOptional<z.ZodEnum<{
        promote: "promote";
        revise_minor: "revise_minor";
        revise_major: "revise_major";
        discard: "discard";
    }>>;
}, z.core.$strip>;
export type DirectorNotes = z.infer<typeof DirectorNotes>;
export declare const QualityCheckResult: z.ZodObject<{
    check_id: z.ZodString;
    category: z.ZodEnum<{
        skill_files: "skill_files";
        archive: "archive";
        experience: "experience";
        consistency: "consistency";
        api: "api";
    }>;
    name: z.ZodString;
    passed: z.ZodBoolean;
    message: z.ZodString;
    details: z.ZodOptional<z.ZodArray<z.ZodString>>;
}, z.core.$strip>;
export declare const QualityReport: z.ZodObject<{
    report_id: z.ZodString;
    skill_id: z.ZodString;
    preview_id: z.ZodOptional<z.ZodString>;
    created_at: z.ZodString;
    triggered_by: z.ZodString;
    overall_passed: z.ZodBoolean;
    results: z.ZodArray<z.ZodObject<{
        check_id: z.ZodString;
        category: z.ZodEnum<{
            skill_files: "skill_files";
            archive: "archive";
            experience: "experience";
            consistency: "consistency";
            api: "api";
        }>;
        name: z.ZodString;
        passed: z.ZodBoolean;
        message: z.ZodString;
        details: z.ZodOptional<z.ZodArray<z.ZodString>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type QualityCheckResult = z.infer<typeof QualityCheckResult>;
export type QualityReport = z.infer<typeof QualityReport>;
//# sourceMappingURL=index.d.ts.map