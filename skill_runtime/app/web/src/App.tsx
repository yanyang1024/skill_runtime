import { useEffect, useState } from "react";
import { StageNavigator } from "./components/StageNavigator";
import { ChatPage } from "./pages/ChatPage";
import { PromptAssistant } from "./components/PromptAssistant";
import { ArtifactPanel } from "./components/ArtifactPanel";
import { createRun, listRuns, listSkills, startStage, stopStage, retryStage } from "./services/api";

export default function App() {
  const [skills, setSkills] = useState<string[]>([]);
  const [skillsError, setSkillsError] = useState<string | null>(null);
  const [currentSkill, setCurrentSkill] = useState<string>("");
  const [runs, setRuns] = useState<Array<{ run_id: string; skill_id: string }>>([]);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [currentStageId, setCurrentStageId] = useState<string | null>(null);
  const [currentAttempt, setCurrentAttempt] = useState(1);
  const [runningStages, setRunningStages] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState("请选择 Skill 并创建 Run");
  const [statusClass, setStatusClass] = useState("status-idle");
  const [serverId, setServerId] = useState<string | null>(null);
  const [pendingSendText, setPendingSendText] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    listSkills()
      .then(setSkills)
      .catch((err) => {
        setSkillsError(err instanceof Error ? err.message : String(err));
        setSkills([]);
      });
    listRuns()
      .then(setRuns)
      .catch((err) => {
        setRunsError(err instanceof Error ? err.message : String(err));
        setRuns([]);
      });
  }, []);

  const updateStatus = (text: string, cls = "status-idle") => {
    setStatus(text);
    setStatusClass(cls);
  };

  const handleSkillChange = (skill: string) => {
    setCurrentSkill(skill);
    setCurrentRunId(null);
    setCurrentStageId(null);
    setCurrentAttempt(1);
    setServerId(null);
    setRunningStages(new Set());
    setPendingSendText(null);
    updateStatus("请创建 Run", "status-idle");
  };

  const handleCreateRun = async () => {
    if (!currentSkill || isLoading) return;
    setIsLoading(true);
    updateStatus("创建 run 中…", "status-loading");
    try {
      const run = await createRun(currentSkill);
      setRuns((prev) => [...prev, { run_id: run.run_id, skill_id: currentSkill }]);
      setCurrentRunId(run.run_id);
      updateStatus("run 已创建 — 请选择阶段并启动", "status-success");
    } catch (err) {
      updateStatus(`创建失败: ${err instanceof Error ? err.message : String(err)}`, "status-error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartStage = async () => {
    if (!currentRunId || !currentStageId || isLoading) return;
    setIsLoading(true);
    updateStatus(`启动 ${currentStageId}…`, "status-loading");
    try {
      const result = await startStage(currentRunId, currentStageId, currentAttempt);
      setServerId(result.server_id);
      setRunningStages((prev) => new Set(prev).add(currentStageId));
      updateStatus(`${currentStageId} 运行中`, "status-success");
    } catch (err) {
      updateStatus(`启动失败: ${err instanceof Error ? err.message : String(err)}`, "status-error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleStopStage = async () => {
    if (!currentRunId || !currentStageId || isLoading) return;
    setIsLoading(true);
    updateStatus(`停止 ${currentStageId}…`, "status-loading");
    try {
      await stopStage(currentRunId, currentStageId, currentAttempt);
      setRunningStages((prev) => {
        const next = new Set(prev);
        next.delete(currentStageId);
        return next;
      });
      updateStatus(`${currentStageId} 已停止`, "status-success");
    } catch (err) {
      updateStatus(`停止失败: ${err instanceof Error ? err.message : String(err)}`, "status-error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRetryStage = async () => {
    if (!currentRunId || !currentStageId || isLoading) return;
    setIsLoading(true);
    updateStatus(`重跑 ${currentStageId}…`, "status-loading");
    try {
      const result = await retryStage(currentRunId, currentStageId);
      setCurrentAttempt(result.attempt);
      setServerId(result.server_id);
      setRunningStages((prev) => new Set(prev).add(currentStageId));
      updateStatus(`${currentStageId} attempt ${result.attempt} 运行中`, "status-success");
    } catch (err) {
      updateStatus(`重跑失败: ${err instanceof Error ? err.message : String(err)}`, "status-error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectStage = (stage: string) => {
    setCurrentStageId(stage);
    setCurrentAttempt(1);
    setServerId(null);
  };

  const currentRun = runs.find((r) => r.run_id === currentRunId);
  const isStageRunning = currentStageId ? runningStages.has(currentStageId) : false;

  return (
    <div className="app">
      <header className="top-bar">
        <div className="brand">
          Skill Growth Studio <span className="version">v0.3</span>
        </div>
        <div className="controls">
          <select value={currentSkill} onChange={(e) => handleSkillChange(e.target.value)}>
            <option value="" disabled>-- 选择 Skill --</option>
            {skills.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <button onClick={handleCreateRun} disabled={!currentSkill || isLoading}>创建 Run</button>
          <span className="run-label">{currentRun ? currentRun.run_id : "未选择 run"}</span>
        </div>
        <div className={`status ${statusClass}`}>{status}</div>
      </header>

      {skillsError && <div className="app-error-banner">⚠ 加载 Skill 列表失败: {skillsError}</div>}
      {runsError && <div className="app-error-banner">⚠ 加载 Run 列表失败: {runsError}</div>}

      <main className="director-console">
        <StageNavigator currentStage={currentStageId} onSelect={handleSelectStage} runningStages={runningStages} />

        <section className="main-panel">
          <div className="runtime-header">
            <h2>{currentStageId ?? "请选择阶段"}</h2>
            <div className="runtime-actions">
              {!isStageRunning ? (
                <button onClick={handleStartStage} disabled={!currentRunId || !currentStageId || isLoading}>
                  {isLoading ? "启动中…" : "启动 Stage"}
                </button>
              ) : (
                <button onClick={handleStopStage} disabled={!currentRunId || !currentStageId || isLoading}>
                  {isLoading ? "停止中…" : "停止 Stage"}
                </button>
              )}
              <button onClick={handleRetryStage} disabled={!currentRunId || !currentStageId || isLoading}>
                重跑 Stage
              </button>
            </div>
          </div>
          <ChatPage
            key={currentRunId && currentStageId ? `${currentRunId}-${currentStageId}-${currentAttempt}` : "empty"}
            runId={currentRunId}
            stageId={currentStageId}
            attempt={currentAttempt}
            pendingSendText={pendingSendText}
            onPendingSendConsumed={() => setPendingSendText(null)}
          />
        </section>

        <PromptAssistant
          runId={currentRunId}
          stageId={currentStageId}
          attempt={currentAttempt}
          serverId={serverId}
          onSend={(text) => setPendingSendText(text)}
        />
      </main>

      <ArtifactPanel runId={currentRunId} stageId={currentStageId} attempt={currentAttempt} />
    </div>
  );
}
