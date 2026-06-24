import {
  createRun,
  listRuns,
  listSkills,
  startStage,
  stopStage,
  commitStage,
  retryStage,
  getStageState,
  openStage,
  recommendPrompt,
  sendPrompt,
  listArtifacts,
  getArtifact,
} from "./services/api.js";

const skillSelector = document.getElementById("skill-selector");
const btnCreateRun = document.getElementById("btn-create-run");
const currentRunLabel = document.getElementById("current-run");
const globalStatus = document.getElementById("global-status");
const stageListItems = document.querySelectorAll(".stage-navigator li[data-stage]");
const currentStageTitle = document.getElementById("current-stage-title");
const btnStartStage = document.getElementById("btn-start-stage");
const btnOpenOpencode = document.getElementById("btn-open-opencode");
const btnStopStage = document.getElementById("btn-stop-stage");
const btnCommitStage = document.getElementById("btn-commit-stage");
const btnRetryStage = document.getElementById("btn-retry-stage");
const iframeContainer = document.getElementById("opencode-iframe-container");
const opencodeIframe = document.getElementById("opencode-iframe");
const stageInfo = document.getElementById("stage-info");
const recommendationLoading = document.getElementById("recommendation-loading");
const recommendationContent = document.getElementById("recommendation-content");
const primaryPrompt = document.getElementById("primary-prompt");
const alternativePrompts = document.getElementById("alternative-prompts");
const recommendationRationale = document.getElementById("recommendation-rationale");
const recommendationRisk = document.getElementById("recommendation-risk");
const btnSendPrompt = document.getElementById("btn-send-prompt");
const artifactList = document.getElementById("artifact-list");
const artifactViewer = document.getElementById("artifact-viewer");

let currentSkill = skillSelector.value;
let currentRunId = null;
let currentStageId = null;
let currentAttempt = 1;
let currentServerId = null;
let currentSessionId = null;
let currentOpenUrl = null;
let pollInterval = null;

function setStatus(text, cls = "idle") {
  globalStatus.textContent = text;
  globalStatus.className = `status ${cls}`;
}

async function refreshRuns() {
  try {
    const runs = await listRuns();
    if (runs.length > 0 && !currentRunId) {
      selectRun(runs[runs.length - 1].run_id);
    }
  } catch (err) {
    console.error("refresh runs failed", err);
  }
}

function selectRun(runId) {
  currentRunId = runId;
  currentRunLabel.textContent = runId;
}

async function createNewRun() {
  setStatus("创建 run 中…", "busy");
  try {
    const run = await createRun(currentSkill);
    selectRun(run.run_id);
    setStatus("run 已创建", "idle");
  } catch (err) {
    setStatus(`创建失败: ${err.message}`, "error");
  }
}

function selectStage(stageId) {
  currentStageId = stageId;
  stageListItems.forEach((li) => li.classList.toggle("active", li.dataset.stage === stageId));
  currentStageTitle.textContent = stageId;
  btnStartStage.disabled = !currentRunId;
  btnOpenOpencode.disabled = true;
  btnStopStage.disabled = true;
  btnCommitStage.disabled = true;
  btnRetryStage.disabled = !currentRunId;
  iframeContainer.classList.add("hidden");
  stageInfo.classList.remove("hidden");
  currentAttempt = 1;
  currentServerId = null;
  currentOpenUrl = null;
  currentSessionId = null;
  loadRecommendation();
  loadArtifacts();
}

async function startSelectedStage() {
  if (!currentRunId || !currentStageId) return;
  setStatus(`启动 ${currentStageId}…`, "busy");
  try {
    const result = await startStage(currentRunId, currentStageId, {
      attempt: currentAttempt,
    });
    currentServerId = result.server_id;
    currentOpenUrl = result.open_url_with_auth ?? result.open_url;
    btnOpenOpencode.disabled = false;
    btnStopStage.disabled = false;
    btnCommitStage.disabled = false;
    setStatus(`${currentStageId} 运行中`, "busy");
    markStageRunning(currentStageId);
    loadRecommendation();
    startPolling();
  } catch (err) {
    setStatus(`启动失败: ${err.message}`, "error");
  }
}

function markStageRunning(stageId) {
  stageListItems.forEach((li) => {
    if (li.dataset.stage === stageId) li.classList.add("running");
  });
}

function openOpencode() {
  if (currentOpenUrl) {
    window.open(currentOpenUrl, "_blank");
  }
}

async function commitSelectedStage() {
  if (!currentRunId || !currentStageId) return;
  setStatus(`提交 ${currentStageId} 的 work/ 到 preview…`, "busy");
  try {
    const result = await commitStage(currentRunId, currentStageId, currentAttempt);
    setStatus(`已提交到 preview ${result.preview_id}`, "idle");
  } catch (err) {
    setStatus(`提交失败: ${err.message}`, "error");
  }
}

async function stopSelectedStage() {
  if (!currentRunId || !currentStageId) return;
  try {
    await stopStage(currentRunId, currentStageId, currentAttempt);
    btnStopStage.disabled = true;
    btnCommitStage.disabled = true;
    setStatus(`${currentStageId} 已停止`, "idle");
    stopPolling();
  } catch (err) {
    setStatus(`停止失败: ${err.message}`, "error");
  }
}

async function retrySelectedStage() {
  if (!currentRunId || !currentStageId) return;
  setStatus(`重跑 ${currentStageId}…`, "busy");
  try {
    const result = await retryStage(currentRunId, currentStageId);
    currentAttempt = result.attempt;
    currentServerId = result.server_id;
    currentOpenUrl = result.open_url_with_auth ?? result.open_url;
    btnOpenOpencode.disabled = false;
    btnStopStage.disabled = false;
    btnCommitStage.disabled = false;
    setStatus(`${currentStageId} attempt ${currentAttempt} 运行中`, "busy");
    loadRecommendation();
    startPolling();
  } catch (err) {
    setStatus(`重跑失败: ${err.message}`, "error");
  }
}

async function loadRecommendation() {
  if (!currentRunId || !currentStageId) {
    recommendationContent.classList.add("hidden");
    return;
  }
  recommendationLoading.classList.remove("hidden");
  recommendationContent.classList.add("hidden");
  try {
    const rec = await recommendPrompt(currentRunId, currentStageId, currentAttempt, currentServerId ?? `${currentRunId}-${currentStageId}-${currentAttempt}`);
    primaryPrompt.value = rec.primary;
    alternativePrompts.innerHTML = (rec.alternatives ?? []).map((alt) => `<li>${escapeHtml(alt)}</li>`).join("");
    recommendationRationale.textContent = rec.rationale;
    recommendationRisk.textContent = rec.risk_hint ?? "无";
    recommendationContent.classList.remove("hidden");
    btnSendPrompt.disabled = false;
  } catch (err) {
    primaryPrompt.value = `推荐失败: ${err.message}`;
  } finally {
    recommendationLoading.classList.add("hidden");
  }
}

async function sendSelectedPrompt() {
  if (!currentRunId || !currentStageId) return;
  const text = primaryPrompt.value.trim();
  if (!text) return;
  setStatus("发送 prompt 中…", "busy");
  try {
    const result = await sendPrompt(currentRunId, currentStageId, [{ type: "text", text }], currentSessionId, currentAttempt);
    currentSessionId = result.session_id;
    setStatus("prompt 已发送", "idle");
    setTimeout(loadArtifacts, 2000);
  } catch (err) {
    setStatus(`发送失败: ${err.message}`, "error");
  }
}

async function loadArtifacts() {
  if (!currentRunId || !currentStageId) {
    artifactList.innerHTML = "";
    return;
  }
  try {
    const artifacts = await listArtifacts(currentRunId, currentStageId, currentAttempt);
    artifactList.innerHTML = artifacts.map((a) => `<button data-name="${escapeHtml(a.name)}">${escapeHtml(a.name)}</button>`).join("");
    artifactList.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => showArtifact(btn.dataset.name));
    });
  } catch (err) {
    artifactList.innerHTML = `<div style="color:var(--text-muted)">${escapeHtml(err.message)}</div>`;
  }
}

async function showArtifact(name) {
  if (!currentRunId || !currentStageId) return;
  try {
    const content = await getArtifact(currentRunId, currentStageId, name, currentAttempt);
    artifactViewer.innerHTML = `<pre>${escapeHtml(content)}</pre>`;
    artifactList.querySelectorAll("button").forEach((btn) => btn.classList.toggle("active", btn.dataset.name === name));
  } catch (err) {
    artifactViewer.textContent = `读取失败: ${err.message}`;
  }
}

function startPolling() {
  stopPolling();
  pollInterval = setInterval(() => {
    loadArtifacts();
  }, 3000);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function populateSkills() {
  try {
    const skills = await listSkills();
    skillSelector.innerHTML = "";
    for (const skill of skills) {
      const opt = document.createElement("option");
      opt.value = skill;
      opt.textContent = skill;
      skillSelector.appendChild(opt);
    }
    currentSkill = skillSelector.value;
  } catch (err) {
    console.error("populate skills failed", err);
  }
}

skillSelector.addEventListener("change", () => {
  currentSkill = skillSelector.value;
});

btnCreateRun.addEventListener("click", createNewRun);
btnStartStage.addEventListener("click", startSelectedStage);
btnOpenOpencode.addEventListener("click", openOpencode);
btnStopStage.addEventListener("click", stopSelectedStage);
btnCommitStage.addEventListener("click", commitSelectedStage);
btnRetryStage.addEventListener("click", retrySelectedStage);
btnSendPrompt.addEventListener("click", sendSelectedPrompt);

stageListItems.forEach((li) => {
  li.addEventListener("click", () => selectStage(li.dataset.stage));
});

// SSE global events
const evtSource = new EventSource("/api/events");
evtSource.addEventListener("status", (e) => {
  const data = JSON.parse(e.data);
  setStatus(data.text, data.class);
});
evtSource.onerror = () => setStatus("事件流断开", "error");

populateSkills();
refreshRuns();
selectStage("observe-log-review");
