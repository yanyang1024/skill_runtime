export async function renderApiDocs(container, skillId) {
  container.innerHTML = `
    <div class="panel">
      <h2>API Docs · 端点生命周期</h2>
      <div style="display:flex;gap:8px;margin-bottom:12px;">
        <button class="btn" id="api-scan">扫描 API 文档</button>
      </div>
      <div id="api-output"></div>
    </div>
  `;

  const out = container.querySelector("#api-output");

  async function loadEndpoints() {
    out.innerHTML = "加载中…";
    const res = await fetch(`/api/skills/${skillId}/endpoints`);
    if (!res.ok) {
      out.innerHTML = `读取失败: ${res.statusText}`;
      return;
    }
    const manifest = await res.json();
    if (!manifest.endpoints?.length) {
      out.innerHTML = "<p class=\"empty-state\">暂无 endpoint，请先点击扫描。</p>";
      return;
    }
    out.innerHTML = manifest.endpoints
      .map(
        (ep) => `
      <div class="panel" style="margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <strong>${ep.method} ${ep.path}</strong>
          <span class="status ${ep.status}">${ep.status}</span>
        </div>
        <p>${ep.description}</p>
        <div style="font-size:12px;color:var(--text-dim);">
          必需参数: ${ep.required_params.join(", ") || "无"} |
          skill_usage: ${ep.skill_usage.allowed ? "允许" : ep.skill_usage.reason}
        </div>
        <button class="btn secondary" data-endpoint="${ep.id}" style="margin-top:8px;">运行基础测试</button>
        <div class="test-result" id="test-${ep.id}"></div>
      </div>
    `,
      )
      .join("");

    out.querySelectorAll("[data-endpoint]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.endpoint;
        const resultEl = out.querySelector(`#test-${id}`);
        resultEl.innerHTML = "测试中…";
        const res = await fetch(`/api/skills/${skillId}/api-test/${id}`, { method: "POST" });
        const data = await res.json();
        resultEl.innerHTML = `<pre><code>${JSON.stringify(data, null, 2)}</code></pre>`;
      });
    });
  }

  container.querySelector("#api-scan").addEventListener("click", async () => {
    out.innerHTML = "扫描中…";
    const res = await fetch(`/api/skills/${skillId}/api-scan`, { method: "POST" });
    if (!res.ok) {
      out.innerHTML = `扫描失败: ${res.statusText}`;
      return;
    }
    await loadEndpoints();
  });

  await loadEndpoints();
}
