import { useState, useEffect } from "react";
import { listArtifacts, getArtifact } from "../services/api";
export function ArtifactPanel({ runId, stageId, attempt }) {
    const [artifacts, setArtifacts] = useState([]);
    const [selected, setSelected] = useState(null);
    const [content, setContent] = useState("");
    useEffect(() => {
        if (!runId || !stageId) {
            setArtifacts([]);
            setContent("");
            return;
        }
        listArtifacts(runId, stageId, attempt)
            .then(setArtifacts)
            .catch(() => setArtifacts([]));
    }, [runId, stageId, attempt]);
    const handleSelect = async (name) => {
        if (!runId || !stageId)
            return;
        setSelected(name);
        try {
            const text = await getArtifact(runId, stageId, name, attempt);
            setContent(text);
        }
        catch (err) {
            setContent(`读取失败: ${err instanceof Error ? err.message : String(err)}`);
        }
    };
    return (<section className="artifact-panel">
      <h3>Artifacts</h3>
      <div className="artifact-list">
        {artifacts.map((a) => (<button key={a.name} className={selected === a.name ? "active" : ""} onClick={() => handleSelect(a.name)}>
            {a.name}
          </button>))}
      </div>
      <pre className="artifact-viewer">{content}</pre>
    </section>);
}
//# sourceMappingURL=ArtifactPanel.js.map