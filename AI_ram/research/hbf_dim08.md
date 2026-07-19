# 维度 08：大模型打分评价体系与用户关心指标（2024–2026）

> 调研范围：模型质量评测维度、推理服务性能指标、不同用户角色的指标偏好、评测方法论争议、业界选型打分框架。
> 方法：26 次独立检索（学术基准、服务指标、争议、选型框架等）+ 2 次官网直开（Artificial Analysis 方法论页、OpenRouter Rankings 页）。检索/访问日期：2026-07。
> 引用格式：正文 [^n^] 内联标注，文末附原文摘录、URL、日期与置信度（高/中/低）。

---

## Key Findings

1. **质量评测呈"双层结构"且快速换代**：知识/推理层（MMLU→MMLU-Pro、GPQA Diamond、AIME、HLE）+ 能力层（代码 SWE-bench Verified/LiveCodeBench、指令遵循 IFEval/IFBench、幻觉 SimpleQA、安全 HarmBench/AILuminate、Agent τ-bench/OSWorld/Terminal-Bench、长上下文 RULER/LongBench）。老一代基准（MMLU、GSM8K、HumanEval、NIAH）在 2024–2026 相继饱和或被证实污染，业界已转向"更难/抗污染/私有 holdout"的继任基准（置信度：高）[^15^][^16^][^48^]。
2. **服务性能指标已标准化为 TTFT / ITL(TPOT,TBT) / E2E / 吞吐 / goodput / SLO 达成率 / 每 token 成本 / MFU 八件套**：TTFT 决定"响应感"、ITL 决定"流畅感"、goodput（SLO 约束下的有效吞吐）直接决定每查询成本；典型交互 SLO 为 TTFT < 0.5–2s、TBT/TPOT 50–100ms，语音 Agent 场景 LLM TTFT 预算 ≈600ms（置信度：高）[^1^][^3^][^4^][^5^][^6^]。
3. **不同角色关心不同指标**：终端用户关心感知延迟（TTFT、流式速度是否超过 ~5–15 tok/s 阅读速度）；平台运营关心 goodput/吞吐/MFU/每 token 成本（成本对负载极敏感，同 GPU 同模型可差 17.5–36 倍）；开发者/选型者关心任务匹配的质量分与成本-质量-速度 Pareto（置信度：高）[^2^][^11^][^12^][^41^]。长上下文场景额外引入 **KV 命中率 / prefix cache 命中率**（生产 RAG 场景 40–70%、多轮对话 20–40%），命中率直接换算为 TTFT 与成本（置信度：中高）[^44^][^45^][^47^]。
4. **评测方法论三大争议——污染、Arena 偏差、Goodhart——均有实锤证据**：污染影响"可能比模型报告声称的大得多"（ConTAM）；Arena 存在冗长/markdown 风格偏差（长度是主导混淆因子，回归系数 0.249–0.267）与私下多版本刷榜（The Leaderboard Illusion：Meta 测了 27 个 Llama-4 变体只公布最高分，选择性披露可虚增约 112%）；Goodhart 定律表现为刷榜代替真能力，缓解手段是私有黄金集 + 动态基准 + 多信号交叉（置信度：高）[^22^][^33^][^36^][^39^]。
5. **业界选型已收敛到"quality–speed–price"三轴 + 用量信号**：Artificial Analysis 用 8–10 个基准合成 Intelligence Index，并定义混合价（7:2:1 缓存命中:输入:输出）、Cost per Task、TTFT/输出速度/E2E 等客户体验指标；OpenRouter 用真实 token 消耗量排名（需求侧信号）；GDPval-AA、Arena 等提供偏好侧信号——多源交叉而非单一榜单是 2026 年的主流实践（置信度：高）[^41^][^42^][^43^][^50^]。

---

## 质量维度

### 1. 学术基准地图与"饱和→换代"路径

**知识/推理核心基准（2026 现状）**

| 基准 | 测什么 | 现状（2026） | 继任者 |
|---|---|---|---|
| MMLU（57 学科 4 选 1，~16k 题） | 广博知识 | 已饱和（前沿 88–94%）[^48^] | MMLU-Pro、HLE |
| MMLU-Pro（12,032 题、14 类、10 选 1） | 更难、偏推理的知识 | 前沿 86–89%，开始现饱和迹象 | HLE |
| GPQA Diamond（198 题研究生级 4 选 1） | 专家级科学推理 | 仍在爬升（40%→~80%+，18 个月） | SuperGPQA、HLE |
| GSM8K / MATH | 数学推理 | 饱和（98%+ / 80%+），GSM8K 被证实污染 | AIME 2025、FrontierMath、MATH-500 |
| HumanEval / MBPP（164 题） | 代码生成 | 饱和+污染 | SWE-bench Verified、LiveCodeBench、BigCodeBench |
| HLE（Humanity's Last Exam，2,684 题） | 专家级开放作答 | 前沿 ~53%（带工具），远未饱和 | — |

- MMLU 饱和与换代：未来 AGI 词典的"饱和替换表"明确将 MMLU 标为"Saturated (92-95% frontier)，Label noise caps headroom"，继任者为 GPQA Diamond / MMLU-Pro / HLE[^15^]；tokonomics 指出"MMLU is now largely saturated at the frontier (88–94%), and GPQA Diamond and SWE-bench are becoming the preferred differentiators"[^48^]。
- GPQA 设计：448 道生物/物理/化学多选题，PhD 专家准确率仅 65%，允许上网的非专家仅 34%（"Google-proof"），Diamond 子集 198 题[^17^]。
- MMLU-Pro 设计：12,032 题、14 领域、10 选项（随机基线从 25% 降到 10%），过滤琐碎/噪声题，24 种 prompt 风格下仅 2% 方差（MMLU 为 4–5%）；关键发现是 CoT 在 MMLU-Pro 上显著有效而在 MMLU 上无效，证明其真的考推理[^18^]。
- Lambda Finance 给出的"多大差距才算数"校准：Arena ELO >20 分、MMLU >2pp、HumanEval >3pp、MATH >2pp、GPQA Diamond >4pp 才有意义，CI 重叠即不可区分[^49^]。

**人类偏好基准（Arena/ELO 系）**

- 机制：盲测两两对比投票，2023 年底起从在线 Elo 迁移到 Bradley-Terry 最大似然模型，产出置信区间；2026 年文本榜前沿约 1450–1560 分，累计 600 万+ 票[^21^]。
- 风格控制（Style Control）：2024-08 LMSYS 将回答长度、markdown 标题/加粗/列表数作为协变量加入 Bradley-Terry 回归；**长度是主导风格因子**（系数 0.249–0.267），控制后 GPT-4o-mini、Grok-2-mini 明显下滑，Claude 3.5 Sonnet、Llama-3.1-405B 显著上升[^22^]。
- 分榜单实践：Overall / Style-Controlled / Hard Prompts / Coding / Math / Creative Writing；hard-prompts 榜区分度最高；20 分以内差距≈掷硬币[^23^]。

**长上下文基准**

- NIAH（大海捞针）：单针检索已到 1M token 饱和，"single-needle retrieval no longer measures real long-context reasoning"，继任为 RULER、LongBench v2、BABILong[^15^]。
- RULER（NVIDIA，2024-04）：13 个任务 4 大类（检索 S/MK/MV/MQ-NIAH、多跳变量追踪 VT、聚合 CWE/FWE、抗干扰 QA），4K–128K 六档长度；结论是所有宣称 32K+ 的模型在 vanilla NIAH 满分但随长度性能大跌，仅 4 个模型在 32K 保持满意表现[^19^]。
- LongBench（清华/智谱，2023-08）：首个双语多任务长上下文基准，21 个数据集、6 大任务类（单文档 QA、多文档 QA、摘要、few-shot、合成任务、代码补全），英文平均 6,711 词[^20^]；v2 进一步提高难度与抗污染性[^15^]。

### 2. 幻觉/事实性评测体系

- **TruthfulQA**（817 题，针对"人类常见误解"）：已饱和且被 HalluLens 作者实测出严重问题——约 25% 被 MC1 判错的回答其实事实正确，且含错误/过时金标；"TruthfulQA is primarily a factuality benchmark and is not easily adaptable to serve as a hallucination benchmark"[^24^]。
- **SimpleQA**（OpenAI，2024 末；4,326 短事实题）：指标为 correct、correct-given-attempted（其倒数≈幻觉率）与 F-score；GPT-4o/Claude-3.5 发布时 <40%，且模型过度自信、不肯弃答[^24^]。**SimpleQA Verified**（Google DeepMind，2025-09）经去重、主题平衡、多源核验清洗出 1,000 题，Gemini 2.5 Pro F1 55.6 居首[^25^]。
- **HalluLens**（2025-04）：区分内在幻觉（与输入矛盾）与外在幻觉（无输入依据、难以验证），并指出静态幻觉测试集极易被新训练数据吞没，采用动态生成测试集防泄漏[^24^]。
- 事实性评测四分法（SimpleQA Verified 综述）：grounding 评测（对给定上下文的事实性，如 FACTS Grounding）、检索增强评测（FreshQA/RealtimeQA/CRAG）、长文本事实性（LongFact/FELM/VeriScore）、参数化事实性（TriviaQA/NQ/TruthfulQA→SimpleQA 一脉）[^25^]。

### 3. 指令遵循评测体系

- **IFEval**（Google，2023）：用"可程序化验证"的指令（如"输出编号列表""只写一句话"）做客观 0/1 判分，"offering a measure of LLM performance without subjective AI or human judgement"[^27^]；衍生 M-IFEval（法/日/西多语，2025-02）发现不同语言×指令类型表现差异巨大[^27^]。
- **IFBench**（Artificial Analysis）：294 题，测单轮精确合规（计数、格式、字符操作），已进入 AA Intelligence Index[^42^]。
- MT-Bench/AlpacaEval 因"verbosity bias + judge-model leakage"被 Arena-Hard-Auto、WildBench 取代[^15^]。

### 4. 推理与前沿能力评测

- 推理旗舰组合（2026）：GPQA Diamond（科学）、AIME 2025（竞赛数学，30 题整数答案）、HLE（2,684 题专家级开放作答，带工具前沿 ~53%）[^16^][^42^]。
- BBH/BBEH、ARC-AGI-2（私有 holdout）、FrontierMath 用于抵抗饱和与污染[^15^]。
- 推理评测的"推理预算"披露争议：数学推理综述要求每个分数附带采样数 k、选择机制（greedy/majority/PRM/执行）与每题 token 成本，否则"90% on MATH"可含 20pp 歧义（pass@1 vs best-of-256）[^270^→见 51]。

### 5. 安全/红队评测体系

- **HarmBench**（ICML 2024）：400 个有害行为、7 大类、18 种攻击方法、33 个模型；头条指标 ASR（攻击成功率）[^26^]。
- **JailbreakBench**（2024）：100 个有害行为 + 100 个良性行为 + 越狱 artifact 仓库与榜单，聚焦纯 prompt 攻击的可复现性[^26^]。
- **AILuminate**（MLCommons，2024-12）：12 个危害类别、24,000 条评测 prompt，输出五级评级（Excellent→Poor）而非单一 ASR，面向采购/非技术干系人，被称为"安全界的 MLPerf"[^26^]。
- 其他：AdvBench（500 有害行为）、WildJailbreak（大规模 vanilla/adversarial 对，兼测过拒）[^26^]。

### 6. Agent 能力评测体系

- 五大核心基准（不可合并为单一排名）：SWE-bench Verified（500 真实 GitHub issue，Claude Opus 4.7 87.6% 领先）、GAIA（多步工具使用）、τ-bench/τ2-bench（165 客服任务，零售+航空，指标为 pass^k 一致性与政策合规）、WebArena（812 任务，人类基线 ~78%）、OSWorld（369 真实桌面任务）[^28^][^29^]。
- Agent 评测的五个"真信号"指标：**latency p50/p95、accuracy（任务成功率）、cost per task、N-run reliability（同任务 5–10 次重复成功率）、tool-use success rate**；"A 90% single-run accuracy can mean 60% reliability on repeated attempts"[^28^]。
- AgentBench（清华 THUDM）：8 环境 1,091 任务；Terminal-Bench（89 Docker 隔离 shell 任务）；注意 2026-04 UC Berkeley/RDI 演示 8 大 Agent 基准全部可被 reward hack 到 ~100%，建议用第三方复现分 + 自有 holdout[^28^][^29^]。

### 7. 综合/动态评测框架

- **HELM**（Stanford CRFM）：同时评 7 个维度——accuracy、calibration、robustness、fairness、bias、toxicity、efficiency——输出多维画像而非单一分[^30^]。
- **LiveBench**（2024-06 起）：每月更新题目（新数学竞赛、arXiv 论文、新闻），客观 ground truth 自动判分、不用 LLM judge，头部模型 <70%，定位"contamination-limited"[^31^]；LiveCodeBench 以时间戳滚动采集竞赛题抗污染[^15^]。
- **GDPval-AA**（Artificial Analysis，2026）：1,320 个覆盖 44 职业、9 大 GDP 行业的真实经济价值任务，同样用 Bradley-Terry 拟合，是 Arena 之外的"经济价值偏好榜"[^50^]。

---

## 服务性能维度

### 1. 延迟指标族（定义已标准化）

- **TTFT（Time To First Token）**：从请求到达到首个输出 token 的时延，含排队调度延迟 + prefill 时间；"Minimizing TTFT is crucial for real-time interactions"，离线批处理可放宽[^1^]。注意：prefill 是算力瓶颈且随 prompt 长度伸缩，"Any TTFT figure quoted without a prompt length attached is close to meaningless"[^2^]。
- **ITL / TBT（Inter-Token Latency / Time Between Tokens）**：decode 阶段相邻 token 间隔，决定流式流畅感；TPOT 是其均值形式（总 decode 时间/输出 token 数）[^1^]。TBT 比 TPOT 更严格："under a TPOT SLO, a request violates the SLO when its average per-token latency exceeds the target, whereas under a TBT SLO, each token exceeding that latency constitutes a violation"[^8^]。
- **E2E 延迟 / TTLT**：完整请求端到端时延（调度+prefill+decode），代码补全等"部分输出无价值"场景必须看 TTLT[^60^→见 52]。AA 定义了更细的 Time to First Answer Token（推理模型排除 thinking 段）与 Total Response Time[^41^]。
- **Normalized Latency**：总执行时间/decode token 数，用于在指定 QPS 下比较系统吞吐[^1^]。
- **Capacity**：满足延迟 SLO 前提下系统可承受的最大 QPS；"Higher capacity is desirable because it reduces the cost of serving"[^1^]。

### 2. 典型 SLO 数值（业界惯例）

- **TTFT**：<500ms 优秀（用户感到即时）、500ms–2s 可接受、>3s 用户开始流失[^3^]；"users notice when nothing appears for more than 1-2 seconds"[^71^→见 53]。学术评测常用 TTFT < 2s 作 SLO 约束[^6^]；SGLang 生产指南告警线 p95 > 2s[^45^]。
- **语音 Agent 的 TTFT 预算更苛刻**：1 秒话轮预算 = STT 端点检测 ~150ms + LLM TTFT + TTS TTFT ~150ms + 起播，"If LLM TTFT exceeds ~600 ms, the user perceives the agent as slow regardless of model quality"[^4^]。
- **ITL/TBT/TPOT**：对齐人类阅读速度。平均英语阅读 250 词/分钟 ≈ 6 tok/s 是下限[^1^]；5–15 tok/s 覆盖阅读速度，Agent/流水线场景需要远高于此[^2^]；60ms ITL ≈ 16 tok/s"smooth typing"[^3^]。学术 SLO 常用 TBT 50ms（8B）/100ms（70B）[^7^]、TPOT < 0.08s[^6^]；消费速度默认值 20 tok/s（smooth goodput 论文）[^9^]。
- 尾部指标：SLO 达成率通常按 P90/P99 尾部评估（如 90% 达成率）[^5^][^7^]。

### 3. 吞吐、goodput 与 SLO 达成率

- **吞吐（Throughput）**：全系统聚合 tokens/s（或 tokens/s/GPU），反映原始产能，"the total number of tokens generated per second irrespective of latency or SLO attainment"[^6^]；交互 UX 下"throughput matters only after TTFT is acceptable"[^4^]。
- **Goodput（有效吞吐）**：DistServe（OSDI 2024）定义——"the maximum request rate that can be served adhering to the SLO attainment goal (say, 90%) for each GPU provisioned — higher per-GPU goodput directly translates into lower cost per query"[^5^]。DOPD 采用 SLO 约束版定义（TTFT<2s 且 TPOT<0.08s 下成功交付的 token 速率）[^6^]。
- 实证：13B 模型在 A100 上、90% SLO 达成率下，共置（colocation）系统 per-GPU goodput 仅 1.6 rps，prefill/decode 分离后整体 10 rps（2.1×），差距来自两阶段干扰[^5^]；PD 聚合与分离各有 SLO 短板（16s/60ms 下分离 98% vs 聚合 7%；5s/250ms 下反转 97% vs 42%）[^65^→见 54]。
- 吞吐-延迟权衡：纯吞吐最大化与 SLO 不可兼得，故出现 smooth goodput（按用户消费速度 20 tok/s 平滑计量）等修正指标[^9^]。

### 4. 成本指标

- **每 token 价格（$/M tokens）**：API 价目呈"LLMflation"——a16z 测算自 2021 年起推理成本每年降 ~10×，同等性能从 2021-11 的 $60/M tokens 降到 ~$0.06（4 年 1000×）[^11^]；GPT-4 发布价 $30/$60（2023-03）→ GPT-5 $1.25/$10（2025-08），三年等效降 ~95%[^11^]。
- **成本对负载极度敏感**：同一 H100 + Mixtral 8x7B，1 rps 时 $15.25/M tokens、25 rps 时 $0.87——17.5–36.3× 的成本带宽，"the dominant term in the cost equation, and it is invisible to every production cost calculator"[^12^]；10% 负载会把 $13/MTok 变成 $130/MTok[^12^]。
- **推理模型溢价**：o1-pro $150/$600 per M input/output tokens；用户侧多为订阅制，思考成本由服务商吸收，构成运营侧风险[^13^]。
- **缓存感知定价**：AA 定义 Blended Price 按 7:2:1（缓存命中:输入:输出）加权；Cost per Task = 实际 token 消耗 × 分项价格 ÷ 任务数——"models that produce longer answers or more reasoning tokens will have a higher cost per task, even at identical per-token prices"[^41^]。

### 5. 效率指标：MFU

- 定义：MFU = 实际达成的模型 FLOPs/s ÷ 硬件峰值 FLOPs/s（PaLM 论文推广）；训练口径 per-token FLOPs ≈ 6N，只计模型固有矩阵运算，便于跨硬件比较[^10^]。
- 典型区间：大规模训练 35–45%（CoreWeave、Lambda；Llama 3.1 报 38–43% on H100）[^10^]；推理侧 prefill 30–50%、**decode 仅 8–12%**（访存瓶颈的 roofline 上限，非优化不力）；朴素 eager PyTorch 仅 3–8%[^10^]。
- 警示：MFU 是诊断指标不是优化目标，"A run with 70% MFU and broken convergence is not preferable to a run with 35% MFU and stable training"；同一 H100 上同一模型可从 15% 到 60% 不等，取决于软件栈[^10^]。

---

## 用户视角指标

### 1. 角色差异

| 角色 | 首要指标 | 说明 |
|---|---|---|
| 终端用户 | TTFT、流式速度（ITL/输出 tok/s）、E2E | "TTFT is what users perceive as responsiveness…In a voice agent, it's dead air"[^2^]；>3s 无输出即流失[^3^]；流式速度须超过 ~5–15 tok/s 阅读速度[^2^] |
| 应用/产品开发者 | 任务匹配质量分（自有 eval + 任务基准）、成本-质量-速度 Pareto、E2E 与成本/任务 | 选型看"2–3 个匹配场景的基准而非 16 个"，指标预先承诺（latency p50/p95、accuracy、cost/task、N-run reliability、tool-use success）[^28^] |
| 平台运营/SRE | goodput、聚合吞吐、SLO 达成率（P90/P99）、GPU 利用率/MFU、每 token 成本曲线、KV 命中率 | goodput→cost per query[^5^]；成本随负载 17.5–36× 摆动，容量规划必须画成本曲线[^12^] |
| 采购/管理层 | 综合质量-价格-速度指数、安全评级（AILuminate 五级）、TCO | AA Intelligence Index + Blended Price + Output Speed 的三角图[^41^][^42^]；AILuminate 五级标签面向非技术干系人[^26^] |

- 指标冲突实例："A provider with 2,000 tok/s throughput but 4 seconds of TTFT will feel slow in chat. A provider with 200 ms TTFT but 30 tok/s throughput will feel snappy at first and stall on long answers. Measure both, then map to your product's conversational budget."[^4^]

### 2. 长上下文场景的额外指标

- **KV cache / prefix cache 命中率**：前缀共享（系统提示、RAG 文档、多轮历史、工具 schema）的 KV 复用比例，直接换算 TTFT 下降与 prefill 成本节约。SGLang NeurIPS 2024 论文报告各基准命中率 50–99%，cache-aware 调度达理论最优的 96%，吞吐最高 6.4×[^46^]。
- 生产命中率量级：固定文档库 RAG 40–70%、持久会话多轮聊天 20–40%、独特上下文代码补全 <10%[^47^]；Agentic 多轮场景可达 75–95%[^45^]。
- 命中率↔TTFT 换算（80% 前缀重叠、并发 50）：重叠 20%/40%/60%/80%/95% → 命中率 ~28%/54%/71%/84%/93% → TTFT 相对下降 ~7%/15%/24%/37%/44%[^44^]。
- 监控实践：Prometheus 指标 `sglang_cache_hit_rate`（<30% 告警——检查系统提示是否逐字节一致，"Even a single character difference creates a full cache miss"）、`sglang_token_usage`（KV 填充率 >85% 告警）、TTFT p95>2s 告警、多副本需会话亲和避免冷缓存[^45^]。
- 选型规则："If more than 60% of your requests share a common prefix…RadixAttention delivers measurably lower latency"；低于 40% 重叠收益边际[^44^]。
- 定价侧呼应：缓存命中 token 价格显著低于普通输入 token，AA 混合价直接以 7:2:1 缓存:输入:输出建模[^41^]。

### 3. 业界如何做模型选型打分（quality–speed–price 框架）

- **Artificial Analysis**：Intelligence Index = 8 个基准等权合成（v3 口径：MMLU-Pro、HLE、GPQA Diamond、AIME 2025、SciCode、LiveCodeBench、IFBench、AA-LCR 长上下文推理；后续加入 Terminal-Bench Hard、τ2-Bench Telecom 等 Agentic 项）[^42^]。性能侧定义 TTFT、Time to First Answer Token、Output Speed（首个 token 后的 tok/s）、E2E Response Time、100-token 合成响应时间；价格侧 Blended Price（7:2:1）与 Cost per Task[^41^]。定位："benchmark results are not intended to represent the maximum possible performance on any particular hardware platform, they are intended to represent the real-world performance customers experience across providers"[^41^]。
- **OpenRouter Rankings**：按真实 token 消耗量排名（Top Models 周榜、按任务的花费份额榜、工具调用榜），"Live LLM rankings based on benchmarks and real data from millions of people using models through OpenRouter"[^43^]；学术研究证实其提供每模型日级 prompt/completion token 数据（自 2025-01-11 起，296 个模型），是需求侧（"人们实际用什么"）信号，与基准分（能力侧）互补[^43^]。
- **偏好侧**：Chatbot Arena / GDPval-AA 提供 Bradley-Terry 偏好 Elo[^21^][^50^]。
- **实践共识**：单一榜单不足信；"a model that ranks well on both Chatbot Arena and an objective benchmark for your use case is a safer bet than one that wins only on Arena"[^21^]；运营侧再叠加 OpenRouter 用量/价格信号与自有黄金集回归[^39^]。

---

## 争议

### 1. 基准污染（Data Contamination）

- 定义与危害：测试集混入训练语料导致"training on the test set"，分数虚高且难以解释；"contamination may have a much larger effect than reported in recent LLM releases"（ConTAM，13 基准 × 7 模型大规模研究）[^33^]。
- 检测方法谱系：白盒（13-gram/40-gram 重叠——GPT-3/GPT-4 口径、embedding 相似度）、灰盒（Min-K% Prob、CDD 输出分布尖峰）、黑盒（成员推理攻击 MIA、quiz/引导复述、DyePack 后门染料）[^32^][^34^]；局限：n-gram 漏掉语义改写、需训练数据访问、对微调期污染失效[^32^]。
- 合成数据时代的四级污染：token 级原样、改写级、语义近邻、推理模式级——后两者传统 n-gram 完全失效[^278^→见 55]。
- LLM-as-judge 特有的"偏好泄漏"：数据生成器与裁判模型同源时，裁判对"学生模型"系统性偏袒，AlpacaEval 2.0 与 Arena-Hard 上普遍存在且比长度偏见更隐蔽[^38^]。
- 厂商自陈：Phi-4 技术报告承认 n-gram 去污染"not effective against all scenarios, including rephrasing"，并指出基准另三宗罪——技能面窄、judge 偏风格、选择题可蒙；为此自建原创 PhiBench[^35^]。
- 工程缓解：动态/滚动基准（LiveBench 月度更新、LiveCodeBench 时间戳采集）、私有 holdout（ARC-AGI 2、HLE）、内部黄金集绝不公开[^15^][^31^][^39^]。

### 2. Arena 偏差与可被操纵性

- **风格/冗长偏差**：人类投票系统性偏好更长、markdown 更重的回答；长度是主导混淆（BT 回归系数 0.249–0.267），Style Control 后前排重排 1–3 位[^22^][^23^]。
- **私下多版本刷榜（The Leaderboard Illusion, Singh et al. 2025）**：少数大厂可在发布前私下测试多个变体并撤回低分——"27 private LLM variants tested by Meta in the lead-up to the Llama-4 release"，选择性披露导致"biased Arena scores"；作者估算额外数据访问可带来最高 112% 的分数提升[^36^]。Karpathy 直言实验室在"overfitting to Arena rankings"[^36^]。
- **刷票/对抗操纵**：学术复现证明可通过针对性投票操纵排名（vote rigging）[^37^]；厂商社区拉票（brigading）已被平台反作弊治理，但"headline number is broadly trustworthy at the 50-100 Elo-point granularity, less so at the 10-30 point granularity"[^23^]。
- **聚合掩盖异质性**：Elo 聚合掩盖了不同任务上的能力差异，且评测 query 偏向极简单/极客观问题，"ties are driven more by intrinsic query properties than by model capability"；偏好评测优先"感知有用性"，对事实正确性、诚实、安全约束很弱[^40^]。
- 投票者结构：英语主导、美欧倾斜、专业度参差；投票者按人数加权，"A prompt engineer who runs 1,000 votes contributes 1,000 data points; a regulated-industry buyer who runs zero contributes zero"[^23^][^386^→见 56]。

### 3. Goodhart 定律（指标即目标）

- 表现形态：数据污染、RLHF 针对性训练成"基准偏好的风格"、format gaming、judge hacking（更长更自信加 emoji 骗裁判）、选择性提交——"Berkeley RDI 长期警告 leaderboard overfitting"[^39^]。
- 机制：即使无人作弊，"每个团队都按基准选模型/调超参"的发表反馈环也会让基准泄漏进开发决策，形成系统性过拟合；检验法是外部验证——MMLU 涨但 BIG-bench/自然偏好不涨即疑似 gaming[^39^]。
- 后果：榜单顶部挤成一团、统计上不可区分（saturation），"MMLU, MATH, and HumanEval are all within 6 percentage points of their theoretical ceilings"[^49^]；多模态综述呼吁多指标框架 + 保密部分测试集 + 定期换题[^152^→见 57]。
- 缓解共识："no single evaluation metric should be trusted in isolation"——私有黄金集 + 真实流量采样评估（1–5% 生产 trace 持续评分）+ 多基准交叉 + 公开全部私下测试结果（Hooker 建议）[^28^][^36^][^39^]。

### 4. 分数↔实际体验的鸿沟

- 基准高分手感差与反向案例并存："A model can score highly on benchmarks but have mediocre Arena Elo…The reverse is also true"[^67^→见 58]；"you often see a model score 95% on a benchmark but fail to write a simple script in your IDE"[^39^]。
- 选型含义：把公开榜单当初筛、把私有 eval + 生产观测当终裁；关注推理预算透明度（pass@1 vs best-of-k）与 harness/脚手架披露，否则跨厂商分数差数个百分点纯属噪声[^18^][^51^]。

---

## 参考引用（含原文摘录 / URL / 日期 / 置信度）

[^1^] **Etalon: Holistic Performance Evaluation Framework for LLM Inference Systems**（arXiv:2407.07000，2024-07；置信度：高）。"TTFT…is the latency between the request arrival and the first output token generated…Minimizing TTFT is crucial for real-time interactions…TBT…If we assume the average English reading speed is 250 words per minute then a TBT of roughly 6 tokens per second is required…TPOT…is the average time to generate an output token in the decode phase…Capacity: the maximum request load (queries-per-second) a system can sustain while meeting certain latency targets (SLOs)…reduces the cost of serving." https://arxiv.org/pdf/2407.07000

[^2^] **AI Inference Latency Explained: TTFT, TPS, and How to Optimize Them**（General Compute，2026-06-12；置信度：中）。"TTFT is what users perceive as responsiveness. In a chat UI, it's the gap before text starts appearing. In a voice agent, it's dead air…Any TTFT figure quoted without a prompt length attached is close to meaningless…roughly 5 to 15 TPS covers human reading; agents and pipelines benefit from far more." https://www.generalcompute.com/blog/ai-inference-latency-explained-ttft-tps-and-how-to-optimize-them

[^3^] **NVIDIA aiperf: Benchmark LLM Inference (TTFT, ITL, Throughput)**（Luca Berton blog，2026-04-22；置信度：中）。"Under 500ms: Excellent — users perceive instant response; 500ms - 2s: Acceptable for most applications; Over 3s: Users start abandoning…At 60ms ITL, text appears at roughly 16 tokens/second — fast enough to feel like smooth typing." https://lucaberton.com/blog/nvidia-aiperf-llm-inference-benchmarking-guide/

[^4^] **Fastest LLM Inference APIs in 2026: A Developer's Guide to TTFT and Throughput**（Inworld AI，2026-05-28；置信度：中）。"For interactive UX, throughput matters only after TTFT is acceptable…If LLM TTFT exceeds ~600 ms, the user perceives the agent as slow regardless of model quality…A provider with 2,000 tok/s throughput but 4 seconds of TTFT will feel slow in chat." https://inworld.ai/resources/fastest-llm-inference-api

[^5^] **DistServe: Disaggregating Prefill and Decoding for Goodput-optimized LLM Serving**（arXiv:2401.09670，2024-01，OSDI 2024；置信度：高）。"maximize per-GPU goodput, defined as the maximum request rate that can be served adhering to the SLO attainment goal (say, 90%) for each GPU provisioned — higher per-GPU goodput directly translates into lower cost per query…Under the SLO attainment of 90%, the maximum achievable goodput on a single A100 GPU…is about 1.6 requests per second (rps)…we can effectively serve the model with an overall goodput of 10 rps…2.1x higher than existing systems." https://arxiv.org/pdf/2401.09670v2

[^6^] **DOPD: A Dynamic PD-Disaggregation Architecture for Maximizing Goodput in LLM Inference Serving**（arXiv:2511.20982，2025-11；置信度：高）。"Goodput: the rate of useful tokens successfully delivered per unit time under SLO constraints (TTFT < 2s and TPOT < 0.08s)…Throughput: the total number of tokens generated per second irrespective of latency or SLO attainment." https://arxiv.org/html/2511.20982v1

[^7^] **MuxWise: Towards High-Goodput LLM Serving with Prefill-decode Multiplexing**（arXiv:2504.14489v3，2025-04；置信度：高）。"TBT accounts the latency of each individual token, whereas TPOT is an average metric that may mask the poor performance of some tokens…We set the TBT SLO target to 50ms for Llama3-8B and 100ms for Llama3-70B, following prior works." https://arxiv.org/html/2504.14489v3

[^8^] **SLO Metrics 综述段落**（arXiv:2601.10729，2026-01；置信度：中）。"In LLM serving, time-to-first-token (TTFT) and time-per-output-token (TPOT) are common SLO metrics…For the same latency target (e.g., 50 ms per token), under a TPOT SLO, a request violates the SLO when its average per-token latency exceeds the target, whereas under a TBT SLO, each token exceeding that latency constitutes a violation." https://arxiv.org/pdf/2601.10729

[^9^] **Revisiting SLO and Goodput Metrics in LLM Serving**（arXiv:2410.14257，2024-10；置信度：高）。"We use the smooth goodput to evaluate the performance of LLM serving…with a default information consumption speed of 20 tokens per second." https://arxiv.org/html/2410.14257v1

[^10^] **MFU 多来源**：Lambda《MFU》白皮书（无日期；置信度：高）"MFU = Observed FLOPS / Peak Theoretical FLOPS…In practice, MFU for production-scale LLM training typically ranges between 35-45%" https://lambda.ai/hubfs/4.%20Resources/White%20Papers/Lambda%20MFU.pdf ；ZeroEntropy MFU 概念页（无日期；置信度：中）"Inference prefill: 30-50 percent…Inference decode, batch 32: 8-12 percent — capped by the bandwidth-bound ridge…Decode-step inference loads the full weight tensor per token (memory-bound)" https://zeroentropy.dev/concepts/mfu/ ；arXiv:2602.20164（2026；置信度：中）"the recent training of Llama 3.1 reported achieving an MFU of 38-43% on clusters of NVIDIA H100 GPUs"；TechnoLynx（2026-05-10；置信度：中）"MFU is a useful efficiency metric, not a target to maximise…A run with 70% MFU and broken convergence is not preferable to a run with 35% MFU and stable training." https://www.technolynx.com/post/model-flops-utilization-training-efficiency

[^11^] **Cloud and AI Infrastructure Cost Optimization: A Comprehensive Review**（arXiv:2307.12479v2，2026-01-26；置信度：中）。"LLM inference costs have decreased by approximately 10x annually since the public introduction of GPT-3 in 2021…What cost $60 per million tokens in November 2021 now costs approximately $0.06 per million tokens…GPT-4 in March 2023, pricing stood at $30/$60 per million tokens…GPT-5 in August 2025 at $1.25/$10…approximately a 95% reduction in costs for equivalent model capabilities over the three-year period." https://arxiv.org/html/2307.12479v2

[^12^] **A Concurrency-Awareness Methodology for LLM Infrastructure Cost Estimation**（arXiv:2606.11690，2026-06-09；置信度：中）。"At 1 request/second on an H100, a Mixtral 8x7B FP16 deployment costs $15.25 per million tokens—more expensive than Claude Sonnet 4.6. At 25 rps, the same hardware costs $0.87…a 17.5–36.3× cost ratio…a GPU at 10% load transforms a $13/MTok cost into $130/MTok." https://arxiv.org/html/2606.11690v1

[^13^] **OverThink: Slowdown Attacks on Reasoning LLMs**（arXiv:2502.02542，2025-02；置信度：中）。"GPT o1-pro costs $150 per million input tokens and $600 per million output tokens…user-facing applications like ChatGPT, Copilot…offer free or fixed-cost access…insulating users from the underlying token-based pricing." https://arxiv.org/html/2502.02542v4

[^14^] **HealthProcessAI 定价表**（arXiv:2508.21540，2025-08；置信度：中）。"Token pricing is reported per 1 million input/output tokens as of August 2025"：Claude Sonnet-4 $3.00/$15.00；GPT-4.1 $10.00/$30.00；Gemini 2.5 Pro $1.25/$5.00；DeepSeek R1 $0.55/$2.19。https://arxiv.org/pdf/2508.21540

[^15^] **LLM Benchmarks: Definition, Examples & FutureAGI Guide**（FutureAGI，2026-05-07；置信度：中）。饱和替换表："MMLU | Saturated (92-95% frontier) | GPQA Diamond, MMLU-Pro, HLE…HumanEval | Saturated, contaminated | SWE-Bench Verified, Aider Polyglot, LiveCodeBench…MT-Bench | Saturated + judge bias | Arena-Hard-Auto, WildBench…Needle-in-a-Haystack | Saturated to 1M tokens | RULER, LongBench v2, BABILong." https://futureagi.com/glossary/llm-benchmarks/

[^16^] **LLM Benchmarks Compared: MMLU, HumanEval, GSM8K and More (2026)**（LXT，2026-05-19；置信度：中）。15 基准表："GPQA Diamond…Gemini 3.1 Pro — 94.3% | Approaching…SWE-bench Verified…Claude Opus 4.6 — 80.8% | No…LiveCodeBench…Qwen3.5-plus — 83.6% | No…HLE…Claude Opus 4.6 — 53.1% (with tools) | No." https://www.lxt.ai/blog/llm-benchmarks/

[^17^] **GPQA: A Graduate-Level Google-Proof Q&A Benchmark**（arXiv:2311.12022，2023-11；经 Gabor Melli 知识库转述，2026-07-13 更新；置信度：高）。"448 multiple-choice questions crafted by domain experts in biology, physics, and chemistry…experts achieving an accuracy of only 65%…non-expert validators, despite having unrestricted web access…only reached a 34% accuracy rate…GPT-4 based baseline model achieved a 39% accuracy…the diamond set (198 questions)." http://www.gabormelli.com/RKB/Graduate-Level_Google-Proof_Q%26A_(GPQA)_Benchmark

[^18^] **MMLU-Pro（TIGER-Lab，NeurIPS 2024，arXiv:2406.01574）**，经 Benchgen（2026-06-19）与 id8.co.in（2026-06-23）转述；置信度：高。"12,032 questions across 14 academic domains, each with 10 answer choices instead of 4…reducing the chance of guessing correctly from 25% to 10%…measured only 2% variance across 24 different prompt styles, compared to 4-5% variance on the original MMLU…Chain-of-Thought reasoning improves performance on MMLU-Pro but has negligible or negative effects on the original MMLU." https://benchgen.com/benchmarks/tiger-ai-lab-university-of-waterloo/mmlu-pro

[^19^] **RULER: What's the Real Context Size of Your Long-Context Language Models?**（arXiv:2404.06654，2024-04；置信度：高）。"We evaluate ten long-context LMs with 13 representative tasks in RULER. Despite achieving nearly perfect accuracy in the vanilla NIAH test, all models exhibit large performance drops as the context length increases…only four models…can maintain satisfactory performance at the length of 32K." https://arxiv.org/pdf/2404.06654v1

[^20^] **LongBench: A Bilingual, Multitask Benchmark for Long Context Understanding**（arXiv:2308.14508，2023-08（v2 2024-06）；置信度：高）。"LongBench comprises 21 datasets across 6 task categories in both English and Chinese, with an average length of 6,711 words (English)…single-doc QA, multi-doc QA, summarization, few-shot learning, synthetic tasks, and code completion." https://arxiv.org/abs/2308.14508

[^21^] **The $1.7B Benchmark: How LMArena's 6 Million Human Votes Are Reshaping AI Model Rankings**（AgentMarketCap，2026-04-06；置信度：中）。"Arena migrated to the Bradley-Terry (BT) model…runs a maximum-likelihood estimation over the entire history of all battles…The canonical methodology paper (arXiv 2403.04132)…As of March 2026, the text leaderboard top five reads roughly: Claude Opus 4.6 (Elo ~1504)…"；AiCE-Lab（2026-05-16）："The platform now has over 6 million votes…The frontier rating range in 2026 sits roughly between 1,450 and 1,560…a model that ranks well on both Chatbot Arena and an objective benchmark for your use case is a safer bet." https://agentmarketcap.ai/blog/2026/04/06/lmarena-17b-valuation-benchmark-arbiter-human-preference-ranking ; https://www.aice-lab.org/posts/llm-benchmarks-complete-guide-2026/

[^22^] **Does style matter? Disentangling style and substance in Chatbot Arena**（LMSYS 官方博客，2024-08-28；置信度：高）。"We controlled for the effect of length and markdown, and indeed, the ranking changed…length was the dominant style factor. All other markdown effects are second order."（长度系数 0.249–0.267）https://www.lmsys.org/blog/2024-08-28-style-control/

[^23^] **Chatbot Arena: Elo Ratings, Methodology, Caveats**（BenchmarkingAgents，2026-04-21；置信度：中）。"Three known gaming vectors. First, response style…Second, sycophancy…Third, vote brigading…the headline number is broadly trustworthy at the 50-100 Elo-point granularity, less so at the 10-30 point granularity…a 100-point difference roughly corresponds to a 64 percent win-rate expectation…intervals can be 30 points or more." https://benchmarkingagents.com/chatbot-arena/

[^24^] **HalluLens: LLM Hallucination Benchmark**（arXiv:2504.17550，2025-04；置信度：高）。"More than 200 samples (approximately 25% of the test set) scored as incorrect by MC1 could have been factually correct…TruthfulQA…is now saturated due to inclusion in training data, contains incorrect gold answers…Static test sets are especially vulnerable to obsolescence as new training datasets continuously update…For hallucination evaluation, the focus is on the inverse of correct given attempted (SimpleQA)." https://arxiv.org/html/2504.17550v1

[^25^] **SimpleQA Verified: A Reliable Factuality Benchmark to Measure Parametric Knowledge**（arXiv:2509.07968，2025-09；置信度：高）。"a 1,000-prompt benchmark…On this new benchmark, Gemini 2.5 Pro achieves a state-of-the-art F1-score of 55.6, outperforming other frontier models, including GPT-5…OpenAI released SimpleQA in late 2024, a more challenging benchmark for short-form, parametric factuality that quickly became an industry standard." https://arxiv.org/html/2509.07968v2

[^26^] **Safety Eval Suites 2026: HarmBench, JailbreakBench, AILuminate Compared**（BenchmarkingAgents，2026-04-21；置信度：中高）。"HarmBench (Mazeika et al., ICML 2024)…400 harmful behaviours across 7 categories…The headline metric is Attack Success Rate (ASR)…JailbreakBench…100 harmful behaviours…AILuminate (MLCommons, December 2024)…12 hazard categories and 24,000 evaluation prompts…The output is a five-grade rating…The three are complements, not substitutes." https://benchmarkingagents.com/harm-safety-evals/

[^27^] **M-IFEval: Multilingual Instruction-Following Evaluation**（arXiv:2502.04688，2025-02-07；置信度：高）。"The Instruction Following Evaluation (IFEval) benchmark…does this using objective criteria, offering a measure of LLM performance without subjective AI or human judgement…benchmark performance across languages and instruction types can vary widely." https://arxiv.org/abs/2502.04688

[^28^] **AI Agent Framework Scorecard 2026**（RapidClaw，2026-04-30；置信度：中）。"Claude Opus 4.7 leads SWE-bench Verified at 87.6%…Five metrics…latency p50/p95, accuracy, cost per task, reliability (N-run success), tool-use success rate…A 90% single-run accuracy can mean 60% reliability on repeated attempts…on April 12, 2026 UC Berkeley research showed all eight major agent benchmarks could be reward-hacked to ~100%…Prefer third-party…scores and run your own held-out eval." https://rapidclaw.dev/blog/ai-agent-benchmarks-2026

[^29^] **AI Agent Benchmarks 对比页**（BenchmarkingAgents，2026-04-21；置信度：中）。τ-bench："165 customer-service tasks across two domains…The headline metric is pass^k (consistency across k independent runs)…Policy compliance scored as a first-class metric."；比较表：SWE-bench Verified 500 任务"Medium (public git history)"泄漏风险、WebArena 812 任务 Low、OSWorld 369 Low。https://benchmarkingagents.com/agent-benchmarks/

[^30^] **HELM 多维框架**，ai-training-playbook（GitHub，2026-03-25）与 Awesome-AI-Evaluation-Guide（2025-12-02；置信度：中）。"A framework from Stanford that evaluates models across multiple dimensions simultaneously: accuracy, calibration, robustness, fairness, bias, toxicity, and efficiency. Rather than a single score, HELM produces a multi-dimensional profile." https://github.com/nikhil-thomas-a/ai-training-playbook/blob/main/02-evaluation-metrics.md

[^31^] **LiveBench: A Challenging, Contamination-Limited LLM Benchmark**（arXiv:2406.19314，2024-06（v2 2025-04）；置信度：高）。"the first benchmark that (1) contains frequently-updated questions from recent information sources, (2) scores answers automatically according to objective ground-truth values, and (3) contains a wide variety of challenging tasks…LiveBench is difficult, with top models achieving below 70% accuracy…Questions are added and updated on a monthly basis."；VentureBeat（2025-12-22）："LiveBench is releasing new questions every month that can be used to minimize potential test data contamination." https://arxiv.org/abs/2406.19314 ; https://venturebeat.com/ai/livebench-open-ai-model-benchmark-contamination-free-test-data/

[^32^] **DyePack: Provably Flagging Test Set Contamination in LLMs Using Backdoors**（arXiv:2505.23001，2025-05；置信度：高）。"Test set contamination…arises when test data overlaps with training data, leading to artificially inflated performance…model providers traditionally use preventative measures like high-order n-gram matching…or embedding similarity search…However, such pre-training methods are imperfect…Shi et al. applied membership inference attacks…Golchin and Surdeanu leveraged LLM memorization via prompting and quiz-based methods…these methods fail for contamination during finetuning." https://arxiv.org/pdf/2505.23001v3

[^33^] **Evaluation data contamination in LLMs: how do we measure it and (when) does it matter? (ConTAM)**（arXiv:2411.03923，2024-11；置信度：高）。"We find that contamination may have a much larger effect than reported in recent LLM releases and that there are differences in the extent to which models at different scale are impacted by contamination." https://arxiv.org/html/2411.03923

[^34^] **A Survey on Data Contamination for Large Language Models**（arXiv:2502.14425，2025-02；置信度：高）。"white-box detection…N-gram overlap or embedding similarity; gray-box detection…token probabilities; black-box detection…without access to internal model details…dynamic evaluation frameworks generate test samples using techniques like combinatorial optimization, graph-based reasoning, and controlled randomization." https://arxiv.org/html/2502.14425v2

[^35^] **Phi-4 Technical Report**（arXiv:2412.08905，2024-12-12；置信度：高）。"Data Contamination: Many benchmarks rely on datasets that overlap with pretraining corpora…these methods are not effective against all scenarios, including rephrasing…Limited Skill Scope…Bias in Generation-Based Benchmarks: These judgments sometimes may prioritize style, fluency, or surface-level qualities over accuracy…Limitations of Multiple-Choice Tasks…clever guesses…pattern matching rather than…reasoning." https://arxiv.org/html/2412.08905v1

[^36^] **The Leaderboard Illusion（Singh et al., 2025）**，经 Collinear AI（2025-05-15）与 tianpan.co（2026-04-14）转述；置信度：中（二手转述，原文 arXiv:2504.20879）。"Undisclosed private testing practices benefit a handful of providers who are able to test multiple variants before public release and retract scores if desired…27 private LLM variants tested by Meta in the lead-up to the Llama-4 release…even a modest increase in access to Arena data could boost a model's Arena performance by up to 112%…Andrej Karpathy put it bluntly: AI labs were 'overfitting' to Arena rankings…One major lab privately evaluated 27 model variants…selective submission alone could artificially inflate leaderboard scores by up to 112%." https://blog.collinear.ai/p/gaming-the-system-goodharts-law-exemplified-in-ai-leaderboard-controversy ; https://tianpan.co/blog/2026-04-14-goodharts-law-in-your-llm-eval-suite

[^37^] **Improving Your Model Ranking on Chatbot Arena by Vote Rigging**（arXiv:2501.17858，2025-01；置信度：高）。论文系统性证明可通过投票操纵提升 Arena 排名（Omni rigging 等策略）。https://arxiv.org/html/2501.17858v1

[^38^] **Preference Leakage: A Contamination Problem in LLM-as-a-judge**（arXiv:2502.01534，2025-02；置信度：高）。"this issue is particularly pervasive in popular LLM-as-a-judge benchmarks (e.g., AlpacaEval 2.0 and Arena-Hard)…a systematic bias of judge LLMs towards their related student models…preference leakage is subtler and more challenging to detect." https://arxiv.org/html/2502.01534v3

[^39^] **Goodhart/刷榜多来源**（置信度：中）：FourWeekMBA（2025-09-05）"When a measure becomes a target, it ceases to be a good measure. AI has turned this economic principle into an existential crisis for machine intelligence." https://fourweekmba.com/the-goodharts-law-trap-when-ai-metrics-become-useless/ ；Brenndoerfer（2026-01-07）"If a model climbs the MMLU leaderboard but does not improve on BIG-bench tasks or naturalistic human preference ratings, it may be gaming rather than genuinely improving." https://mbrenndoerfer.com/writing/benchmark-design-construction-annotation-validity-nlp ；AI Agent Engineer Handbook（GitHub，2026-05-02）"数据污染：HumanEval / MMLU 都被反复证实污染…实战缓解：自家黄金集（私有，绝不公开）+ 真实用户日志采样人工评估 + 多 benchmark 交叉验证，不信任任何单一榜单。" https://github.com/harrisliangsu/ai-agent-engineer-handbook/blob/main/interview-prep/interview-questions.md

[^40^] **Who Defines "Best"? Towards Interactive, User-Defined Evaluation of LLM Leaderboards**（arXiv:2604.21769，2026-04；置信度：高）。"Aggregation mechanisms such as Elo obscure performance heterogeneity across different tasks…evaluations occur disproportionately for queries that are very easy or highly objective, meaning ties are driven more by intrinsic query properties than by model capability…preference-based evaluation tends to prioritize perceived helpfulness, while weakly constraining other important dimensions, like factual correctness, honesty, and safety." https://arxiv.org/html/2604.21769v1

[^41^] **Artificial Analysis 官方 Methodology 页**（访问于 2026-07；置信度：高）。"benchmark results are not intended to represent the maximum possible performance on any particular hardware platform, they are intended to represent the real-world performance customers experience across providers…Price (Blended): we calculate a blended price assuming a 7:2:1 ratio of cache hit, input, and output tokens…Cost per Task: The weighted-average cost (USD) to complete one Artificial Analysis Intelligence Index task…models that produce longer answers or more reasoning tokens will have a higher cost per task, even at identical per-token prices…Time to First Answer Token…Output Speed…End-to-End Response Time." https://artificialanalysis.ai/methodology

[^42^] **Artificial Analysis Intelligence Index 构成**，NBER Working Paper w34608 附录表（2025；置信度：高）。"Intelligence Index: Composite measure aggregating eight constituent benchmarks: MMLU-Pro, HLE, GPQA Diamond, AIME 2025, SciCode, LiveCodeBench, IFBench, and AA-LCR."（AA-LCR：100 题、最长 100k token 的长上下文推理）；Theseus 论文附录另列 Terminal-Bench Hard 与 τ²-Bench Telecom 各 1/10 权重。https://www.nber.org/system/files/working_papers/w34608/w34608.pdf ; https://www.theseus.fi/bitstream/10024/905597/2/Lahti_Matti.pdf

[^43^] **OpenRouter Rankings 官方页**（访问于 2026-07；置信度：高）。"Live LLM rankings based on benchmarks and real data from millions of people using models through OpenRouter…Top Models: Weekly usage of models across OpenRouter…ranked by share of spend." https://openrouter.ai/rankings ；佐证研究 **Demand for LLMs**（arXiv:2504.15440，2025-04；置信度：高）："OpenRouter provides a set of rankings that specify the top models by tokens used over time…daily tokens used starting from January 11, 2025…296 models in total…Claude 3.7 Sonnet has the highest average prompt token usage in the sample, while Google's Gemini 2.0 Flash 001 has the highest average completion tokens." https://arxiv.org/pdf/2504.15440

[^44^] **vLLM vs SGLang 2026: RadixAttention vs PagedAttention Benchmarks**（Spheron，2026-06-22；置信度：中）。"If more than 60% of your requests share a common prefix…SGLang's RadixAttention delivers measurably lower latency…At c=50, SGLang delivers a 37% lower TTFT p50 and 41% lower p95…Prefix overlap 20%/40%/60%/80%/95% → cache hit rate ~28%/54%/71%/84%/93% → TTFT reduction ~7%/15%/24%/37%/44%." https://www.spheron.network/blog/vllm-vs-sglang-2026/

[^45^] **SGLang Production Deployment Guide**（Spheron，2026-03-30；置信度：中）。"Workloads where agents share a fixed system prompt and tool definitions across all sessions see 75-95% cache hit rates…Monitor: sglang_cache_hit_rate (< 30% 告警: check prefix consistency), sglang_token_usage (> 85%), sglang_time_to_first_token_seconds (p95 > 2s)…Even a single character difference creates a full cache miss…session affinity is critical for multi-turn workloads." https://www.spheron.network/blog/sglang-production-deployment-guide/

[^46^] **SGLang: Efficient Execution of Structured Language Model Programs**（NeurIPS 2024；置信度：高）。"SGLang improves throughput by up to 6.4x and reduces latency by up to 3.7x…On these benchmarks, the cache hit rate ranges from 50% to 99%...our cache-aware scheduling approaches 96% of the optimal hit rate on average." https://proceedings.neurips.cc/paper_files/paper/2024/file/724be4472168f31ba1c9ac630f15dec8-Paper-Conference.pdf

[^47^] **Advanced KV Cache: RadixAttention, LMCache, and Context Parallelism**（CalibreOS，无日期；置信度：低中）。"for RAG workloads with a fixed document corpus, RadixAttention achieves 40-70% KV cache hit rate…For multi-turn chat with persistent sessions, 20-40% hit rate…For code completion with unique file contexts, under 10%…SGLang achieves 2-4x higher cache hit rates." https://www.calibreos.com/learn/genai-kv-cache-management

[^48^] **LLM Model Comparison 2026: Cost, Quality, Speed**（Tokonomics，2026-06-02；置信度：中）。"MMLU is now largely saturated at the frontier (88–94%), and GPQA Diamond and SWE-bench are becoming the preferred differentiators. Use these scores directionally, not as absolute rankings." https://tokonomics.ca/blog/llm-model-comparison-guide-2026

[^49^] **AI Model Leaderboard: LMArena ELO and Benchmark Scores**（Lambda Finance，2026-04-21；置信度：中）。校准规则："LMArena ELO > 20 points; MMLU > 2 percentage points (Saturating near 92%); HumanEval > 3pp (Contamination risk); MATH > 2pp; GPQA Diamond > 4pp (Still hard: 80% is far from saturated)…GPQA…scores have risen from ~40% (GPT-4, 2023) to 79.7% (o3-mini, 2025) in eighteen months." https://www.lambdafin.com/articles/ai-model-leaderboard

[^50^] **LMSys Arena Elo April 2026: How To Actually Read It**（SmartChunks，2026-04-21；置信度：中）。"GDPval-AA is Artificial Analysis's own pairwise leaderboard, fitted with the same Bradley-Terry machinery as Arena but judged on 1,320 real-world, economically-valuable tasks spanning 44 occupations across nine major U.S. GDP-contributing industries…treat Arena Elo as one of at least two or three rankings you cross-reference." https://smartchunks.com/lmsys-arena-elo-leaderboard-explained-2026/

[^51^] **AI for Mathematical Reasoning 综述**（arXiv:2606.08728，2026-06-07；置信度：高）。"Every accuracy figure should be accompanied by its inference budget: the number of sampled solutions (k), the selection mechanism (greedy, majority vote, ORM, PRM, execution, or Lean checking), and an approximate token cost per problem. Without these annotations, a '90% on MATH' claim is ambiguous by at least 20 percentage points…Decontamination audits: at minimum n-gram overlap (n≥13)…supplemented by embedding-based cosine-similarity recall." https://arxiv.org/html/2606.08728

[^52^] **LLM 推理指标定义综述**（arXiv:2507.09019，2025-07；置信度：高）。"Time to Last Token (TTLT): End-to-end latency (Ts+Tp+Td) for complete request processing. Essential for applications like code completion where partial outputs have limited utility…Time Between Tokens (TBT)…Directly impacts perceived model speed, with 6 tokens/second matching typical reading speed." https://arxiv.org/pdf/2507.09019

[^53^] **Measuring LLM Latency: TTFT and TPOT**（CoddyKit AI Engineering Academy，2026-07-15；置信度：中）。"TTFT dominates perceived responsiveness — users notice when nothing appears for more than 1-2 seconds, regardless of how fast tokens stream afterward…A model can have great TTFT but slow TPOT, making long responses feel sluggish." https://www.coddykit.com/courses/learn_ai_engineering/measuring-llm-latency-ttft-and-tpot-10638175

[^54^] **Prefill-Decode Aggregation or Disaggregation? Unifying Both for Goodput-Optimized LLM Serving**（arXiv:2508.01989，2025-08；置信度：高）。SLO 达成率表（QPS=12）："Relaxed TTFT & Tight TPOT (16s, 60ms): 聚合 7% vs 分离 98%；Tight TTFT & Relaxed TPOT (5s, 250ms): 97% vs 42%；Balanced (6s, 100ms): 16% vs 50%…neither approach can effectively satisfy balanced SLO requirements." https://arxiv.org/html/2508.01989v1

[^55^] **Hierarchical Contamination Detection for Synthetic Training Data**（arXiv:2511.17602，2025-11；置信度：高）。四级污染场景："S1 Token-Level…S2 Paraphrase…S3 Semantic…S4 Reasoning-Pattern"，对照 13-gram、Min-K% Prob、embedding、LLM Decontaminator、CDD 五类检测基线。https://arxiv.org/html/2511.17602v1

[^56^] **LMArena Elo Explained: 5 Failure Modes Every Enterprise Buyer Should Know**（Swfte，2026-07-10；置信度：中）。"Pairwise, not absolute. The system never asks 'is this answer correct?'…Voter-weighted. Every vote counts equally. A prompt engineer who runs 1,000 votes contributes 1,000 data points; a regulated-industry buyer who runs zero contributes zero…It is wrong only when treated as a measurement of production utility." https://www.swfte.com/de/blog/lmarena-elo-explained-unternehmen-kaeufer

[^57^] **What We are Missing in Multimodal LLM Evaluation?**（arXiv:2606.26348，2026-06；置信度：高）。"Current benchmarks…are increasingly subject to Goodhart's Law…Potential solutions involve designing multi-metric evaluation frameworks…keeping portions of the evaluation confidential to prevent overfitting and leaderboard gaming…periodically refreshing datasets' content." https://arxiv.org/html/2606.26348v1

[^58^] **Arena Elo Explained: How LMArena Chatbot Rankings Work**（BenchLM，2026-07-13；置信度：中）。"verbosity bias: humans tend to prefer longer, more detailed responses, even when a shorter answer is more accurate…A model can score highly on benchmarks but have mediocre Arena Elo if humans find its responses less helpful…It's less useful for technical accuracy (use GPQA or MMLU-Pro instead), coding (SWE-bench and LiveCodeBench), math (AIME and MATH-500), or factual reliability, where SimpleQA measures hallucination rates directly." https://benchlm.ai/blog/posts/chatbot-arena-elo-explained

---

*检索方法说明：共 26 次独立 web 检索（TTFT/ITL 定义与 SLO、goodput、基准饱和、Arena 批评、Artificial Analysis、污染、RULER/NIAH、Agent 基准、幻觉、IFEval、安全、Leaderboard Illusion、Goodhart、OpenRouter、MFU、prefix 缓存、成本、选型框架、污染检测、LongBench、GPQA、SGLang/vLLM、LiveBench、HELM、风格控制、Arena-Hard、Intelligence Index 构成、MMLU-Pro）+ 2 次目标 URL 直开（artificialanalysis.ai/methodology、openrouter.ai/rankings）。部分 2026 年博客来源权威性有限（已在置信度标注），学术结论优先采用 arXiv 原文。*
