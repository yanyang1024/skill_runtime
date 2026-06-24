import { useState, useEffect } from "react";
import { recommendPrompt } from "../services/api";
export function PromptAssistant({ runId, stageId, attempt, serverId, onSend }) {
    const [loading, setLoading] = useState(false);
    const [primary, setPrimary] = useState("");
    const [alternatives, setAlternatives] = useState([]);
    const [rationale, setRationale] = useState("");
    const [risk, setRisk] = useState("");
    const [error, setError] = useState("");
    useEffect(() => {
        if (!runId || !stageId) {
            setPrimary("");
            setAlternatives([]);
            setRationale("");
            setRisk("");
            return;
        }
        setLoading(true);
        setError("");
        recommendPrompt(runId, stageId, attempt, serverId ?? `${runId}-${stageId}-${attempt}`)
            .then((rec) => {
            setPrimary(rec.primary);
            setAlternatives(rec.alternatives ?? []);
            setRationale(rec.rationale);
            setRisk(rec.risk_hint ?? "无");
        })
            .catch((err) => setError(err.message))
            .finally(() => setLoading(false));
    }, [runId, stageId, attempt, serverId]);
    return (<aside className="prompt-assistant">
      <h3>Prompt Assistant</h3>
      {loading && <div>推荐中…</div>}
      {error && <div className="assistant-error">{error}</div>}
      {!loading && !error && (<>
          <div className="assistant-section">
            <label>主推荐</label>
            <textarea rows={6} value={primary} onChange={(e) => setPrimary(e.target.value)}/>
          </div>
          <div className="assistant-section">
            <label>备选</label>
            <ul>
              {alternatives.map((alt, i) => (<li key={i}>{alt}</li>))}
            </ul>
          </div>
          <div className="assistant-section">
            <label>推荐理由</label>
            <p>{rationale}</p>
          </div>
          <div className="assistant-section">
            <label>风险提示</label>
            <p>{risk}</p>
          </div>
          <button className="send-button" onClick={() => onSend(primary)} disabled={!primary.trim()}>
            发送到 ChatPage
          </button>
        </>)}
    </aside>);
}
//# sourceMappingURL=PromptAssistant.js.map