import { useEffect, useState } from "react";
import { StageNavigator } from "./components/StageNavigator";
import { ChatPage } from "./pages/ChatPage";
import { PromptAssistant } from "./components/PromptAssistant";
import { ArtifactPanel } from "./components/ArtifactPanel";
import { createRun, listRuns, listSkills, startStage, stopStage, retryStage } from "./services/api";
export default function App() {
    const [skills, setSkills] = useState([]);
    const [currentSkill, setCurrentSkill] = useState("");
    const [runs, setRuns] = useState([]);
    const [currentRunId, setCurrentRunId] = useState(null);
    const [currentStageId, setCurrentStageId] = useState("observe-log-review");
    const [currentAttempt, setCurrentAttempt] = useState(1);
    const [runningStages, setRunningStages] = useState(new Set());
    const [status, setStatus] = useState("就绪");
    const [serverId, setServerId] = useState(null);
    const [pendingSendText, setPendingSendText] = useState(null);
    useEffect(() => {
        listSkills().then((s) => {
            setSkills(s);
            if (s.length > 0 && !currentSkill)
                setCurrentSkill(s[0]);
        });
        listRuns().then((r) => {
            setRuns(r);
            if (r.length > 0 && !currentRunId)
                setCurrentRunId(r[r.length - 1].run_id);
        });
    }, [currentSkill, currentRunId]);
    const handleCreateRun = async () => {
        if (!currentSkill)
            return;
        setStatus("创建 run 中…");
        try {
            const run = await createRun(currentSkill);
            setRuns((prev) => [...prev, { run_id: run.run_id, skill_id: currentSkill }]);
            setCurrentRunId(run.run_id);
            setStatus("run 已创建");
        }
        catch (err) {
            setStatus(`创建失败: ${err instanceof Error ? err.message : String(err)}`);
        }
    };
    const handleStartStage = async () => {
        if (!currentRunId || !currentStageId)
            return;
        setStatus(`启动 ${currentStageId}…`);
        try {
            const result = await startStage(currentRunId, currentStageId, currentAttempt);
            setServerId(result.server_id);
            setRunningStages((prev) => new Set(prev).add(currentStageId));
            setStatus(`${currentStageId} 运行中`);
        }
        catch (err) {
            setStatus(`启动失败: ${err instanceof Error ? err.message : String(err)}`);
        }
    };
    const handleStopStage = async () => {
        if (!currentRunId || !currentStageId)
            return;
        setStatus(`停止 ${currentStageId}…`);
        try {
            await stopStage(currentRunId, currentStageId, currentAttempt);
            setRunningStages((prev) => {
                const next = new Set(prev);
                next.delete(currentStageId);
                return next;
            });
            setStatus(`${currentStageId} 已停止`);
        }
        catch (err) {
            setStatus(`停止失败: ${err instanceof Error ? err.message : String(err)}`);
        }
    };
    const handleRetryStage = async () => {
        if (!currentRunId || !currentStageId)
            return;
        setStatus(`重跑 ${currentStageId}…`);
        try {
            const result = await retryStage(currentRunId, currentStageId);
            setCurrentAttempt(result.attempt);
            setServerId(result.server_id);
            setRunningStages((prev) => new Set(prev).add(currentStageId));
            setStatus(`${currentStageId} attempt ${result.attempt} 运行中`);
        }
        catch (err) {
            setStatus(`重跑失败: ${err instanceof Error ? err.message : String(err)}`);
        }
    };
    const handleSelectStage = (stage) => {
        setCurrentStageId(stage);
        setCurrentAttempt(1);
        setServerId(null);
    };
    const currentRun = runs.find((r) => r.run_id === currentRunId);
    return (<div className="app">
      <header className="top-bar">
        <div className="brand">
          Skill Growth Studio <span className="version">v0.3</span>
        </div>
        <div className="controls">
          <select value={currentSkill} onChange={(e) => setCurrentSkill(e.target.value)}>
            {skills.map((s) => (<option key={s} value={s}>
                {s}
              </option>))}
          </select>
          <button onClick={handleCreateRun}>创建 Run</button>
          <span className="run-label">{currentRun ? currentRun.run_id : "未选择 run"}</span>
        </div>
        <div className="status">{status}</div>
      </header>

      <main className="director-console">
        <StageNavigator currentStage={currentStageId} onSelect={handleSelectStage} runningStages={runningStages}/>

        <section className="main-panel">
          <div className="runtime-header">
            <h2>{currentStageId ?? "请选择阶段"}</h2>
            <div className="runtime-actions">
              <button onClick={handleStartStage} disabled={!currentRunId || !currentStageId}>
                启动 Stage
              </button>
              <button onClick={handleStopStage} disabled={!currentRunId || !currentStageId}>
                停止 Stage
              </button>
              <button onClick={handleRetryStage} disabled={!currentRunId || !currentStageId}>
                重跑 Stage
              </button>
            </div>
          </div>
          <ChatPage runId={currentRunId} stageId={currentStageId} attempt={currentAttempt} pendingSendText={pendingSendText} onPendingSendConsumed={() => setPendingSendText(null)}/>
        </section>

        <PromptAssistant runId={currentRunId} stageId={currentStageId} attempt={currentAttempt} serverId={serverId} onSend={(text) => setPendingSendText(text)}/>
      </main>

      <ArtifactPanel runId={currentRunId} stageId={currentStageId} attempt={currentAttempt}/>
    </div>);
}
//# sourceMappingURL=App.js.map