# Interactive Widget 渲染契约

以 dsl/SPEC.md 第 3 节为准。本文件给出完整契约与 postMessage 桥参考实现。

## 场景 JSON 形

```json
{
  "type": "interactive",
  "widgetType": "simulation",
  "description": "交互目的",
  "html": "<!DOCTYPE html>……完整自包含 HTML……"
}
```

`widgetType` 五选一：`tutorial` / `simulation` / `diagram` / `code` / `game`。

## 逻辑视口与宿主缩放

- 页面针对 **1280×720** 逻辑视口创作。
- 宿主把 iframe 固定为 1280×720，再用 CSS `transform: scale()`（`transform-origin: top left`）等比缩放到可用区域并居中。
- 因此：**不要写依赖窗口实际尺寸的布局**；按固定 1280×720 设计即可，缩放由宿主负责。

## sandbox 边界

宿主渲染参数：`sandbox="allow-scripts allow-forms allow-popups"`，**没有 `allow-same-origin`**，页面处于 null origin。

- localStorage / cookie **不可用**（访问即抛错）——状态全部保存在内存变量。
- 不得发起网络请求（离线环境也没有网络可用）。
- 宿主与 iframe 之间**唯一的通信通道是 postMessage**（宿主发送时 `targetOrigin='*'`，null origin 下正常工作）。

## widget-config 内嵌格式（可选）

```html
<script type="application/json" id="widget-config">
{"type": "simulation", "variables": ["maxAge"], "presets": ["no-cache"]}
</script>
```

- 必须是合法 JSON（解析失败计校验 ERROR）。
- simulation 常见字段：`concept`、`variables`、`presets`；code：`language`、`starterCode`、`testCases`、`hints`；game：`gameType`、`successCondition` 等。按 widget 类型自取所需。

## 元素命名约定

关键控件用可预测的 id/class，供导览动作（spotlight/annotate）用 CSS 选择器定位：

| 元素 | 约定 | 示例 |
|---|---|---|
| 滑块 | `{变量名}-slider` | `maxage-slider`、`angle-slider` |
| 按钮 | `{动作}-btn` | `start-btn`、`reset-btn`、`run-btn` |
| 数值显示 | `{变量名}-display` | `speed-display` |
| 步骤容器 | `[data-step-id="step-N"]` | `data-step-id="step-2"` |
| 进度显示 | `#progress-display` | |
| diagram 节点 | `node-{节点id}` | `node-n1` |
| code 组件 | `#code-input` / `#output` / `#solution` / `#hint-{n}` | |

## postMessage 桥参考实现（推荐每个 widget 都内嵌）

宿主侧的导览动作（spotlight/annotate）通过 postMessage 下发到 iframe。
**消息格式**：宿主调用 `iframe.contentWindow.postMessage({ type, ...payload }, '*')`，
即消息对象形如 `{type: 'HIGHLIGHT_ELEMENT', target: '#reset-btn'}`。
字段：`type`（消息类型）、`target`（CSS 选择器）、`content`（批注文本）、`state`（状态对象，可选）。

widget 侧在 HTML 末尾（或 DOMContentLoaded 内）注册监听。以下为可直接粘贴的参考实现：

```javascript
// ===== postMessage 桥：监听宿主下发的导览消息 =====
window.addEventListener('message', function (event) {
  // 宿主消息形如 {type:'HIGHLIGHT_ELEMENT', target:'#reset-btn', content:'…', state:{…}}
  const data = event.data || {};
  const type = data.type;
  const target = data.target;   // CSS 选择器
  const content = data.content; // 批注文本
  const state = data.state;     // 可选：状态对象

  switch (type) {
    case 'SET_WIDGET_STATE':
      // 按命名约定把 state 里的每个键写回对应控件并触发 input 事件
      if (state) {
        Object.entries(state).forEach(function ([key, value]) {
          const el = document.getElementById(key + '-slider') ||
                     document.querySelector('[data-var="' + key + '"]');
          if (el) {
            el.value = value;
            el.dispatchEvent(new Event('input', { bubbles: true }));
          }
        });
      }
      break;

    case 'HIGHLIGHT_ELEMENT':
      // 给目标元素加脉冲描边，3 秒后自动移除
      var highlightEl = document.querySelector(target);
      if (highlightEl) {
        highlightEl.style.outline = '3px solid rgba(139, 92, 246, 0.8)';
        highlightEl.style.outlineOffset = '4px';
        highlightEl.style.animation = 'pulse-highlight 2s infinite';
        setTimeout(function () {
          highlightEl.style.outline = '';
          highlightEl.style.animation = '';
        }, 3000);
      }
      break;

    case 'ANNOTATE_ELEMENT':
      // 在目标元素附近弹出批注气泡，4 秒后自动移除
      var annotateEl = document.querySelector(target);
      if (annotateEl && content) {
        const rect = annotateEl.getBoundingClientRect();
        const tooltip = document.createElement('div');
        tooltip.className = 'teacher-annotation';
        tooltip.style.cssText =
          'position:fixed; top:' + (rect.top - 40) + 'px; left:' + rect.left + 'px;' +
          'background:rgba(139,92,246,0.95); color:white; padding:8px 12px;' +
          'border-radius:8px; font-size:14px; z-index:1000; animation:fadeIn 0.3s;';
        tooltip.textContent = content;
        document.body.appendChild(tooltip);
        setTimeout(function () { tooltip.remove(); }, 4000);
      }
      break;

    case 'REVEAL_ELEMENT':
      // 显示一个预先隐藏的元素（如答案面板、下一步骤）
      var revealEl = document.querySelector(target);
      if (revealEl) {
        revealEl.style.display = '';
        revealEl.style.opacity = '1';
      }
      break;
  }
});

// 上述两个动画所需的 keyframes，动态注入 <style>
const style = document.createElement('style');
style.textContent =
  '@keyframes pulse-highlight { 0%, 100% { outline-color: rgba(139, 92, 246, 0.8); }' +
  ' 50% { outline-color: rgba(139, 92, 246, 0.4); } }' +
  '@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); }' +
  ' to { opacity: 1; transform: translateY(0); } }';
document.head.appendChild(style);
```

按 widget 类型调整 `SET_WIDGET_STATE` 分支：

- **diagram**：键对应节点 id，节点元素为 `id="node-{id}"`，置 `opacity` / `active` class。
- **code**：`state` 形如 `{code: "…", run: true}` —— 写回编辑区（`#code-input`），可选触发运行。
- **game**：控件之外的游戏参数走一个全局 `window.setGameParam(key, value)` 入口。

widget 未实现桥时导览动作静默跳过，不算错误；但实现后体验显著更好，**推荐总是内嵌**。

## 校验分级提醒

- interactive HTML 引用 http(s) 外链 → **ERROR**；widget-config JSON 解析失败 → ERROR；HTML 截断（缺 `<!DOCTYPE html>` 或 `</html>`）→ ERROR。
- 产出后必须运行 `python3 tools/course_validate.py --course <course_dir> --scene <scene_id>`，errors 清零才算完成。
