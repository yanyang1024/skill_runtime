import { z } from "zod";
export declare const UtcTimestamp: z.ZodString;
export declare const FilePath: z.ZodString;
export declare const SkillId: z.ZodString;
export declare const StageId: z.ZodEnum<{
    "observe-log-review": "observe-log-review";
    "observe-api-scan": "observe-api-scan";
    "grow-plan": "grow-plan";
    "grow-build": "grow-build";
    "grow-quality-review": "grow-quality-review";
    "rehearse-preview": "rehearse-preview";
    "rehearse-iteration": "rehearse-iteration";
    "stabilize-release": "stabilize-release";
}>;
export type StageId = z.infer<typeof StageId>;
export declare const RiskLevel: z.ZodEnum<{
    low: "low";
    medium: "medium";
    high: "high";
}>;
export declare const StageRuntimeContract: z.ZodObject<{
    stage_id: z.ZodEnum<{
        "observe-log-review": "observe-log-review";
        "observe-api-scan": "observe-api-scan";
        "grow-plan": "grow-plan";
        "grow-build": "grow-build";
        "grow-quality-review": "grow-quality-review";
        "rehearse-preview": "rehearse-preview";
        "rehearse-iteration": "rehearse-iteration";
        "stabilize-release": "stabilize-release";
    }>;
    runtime_mode: z.ZodLiteral<"serve">;
    agent_role: z.ZodEnum<{
        observe: "observe";
        plan: "plan";
        build: "build";
        review: "review";
        preview: "preview";
        iteration: "iteration";
        release: "release";
    }>;
    skill_mount: z.ZodEnum<{
        "stable-readonly": "stable-readonly";
        "preview-readonly": "preview-readonly";
        "preview-writable": "preview-writable";
        none: "none";
    }>;
    work_writable: z.ZodBoolean;
    requires_snapshot_before_start: z.ZodBoolean;
    requires_quality_after_complete: z.ZodBoolean;
    expected_outputs: z.ZodArray<z.ZodString>;
    human_role: z.ZodEnum<{
        none: "none";
        watch: "watch";
        experience: "experience";
        "write-review": "write-review";
    }>;
}, z.core.$strip>;
export type StageRuntimeContract = z.infer<typeof StageRuntimeContract>;
export declare const RunState: z.ZodObject<{
    run_id: z.ZodString;
    skill_id: z.ZodString;
    preview_id: z.ZodOptional<z.ZodString>;
    current_stage: z.ZodOptional<z.ZodEnum<{
        "observe-log-review": "observe-log-review";
        "observe-api-scan": "observe-api-scan";
        "grow-plan": "grow-plan";
        "grow-build": "grow-build";
        "grow-quality-review": "grow-quality-review";
        "rehearse-preview": "rehearse-preview";
        "rehearse-iteration": "rehearse-iteration";
        "stabilize-release": "stabilize-release";
    }>>;
    status: z.ZodEnum<{
        idle: "idle";
        running: "running";
        waiting_director: "waiting_director";
        completed: "completed";
        failed: "failed";
    }>;
    created_at: z.ZodString;
    updated_at: z.ZodString;
}, z.core.$strip>;
export type RunState = z.infer<typeof RunState>;
export declare const StageState: z.ZodObject<{
    stage_id: z.ZodEnum<{
        "observe-log-review": "observe-log-review";
        "observe-api-scan": "observe-api-scan";
        "grow-plan": "grow-plan";
        "grow-build": "grow-build";
        "grow-quality-review": "grow-quality-review";
        "rehearse-preview": "rehearse-preview";
        "rehearse-iteration": "rehearse-iteration";
        "stabilize-release": "stabilize-release";
    }>;
    run_id: z.ZodString;
    status: z.ZodEnum<{
        running: "running";
        completed: "completed";
        failed: "failed";
        pending: "pending";
        waiting_input: "waiting_input";
    }>;
    attempt: z.ZodNumber;
    server_id: z.ZodOptional<z.ZodString>;
    workspace_path: z.ZodString;
    outputs: z.ZodArray<z.ZodString>;
    digest_path: z.ZodString;
    created_at: z.ZodString;
    updated_at: z.ZodString;
}, z.core.$strip>;
export type StageState = z.infer<typeof StageState>;
export declare const StageTransition: z.ZodObject<{
    from: z.ZodEnum<{
        "observe-log-review": "observe-log-review";
        "observe-api-scan": "observe-api-scan";
        "grow-plan": "grow-plan";
        "grow-build": "grow-build";
        "grow-quality-review": "grow-quality-review";
        "rehearse-preview": "rehearse-preview";
        "rehearse-iteration": "rehearse-iteration";
        "stabilize-release": "stabilize-release";
    }>;
    to: z.ZodEnum<{
        "observe-log-review": "observe-log-review";
        "observe-api-scan": "observe-api-scan";
        "grow-plan": "grow-plan";
        "grow-build": "grow-build";
        "grow-quality-review": "grow-quality-review";
        "rehearse-preview": "rehearse-preview";
        "rehearse-iteration": "rehearse-iteration";
        "stabilize-release": "stabilize-release";
    }>;
    reason: z.ZodEnum<{
        normal: "normal";
        fix: "fix";
        rescan: "rescan";
        retry: "retry";
        manual: "manual";
    }>;
    carry_outputs: z.ZodArray<z.ZodString>;
    created_at: z.ZodString;
}, z.core.$strip>;
export type StageTransition = z.infer<typeof StageTransition>;
export declare const OpencodeRuntime: z.ZodObject<{
    server_id: z.ZodString;
    stage_id: z.ZodEnum<{
        "observe-log-review": "observe-log-review";
        "observe-api-scan": "observe-api-scan";
        "grow-plan": "grow-plan";
        "grow-build": "grow-build";
        "grow-quality-review": "grow-quality-review";
        "rehearse-preview": "rehearse-preview";
        "rehearse-iteration": "rehearse-iteration";
        "stabilize-release": "stabilize-release";
    }>;
    run_id: z.ZodString;
    skill_id: z.ZodString;
    runtime_mode: z.ZodLiteral<"serve">;
    port: z.ZodNumber;
    base_url: z.ZodString;
    open_url: z.ZodString;
    open_url_with_auth: z.ZodOptional<z.ZodString>;
    proxy_url: z.ZodString;
    workspace_path: z.ZodString;
    opencode_config_dir: z.ZodString;
    process_pid: z.ZodOptional<z.ZodNumber>;
    status: z.ZodEnum<{
        error: "error";
        running: "running";
        starting: "starting";
        stopped: "stopped";
    }>;
}, z.core.$strip>;
export type OpencodeRuntime = z.infer<typeof OpencodeRuntime>;
export declare const PromptRecommendRequest: z.ZodObject<{
    stage_id: z.ZodEnum<{
        "observe-log-review": "observe-log-review";
        "observe-api-scan": "observe-api-scan";
        "grow-plan": "grow-plan";
        "grow-build": "grow-build";
        "grow-quality-review": "grow-quality-review";
        "rehearse-preview": "rehearse-preview";
        "rehearse-iteration": "rehearse-iteration";
        "stabilize-release": "stabilize-release";
    }>;
    run_id: z.ZodString;
    server_id: z.ZodString;
    attempt: z.ZodOptional<z.ZodNumber>;
    recent_output_summary: z.ZodOptional<z.ZodString>;
    director_review: z.ZodOptional<z.ZodString>;
    goal: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type PromptRecommendRequest = z.infer<typeof PromptRecommendRequest>;
export declare const PromptRecommendResponse: z.ZodObject<{
    primary: z.ZodString;
    alternatives: z.ZodArray<z.ZodString>;
    rationale: z.ZodString;
    risk_hint: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type PromptRecommendResponse = z.infer<typeof PromptRecommendResponse>;
export declare const DirectorReview: z.ZodObject<{
    review_id: z.ZodString;
    run_id: z.ZodString;
    stage_id: z.ZodEnum<{
        "observe-log-review": "observe-log-review";
        "observe-api-scan": "observe-api-scan";
        "grow-plan": "grow-plan";
        "grow-build": "grow-build";
        "grow-quality-review": "grow-quality-review";
        "rehearse-preview": "rehearse-preview";
        "rehearse-iteration": "rehearse-iteration";
        "stabilize-release": "stabilize-release";
    }>;
    skill_id: z.ZodString;
    preview_id: z.ZodOptional<z.ZodString>;
    content: z.ZodString;
    created_at: z.ZodString;
}, z.core.$strip>;
export type DirectorReview = z.infer<typeof DirectorReview>;
export declare const SnapshotManifest: z.ZodObject<{
    snapshot_id: z.ZodString;
    created_at: z.ZodString;
    skill_id: z.ZodString;
    preview_id: z.ZodOptional<z.ZodString>;
    path: z.ZodString;
    included: z.ZodArray<z.ZodString>;
    triggered_by: z.ZodString;
    source_run: z.ZodOptional<z.ZodString>;
    restore_command: z.ZodString;
}, z.core.$strip>;
export type SnapshotManifest = z.infer<typeof SnapshotManifest>;
export declare const ArchiveManifest: z.ZodObject<{
    archive_id: z.ZodString;
    created_at: z.ZodString;
    skill_id: z.ZodString;
    triggered_by: z.ZodString;
    source_run: z.ZodOptional<z.ZodString>;
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
        required_params: z.ZodOptional<z.ZodArray<z.ZodString>>;
        optional_params: z.ZodOptional<z.ZodArray<z.ZodString>>;
        auth: z.ZodOptional<z.ZodObject<{
            type: z.ZodString;
            required: z.ZodBoolean;
        }, z.core.$strip>>;
        risk_level: z.ZodOptional<z.ZodEnum<{
            read_only: "read_only";
            write: "write";
            admin: "admin";
        }>>;
        added_at: z.ZodOptional<z.ZodString>;
        tests: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodObject<{
            path: z.ZodString;
            status: z.ZodDefault<z.ZodEnum<{
                failed: "failed";
                pending: "pending";
                passed: "passed";
            }>>;
        }, z.core.$strip>>>;
        skill_usage: z.ZodOptional<z.ZodObject<{
            allowed: z.ZodBoolean;
            reason: z.ZodOptional<z.ZodString>;
            usage_hint: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type EndpointManifest = z.infer<typeof EndpointManifest>;
export declare const ToolCall: z.ZodObject<{
    tool_name: z.ZodString;
    status: z.ZodEnum<{
        success: "success";
        pending: "pending";
        failure: "failure";
    }>;
    summary: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const ScriptCall: z.ZodObject<{
    script_name: z.ZodString;
    status: z.ZodEnum<{
        success: "success";
        pending: "pending";
        failure: "failure";
    }>;
    summary: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
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
        experience: "experience";
        positive_guidance: "positive_guidance";
        quality_gate: "quality_gate";
        api_endpoint_flow: "api_endpoint_flow";
        tool_gap: "tool_gap";
        workflow: "workflow";
        archive: "archive";
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
            experience: "experience";
            positive_guidance: "positive_guidance";
            quality_gate: "quality_gate";
            api_endpoint_flow: "api_endpoint_flow";
            tool_gap: "tool_gap";
            workflow: "workflow";
            archive: "archive";
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
export declare const QualityCheckResult: z.ZodObject<{
    check_id: z.ZodString;
    category: z.ZodEnum<{
        experience: "experience";
        skill_files: "skill_files";
        archive: "archive";
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
            experience: "experience";
            skill_files: "skill_files";
            archive: "archive";
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