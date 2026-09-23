---
name: offline-dashboard
description: 构建单文件、零外链的离线交互式 HTML 仪表盘（KPI 卡、图表、筛选器、明细表）。当用户要求做 dashboard/仪表盘/数据看板/KPI 汇报页、把查询结果或统计数据变成可分享的网页报告、给领导做经营/平台数据速览时使用。Build a self-contained offline HTML dashboard with KPI cards, charts, filters and tables — works in air-gapped intranet, no CDN, no server.
---

# Offline Dashboard Builder

生成**单个 HTML 文件**的交互式仪表盘：双击即开、断网可用、可直接发邮件或丢内网共享盘。

## 离线铁律（不可违反）

1. **产出物禁止任何运行时外部资源**——不引用 CDN 的 script/css/字体/图片，不 fetch 远程数据。
2. **Chart.js 必须内嵌**：用 Read 读取本 skill 目录下 `assets/chart.umd.js`（约 200KB），
   全文粘贴进模板的 `<script>/* __CHART_UMD_JS__ */</script>` 占位处。
3. **数据必须内嵌**：所有数据以 `const DATA = {...}` 形式写死在 HTML 里。
4. 交付前**必须**跑交付闸门（见文末），不跑闸门不算完成。

> 若用户明确要求"dashboard 和图表库分开放"（如内网多个页面共享一份库），
> 可用 `<script src="./chart.umd.js">` 相对引用代替内嵌——但必须把
> `assets/chart.umd.js` 复制到产出物旁边，并在交付说明里写清"两个文件需一起拷贝"。

## Workflow

### 1. 明确需求

- **用途**：领导速览 / 运营监控 / 专题分析汇报
- **读者**：谁看？（决定专业术语深度和 KPI 选择）
- **关键数字**：最重要的 2–4 个指标是什么
- **切片维度**：需要按什么筛选（时间、部门、产品线……）
- **数据来源**：用户贴的数据 / CSV / 仓库查询结果 / 暂无数据

### 2. 处理数据

- 清洗后内嵌为 `const DATA`（JSON 数组或按图表分组的多个数组）。
- **用户没给数据时**：生成符合描述结构的示意数据，并做到**双重标注**——
  ① 代码中数据声明处写注释 `// sample-data`；② 页面顶部放**可见的**
  `<div class="sample-banner">示意数据 — 替换 DATA 后即可用于真实数据</div>`。
  两道标注缺一不可（闸门靠代码标记发现示意数据、靠可见文本确认读者知情），
  禁止不标注。

### 3. 图表选型

读 `references/chart-selection.md` 按**数据形状**选型。最常考的三条：

- x 轴是无序类别（地区/部门/产品名）→ **柱状图**，永远不画折线
- 部分之和不是整体 → 不用环形图
- 柱状图永远 `beginAtZero: true`

### 4. 生成 HTML

基于下方基础模板生成。布局约定：

```
┌────────────────────────────────────────────┐
│  标题(写发现)              [筛选器 ▼]       │
├─────────┬─────────┬─────────┬──────────────┤
│ KPI 卡  │ KPI 卡  │ KPI 卡  │  KPI 卡      │
├─────────┴─────────┼─────────┴──────────────┤
│   主图(最大)      │   副图                 │
├───────────────────┴────────────────────────┤
│   明细表(可排序表头)                        │
├────────────────────────────────────────────┤
│  数据截至: YYYY-MM-DD                       │
└────────────────────────────────────────────┘
```

- KPI 卡 2–4 个，放头条数字
- 图表 1–3 个，**每个图的标题写发现不写主题**（见选型表"标题"节）
- 筛选器变化时 KPI、所有图表、表格**同步更新**

### 5. 跑闸门并交付

```bash
python3 scripts/check_dashboard.py 输出文件.html --final
```

全部通过才算完成。失败项逐条修复后重跑。

## 基础模板

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>写发现的标题</title>
<script>
/* __CHART_UMD_JS__ — 此处全文粘贴 assets/chart.umd.js 的内容 */
</script>
<style>
  :root {
    --bg: #f5f6f8; --card: #ffffff; --ink: #1f2329; --ink2: #646a73;
    --line: #e5e7eb; --accent: #2563eb; --muted: #9ca3af;
    --pos: #16a34a; --neg: #dc2626;
  }
  * { box-sizing: border-box; margin: 0; }
  body { background: var(--bg); color: var(--ink);
         font: 14px/1.6 -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; }
  .container { max-width: 1200px; margin: 0 auto; padding: 24px; }
  .dash-header { display: flex; justify-content: space-between; align-items: center;
                 flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
  .dash-header h1 { font-size: 20px; }
  .filters { display: flex; gap: 10px; flex-wrap: wrap; }
  .filters select { padding: 6px 10px; border: 1px solid var(--line); border-radius: 6px;
                    background: #fff; }
  .kpi-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
             gap: 16px; margin-bottom: 16px; }
  .kpi-card { background: var(--card); border-radius: 10px; padding: 16px 20px;
              box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  .kpi-label { color: var(--ink2); font-size: 13px; }
  .kpi-value { font-size: 28px; font-weight: 600; margin-top: 4px; }
  .kpi-change { font-size: 12px; margin-top: 2px; }
  .kpi-change.positive { color: var(--pos); } .kpi-change.negative { color: var(--neg); }
  .chart-row { display: grid; grid-template-columns: 3fr 2fr; gap: 16px; margin-bottom: 16px; }
  @media (max-width: 900px) { .chart-row { grid-template-columns: 1fr; } }
  .chart-card { background: var(--card); border-radius: 10px; padding: 16px 20px;
                box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  .chart-title { font-size: 15px; font-weight: 600; margin-bottom: 4px; }
  .chart-subtitle { font-size: 12px; color: var(--ink2); margin-bottom: 10px; }
  .chart-box { position: relative; height: 300px; }
  .table-card { background: var(--card); border-radius: 10px; padding: 16px 20px;
                box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--line); }
  th { cursor: pointer; user-select: none; color: var(--ink2); font-size: 13px; }
  th.sorted-asc::after { content: " ▲"; } th.sorted-desc::after { content: " ▼"; }
  .dash-footer { color: var(--ink2); font-size: 12px; margin-top: 16px; text-align: right; }
  .sample-banner { background: #fef3c7; color: #92400e; border: 1px solid #fbbf24;
                   border-radius: 8px; padding: 8px 14px; margin-bottom: 16px; font-size: 13px; }
</style>
</head>
<body>
<div class="container">
  <header class="dash-header">
    <h1>仪表盘标题(一句发现)</h1>
    <div class="filters"><!-- 筛选器 --></div>
  </header>
  <section class="kpi-row"><!-- KPI 卡 --></section>
  <section class="chart-row"><!-- 图表卡 --></section>
  <section class="table-card"><!-- 明细表 --></section>
  <footer class="dash-footer">数据截至: <span id="data-date">YYYY-MM-DD</span></footer>
</div>
<script>
// ============ 内嵌数据 ============
const DATA = { /* rows: [...], ... */ };

// ============ 常量与工具 ============
const COLORS = {
  palette: ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2'],
  accent: '#2563eb', muted: '#9ca3af', positive: '#16a34a', negative: '#dc2626'
};
function formatValue(v, fmt = 'number') {
  if (fmt === 'percent') return v.toFixed(1) + '%';
  if (fmt === 'currency') return v >= 1e4 ? '¥' + (v / 1e4).toFixed(1) + '万' : '¥' + v.toLocaleString();
  return v >= 1e8 ? (v / 1e8).toFixed(2) + '亿' :
         v >= 1e4 ? (v / 1e4).toFixed(1) + '万' : v.toLocaleString();
}

// ============ 渲染逻辑 ============
// renderKPIs() / renderCharts() / renderTable() / applyFilters()
// 筛选器 onchange → applyFilters(): 重算 filteredData → 更新 KPI/图表/表格

document.getElementById('data-date').textContent = new Date().toISOString().slice(0, 10);
</script>
</body>
</html>
```

## 图表模式速查

配色纪律：系列色取 `COLORS.palette`；强调模式用 `COLORS.accent`(主角) + `COLORS.muted`(背景)；
"其他/未分类"永远 `COLORS.muted`。完整规则见 `references/chart-selection.md`。

**折线（时间趋势）**
```javascript
new Chart(document.getElementById('trend-chart'), {
  type: 'line',
  data: { labels: months, datasets: series.map((s, i) => ({
    label: s.label, data: s.data,
    borderColor: COLORS.palette[i % COLORS.palette.length],
    backgroundColor: COLORS.palette[i % COLORS.palette.length] + '20',
    borderWidth: 2, tension: 0.3, pointRadius: 3, fill: false
  }))},
  options: { responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { position: 'top' } },
    scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } },
              y: { beginAtZero: true } } }  // maxTicksLimit 防止时间标签挤成一团
});
```

**柱状（类别对比）/ 条形（长标签或 >12 类，`indexAxis:'y'`）**
```javascript
new Chart(document.getElementById('cat-chart'), {
  type: 'bar',
  data: { labels: cats, datasets: [{ data: values,
    backgroundColor: COLORS.palette.map(c => c + 'CC'), borderRadius: 4 }]},
  options: { responsive: true, maintainAspectRatio: false, // indexAxis: 'y' 即条形
    plugins: { legend: { display: false } },
    scales: { y: { beginAtZero: true } } }  // 柱状图必须 beginAtZero
});
```

**强调模式（标题点名了谁，谁换色；单系列时删 legend）**
```javascript
// 例: 标题"前两名贡献 90% 的量" → 前两名 accent, 其余 muted
backgroundColor: rows.map((r, i) => i < 2 ? COLORS.accent : COLORS.muted)
```

**环形（构成 ≤6 部分）**
```javascript
new Chart(document.getElementById('share-chart'), {
  type: 'doughnut',
  data: { labels: parts, datasets: [{ data: shares,
    backgroundColor: COLORS.palette.map(c => c + 'CC'), borderColor: '#fff', borderWidth: 2 }]},
  options: { responsive: true, maintainAspectRatio: false, cutout: '60%',
    plugins: { legend: { position: 'right' },
      tooltip: { callbacks: { label: (c) => {
        const t = c.dataset.data.reduce((a, b) => a + b, 0);
        return `${c.label}: ${formatValue(c.parsed)} (${(c.parsed / t * 100).toFixed(1)}%)`;
      } } } } }
});
```

**散点（两个数值变量）**：`type:'scatter'`, `data: [{x, y}, ...]`，两轴皆数值。
**瀑布 / 两态差距 / 直方图**：实现模式见 `references/chart-selection.md` 附录。

## 交互模式

**筛选器联动**（所有视图同步）：
```javascript
function applyFilters() {
  const filtered = DATA.rows.filter(row =>
    (!state.region || row.region === state.region) &&
    (!state.dept   || row.dept   === state.dept));
  renderKPIs(filtered);
  for (const [key, chart] of Object.entries(charts)) {
    const next = aggregateFor(key, filtered);
    chart.data.labels = next.labels;
    chart.data.datasets.forEach((ds, i) => ds.data = next.datasets[i]);
    chart.update('none');   // 'none' 关动画, 筛选时即时响应
  }
  renderTable(filtered);
}
```

**可排序表头**：
```javascript
function sortTable(th, key, numeric = true) {
  const dir = th.dataset.dir === 'asc' ? 'desc' : 'asc';
  th.dataset.dir = dir;
  document.querySelectorAll('th').forEach(h => h.className = '');
  th.className = 'sorted-' + dir;
  tableRows.sort((a, b) => {
    const d = numeric ? a[key] - b[key] : String(a[key]).localeCompare(String(b[key]), 'zh');
    return dir === 'asc' ? d : -d;
  });
  renderTable(tableRows);
}
```

## 交付闸门

```bash
python3 scripts/check_dashboard.py <输出文件>.html           # 开发期检查
python3 scripts/check_dashboard.py <输出文件>.html --final   # 交付前必跑
```

闸门检查项：外链资源（FAIL）、Chart.js 内嵌、canvas-图表配对、数据内嵌非空、
示意数据可见标注、标题非占位、数据日期、TODO 残留。**不跑闸门的 dashboard 不许交付。**
