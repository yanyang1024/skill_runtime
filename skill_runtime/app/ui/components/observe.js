export async function renderObserve(container, skillId) {
  container.innerHTML = `
    <div class="panel">
      <h2>Observe · Background Review</h2>
      <p class="empty-state">选择 session log 或 eval prompt，生成 Runtime Replay Card。</p>
      <button class="btn" id="observe-run">从 evals.json 生成模拟 Trace</button>
      <div id="observe-output" style="margin-top:12px;"></div>
    </div>
  `;

  container.querySelector("#observe-run").addEventListener("click", async () => {
    const out = container.querySelector("#observe-output");
    out.innerHTML = "运行中…";
    const res = await fetch(`/api/skills/${skillId}/observe`, { method: "POST" });
    if (!res.ok) {
      out.innerHTML = `失败: ${res.statusText}`;
      return;
    }
    const data = await res.json();
    out.innerHTML = `<pre><code>${JSON.stringify(data, null, 2)}</code></pre>`;
  });
}
