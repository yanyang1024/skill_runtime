export async function renderGrow(container, skillId) {
  container.innerHTML = `
    <div class="panel">
      <h2>Grow · Curator</h2>
      <p class="empty-state">先运行 Observe 生成 trace，再执行 dry-run。</p>
      <div style="display:flex;gap:8px;">
        <button class="btn" id="grow-dry-run">Dry-run</button>
        <button class="btn danger" id="grow-live" disabled>一键确认 Live Run</button>
      </div>
      <div id="grow-output" style="margin-top:12px;"></div>
    </div>
  `;

  const out = container.querySelector("#grow-output");
  container.querySelector("#grow-dry-run").addEventListener("click", async () => {
    out.innerHTML = "生成中…";
    const res = await fetch(`/api/skills/${skillId}/grow/dry-run`, { method: "POST" });
    if (!res.ok) {
      out.innerHTML = `失败: ${res.statusText}`;
      return;
    }
    const data = await res.json();
    out.innerHTML = `<pre><code>${JSON.stringify(data, null, 2)}</code></pre>`;
    container.querySelector("#grow-live").disabled = false;
  });

  container.querySelector("#grow-live").addEventListener("click", async () => {
    if (!confirm("确定执行 live run？系统将先创建快照。")) return;
    out.innerHTML = "执行中…";
    const res = await fetch(`/api/skills/${skillId}/grow/live`, { method: "POST" });
    const data = await res.json();
    out.innerHTML = `<pre><code>${JSON.stringify(data, null, 2)}</code></pre>`;
  });
}
