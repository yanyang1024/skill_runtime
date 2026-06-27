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
  const [artifactError, setArtifactError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState<string>("");
  const eventSourceRef = useRef<EventSource | null>(null);
  const selectedRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const retryCountRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  selectedRef.current = selected;

  const refresh = useCallback(async () => {
    if (!runId || !stageId) {
      setArtifacts([]);
      setArtifactError("");
      setContent("");
      return;
    }
    try {
      const list = await listArtifacts(runId, stageId, attempt);
      if (mountedRef.current) {
        setArtifacts(list);
        setArtifactError("");
      }
    } catch (err) {
      if (mountedRef.current) {
        setArtifacts([]);
        setArtifactError(err instanceof Error ? err.message : String(err));
      }
    }
  }, [runId, stageId, attempt]);

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

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    return () => {
      mountedRef.current = false;
    };
  }, [refresh]);

  useEffect(() => {
    if (!runId || !stageId) return;

    mountedRef.current = true;
    retryCountRef.current = 0;

    function connectSSE() {
      if (!mountedRef.current) return;
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
          if (event.name && selectedRef.current === event.name) {
            void handleSelect(event.name);
          }
        }
      });

      es.onerror = () => {
        if (!mountedRef.current) return;
        es.close();
        eventSourceRef.current = null;
        retryCountRef.current++;
        if (retryCountRef.current <= 5) {
          const delay = Math.min(1000 * Math.pow(2, retryCountRef.current - 1), 10000);
          if (reconnectTimerRef.current !== null) clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = setTimeout(() => {
            if (mountedRef.current) connectSSE();
          }, delay);
        }
      };
    }

    connectSSE();

    return () => {
      if (reconnectTimerRef.current !== null) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, [runId, stageId, attempt, refresh, handleSelect]);

  const handleDownload = (name: string) => {
    if (!runId || !stageId) return;
    const url = `/api/runs/${runId}/stage/${stageId}/artifact/${encodeURIComponent(name)}?attempt=${attempt}&download=1`;
    window.open(url, "_blank");
  };

  return (
    <section className="artifact-panel">
      <h3>Artifacts</h3>
      {artifactError && <div className="artifact-error">{artifactError}</div>}
      <div className="artifact-list">
        {artifacts.map((a) => (
          <div key={a.name} className="artifact-item">
            <button
              className={selected === a.name ? "active" : ""}
              onClick={() => handleSelect(a.name)}
            >
              {a.name}
            </button>
            <button className="artifact-download" onClick={() => handleDownload(a.name)} title="下载">
              ⬇
            </button>
          </div>
        ))}
      </div>
      {artifacts.length === 0 && !artifactError && (
        <div className="artifact-empty">暂无产物</div>
      )}
      <pre className="artifact-viewer">{content}</pre>
    </section>
  );
}
