const treeEl = document.getElementById("file-tree");

export async function loadFileTree(skillId) {
  if (!treeEl) return;
  treeEl.innerHTML = "加载中…";
  try {
    const res = await fetch(`/api/skills/${skillId}/tree`);
    if (!res.ok) throw new Error(res.statusText);
    const nodes = await res.json();
    treeEl.innerHTML = "";
    renderNodes(treeEl, nodes, 0);
  } catch (err) {
    treeEl.textContent = `加载失败: ${err.message}`;
  }
}

function renderNodes(container, nodes, depth) {
  for (const node of nodes) {
    const div = document.createElement("div");
    div.className = `entry ${node.type}${depth > 0 ? " indent" : ""}`;
    div.textContent = node.name;
    div.dataset.path = node.path;
    div.dataset.type = node.type;
    div.addEventListener("click", () => {
      if (node.type === "file") {
        window.dispatchEvent(new CustomEvent("open-skill-file", { detail: node }));
      }
    });
    container.appendChild(div);
    if (node.children) {
      renderNodes(container, node.children, depth + 1);
    }
  }
}
