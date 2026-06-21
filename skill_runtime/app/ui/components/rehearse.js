const TAGS = [
  { key: "better", label: "更自然" },
  { key: "too_verbose", label: "太啰嗦" },
  { key: "ask_too_much", label: "问太多" },
  { key: "ask_too_little", label: "问太少" },
  { key: "flow_ok", label: "流程对" },
  { key: "tool_wrong", label: "工具用错" },
  { key: "too_generic", label: "结果太泛" },
  { key: "ready", label: "可以稳定化" },
  { key: "needs_minor", label: "需要小改" },
  { key: "discard", label: "丢弃" },
];

export async function renderRehearse(container, skillId) {
  container.innerHTML = `
    <div class="panel">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <h2>Rehearse · 多会话排练</h2>
        <div>
          <button class="btn secondary" data-cols="1">1列</button>
          <button class="btn secondary" data-cols="2">2列</button>
          <button class="btn" id="add-session">+ 启动会话</button>
        </div>
      </div>
      <div id="session-grid" class="session-grid cols-1"></div>
    </div>
  `;

  const grid = container.querySelector("#session-grid");

  container.querySelectorAll("[data-cols]").forEach((btn) => {
    btn.addEventListener("click", () => {
      grid.className = `session-grid cols-${btn.dataset.cols}`;
    });
  });

  container.querySelector("#add-session").addEventListener("click", async () => {
    const label = prompt("会话角色标签（如 Stable / Preview-A）：", "Preview");
    if (!label) return;
    const version = prompt("加载的 skill 版本（stable 或 preview ID）：", "stable");
    if (!version) return;
    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skillId, label, version }),
    });
    if (!res.ok) {
      grid.insertAdjacentHTML("beforeend", `<div class="empty-state">启动失败: ${res.statusText}</div>`);
      return;
    }
    const session = await res.json();
    addSessionPanel(grid, session);
  });

  const listRes = await fetch("/api/sessions");
  if (listRes.ok) {
    const sessions = await listRes.json();
    for (const s of sessions) addSessionPanel(grid, s);
  }
}

function addSessionPanel(grid, session) {
  const panel = document.createElement("div");
  panel.className = "session-panel";
  panel.dataset.sessionId = session.id;
  const src = session.proxyUrl || session.url;
  panel.innerHTML = `
    <div class="session-header">
      <span class="dot idle"></span>
      <span>${session.label}</span>
      <span style="color:var(--text-dim);font-size:12px;">${session.version}</span>
      <div class="session-actions">
        <button class="btn secondary" data-action="refresh">刷新</button>
        <button class="btn secondary" data-action="close">关闭</button>
      </div>
    </div>
    <iframe class="session-frame" src="${src}"></iframe>
    <div class="feedback" style="padding:8px;border-top:1px solid var(--border);">
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;">
        ${TAGS.map((t) => `<button class="tag-btn" data-tag="${t.key}">${t.label}</button>`).join("")}
      </div>
      <textarea class="note-text" placeholder="导演备注…" rows="2" style="width:100%;background:var(--panel-2);color:var(--text);border:1px solid var(--border);border-radius:4px;"></textarea>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">
        <select class="decision-hint" style="background:var(--panel-2);color:var(--text);border:1px solid var(--border);">
          <option value="">决策倾向</option>
          <option value="promote">可以稳定化</option>
          <option value="revise_minor">需要小改</option>
          <option value="revise_major">需要大改</option>
          <option value="discard">丢弃</option>
        </select>
        <button class="btn" data-action="save-notes">保存反馈</button>
      </div>
      <div class="notes-result" style="font-size:12px;color:var(--text-dim);margin-top:4px;"></div>
    </div>
  `;

  const selectedTags = new Set();
  panel.querySelectorAll(".tag-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      btn.classList.toggle("active");
      if (selectedTags.has(btn.dataset.tag)) selectedTags.delete(btn.dataset.tag);
      else selectedTags.add(btn.dataset.tag);
    });
  });

  panel.querySelector('[data-action="refresh"]').addEventListener("click", () => {
    panel.querySelector("iframe").src = src;
  });
  panel.querySelector('[data-action="close"]').addEventListener("click", async () => {
    await fetch(`/api/sessions/${session.id}`, { method: "DELETE" });
    panel.remove();
  });
  panel.querySelector('[data-action="save-notes"]').addEventListener("click", async () => {
    const noteText = panel.querySelector(".note-text").value;
    const decisionHint = panel.querySelector(".decision-hint").value;
    const feedback = Array.from(selectedTags).map((tag) => ({
      dimension: "director",
      label: tag,
      note: TAGS.find((t) => t.key === tag)?.label ?? tag,
    }));
    if (noteText.trim()) {
      feedback.push({ dimension: "free_text", label: "note", note: noteText.trim() });
    }
    const res = await fetch(`/api/sessions/${session.id}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback, decisionHint }),
    });
    const data = await res.json();
    panel.querySelector(".notes-result").textContent = res.ok ? "反馈已保存" : `保存失败: ${data.error}`;
  });

  grid.appendChild(panel);
}
