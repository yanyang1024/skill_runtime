import { useState, useEffect } from "react";
import type { TokenStats } from "../hooks/useChatSession";

interface ContextInfo {
  skill_source: string;
  inputs: {
    previous_stage_output: string[];
    session_log: string[];
    api_docs: string[];
  };
  output_templates: string[];
}

interface ContextPanelProps {
  runId: string | null;
  stageId: string | null;
  attempt: number;
  tokenStats?: TokenStats;
  collapsed?: boolean;
}

export function ContextPanel({ runId, stageId, attempt, tokenStats, collapsed: initialCollapsed }: ContextPanelProps) {
  const [ctx, setCtx] = useState<ContextInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(initialCollapsed ?? true);

  useEffect(() => {
    if (!runId || !stageId) { setCtx(null); setLoading(false); setFetchError(null); return; }
    setLoading(true); setFetchError(null);
    fetch(`/api/runs/${runId}/stage/${stageId}/context?attempt=${attempt}`)
      .then((r) => r.ok ? r.json() as Promise<ContextInfo> : null)
      .then((data) => { setCtx(data); setLoading(false); })
      .catch((err) => { setFetchError(err instanceof Error ? err.message : String(err)); setLoading(false); });
  }, [runId, stageId, attempt]);

  const usagePct = tokenStats && tokenStats.limit > 0
    ? Math.round(tokenStats.input / tokenStats.limit * 100)
    : 0;
  const hasInputs = ctx && (ctx.inputs.previous_stage_output.length > 0
    || ctx.inputs.session_log.length > 0
    || ctx.inputs.api_docs.length > 0);
  const hasTemplates = ctx && ctx.output_templates.length > 0;
  const showContent = !loading && !fetchError && ctx;

  return (
    <div className={`context-panel ${collapsed ? "collapsed" : ""}`}>
      <div className="context-header" onClick={() => setCollapsed(!collapsed)}>
        <span>📋 模型上下文 {collapsed ? "▶" : "▼"}</span>
        {tokenStats && tokenStats.input > 0 && (
          <span className="context-token-mini" style={{ color: usagePct > 80 ? "var(--danger)" : "var(--text-muted)" }}>
            {usagePct}% ({Math.round(tokenStats.input/1000)}K)
          </span>
        )}
      </div>
      {!collapsed && (
        <div className="context-body">
          {loading && <div className="context-empty">加载中…</div>}
          {fetchError && <div className="context-empty" style={{ color: "var(--danger)" }}>加载失败: {fetchError}</div>}
          {showContent && (
            <>
              <div className="context-section">
                <div className="context-label">📂 Skill ({ctx!.skill_source})</div>
                <div className="context-files">
                  <span className="context-file">SKILL.md</span>
                  <span className="context-note">(自动加载到系统提示词)</span>
                </div>
              </div>
              {hasInputs && (
                <div className="context-section">
                  <div className="context-label">📥 输入文件</div>
                  <div className="context-files">
                    {ctx!.inputs.previous_stage_output.map((f) => <span key={f} className="context-file">↳ {f}</span>)}
                    {ctx!.inputs.session_log.map((f) => <span key={f} className="context-file">📝 {f}</span>)}
                    {ctx!.inputs.api_docs.map((f) => <span key={f} className="context-file">📄 {f}</span>)}
                  </div>
                </div>
              )}
              {hasTemplates && (
                <div className="context-section">
                  <div className="context-label">📝 Output 模板</div>
                  <div className="context-files">
                    {ctx!.output_templates.map((f) => <span key={f} className="context-file">⊡ {f} (空白模板)</span>)}
                  </div>
                </div>
              )}
              {!hasInputs && !hasTemplates && (
                <div className="context-empty">无额外文件 — 模型仅加载 SKILL.md</div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
