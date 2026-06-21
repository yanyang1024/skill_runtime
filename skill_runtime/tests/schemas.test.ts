import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  RuntimeTrace,
  DryRunPlan,
  ArchiveManifest,
  SnapshotManifest,
  EndpointManifest,
  QualityReport,
} from "../app/shared/schemas/index.js";

describe("schemas", () => {
  it("validates a minimal RuntimeTrace", () => {
    const trace = {
      trace_id: "trace_20260621_001",
      skill_id: "etch-skill",
      skill_version: "stable-0.2.1",
      session_id: "session_001",
      created_at: "2026-06-21T08:30:12Z",
      raw_user_utterances: [{ turn_id: "u1", text: "hello" }],
      intent_summary: "summary",
      runtime_context: {
        skill_files: ["SKILL.md"],
        tools_available: [],
        api_docs_available: false,
      },
      tool_calls: [],
      script_calls: [],
      hard_signals: {
        tool_failures: [],
        api_failures: [],
        schema_errors: [],
        quality_gate_failures: [],
      },
      soft_signals: {
        user_experience: [],
        director_notes: [],
      },
      growth_candidates: [],
    };
    assert.doesNotThrow(() => RuntimeTrace.parse(trace));
  });

  it("rejects a RuntimeTrace missing required fields", () => {
    assert.throws(() => RuntimeTrace.parse({ trace_id: "x" }));
  });

  it("validates a dry-run plan", () => {
    const plan = {
      run_id: "grow-20260621-083012",
      skill_id: "etch-skill",
      mode: "dry-run",
      source_trace: "trace_20260621_001",
      summary: {
        intent: "test",
        risk_level: "medium",
        live_run_requires_snapshot: true,
      },
      planned_operations: [
        {
          op_id: "op-001",
          type: "update_file",
          target: "skills/etch-skill/stable/SKILL.md",
          reason: "reason",
          dry_run_result: "would_update",
          risk: "low",
        },
      ],
      quality_gates_to_run: [],
      live_run_requirements: [],
    };
    assert.doesNotThrow(() => DryRunPlan.parse(plan));
  });

  it("validates snapshot and archive manifests", () => {
    const snap = {
      snapshot_id: "snapshot-20260621-083012",
      created_at: "2026-06-21T08:30:12Z",
      skill_id: "etch-skill",
      path: ".Grow_backups/etch-skill/2026-06-21T08-30-12Z.tar.gz",
      included: ["stable/"],
      triggered_by: "grow-live-run",
      source_run: "grow-20260621-083012",
      restore_command: "skill-growth restore --snapshot snapshot-20260621-083012",
    };
    assert.doesNotThrow(() => SnapshotManifest.parse(snap));

    const archive = {
      archive_id: "archive-20260621-083012",
      created_at: "2026-06-21T08:30:12Z",
      skill_id: "etch-skill",
      triggered_by: "grow-live-run",
      source_run: "grow-20260621-083012",
      archived_files: [
        {
          original_path: "references/old.md",
          archive_path: ".archive/2026-06-21T08-30-12Z/references/old.md",
          reason: "replaced",
        },
      ],
      policy: { never_delete: true, can_restore: true },
    };
    assert.doesNotThrow(() => ArchiveManifest.parse(archive));
  });

  it("validates endpoint manifest", () => {
    const manifest = {
      skill_id: "etch-skill",
      updated_at: "2026-06-21T08:30:12Z",
      endpoints: [
        {
          id: "run_history_v2",
          name: "Run History Query",
          status: "candidate",
          source: "api_docs/raw/run_history_api.md",
          method: "GET",
          path: "/api/v2/run-history",
          description: "query run history",
          required_params: ["lot_id"],
          auth: { type: "bearer", required: true },
          risk_level: "read_only",
          added_at: "2026-06-21T08:30:12Z",
          skill_usage: { allowed: false, reason: "not tested" },
        },
      ],
    };
    assert.doesNotThrow(() => EndpointManifest.parse(manifest));
  });

  it("validates quality report", () => {
    const report = {
      report_id: "qr-1",
      skill_id: "etch-skill",
      created_at: "2026-06-21T08:30:12Z",
      triggered_by: "grow-live",
      overall_passed: true,
      results: [
        {
          check_id: "no_delete",
          category: "archive",
          name: "No delete operations",
          passed: true,
          message: "ok",
        },
      ],
    };
    assert.doesNotThrow(() => QualityReport.parse(report));
  });
});
