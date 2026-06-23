export async function renderStabilize(container, skillId) {
  container.innerHTML = `
    <div class="panel">
      <h2>Stabilize · 稳定沉淀</h2>
      <div style="margin-bottom:12px;">
        <label>Promote preview ID: <input id="preview-id" type="text" placeholder="留空使用最新 preview" style="background:var(--panel-2);color:var(--text);border:1px solid var(--border);padding:4px 8px;"/></label>
      </div>
      <div style="display:flex;gap:8px;">
        <button class="btn" id="stabilize-promote">Promote to Stable</button>
        <button class="btn secondary" id="stabilize-revise">Revise</button>
        <button class="btn danger" id="stabilize-discard">Discard</button>
      </div>
      <div id="stabilize-output" style="margin-top:12px;"></div>
    </div>
    <div class="panel">
      <h3>快照与回滚</h3>
      <div id="snapshot-list">加载中…</div>
      <div id="rollback-output" style="margin-top:8px;"></div>
    </div>
  `;

  const out = container.querySelector("#stabilize-output");
  container.querySelector("#stabilize-promote").addEventListener("click", async () => {
    if (!confirm("确定 promote？旧 stable 将进入 releases。")) return;
    out.innerHTML = "处理中…";
    const previewId = container.querySelector("#preview-id").value || undefined;
    const res = await fetch(`/api/skills/${skillId}/stabilize/promote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ previewId }),
    });
    const data = await res.json();
    out.innerHTML = `<pre><code>${JSON.stringify(data, null, 2)}</code></pre>`;
    loadSnapshots();
  });

  container.querySelector("#stabilize-revise").addEventListener("click", () => {
    out.innerHTML = "Revise 流程：请回到 Grow 标签重新 dry-run。";
  });
  container.querySelector("#stabilize-discard").addEventListener("click", () => {
    out.innerHTML = "Discard 流程：preview 将被归档。";
  });

  async function loadSnapshots() {
    const list = container.querySelector("#snapshot-list");
    const res = await fetch(`/api/skills/${skillId}/snapshots`);
    if (!res.ok) {
      list.innerHTML = `加载失败: ${res.statusText}`;
      return;
    }
    const snaps = await res.json();
    if (!snaps.length) {
      list.innerHTML = "无快照";
      return;
    }
    list.innerHTML = snaps
      .map(
        (s) => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);">
        <span>${s.filename}</span>
        <button class="btn secondary" data-snapshot="${s.snapshot_id}">回滚</button>
      </div>
    `,
      )
      .join("");
    list.querySelectorAll("[data-snapshot]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm(`确定回滚到 ${btn.dataset.snapshot}？当前 skill 目录将被替换。`)) return;
        const rbOut = container.querySelector("#rollback-output");
        rbOut.innerHTML = "回滚中…";
        const rbRes = await fetch(`/api/skills/${skillId}/rollback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ snapshotId: btn.dataset.snapshot }),
        });
        rbOut.innerHTML = `<pre><code>${JSON.stringify(await rbRes.json(), null, 2)}</code></pre>`;
      });
    });
  }

  await loadSnapshots();
}
