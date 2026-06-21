import { renderSkillPreview } from "./components/skillPreview.js";
import { renderObserve } from "./components/observe.js";
import { renderGrow } from "./components/grow.js";
import { renderRehearse } from "./components/rehearse.js";
import { renderApiDocs } from "./components/apiDocs.js";
import { renderStabilize } from "./components/stabilize.js";
import { loadFileTree } from "./components/fileTree.js";

const skillSelector = document.getElementById("skill-selector");
const globalStatus = document.getElementById("global-status");
const workspace = document.getElementById("workspace");
const sidebarItems = document.querySelectorAll(".sidebar li[data-tab]");

let currentSkill = skillSelector.value;

function setStatus(text, cls = "idle") {
  globalStatus.textContent = text;
  globalStatus.className = `status ${cls}`;
}

async function switchTab(tab) {
  sidebarItems.forEach((li) => li.classList.toggle("active", li.dataset.tab === tab));
  workspace.innerHTML = "";
  setStatus("加载中…", "busy");
  try {
    switch (tab) {
      case "skill":
        await renderSkillPreview(workspace, currentSkill);
        break;
      case "observe":
        await renderObserve(workspace, currentSkill);
        break;
      case "grow":
        await renderGrow(workspace, currentSkill);
        break;
      case "rehearse":
        await renderRehearse(workspace, currentSkill);
        break;
      case "api":
        await renderApiDocs(workspace, currentSkill);
        break;
      case "stabilize":
        await renderStabilize(workspace, currentSkill);
        break;
      default:
        workspace.innerHTML = `<div class="empty-state">未知标签: ${tab}</div>`;
    }
    setStatus("就绪", "idle");
  } catch (err) {
    console.error(err);
    workspace.innerHTML = `<div class="empty-state">加载失败: ${err.message}</div>`;
    setStatus("错误", "error");
  }
}

skillSelector.addEventListener("change", () => {
  currentSkill = skillSelector.value;
  loadFileTree(currentSkill);
  const active = document.querySelector(".sidebar li.active");
  switchTab(active?.dataset.tab ?? "skill");
});

sidebarItems.forEach((li) => {
  li.addEventListener("click", () => switchTab(li.dataset.tab));
});

loadFileTree(currentSkill);
switchTab("skill");

// SSE global events
const evtSource = new EventSource("/api/events");
evtSource.addEventListener("status", (e) => {
  const data = JSON.parse(e.data);
  setStatus(data.text, data.class);
});
evtSource.onerror = () => setStatus("事件流断开", "error");
