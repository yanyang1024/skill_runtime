import { useState, useEffect, useRef, useCallback } from "react";
import { listArtifacts, getArtifact } from "../services/api";

interface ArtifactChangedEvent {
  type: "artifact_changed";
  run_id: string;
  stage_id: string;
  attempt: number;
  name?: string;
}

interface ArtifactPanelProps {
  runId: string | null;
  stageId: string | null;
  attempt: number;
}

export function ArtifactPanel({ runId, stageId, attempt }: ArtifactPanelProps) {
  const [artifacts, setArtifacts] = useState<Array<{ name: string }>>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState<string>("");
  const eventSourceRef = useRef<EventSource | null>(null);
  const selectedRef = useRef<string | null>(null);
  const mountedRef = useRef(true);

  // 保持 ref 与 state 同步，避免 EventSource 回调依赖 selected state
  selectedRef.current = selected;

  const refresh = useCallback(async () => {
    if (!runId || !stageId) {
      setArtifacts([]);
      setContent("");
      return;
    }
    try {
      const list = await listArtifacts(runId, stageId, attempt);
      if (mountedRef.current) setArtifacts(list);
    } catch {
      if (mountedRef.current) setArtifacts([]);
    }
  }, [runId, stageId, attempt]);

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    return () => {
      mountedRef.current = false;
    };
  }, [refresh]);

  useEffect(() => {
    if (!runId || !stageId) return;

    const es = new EventSource("/api/events");
    eventSourceRef.current = es;

    es.addEventListener("artifact_changed", (e) => {
      let event: ArtifactChangedEvent | null = null;
      try {
        event = JSON.parse((e as MessageEvent).data) as ArtifactChangedEvent;
      } catch {
        return;
      }
      if (
        event &&
        event.run_id === runId &&
        event.stage_id === stageId &&
        event.attempt === attempt
      ) {
        void refresh();
        // 如果当前正在查看的 artifact 被更新了，自动重载内容
        if (event.name && selectedRef.current === event.name) {
          void handleSelect(event.name);
        }
      }
    });

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [runId, stageId, attempt, refresh]);

  const handleSelect = useCallback(async (name: string) => {
    if (!runId || !stageId) return;
    setSelected(name);
    try {
      const text = await getArtifact(runId, stageId, name, attempt);
      if (mountedRef.current) setContent(text);
    } catch (err) {
      if (mountedRef.current) setContent(`读取失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, [runId, stageId, attempt]);

  return (
    <section className="artifact-panel">
      <h3>Artifacts</h3>
      <div className="artifact-list">
        {artifacts.map((a) => (
          <button
            key={a.name}
            className={selected === a.name ? "active" : ""}
            onClick={() => handleSelect(a.name)}
          >
            {a.name}
          </button>
        ))}
      </div>
      <pre className="artifact-viewer">{content}</pre>
    </section>
  );
}
