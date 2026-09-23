# 图表选型表（Chart.js 离线版）

选型不是风格问题，是**数据形状**问题：先确认手里的数据是什么形状，再查表。
选错了不是"不好看"，是"画出了数据里没有的信息"。

## 第一步：数据形状 → 图表

| 数据形状 | 用这个 | Chart.js 实现要点 |
|:--|:--|:--|
| 一个值随时间变化，1–4 个系列 | 折线图 | `type:'line'`, `tension:0.3`, x 轴为时间字符串标签 |
| 趋势中间有真实缺口 | 折线图 | 缺口处填 `null`，**不要** `spanGaps:true`，不要用平滑掩盖空洞 |
| 水平长期保持、偶尔跳变（如配额、价格） | 阶梯线 | `type:'line'`, `stepped:true` |
| ≤12 个类别的数值对比 | 柱状图 | `type:'bar'`（垂直） |
| >12 个类别，或类别名很长 | 条形图 | `type:'bar'`, `indexAxis:'y'` |
| 排名列表 | 条形图 | `indexAxis:'y'`，数据预先降序排好 |
| **两态差距**：before/after、计划/实际、我方/对方 | 区间条（floating bar） | `data: [[低值, 高值]]`，每类一根；差距本身是主角 |
| 原始测量值的分布（延迟、订单金额、耗时） | 直方图 | 用 `binData()` 从**原始数据**分箱后画 `bar`；见下方函数 |
| 3+ 个维度的画像对比（形状是主角） | 雷达图 | `type:'radar'`，所有轴同一量纲，画像 ≤3 个 |
| 总量从 A 到 B 的迁移（各因素有正有负） | 瀑布图 | floating bar 实现，见下方"瀑布图模式" |
| 单一整体的构成，≤6 个部分 | 环形图 | `type:'doughnut'`, `cutout:'60%'` |
| 构成随时间变化 | 堆叠柱 | `scales: {x:{stacked:true}, y:{stacked:true}}` |
| 占比随时间变化 | 百分比堆叠柱 | 同上，且数据预先归一化到 100 |
| 两个**数值**变量的关系 | 散点图 | `type:'scatter'`，两个轴都必须是数 |
| 单个关键数字 | 不用图 | 用 KPI 卡片，图表是浪费 |

**Chart.js 画不了的，不要硬造：**

| 想要的 | 替代方案 |
|:--|:--|
| 桑基图（流量分合） | 无分支的线性转化路径 → 降序条形图；有分合 → 用表格列出各路径流量 |
| 华夫图（"100 人里 29 人"） | KPI 大数字 + 一行环形图 |
| 地图 | 按区域降序条形图 + 明细表 |

## 第二步：三条高频错误（比整张表都重要）

1. **折线的 x 轴必须有序（时间或数值）**。浏览器占比、地区、部门、SKU——
   这些类别之间没有顺序和距离，连线的斜率不编码任何信息。换个排序，
   线的形状就变了而数据没变——这就是判据。x 是"名字"时，答案永远是柱状图，
   你本来想表达的是**排名**，不是**趋势**。
   - 看似例外的两种情况：`各地区 2019–2025 营收`是每个地区一条线的时间序列
     （地区进 legend，时间进 x 轴）；年龄段、十分位、漏斗阶段这类**本身有序**的
     分箱画折线是合法的。
2. **部分-整体图（环形/饼图）要求部分之和真的是一个整体**。非负、可相加、
   加总有意义。某地区亏损时的"地区营收环形图"没有诚实的画法——改用柱状图。
3. **构成/占比类图表超过 6 个部分就失效**。把尾部合并为"其他"（永远灰色），
   或改用降序条形图。

## 反模式清单（交付前自查）

- 折线画在无序类别上（地区、部门、产品名）
- 饼/环形图：画时间序列、超过 6 块、各部分之和不等于整体
- 柱状图截断 Y 轴——柱子的**长度**必须编码数值，柱状图永远 `beginAtZero:true`
- 双 Y 轴——拆成上下两个面板，各自一个标题
- 一张图超过 4 条折线——拆图，或一条主线彩色 + 其余全部灰色
- 堆叠柱用来比较中间层——只有最底层和总和是可读的，中间层比较请拆图
- 对数轴里出现 0 或负值
- 散点图的一个轴是类别——点会落在毫无意义的 0,1,2… 索引轴上
- 直方图喂的是已聚合的计数——那是对计数再分箱，画出来的是垃圾
- 瀑布图各步之间没有加减关系、只是几个独立总量——那是柱状图
- 气泡大小按半径而非面积缩放——Chart.js 的 `r` 是半径，面积随 r² 增长，
  数值差 2 倍视觉差 4 倍；要么自己开方（`r = k*sqrt(v)`），要么换柱状图

## 强调（Emphasis）：让标题和画面一致

**如果标题点名了某些柱子，那些柱子必须长得和其他柱子不一样。**
这是单张图表上性价比最高的一个动作，也是最常被跳过的一个：
标题写着"前两名贡献了 90% 的量"，底下 8 根柱子一个颜色，读者就得自己数。

规则：

- **两色，不要彩虹。** 一个强调色给主角，一个中性灰给背景。
  `backgroundColor` 按数据点逐个赋值（见 SKILL.md 的 emphasis 模式）。
  每根柱子一个颜色（`colorByPoint` 式彩虹）是强调的反面——它在说每根柱子
  都是主角，等于没有主角。
- **强调项 ≤2–3 个。** 强调是一种比例。7 根柱子里点亮 4 根，图和底就都读不出来了
  ——说明你的发现其实是两个发现，该拆成两张图。
- **灰色永久留给残余类别。** "其他""未分类""未知"在任何图里都拿灰色，
  它们永远不是发现，不该占用调色板里能给真实类别的颜色。
- **单系列的强调图删掉 legend**——没有系列可命名。需要说明时在副标题写
  "前两名高亮"。
- **不是每张图都有主角。** 发现是整体形状而非具体类别时，全图一个颜色是对的；
  硬挑两根高亮是在编造一个数据里没有的声明。
- **多系列场景，用灰色折叠背景。** 6 条历史折线全部同一个灰，读作"过去"这一个
   band——正是你要的对比；6 种不同的灰读作 6 个东西。标注一次"2019–2024"即可。

## 标题：写发现，不写主题

- 差：`各地区销售情况`、`ARR 构成`、`流量趋势`
- 好：`华东一区贡献 42% 营收`、`企业版占 ARR 的 70%`、`改版后次周留存下降 8pp`

检验方法：把标题遮住，让同事看图 10 秒，说出的结论和你标题一致，才算合格。
标题点名了谁，回到上面的强调规则。

## 附：直方图分箱函数（复制进生成的 HTML）

```javascript
// 原始数值数组 → 直方图 bins。禁止对"已聚合的计数"使用。
function binData(values, binCount = 12) {
  const nums = values.filter(v => Number.isFinite(v));
  const min = Math.min(...nums), max = Math.max(...nums);
  if (min === max) return { labels: [String(min)], counts: [nums.length] };
  const width = (max - min) / binCount;
  const counts = new Array(binCount).fill(0);
  for (const v of nums) {
    let i = Math.floor((v - min) / width);
    if (i === binCount) i = binCount - 1; // 最大值落入最后一箱
    counts[i]++;
  }
  const labels = counts.map((_, i) => {
    const lo = min + i * width;
    return `${formatValue(lo)}–${formatValue(lo + width)}`;
  });
  return { labels, counts };
}
```

## 附：瀑布图模式（floating bar 实现）

```javascript
// steps: [{label:'期初', value:1000, type:'total'},
//         {label:'新增', value:320}, {label:'流失', value:-180},
//         {label:'期末', value:1140, type:'total'}]
function waterfallConfig(steps) {
  let running = 0;
  const data = steps.map(s => {
    if (s.type === 'total') { const bar = [0, s.value]; running = s.value; return bar; }
    const bar = s.value >= 0 ? [running, running + s.value] : [running + s.value, running];
    running += s.value;
    return bar;
  });
  return {
    type: 'bar',
    data: {
      labels: steps.map(s => s.label),
      datasets: [{
        data,
        backgroundColor: steps.map(s =>
          s.type === 'total' ? COLORS.muted : (s.value >= 0 ? COLORS.positive : COLORS.negative)),
      }]
    },
    options: {
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true } }
    }
  };
}
```
