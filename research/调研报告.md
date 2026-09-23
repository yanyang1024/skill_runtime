# 自我改进 Coding Agent 四件套调研报告

> 调研日期：2026-09-24
> 调研对象：SICA · HGM · RRSI（Google Research）· Lilian Weng《Harness Engineering for Self-Improvement》
> 本目录同时存档了论文原文 PDF / 博客 HTML 快照、三个开源仓库源码快照、引用查询 CSV 等一手材料。

---

## 0. TL;DR

| 维度 | SICA | HGM | RRSI (Google) | Lilian Weng 博客 |
|---|---|---|---|---|
| 类型 | 论文+代码 | 论文+代码 | 论文+代码 | 综述性博客（无代码） |
| 发表 | ICLR 2025 SSI-FM  Workshop **Oral** | **ICLR 2026 主会 Oral** | arXiv 预印本（2026-09-21，3 天前） | Lil'Log，2026-07-04 |
| 引用数（Google Scholar） | ~80 | ~48（主会版 43 + arXiv 版 5） | 0（刚发布） | 不适用（但被大量论文引用为 "Weng, 2026"） |
| GitHub stars | 401 | 433 | 245（一周内） | — |
| 仓库维护状态 | **已冻结**（仅 2 个 commit，2025-04 后无更新） | 半冻结（2025-11 后无实质代码修复） | **活跃**（发布一周，天天有 commit） | — |
| 真实可用性 | 研究参考实现，不可直接复现 | 可跑但复现门槛高、issue 无人维护 | 工程最完整，但未经验证 | 思想影响力最大，无代码可用 |
| 一句话 | 证明"能跑通"的拓荒者 | 把"选谁繁衍"做成理论的学院派 | 把"防过拟合"做成工程纪律的工业派 | 给整个赛道立旗的叙事者 |

**核心结论**：这条赛道（agent 改写自身 harness/代码实现递归自我改进）在 18 个月内从"可行性演示"（SICA）→"搜索策略理论化"（HGM）→"泛化与防过拟合的工程化"（RRSI）快速演进，Lilian Weng 的博客是这条线的"名义纲领"。**但四者都还没有跨越"可验证任务 + 大算力预算"的边界**；SICA/HGM 的开源仓库实质上是一次性快照，社区复现案例几乎为零；RRSI 是目前工程质量最高、态度最诚实的实现，但发布仅 3 天，尚无第三方验证。

---

## 1. SICA — A Self-Improving Coding Agent

**论文**：arXiv 2504.15228，Maxime Robeyns / Martin Szummer / Laurence Aitchison（布里斯托大学 + iGent AI）。ICLR 2025 Workshop on Scaling Self-Improving Foundation Models **Oral**（注：你提供的笔记里写"ICLR 2026 研讨会"，实际应为 **ICLR 2025** 研讨会，OpenReview PDF 首页可证）。
**代码**：`github.com/MaximeRobeyns/self_improving_coding_agent` → 已存至 `repos/sica/`。

### 1.1 思想批判

SICA 的历史贡献在于**第一个完整演示了"消除 meta-agent 与 target-agent 界限"的闭环**：archive 里分数最高的 agent 充当本轮 meta-agent，直接编辑自己的整个 Python 代码库（提示词、工具定义、脚手架），而非只改 prompt 字符串。这一点比 Reflexion 深一层，比 ADAS（固定 meta-agent 改 target 的 forward 函数）更进一步。SWE-bench Verified 随机子集 17%→53% 的数字在 2025 年 4 月足够震撼。

但批判地看，它有三个结构性软肋：

1. **贪婪爬山，无探索机制**。SICA 每轮选"当前最优"做父代，本质是 hill-climbing。DGM 论文明确指出这会导致陷入局部次优平台；HGM 随后用谱系统计正面攻击这一点。SICA 自己也承认"early features often influence subsequent features"（README 的 TODO 列表原话），即路径依赖严重。
2. **效用函数看似周全，实则手工调参**。`U = 0.5·score − 0.25·cost − 0.25·time` 的权重是拍脑袋的，且 `select_base_agent` 直接信任 agent 自己写入的 `perf.json`——见下述安全 issue，这不是理论瑕疵，是**实现上就没有完整性校验**。
3. **基准子集过小**。53% 是在 SWE-bench Verified 的 50 题随机子集上取得的，且每个 iteration 的评测预算有限。后续工作（HGM 论文 Sec.4.2）报告 SICA 在 SWE-Verified-60 上跑 360 次评测后反复出现 "query length out-of-LLM-context-window"，说明其架构在长程自我改进下并不稳。

### 1.2 真实可用性评估

- **Star/Fork**：401 / 65（创建 2025-04-11）。作为对照，同期的 DGM（jennyzzt/dgm）有 2363 stars——SICA 的社区关注度只有 DGM 的 1/6，部分原因是 DGM 有 Sakana AI 的 PR 机器和 HN 头条（250 pts / 224 评论），SICA 几乎没有 HN 存在。
- **维护状态：实质冻结**。整个仓库只有 **2 个 commit**（初始提交 + 一个 Dockerfile 缺 awk 的修复，2025-04-23）。17 个月无一行新代码。
- **Issue 信号**（共 3 个，极具信息量）：
  - #1 Docker 构建失败（已修复关闭）；
  - #2 用户请求分享论文中提到的"升级后的工具"——**无人回应，至今 open**（也就是说：论文里 53% 那个 agent 进化出来的工具链并没有随仓库发布，你 clone 下来的是"进化前"的裸 agent）；
  - #4（2026-08，open，作者未回应）：一份非常专业的安全审计，指出两个硬伤——(a) 被接受的自我修改**不经任何 diff/review 门**直接进入下一轮并以 `python -m` 执行（import 时 module 级代码即运行）；(b) benchmark 容器以**读写**方式挂载共享 archive，进化中的 agent 可以覆写其他迭代的评分文件，而排名路径上**没有任何 hash/HMAC/签名**。
- **第三方攻击验证**：arXiv 2609.17817《Contaminating Self-Modifying AI Coding Agents with Poisoned Benchmarks》（2026-09）把 SICA 作为 2 号案例研究，用**原版 SICA 不改一行内部代码**就完成了基准投毒攻击，作者明确指出 SICA 的开放式自我改进 prompt（"Your singular task is to make the coding agent system better"）没有任何护栏。
- **引用**：Google Scholar ~80 次。质量不错但多为"相关工作中提一句"式引用，真正在其代码上 build 的工作几乎没有（MOSS、DGM 系都是另起炉灶）。

**判定**：思想价值 = 高（开山之作）；代码可用性 = **低**。它是一个"干净、可读的参考实现"（论文自我定位），适合读源码学架构，不适合作为可复现的实验平台。安全模型的天真程度在 2026 年的标准下是不可接受的——自己改进出来的代码不经过任何完整性检查就直接跑，且评分文件可被被评测对象篡改。

---

## 2. HGM — Huxley-Gödel Machine

**论文**：arXiv 2510.21614，Wenyi Wang、…、Mingchen Zhuge、Jürgen Schmidhuber（KAUST）。**ICLR 2026 主会 Oral**。
**代码**：`github.com/metauto-ai/HGM` → 已存至 `repos/hgm/`。

### 2.1 思想批判

HGM 的理论洞察是这条赛道里最锋利的：**Metaproductivity-Performance Mismatch（MPM）**——一个 agent 当前的 benchmark 分数 ≠ 它生出更强后代的能力。DGM/SICA 都默认"分数高的父代更值得扩展"，HGM 说这搞错了对象：应该估计的是**整个谱系（clade）的元生产力 CMP**，并用 Thompson sampling 在自我修改树上做搜索。它还证明了：在该设定下，若能拿到真实 CMP，就足以模拟 Gödel Machine 的行为（Theorem 1）——把 Schmidhuber 2003 年的理论怪物往工程上拉近了一步。

实证上：SWE-Verified-60 56.7%（DGM 53.3%、SICA 50.0%），Polyglot 30.5%，CPU 小时比 DGM 省 2.38–6.86 倍；CMP 估计与真实 CMP 的相关性 0.778 vs DGM 启发式的 0.285——这个数字是全文最有说服力的证据，说明"短期分数确实不是好父代指标"。

批判点：

1. **CMP 仍是代理指标的代理**。真实 CMP 需要看到未来后代，不可得；HGM 用的是 clade 内已观测后代分数的 Beta 后验估计。当 clade 很浅（早期迭代）时估计极不准——这正是 issue #7 的真实报告：用户设 ε=0.5、预算 200 时，**总是选到 archive 早期的初始 agent 直系子代**，说明在有限预算下 CMP 估计系统性地偏向"已经被充分评估的老节点"，探索并没有论文曲线上看起来那么美好。
2. **记号混乱**：issue #6 指出论文写 ε=1 取 posterior 的 epsilon 百分位——若按字面理解（100 百分位）所有 agent 无法区分，怀疑实际是 1 百分位（ε=0.01）。作者 2 条评论回复后仍没有给出干净利落的澄清。**论文核心超参数的定义模糊到读者无法确定语义**，这对一篇主会 Oral 来说不应该。
3. **谱系合法性存疑**：issue #1 要求把仓库重建为 DGM 的正式 fork。看代码结构（`self_improve_step.py`、`llm_withtools.py`、`swe_bench/` 布局与 DGM 一致）——HGM 是在 DGM 代码上改的，但以全新仓库发布且没有 fork 关系，虽然 README 末尾有致谢。**这不算学术不端，但增加了 diff 审查成本**，也让"基于哪个 DGM commit 改的"不可考。
4. **复现材料不全**：issue #3 请求发布 evolve trace 让他人验证演化轨迹——open 至今未满足。也就是说 56.7% 的 best-belief agent 的完整演化过程外界看不到。

### 2.2 真实可用性评估

- **Star/Fork**：433 / 73（创建 2025-10-24）。考虑到顶着 ICLR Oral + Schmidhuber 的光环，这个数字只能算中等。
- **维护状态**：最后一个实质代码 commit 是 2025-11-25（"the previous fix was not correct"——连修 bug 都修了两轮）；2026-02 只有 README news 更新。5 个 open issue 中有 3 个是用户复现受阻的呼救，**全部无人实质响应**。
- **引用**：~48（Google Scholar，主会版 43 + arXiv 版 5）。作为 2025-10 的论文尚可，且多为实质引用（后续 self-improvement 工作普遍把 HGM 当 baseline 或理论对照）。
- **HN 存在感**：两次提交合计 4 分 2 评论——社区讨论度与其学术地位严重不匹配，说明**跑起来太贵/太难，没有形成实践者社群**。

**判定**：思想价值 = **最高**（MPM 是整个领域都应该内化的概念）；代码可用性 = **中低**。仓库能跑通 pipeline 的证据存在（有人跑到了 argmax 报错，说明前面流程走通了），但你需要的预算（论文设定 800 次 benchmark 评测）、对 DGM 遗产代码的忍受力、以及核心超参数语义的不确定性，都让它更像"供研究者读和引用"，而非"供工程师复用"。

---

## 3. RRSI — Regularized Recursive Self-Improvement of Agent Harnesses（Google Cloud AI Research）

**论文**：arXiv 2609.24972，Peng Xia 等 13 人（Google Cloud AI Research + Stanford + WashU + UNC；一作是 Google 的 Student Researcher）。提交于 **2026-09-21，即 3 天前**。
**代码**：`github.com/google-research/rrsi` + 项目页 `regularized-rsi.com` → 已存至 `repos/rrsi/`。

### 3.1 思想批判

RRSI 的问题意识直接冲着前两家的软肋去：**harness 自我进化会过拟合 evolve set**——在训练分布上刷出大增益，换一套 benchmark 就缩水甚至为负。它把 ML 正则化的整套语汇翻译进 harness 搜索：

- **提案侧**（约 L0）：余弦退火的编辑预算 `b_t`（一轮候选只能捆绑有限个独立可归因的编辑）；编辑历史全程记录防止重复验证已被证伪的假设（引用 Dwork et al. 2015 的 adaptive data analysis——这是自适应重用同一评测集的正确理论框架）；stall 时强制探索未触达的组件类型。
- **选择侧**：critic 在评测前先筛掉编码了 benchmark 特定内容的候选（防泄漏/防背题）；噪声地板 `S*−δ`（先用基础 harness 重复评测估出噪声带 δ，小于噪声的"提升"不算数）；复杂度罚 `ΔC ≤ β0 + β1·ΔS`（类 Ridge：涨分必须抵偿 token 成本增长）；Lasso 式剪枝（长期无产出的组件直接删）。

**这是四家里思想上最成熟的一个**，原因有三：

1. **它正面承认并测量了别人回避的失败模式**。Table 1 里四个 baseline（Meta-Harness、AHE、TTHE、HarnessX）全部 evolve-set 涨分、OOD 缩水，TTHE 甚至低于起点 −1.7——这张图（Fig.1a）是对整个 harness 进化文献的含蓄指控：你们报的数字很多是自适应过拟合。RRSI 自己则是 evolve-set 增益最小（90.5，最低）但 OOD 均值唯一显著超越 H0（43.6 vs 39.7）的方法——**它故意拿 evolve 分数换泛化**，这是正确且少见的价值取向。
2. **成本被当作一等公民**：最终 harness 2.42M tokens/trial vs 未正则进化 3.80M，比所有 baseline 都便宜且 OOD 更高（Fig.4 的"RRSI 支配区"）。回想 SICA 的效用函数也考虑了成本，但那是手工权重；RRSI 把它变成了可审计的接受规则。
3. **跨模型证据**：Opus 4.8 搜出的 harness 原样跑在 Gemini 3.1 Flash Lite 上仍有 +3.4（30.4% 相对增益）——说明学到的是机制而非对特定 policy 的拟合。这个实验设计比"换个 backbone 再搜一遍"有说服力得多。

批判点：

1. **增益绝对值小**。evolve 集 +1.1~+6.0，OOD +1.8~+4.7。对比 SICA 的 17%→53%、DGM 的 20%→50%，RRSI 的数字"平淡"——但这恰恰可能是诚实的代价：扣除过拟合后，harness 进化的真实可迁移收益也许本来就是这么大。**这不是 RRSI 的缺点，而是它揭露了整个赛道的数字通胀。**不过这也意味着：如果你的目标是"快速把一个 benchmark 刷上去"，RRSI 不是工具，它是约束。
2. **正则化类比是定性的，不是定量的**。论文自己反复承认"the analogy applies to update sparsity rather than to a fixed parameter vector"、"The correspondence is again qualitative"。L0/L1/L2 是修辞框架而非数学等价——β0/β1/δ/bmin/bmax 全部需要手工设定（rrsi.json），δ 还要先跑一遍 bootstrap 标定。**它把"防过拟合"从手工调 prompt 变成了手工调正则超参**，只是后者更可审计。
3. **基础设施绑定重**：policy/proposer/critic 全部 Claude Opus 4.8 on Vertex，judge 用 Gemini 3.5 Flash，三个 domain 分别要 harbor venv、Harvey LAB pinned checkout、EngDesign 官方树 + 沙箱网关。复现的全套环境搭建成本不低，且部分 benchmark（Harvey LAB）是第三方商业 benchmark。

### 3.2 真实可用性评估

- **Star/Fork**：245 / 23，创建 2026-09-16——**一周 245 星**，增速是三者中最快的（SICA 17 个月 401，HGM 11 个月 433）。google-research 官方 org 背书作用明显。
- **维护状态**：极度活跃，2026-09-18 到 09-23 每天都有 commit，README 持续打磨。Issue 区 0 条（太新）。HN 仅 1 个 submission 1 分 0 评论——**热度尚在 GitHub 圈层，未破圈**。
- **工程质量是三者中最好的，且好得明显**：README 里有一张"Method to code"对照表（论文每个机制对应到 `rrsi/selection.py` 的具体函数）；有 `tests/test_core.py`；候选在独立 git worktree 中评测、接受即 fast-forward `evolve/<domain>` 分支（incumbent 永远是一个 commit，天然可回滚——**直接解决了 SICA issue #4 控诉的"无 review 门"问题**）；编辑历史 JSONL 逐条记录 hypothesis/分数/成本/verdict；支持 `readjudicate`/`reevaluate` 重判历史轮次。这套设计明显吸收了 SICA/DGM 时代的教训。
- **引用**：0（发布 3 天）。但已被本调研中的一篇安全论文和综述列为相关方法。

**判定**：思想价值 = 高（把 RSI 从"能不能"推进到"该不该信"）；代码可用性 = **三者中最高**，但"最高"的定语是"在三个研究原型里"。离生产可用仍有距离：全套 Vertex/Opus 依赖、多个商业 benchmark 的接入、以及正则超参的标定负担。适合作为**构建自有 harness 进化循环的架构蓝本**直接抄设计（worktree 隔离、噪声地板、泄漏筛查、critic-before-eval），而不是开箱即跑。

---

## 4. Lilian Weng《Harness Engineering for Self-Improvement》

**出处**：Lil'Log 2026-07-04 长文（~31 分钟阅读量），无代码。作者为前 OpenAI 安全研究 VP、Thinking Machines 联创，2026 年回归 OpenAI 领导 RSI 团队。
**快照**：`papers/Weng_harness_blog_2026-07-04.html`。

### 4.1 思想批判

这篇博客不是研究论文，而是**给整个赛道"立旗"的综述 + 立场声明**。核心论点：近期 RSI 的可行路径不是模型改写自己的权重，而是改写包裹自己的 harness（执行编排、上下文、工具、记忆、评估）。她给出了一条优化对象递进链：**指令 prompt → 结构化 context → workflow → harness 代码 → optimizer 代码**，并综述了 ACE/MCE、ADAS/AFlow、STOP、Self-Harness、AlphaEvolve/DGM、SIA 等约 20 项工作。

价值在于三件事：

1. **术语统一与范畴划定**。"Harness"这个词在 2026 年上半年散见于各家工程博客（OpenAI 的 Harness Engineering、Anthropic 的 harness design），是这篇文章把它锚定进 RSI 学术语境——RRSI 论文引用它为 "Weng, 2026"，arXiv 上一批 harness 进化论文都引用它。"harness engineering"如今能成为简历和融资 PPT 上的词，这篇文章居功至伟。
2. **相对清醒的边界声明**。她明确列了七项挑战：弱评估器、上下文/记忆生命周期、负面结果被系统忽略、多样性坍缩、奖励劫持、长期成功度量、人类角色；并承认"权限与安全层必须留在循环之外"。
3. **诚实的背书节制**。对 SIA 这类联合优化工作她直言"方向有趣但证据是初步的"（实验里 task agent 比 meta agent 弱得多，基线太弱无法干净对照）。

批判点：

1. **综述的选择性**。Mingchen Zhuge（HGM 作者之一）在 X 上当即指出遗漏：Gödel Machine (2003)、GPTSwarm (2024)、Agent-as-a-Judge (2024) 这些被文内工作广泛引用的源头未提。
2. **无新实验、无代码**。所有数字都是转述（DGM 20%→50% 等），读者无法从这篇文章验证任何东西。它的功能是地图，不是领土。
3. **立场与利益相关**。作者彼时正领导 OpenAI 的 RSI 团队，"RSI 近期主战场在 harness 而非权重"的论断，恰好也是其团队的存在理由。这不妨碍论点成立，但读者应意识到这是一篇**有议程的综述**。

### 4.2 真实影响力评估（博客无代码，改用传播指标）

- **HN**：主帖 **334 分 / 80 评论**（2026-08-04 由 tosh 提交，为四对象中最高讨论度）；讨论质量高——有实践者报告"不完整但全绿的测试套件比弱评估器更糟"、有人验证"砍掉 system prompt/skills/MCP 只留 sh 反而更快更省且结果不变"、多人分享自建 harness 经验。
- **X（Twitter）**：作者原推 **84 万+ 浏览**；Emad Mostaque 等人接龙报告落地案例；DeepSeek 研究员崔天一转发并提炼"Skill 是 harness 自我进化的更基本形式"。
- **衍生生态**：直接催生了 `leezythu/Awesome-Harness-Self-Improvement`（99 stars，明确注明 inspired by 此文）、`lobehub/awesome-rsi`（313 stars）等阅读清单；中文圈有完整人工精译版（`deusyu/harness-engineering` 仓库收录，该仓库 6012 stars）；被 arXiv 论文（RRSI、Task-Specific Evolvable Harnesses 综述等）作为正式参考文献引用。

**判定**：作为"思想产品"可用性 = **最高**（免费、清晰、边界诚实）；作为"工程资产"可用性 = 零（无代码）。正确用法是把它当**领域地图和词汇表**，然后顺着它的参考文献去找真正有代码的工作（比如本报告另外三家）。

---

## 5. 横向对比与组合建议

| 维度 | SICA | HGM | RRSI | Weng 博客 |
|---|---|---|---|---|
| 改进对象 | 自身完整代码库 | 自身代码库（树搜索） | harness（开放编辑面） | 概念框架 |
| 父代/候选选择 | 贪婪：效用最高分 | Thompson sampling on CMP | 噪声地板+成本罚+剪枝 | — |
| 防过拟合 | 无 | 间接（树探索） | **核心目标** | 列为挑战 |
| 成本约束 | 效用函数手工权重 | CPU 小时为卖点 | ΔC ≤ β0+β1ΔS 硬规则 | — |
| 安全/完整性 | **无门、评分可篡改**（issue #4 + 2609.17817 实证攻击） | README 警告 + Docker | worktree 隔离 + critic 前置筛查 | 呼吁权限层在循环外 |
| 复现难度 | 环境简单但产物不全 | 高（预算 800 次评测、DGM 遗产代码、ε 语义不明） | 中高（多环境但文档最全） | 不适用 |
| 维护活跃度 | 冻结 17 个月 | 半冻结 10 个月 | 活跃 | 不适用 |
| 学术认可 | Workshop Oral | **主会 Oral** | 待观察 | 被广泛引用 |

**演进脉络**：SICA（2025-04）证明闭环可行 → HGM（2025-10）指出"选谁进化"应该用谱系统计而非当前分数 → RRSI（2026-09）指出"整个循环"会过拟合评测集，需要正则化。三者是互补的：**用 Weng 的地图建立词汇表，用 HGM 的 CMP 做父代选择，用 RRSI 的接受规则做门控，用 SICA 的源码学最小骨架**——一个现代实现应当同时吸收四家。

**对你的决策建议**（取决于目的）：

- **想快速读懂自指改进机制** → 读 SICA 源码（最干净），但不要在它的 runner 上跑真实实验（评分完整性无保障）。
- **想发论文/做研究 baseline** → HGM 是必引必比对象；跑不动就用其论文表格数字并注明设定差异。
- **想在公司内部搭一套 harness 自进化管线** → 抄 RRSI 的架构（worktree + 噪声标定 + critic 前置 + 成本罚），benchmark 换成你自己的私有 evals。注意它对强模型（Opus 4.8 级）的依赖。
- **写立项报告/融资叙事** → 引用 Weng 博客 + RRSI 的过拟合数据（Fig.1a），这是目前最有说服力的"为什么值得做且为什么不能蛮干"的组合论据。

**共同的天花板（务必记住）**：四家都只在"可自动验证"的任务上成立（代码测试、模拟器、rubric judge）。没有任何一家解决了开放域/主观任务的自我改进；也没有任何一家证明长期（数百轮以上）运行不退化。Weng 列的七项挑战至今全部开放。

---

## 附：本目录存档清单

```
research/
├── 调研报告.md                          ← 本文件
├── papers/
│   ├── SICA_2504.15228.pdf              SICA 论文原文（arXiv）
│   ├── HGM_2510.21614.pdf               HGM 论文原文（arXiv）
│   ├── RRSI_2609.24972.pdf              RRSI 论文原文（arXiv）
│   └── Weng_harness_blog_2026-07-04.html Lilian Weng 博客 HTML 快照
├── repos/
│   ├── sica/    github.com/MaximeRobeyns/self_improving_coding_agent @master(964814692)
│   ├── hgm/     github.com/metauto-ai/HGM @main(013872d)
│   └── rrsi/    github.com/google-research/rrsi @main(be50316)
├── scholar_sica.csv / scholar_hgm.csv / scholar_rrsi.csv   Google Scholar 查询结果
└── sica_openreview.json                 OpenReview 元数据尝试（403，已弃）
```

**数据时效声明**：GitHub star/issue 数抓取于 2026-09-24（GitHub API）；引用数来自 Google Scholar（scholar 插件，2026-09-24），OpenAlex 对 arXiv 论文的引用覆盖严重不全（SICA 仅 1 条），已弃用；Semantic Scholar 全程 429 限流未采信。HN 讨论数据来自 Algolia HN API。
