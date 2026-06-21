import { marked } from "/marked/marked.min.js";

export async function renderSkillPreview(container, skillId) {
  container.innerHTML = `
    <div class="panel">
      <div class="tabs">
        <div class="tab active" data-preview="rendered">渲染</div>
        <div class="tab" data-preview="raw">源码</div>
        <div class="tab" data-preview="diff">Diff</div>
      </div>
      <div id="skill-preview-content">
        <div class="empty-state">点击左侧文件预览内容</div>
      </div>
    </div>
  `;

  const contentEl = container.querySelector("#skill-preview-content");
  const tabs = container.querySelectorAll(".tab");
  let currentFile = null;
  let currentMode = "rendered";

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      currentMode = tab.dataset.preview;
      if (currentFile) refresh(currentFile);
    });
  });

  async function refresh(fileNode) {
    currentFile = fileNode;
    const res = await fetch(`/api/skills/${skillId}/file/${encodeURIComponent(fileNode.path)}`);
    if (!res.ok) {
      contentEl.innerHTML = `<div class="empty-state">读取失败: ${res.statusText}</div>`;
      return;
    }
    const { content, ext } = await res.json();
    if (currentMode === "raw" || ext !== "md") {
      contentEl.innerHTML = `<pre><code>${escapeHtml(content)}</code></pre>`;
    } else if (currentMode === "rendered") {
      contentEl.innerHTML = `<div class="markdown-body">${marked.parse(content)}</div>`;
    } else if (currentMode === "diff") {
      contentEl.innerHTML = `<div class="empty-state">Diff 视图开发中，请选择 preview 版本后对比。</div>`;
    }
  }

  window.addEventListener("open-skill-file", (e) => {
    refresh(e.detail);
  });

  // 默认打开 SKILL.md
  const res = await fetch(`/api/skills/${skillId}/tree`);
  if (res.ok) {
    const nodes = await res.json();
    const skillMd = findSkillMd(nodes);
    if (skillMd) refresh(skillMd);
  }
}

function findSkillMd(nodes) {
  for (const node of nodes) {
    if (node.type === "file" && node.name === "SKILL.md") return node;
    if (node.children) {
      const found = findSkillMd(node.children);
      if (found) return found;
    }
  }
  return null;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
