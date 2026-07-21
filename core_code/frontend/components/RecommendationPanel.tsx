import type { Conversation, Recommendation } from "../types";
import { STAGES } from "../types";

interface Props {
  conversation: Conversation | null;
  recommendation: Recommendation | null;
  /** recommendation_started 后为 true，recommendation_ready 后刷新并置 false */
  loading: boolean;
  /** 生成中禁用「立即发送」 */
  running: boolean;
  onRegenerate: () => void;
  /** 填入输入框（不发送） */
  onFill: (text: string) => void;
  /** 立即发送 */
  onSend: (text: string) => void;
  /** 手动选择阶段；null 表示切回自动 */
  onStageChange: (stage: string | null) => void;
}

/** 置信度容错：0~1 视为比例，否则视为百分数 */
function confidencePct(c: number): number {
  return Math.min(100, Math.max(0, Math.round(c <= 1 ? c * 100 : c)));
}

/** 备选条目容错渲染（契约外结构兜底） */
function altText(alt: unknown): string {
  if (typeof alt === "string") return alt;
  return JSON.stringify(alt);
}

/** 阶段徽章配色（8 阶段循环使用柔和底色） */
function stageClass(stage: string): string {
  const idx = STAGES.indexOf(stage as (typeof STAGES)[number]);
  return `stage-tag stage-${idx >= 0 ? idx % 8 : 0}`;
}

export default function RecommendationPanel({
  conversation,
  recommendation,
  loading,
  running,
  onRegenerate,
  onFill,
  onSend,
  onStageChange,
}: Props) {
  const isManual = conversation?.stage_mode === "manual" && !!conversation?.selected_stage;
  const stageValue = isManual ? (conversation?.selected_stage as string) : "auto";
  const pct = recommendation ? confidencePct(recommendation.confidence) : 0;

  return (
    <div className="rec-panel">
      <div className="rec-toolbar">
        <select
          className="stage-select"
          value={stageValue}
          disabled={!conversation}
          onChange={(e) => onStageChange(e.target.value === "auto" ? null : e.target.value)}
        >
          <option value="auto">阶段：自动</option>
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button className="btn" onClick={onRegenerate} disabled={!conversation || loading}>
          重新生成
        </button>
      </div>

      {loading && (
        <div className="rec-skeleton" aria-label="生成中">
          <div className="skel skel-line w40" />
          <div className="skel skel-block" />
          <div className="skel skel-line w80" />
          <div className="skel skel-line w60" />
          <div className="rec-skeleton-text">正在生成推荐…</div>
        </div>
      )}

      {!loading && !recommendation && (
        <div className="panel-empty">
          暂无推荐。
          <br />
          完成一轮对话后，这里会结合对话内容与文件环境，推荐下一句话。
        </div>
      )}

      {!loading && recommendation && (
        <div className="rec-body">
          <div className="rec-meta">
            <span className={stageClass(recommendation.inferred_stage)}>
              {recommendation.inferred_stage}
            </span>
            <span className="stage-mode">{isManual ? "手动指定" : "自动推测"}</span>
          </div>
          <div className="confidence-row" title={`置信度 ${pct}%`}>
            <div className="confidence-bar">
              <div className="confidence-fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="confidence-text">{pct}%</span>
          </div>
          {recommendation.stage_reason && (
            <div className="rec-reason">判断理由：{recommendation.stage_reason}</div>
          )}

          <div className="card rec-primary">
            <div className="rec-label">主推荐</div>
            <div className="rec-text">{recommendation.primary}</div>
            <div className="card-actions">
              <button className="btn" onClick={() => onFill(recommendation.primary)}>
                填入输入框
              </button>
              <button
                className="btn btn-primary"
                disabled={running}
                onClick={() => onSend(recommendation.primary)}
              >
                立即发送
              </button>
            </div>
          </div>

          {recommendation.alternatives && recommendation.alternatives.length > 0 && (
            <div className="rec-alts">
              <div className="rec-label">备选</div>
              {recommendation.alternatives.map((alt, i) => (
                <div key={i} className="card rec-alt">
                  <div className="rec-text">{altText(alt)}</div>
                  <div className="card-actions">
                    <button className="btn" onClick={() => onFill(altText(alt))}>
                      填入输入框
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {recommendation.rationale && (
            <div className="rec-block">
              <div className="rec-label">推荐理由</div>
              <p className="rec-block-text">{recommendation.rationale}</p>
            </div>
          )}

          {recommendation.risk_hint && (
            <div className="rec-risk">风险提示：{recommendation.risk_hint}</div>
          )}
        </div>
      )}
    </div>
  );
}
