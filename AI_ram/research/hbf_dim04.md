# HBF/大容量 Flash 引入后，MoE 架构是否仍然适用及如何演化（2024–2026）

> 调研维度 04。方法：8 批共约 30 次独立检索（以英文为主，优先 arXiv / 官方技术报告与厂商一手新闻稿）。
> 每条关键论断以 `[^n^]` 内联引用，原文摘录、URL、日期、置信度集中在文末"参考文献与证据"。
> 置信度标注：**高**=官方/arXiv 一手且可复现；**中**=一手但为厂商口径或单一来源；**低**=第三方转述/推算。

---

## Key Findings

**KF1 — MoE 与 Flash/慢速介质天然互补，"专家卸载 + 预测预取"已成为 2023–2026 一条成熟且活跃的技术线，但其性能天花板由"慢介质带宽"决定。** MoE 每 token 只激活少数专家，因此把"全部专家驻留快速内存"放宽为"热/将用专家驻留、其余驻留 CPU DRAM/SSD"是可行的；代表系统 MoE-Lightning 在单张 16GB T4 上对 Mixtral-8x7B 取得最高 10.3× 吞吐提升，并指出 Mixtral-8x22B 仅专家 FFN 就需 >256GB（约为同 FLOPs 稠密模型的 4–5×）[^1^]。Apple 的 LLM-in-a-Flash（非 MoE，但同原理）证明：把参数放闪存、按需调入 DRAM，配合 windowing + row-column bundling，可运行 2× DRAM 容量的模型、GPU 上提速 20–25×[^2^]。**这构成"HBF+MoE"推演的出发点：瓶颈从来不是"放不下"，而是"取得不够快"。**

**KF2 — 专家放置策略分三类，预测/缓存命中率差异极大（17%→99%），且强烈依赖模型与层深。** (a) 纯缓存（LRU/LFU/SLRU，Mixtral-Offloading、MoE-Infinity、llama.cpp 两级缓存）；(b) 预测预取（用当前层 hidden state/门控输入预测下一层，Pre-gated MoE、AdapMoE、Fate、ExpertFlow）；(c) CPU 直接算冷专家（Fiddler、HOBBIT 混合精度）[^3^][^4^][^5^]。命中率从 MoE-Beyond 改进前的 17% 到 Fate 的 97.15% 预取准确率 / 99.08% 缓存命中（缓存浅层 0–3 全部专家）不等；ExpertFlow 报告 95% 预测准确率、91.96% 缓存命中[^6^][^7^][^8^]。**关键规律：浅层路由分散→预取不准，深层路由集中→预取准；跨层专家索引接近随机，但 hidden state 仍携带可预测路由的信息。**

**KF3 — 专家访问存在真实但"脆弱"的时空局部性；负载均衡会系统性地破坏局部性，这是 MoE 卸载的根本张力。** 经验上相邻 token 倾向激活相同专家（Mixtral 概率高于随机，可延续 2–4 token）[^9^]；但对 20 个 MoE 模型的系统研究（Liang et al.）发现：**局部路由一致性（local routing consistency）与"局部"负载均衡存在强此消彼长，而"全局"负载均衡可与局部一致性共存；共享专家（DeepSeek 式）会因压缩专家组合空间而降低局部一致性**[^10^]。DAOP 进一步观测到：经负载均衡训练的模型在单序列内激活趋于均匀、跨序列专家偏好差异大，导致缓存不命中与频繁迁移[^11^]。**这意味着"缓存热专家"的有效性高度模型相关——有的模型（GRIN-MoE）适合卸载，有的（Jamba）根本不适合。**

**KF4 — DeepSeek 3FS / Fire-Flyer 证明：用数千块 NVMe SSD + RDMA 可以构建"近算高带宽存储层"，直接支撑训练数据流与推理 KVCache，是 HBF 思路在"系统/集群"层面的先验验证。** Fire-Flyer 2 部署 180 个存储节点 × 16 块 PCIe4 NVMe SSD + 2× CX6 200Gbps IB，共 2880 块 SSD、>20 PiB，设计出站带宽 9 TB/s、实测聚合读 8 TB/s[^12^]；开源版 3FS 在 180 节点集群达 6.6 TiB/s 聚合读、KVCache 单客户端峰值 40+ GiB/s，并用于 V3/R1 的训练数据预处理、数据加载、checkpoint、向量检索与推理 KVCache[^13^]。DeepSeek 线上"Context Caching"把 KV 缓存放分布式硬盘阵列而非 GPU 显存（MLA 大幅压缩 KV 后才可行，64-token 为最小单元、尽力而为），命中/未命中差 10 倍定价[^14^]。**SSD 进入推理热路径已被生产验证，但单点带宽（客户端 40 GiB/s 峰值、平均仅 ~3 GB/s）仍是数量级短板。**

**KF5 — EP（expert parallel）拓扑本质上是为"单卡 HBM 放不下全部专家"而付出的通信税；DeepSeek 已用"节点受限路由 + 冗余专家 + all-to-all 内核"把这笔税降到最低，但它仍是主要瓶颈。** DeepSeek-V3 预填用 EP32（4 节点 32 GPU）、冗余专家（预填设 32 个、每 GPU 多驻 1 个）并探索动态冗余（每 GPU 16 专家、每步激活 9 个）[^15^]；其硬件协同的 Node-Limited Routing 把 256 专家分 8 组×32、每 token 最多路由到 4 节点，用 NVLink(200GB/s):IB(50GB/s)≈4:1 的带宽差做 IB 流量去重[^16^]。但 DS-V3 规模下每层 2 次 all-to-all × 58 个 MoE 层 = 每前向 116 次 dispatch/combine，反向翻倍，单次 200MB 负载在 50GB/s 互联上就要数 ms、累计每步数百至数千 ms[^17^]。**EP 的存在理由 = 容量；若容量问题被 HBF 在封装内解决，EP 度数可大幅收缩，all-to-all 通信税随之下降。**

**KF6 — HBF（High Bandwidth Flash）= 用 HBM 的堆叠/封装方式堆 NAND，目标"近 HBM 读带宽 + 8–16× 容量"，定位 AI 推理权重库，2026 进入标准化、2026H2 出样、2027–2028 进 GPU。** SanDisk 与 SK hynix 已在 OCP 下启动 HBF 标准化（2026-02，2025-08 MOU），SK hynix 称 HBF"类似 HBM 堆 DRAM，HBF 堆 NAND"，并考虑"与 HBM 并列放置以提升系统容量"[^18^][^19^]。规格：单堆 512GB、8 堆 4TB（=HBM4 64GB 的 8–16×）、带宽 1.6–3.2 TB/s（≈HBM3）、NAND 成本约 DRAM 的 1/10–1/20[^20^]；"HBM 之父"Kim Joungho 称 HBF 带宽可 >1638GB/s（远超 NVMe PCIe4 的 ~7GB/s）、无限读、约 10 万次写，并预言 2027 末–2028 进入 NVIDIA/AMD/Google 产品、2038 市场规模或超 HBM[^21^]。Kioxia 另走 PCIe 形态：5TB/64GB/s 模组（<40W，菊链控制器 + 闪存预取）已出原型[^22^]。**硬约束：读优化、写慢且寿命有限、延迟 ~10µs（≈HBM 的 100×），故只适合"读多写少的推理权重"，不适合训练与高频写 KV。**[^23^][^24^]

**KF7 — 综合判断：HBF 不会让 MoE 失效，反而"治愈"MoE 最大的部署痛点（专家容量 vs 每 token 稀疏激活），MoE 将从"通信受限（EP/all-to-all）"回归"内存带宽受限"，并在 2026–2028 演化为"HBM 算 + HBF 存全量专家 + 按需流式读激活专家"的新形态。** MoE 的稀疏读取（每 token 只读少数专家、权重推理期只读）恰好匹配 HBF"读优化、写受限、大容量"的特性；Kioxia/边缘已出现 400B 级 MoE 靠 NVMe 流式推理的原型（iPhone 17 Pro 跑 Qwen3.5-397B-A17B，512 专家/激活 11，受限于 NVMe 4–6GB/s 仅 0.6 t/s）[^25^]。HBF 把这条"流式读专家"路径的带宽抬高约 2 个数量级，使"全量专家驻留近存、按需读"取代"跨节点切分专家 + all-to-all"。详见架构推演。

---

## 代表系统与数据

### 2.1 MoE 专家卸载系统（放置策略 / 预测准确率 / 性能）

| 系统 | 放置/策略 | 预测·命中率 | 性能数据 | 来源 |
|---|---|---|---|---|
| **Mixtral-Offloading** (Eliseev&Mazur 2023) | 专家 3-bit、其余 4-bit；LRU 缓存；用当前层门控输入喂下一层门控做投机预取 | 投机预取，准确率有限 | 消费级硬件跑 Mixtral-8x7B | [^3^][^26^] |
| **MoE-Infinity** (Xue 2024) | 注意力留 GPU、专家从主机 RAM 流式；sparsity-aware 缓存；序列级激活画像预取 | 请求级专家频率，浅层/多专家时较差 | 降低卸载时延、个人机可服务 | [^3^][^27^] |
| **EdgeMoE** (Yi 2023/2025) | 专家级变比特量化；离线校准预测表（相邻层激活统计相关）；compute-I/O 流水 | 统计表预测 | 端侧设备可跑 MoE | [^4^][^28^] |
| **MoE-Lightning** (Cao 2024) | CPU-GPU-I/O 流水 CGOPipe + paged weights；HRM 分层 Roofline 选策略 | —（吞吐型，不重预测） | Mixtral-8x7B 单 T4(16GB) 最高 **10.3×**；GPU 内存受限时 2–3× 更少 CPU 内存达吞吐上限；支持 8x22B/DBRX 多卡 | [^1^] |
| **Fiddler** (Kamahori 2024) | 把激活搬到 CPU、在 CPU 上算冷专家（少搬权重多搬激活） | — | 受限环境 CPU-GPU 协同加速 | [^5^][^29^] |
| **HOBBIT** (Tang 2024) | token/层/序列三级混合精度加载、自适应预取、多维缓存 | 命中率仅 ~55%（Mixtral/Phi-MoE） | 受限设备解码最高 **9.93×** | [^30^][^31^] |
| **Fate** (Fang 2025) | 跨层门控（前层门控输入喂下层）+ 浅层偏置缓存 + 混合量化 | 预取准确率 **97.15%**，缓存命中 **99.08%**（缓存 0–3 层）；prefill>99.6%、decode 最低 76.94% | 较 Load-on-Demand/EAP 解码提速 4.1×/2.2× | [^6^] |
| **ExpertFlow** (He 2024) | 预测调度 + 路由感知 rebatch + 自适应缓存 | RPP 预测准确率至 **95%**；ECE 缓存命中 **91.96%**（超 LRU 61.15%） | 单卡 GPU 内存省 93.72%、吞吐至 10× | [^7^] |
| **DAOP** (Zhang 2025) | 数据感知卸载 + 预测式预计算（冷热专家区分） | 观测：序列内激活均匀、跨序列偏好漂移→缓存失效 | 内存受限 GPU-CPU 高效推理 | [^11^] |
| **Pre-gated MoE** (Hwang 2024, ISCA) | 改模型：pre-gate 在当前层决定下一层专家，解耦选择与计算 | 需整模型微调 | 降低内存占用、隐藏加载时延 | [^3^][^32^] |
| **SiDA-MoE** (Du 2024) | 离线训练哈希网络预测激活 | 哈希命中 >90%（Switch-base-128） | 端侧高效预取 | [^4^][^33^] |
| **DuoServe** (Zhang 2025) | prefill/decode 分相优化 + 层级专家预测器 + 双 CUDA stream | top-2 准确率 **54–67%**、hit-1 **90.3–95.5%** | Mixtral-8x7B/8x22B | [^34^] |
| **FlashMoE** (2026) | 专家/非专家拆分、按需从 SSD 单次加载、ML 缓存替换 | ML 替换策略超 LRU **+21%**、超 LFU **+51%** | 加载快 llama.cpp 4×、Fiddler/DAOP 6.8× | [^35^] |
| **MoE-Beyond** (2025) | 轻量 4 层 Transformer 预测器（6600 万激活轨迹训练） | 命中率 17%→**72%**，GPU 缓存命中 +55% | 边缘 GPU 单用户 | [^36^] |
| **llama.cpp 两级缓存提案** (2026) | GPU 槽位(SLRU)+CPU+SSD 三级；频率门控准入 | SLRU+准入较 LRU **+8–15pp** 稳态命中 | 解决 prefill 平坦分布冲刷缓存问题 | [^37^] |

**读取要点**：①放置策略从"全驻留"到"LRU/LFU/SLRU 缓存"到"预测预取"到"CPU 直算"，是在 *带宽、命中率、模型改动量* 三者间取舍；②预测准确率在文献中从 17% 到 99% 跨度极大，取决于**是否允许改模型**（Pre-gated/SiDA 改模型→高准确率但损便携性）与**层深**（浅层不准、深层准）；③吞吐型系统（MoE-Lightning）甚至不强依赖预测，靠 I/O 调度即可逼近硬件上限——这对"HBF 时代还需不需要复杂预取"是个重要暗示。

### 2.2 DeepSeek 3FS / Fire-Flyer：SSD 如何支撑训练/推理数据流

- **硬件构成**：Fire-Flyer 2 共 180 个存储节点，每节点 16 块 PCIe 4.0 NVMe SSD + 2× Mellanox CX6 200Gbps IB HCA；全网 360×200Gbps 出站 HCA、2880 块 SSD、>20 PiB（镜像冗余），设计出站 9 TB/s、实测聚合读 **8 TB/s**[^12^]。
- **一致性/调度**：CRAQ（链式复制 + 分派查询，write-all-read-any）释放全部 SSD 的吞吐与 IOPS；存储网络为全对分带宽 Fat-Tree，客户端可访问任一存储服务；为缓解客户端侧 incast 拥塞实现 *request-to-send* 流控（牺牲一点时延换可持续高吞吐）[^38^]。
- **存算一体网络**：Two-Layer Fat-Tree 把存储流量与计算通信并入同一网络，用 IB 的 Service-Level→Virtual-Lane 映射做流量隔离，避免 HOL 阻塞与碰撞；静态路由 + 拓扑/路由优化打散存储流量[^39^]。
- **性能（开源 3FS 口径）**：180 节点 6.6 TiB/s 聚合读；25 节点 GraySort 3.66 TiB/min（30 分 14 秒排 110.5 TiB）；KVCache 单客户端峰值 **40+ GiB/s**[^13^]。第三方复核指出：KV 读平均仅 ~3 GB/s、峰值 40 GB/s（=客户端 400Gbps NIC 的 80% 利用率，平均仅 6%）——**SSD 聚合带宽巨大，但单客户端/单点有效带宽仍是短板**[^40^]。
- **在 V3/R1 的用途**：训练数据预处理、数据集加载（免预取/免 shuffle 的跨节点随机访问）、大规模并行 checkpoint、嵌入向量检索、**推理 KVCache**（作为 DRAM 缓存的经济替代，容量更大、吞吐高）[^13^][^41^]。
- **线上 Context Caching**：DeepSeek 把预计复用的上下文 KV 缓存到**分布式硬盘阵列**而非 GPU 显存；可行前提是 MLA 把 KV 体积大幅压缩（每 token FP16 约 70KB），以 64-token 为最小缓存单元、尽力而为（不保证命中）、数小时–数天自动过期；命中 0.1 元/M token vs 未命中 1 元/M token[^14^][^42^]。
- **生态收敛**：SGLang HiCache 以 3FS 为存储后端，报告吞吐翻倍、命中率 40%→80%；阿里云 Tair 基于 3FS 做 L3 SSD KVCache（要求单节点带宽 ≥20GB/s、P99<50ms）；行业分析（DualPath 等）指出 agentic 推理正变为"存储-NIC / 内存fabric 受限"[^43^][^44^]。

### 2.3 专家访问的时空局部性（hot/cold、负载均衡的破坏）

- **存在局部性**：Mixtral-8x7B 对下一 token 选同一专家的概率高于随机；该现象可延续 2–4 个连续 token（Eliseev & Mazur 案例研究）[^9^]。MoE-Infinity 报告解码期专家频繁复用、且复用集合依赖 prefill 输入[^27^]。
- **但局部性"脆弱且模型相关"**：Liang et al.（2025，对 20 个 MoE LLM 提出 SRP/SCH 两指标）发现——(1) **局部路由一致性与"局部"负载均衡强负相关**，但"全局"负载均衡可与之共存；(2) **共享专家**因压缩专家组合空间而降低局部一致性；(3) 领域特化专家比词表特化专家更贡献一致性；(4) 多数模型在缓存≈2×激活专家数时兼顾命中率与效率[^10^]。结论：**并非所有模型都适合专家卸载**（GRIN-MoE 一致性高、Jamba-Mini 一致性低）[^10^]。
- **负载均衡的破坏机制（DAOP）**：经均衡训练的 MoE 在**单序列内**各专家激活近乎均匀、**跨序列**专家偏好差异显著→GPU 难以捕捉局部性→缓存不命中、专家在层级间频繁迁移[^11^]。
- **层深结构**：Fate 测得浅层路由权重分布平坦（预取不准）、深层路由偏好明确（预取准）；把 0–3 层全缓存即达 99.08% 命中[^6^]。对 Qwen3.5-35B-A3B 的独立实测：跨层专家索引相关性仅 1.07×随机（Jaccard 0.017），但用 hidden_state×下一层门控权重可 77% 命中；路由分布极分散（top-8 仅占 15.7% 概率质量、熵 7.5/8 bit）；深层更特化（Gini 0.38→0.62）；同层连续 token 缓存命中 35%（深层 48%）[^45^]。
- **工程含义**：hot/cold 倾斜**存在但不稳**，且被现代 MoE 的"负载均衡 + 共享专家 + 每层皆 MoE + 细粒度多专家"等趋势主动抹平——这既是"缓存热专家"路线的天花板，也反衬出"全量专家驻留近存"路线的必要性。

### 2.4 EP 拓扑与 all-to-all 通信（为何它是 MoE 的核心税）

- **EP 的存在理由**：单卡 HBM 放不下全部专家 → 专家切到多卡/多节点 → 每 MoE 层需 dispatch（token 发给专家所在卡）+ combine（结果收回）两次 all-to-all[^17^]。
- **通信量级**：DS-V3 58 个 MoE 层 × 2 = 每前向 **116 次** dispatch/combine，反向翻倍；单 token 激活 ~7KB（FP8、hidden 7168），naive 实现产生大量细碎 GPU-GPU 传输；200MB 负载在 50GB/s IB 上数 ms，累计每步数百–数千 ms[^17^][^46^]。
- **DeepSeek 的降税三件套**：(1) **Node-Limited Routing**——256 专家分 8 组×32/节点、每 token 最多路由 4 节点，借 NVLink:IB≈4:1 带宽差在节点内去重 IB 流量（IB 成本从 8t 降到 Mt，M<8）[^16^]；(2) **冗余专家**——按在线负载统计周期性（如每 10 分钟）复制高负载专家、预填设 32 个冗余（每 GPU 多驻 1 个），并探索动态冗余（每 GPU 16 专家、每步激活 9 个、all-to-all 前即时算全局最优路由）[^15^]；(3) **DeepEP**——高吞吐 + 低时延 all-to-all 内核、FP8、面向 group-limited gating 的 NVLink→RDMA 非对称域转发、解码用纯 RDMA 低时延内核、hook 式通信-计算重叠[^47^]。实测：FP8 提吞吐 1.5–2.5×、dispatch/combine 时延降 30–50%、RDMA 解码端到端降 10–25%[^48^]。
- **仍是瓶颈**：Megatron-Core 在 GB200 上需 HybridEP（为 NVL72 优化）+ CUDA Graph、H100 上需 DeepEP + EP all-to-all 重叠，才把 DS-V3 训练推到 1048 / 368 TFLOPS/GPU[^49^]。**EP all-to-all 是当前 MoE 扩展的第一通信墙。**

### 2.5 HBF / 大容量 Flash 介质规格与定位

- **定义**：HBF 用 HBM 的 TSV 堆叠/封装方式堆 3D NAND（12–16 层 die + 基底逻辑 die + interposer），物理 footprint/电气接口（PHY 级）与 HBM4 近乎一致、可复用 HBM interposer/封装，但**非即插即用**（NAND 按页访问、需擦除、磨损均衡，主控侧需最小协议改动）[^23^][^24^]。
- **容量/带宽/成本**：单堆 512GB、8 堆 4TB（HBM4 64GB 的 8–16×）；带宽 1.6–3.2 TB/s（≈HBM3）；SK 238 层 NAND 12-Hi 等效 2866 层/768GB；NAND 每 GB 成本约 DRAM 的 1/10–1/20[^20^]。SemiEngineering：HBM 现 192GB、下代 ~400GB，而 HBF 已达 3Tb[^23^]。
- **延迟/写/寿命（硬约束）**：读延迟 ~10µs（≈HBM 数十–数百 ns 的 **100×**）；写慢（先擦后写、整块擦除）、擦写寿命约 10 万次；**只读不限**[^21^][^24^]。故 HBF 定位**推理权重库**（静态权重、反复读），不适合训练（频繁写）与高频写 KV[^23^][^24^]。
- **路线与时间表**：SanDisk+SK hynix 在 OCP 标准化（2026-02 kick-off；2025-08 MOU；Samsung/Kioxia/Micron 亦在布局）；SanDisk 16-die 堆叠 2026H2 出样、2027 初设备出样；Kim Joungho 预计 2027 末–2028 进 NVIDIA/AMD/Google GPU、2038 市场或超 HBM[^18^][^21^][^23^]。
- **另一形态（Kioxia）**：5TB/64GB/s PCIe6 x8 模组、<40W、菊链控制器（每模组一控制器、可线性扩展至 80TB/1TB/s）、控制器内**闪存预取**降读延迟——面向边缘 AI/MEC[^22^]。
- **产业叙事**：SK hynix 明确"HBM 当热层、HBF 当冷/温层"的分层；"HBM 之父"以"HBM=家中书架、HBF=图书馆（稍慢但藏书多）"作喻[^19^][^21^][^50^]。

---

## 对"HBF+MoE"的架构推演

> 以下是基于上述证据的**架构推理**（非已有产品的直接事实），置信度标注于每条。

**推演 A — MoE 是 HBF 的"天选负载"：稀疏读取 + 推理期只读 + 容量巨大，三者同时命中 HBF 的甜点、避开其死穴。**（置信度：高，逻辑推演+强旁证）
MoE 每 token 只读 top-k 个专家（读取天然稀疏、可按需流式），权重在推理期不变（只读，规避 HBF 写慢/寿命短的死穴），总参数量大且持续向更多专家演进（DS-V3 256、Kimi-K2 384、Qwen3.5 512）[^20^][^46^]。这与稠密模型"每 token 必读全部权重"形成对比——HBF 对 MoE 的有效利用率远高于稠密模型。**因此 HBF 非但不威胁 MoE，反而可能因"大容量 + 稀疏读"而奖励 MoE、惩罚稠密。**

**推演 B — "专家放哪"的权衡从三级（HBM 热 / DRAM 温 / SSD 冷）收敛为两级（HBM 算 / HBF 存全量专家），预取从"必须预测准"降级为"锦上添花"。**（置信度：中高）
当前卸载研究的一切复杂度（LRU/SLRU 缓存、跨层预测、改门控、CPU 直算）都源于一个事实：**慢介质（PCIe SSD ~7GB/s、CPU DRAM）带宽太低，一旦缓存不命中就停顿，所以必须预测准**[^1^][^11^]。HBF 把慢介质带宽抬高约 2 个数量级（>1.6TB/s 对 ~7GB/s）[^20^][^21^]，使"全量专家驻留近存封装内、每层按需读当前激活专家"成为可行基线——这等价于把 Apple LLM-in-a-Flash 的 windowing 流式思想搬到近存，但带宽不再是瓶颈[^2^]。此时 HBM 退化为"当前激活专家 + 注意力/共享专家 + 激活/KV 的工作区"，预取/缓存只用于掩盖 HBF ~10µs 的读延迟（而非弥补带宽缺口），容错性大增。**负载均衡抹平 hot/cold 的副作用在此模型下变得无害——因为不再依赖"缓存命中热专家"，而是按需读任一专家。**

**推演 C — EP 拓扑可被"封装内容量"重构：EP 度数收缩、跨节点 all-to-all 通信税下降，MoE 从通信受限回归带宽受限。**（置信度：中，方向性强、定量待验证）
EP 的根本动机是单卡 HBM 容量不足[^17^]。若单加速器封装内 HBF 可放下一层（乃至整模型）的全部 256–512 个专家，则单层无需把专家切到数十个节点 → dispatch/combine 的跨节点 all-to-all 大幅收缩，DeepEP/Node-Limited-Routing/冗余专家这套"降税"工程的边际价值下降[^15^][^16^][^47^]。MoE 扩展的第一约束从"互联带宽"回到"HBF 读带宽"——后者是单点、可预测、易扩展的。**但注意**：专家数与层数仍在增长（更多专家、每层皆 MoE），单封装 HBF 未必永远装得下整个模型；届时出现"HBF 内全专家 + 少量跨封装 EP"的混合拓扑，而非回到今天的超大 EP。

**推演 D — 存储-内存分层重构为"DRAM/HBM（热、可写）↔ HBF（温、只读权重库）↔ NVMe SSD/对象存储（冷、KV/数据）"，MoE 权重与 KV/数据各归其位。**（置信度：中高）
HBF 写慢、寿命有限 → 只放静态权重；KV cache（高频写、需大容量）与训练数据/checkpoint 仍落在 3FS 式 NVMe SSD 层（DeepSeek 已验证 KV/上下文可上盘）[^12^][^13^][^14^][^23^]。于是形成清晰分工：**HBF 存"会反复读但不改"的专家权重；HBM/DRAM 存"要算、要写"的激活与工作区；SSD/3FS 存"要大容量、可流式"的 KV 与数据**。这与 SK hynix"HBM 热层 + HBF 冷/温层 + 与 HBM 并列放置"的公开路线一致[^19^][^50^]。

**推演 E — MoE 架构本身将向"更适配近存流式"演化：细粒度专家、共享/稠密部分留 HBM、路由偏向可流式读取。**（置信度：中）
证据已现端倪：(1) 细粒度专家趋势（256→512）使单专家更小、按需读的粒度更友好[^46^]；(2) Fate/AdapMoE 利用"相邻层 hidden state 高相似"做跨层预取，本质是流式读取的时间局部性[^6^]；(3) 训练侧开始出现"为部署友好而设计路由"的工作（如训练期注入局部性偏置、Sticky Routing；Li et al. 指出全局负载均衡可与局部一致性共存——即可兼顾训练均衡与推理流式友好）[^10^][^51^]。**推论：未来 MoE 可能在保证模型质量前提下，主动把路由约束成"对近存顺序/批量读更友好"，形成硬件-架构协同（类似 DeepSeek 为 H800 互联做 Node-Limited Routing 的先例）**[^16^]。

**推演 F — 端侧/边缘是 HBF+MoE 的先行落地场景，数据中心随后在 2027–2028 跟进。**（置信度：中）
边缘已用 NVMe 跑通 400B MoE（iPhone 17 Pro 上 Qwen3.5-397B-A17B，受限于 NVMe 4–6GB/s 仅 0.6 t/s，瓶颈明确是 SSD 带宽）[^25^]；Kioxia 5TB/64GB/s 模组直接面向边缘 AI/MEC[^22^]。数据中心侧，HBF 进 GPU 需待 2027–2028（Kim Joungho / SanDisk 时间表）[^21^][^23^]。**节奏判断：边缘先用"PCIe 形态 HBF/高带宽 SSD"验证 MoE 流式，数据中心后用"封装内 HBF"重构 EP。**

---

## 争议

**争议 1 — 路由动态性是否使闪存预取失效？（反方核心）**
- **反方论据**：路由是输入相关、逐 token 动态的，跨层专家索引接近随机（Qwen3.5 实测仅 1.07×随机）[^45^]；负载均衡使单序列内激活趋于均匀、跨序列偏好漂移，导致缓存不命中与频繁迁移（DAOP）[^11^]；浅层路由平坦→预取不准（Fate 测得 decode 最低仅 76.94%）[^6^]；预测类方法"收益有限，因为专家加载成本远大于 GPU 计算成本"（MoE-Lightning/HOBBIT 的批评），HOBBIT 缓存命中仅 ~55%[^30^][^31^]；并非所有模型适合卸载（Liang：局部一致性与局部负载均衡强负相关、共享专家降低一致性）[^10^]。**若局部性被抹平、预测又不准，则"缓存+预取"范式失效。**
- **正方/化解**：(a) 预测不必靠"索引记忆"，hidden state 仍携带可预测路由的信息（77% 跨层命中）[^45^]，且允许改模型时（Pre-gated/SiDA）可达 >90%[^4^][^32^]；(b) 深层路由集中、预取准[^6^]；(c) **更根本的化解是推演 B——HBF 把带宽缺口补上后，预取从"必须命中"降级为"掩盖 ~10µs 延迟的优化"，即使预测不准、按需读的代价也可接受**。换言之，**"预取失效"是低带宽慢介质时代的病，HBF 是治本而非治标。**（本条为综合推演，置信度：中高）

**争议 2 — HBF 是否只是"更贵的 SSD"，无法真正替代 HBM/改变架构？**
- **反方**：HBF 读延迟 ~10µs（HBM 的 100×）、写慢、寿命 ~10 万次、非即插即用（需改主控协议），因此对延迟敏感的单 token 解码（每 token 每层都要读专家）仍会停顿；且无法承载 KV（高频写）与训练（权重更新），架构影响有限[^23^][^24^]。
- **正方**：定位本就不是替代 HBM 而是补容量断层（SK hynix"HBM 热 + HBF 温/冷"分层）[^50^]；批量推理（吞吐型）下延迟可被流水/预取掩盖，带宽才是关键；MoE-Lightning 已证明高 I/O 利用率可逼近硬件吞吐上限[^1^]。**裁决：HBF 替代的是"慢 SSD/远程存储 + 超大 EP"，而非 HBM；对吞吐型 MoE 推理是质变，对极致低延迟单请求是改良。**（置信度：中）

**争议 3 — 全量专家驻留近存 vs HBM 缓存热专家，哪条路线胜出？**
- **"HBM 缓存热专家"派**：利用 hot/cold 倾斜，把热专家留 HBM、冷专家留 HBF/SSD（Fiddler/HOBBIT/llama.cpp 两级缓存的思路延伸到 HBF）[^5^][^30^][^37^]。优点：HBM 快；缺点：依赖局部性，而局部性被负载均衡/共享专家抹平（争议 1）。
- **"全量专家驻留近存"派**：HBF 容量足够，全量专家放 HBF、按需读，HBM 只放工作区（推演 B/C）。优点：不依赖局部性、容错、EP 收缩；缺点：吃 HBF 带宽与 ~10µs 延迟。
- **裁决倾向**：两者非互斥——**HBF 存全量专家作"容量底座"，HBM 缓存当前/热专家作"延迟缓冲"**，正是 SK hynix"并列放置"与产业分层的共识方向[^19^][^50^]。但当 hot/cold 被抹平时，"全量驻留 + 按需读"是更稳健的默认。（置信度：中）

**争议 4 — MoE 会不会因"内存墙缓解"而被稠密模型反扑？**
- **反方**：若 HBF 让大稠密模型也能"装下并流式跑"，MoE 的"省算力"优势是否仍值其路由/通信复杂度？
- **正方**：MoE 的核心价值是"容量与每 token 计算解耦"（质量(671B)@成本(37B)）[^46^]，这与内存介质无关；且 HBF 对 MoE 的有效利用率更高（稀疏读匹配），反而可能拉大 MoE 对稠密的优势（推演 A）。**裁决：HBF 更可能巩固而非颠覆 MoE；但 MoE 内部形态（EP 拓扑、路由设计、专家粒度）会显著演化。**（置信度：中，方向性判断）

**争议 5 — 数据/证据时效与口径风险。** HBF 尚未量产（2026H2 出样、2027–2028 进 GPU），其带宽/延迟/寿命多为厂商口径或分析推算（中–低置信度）[^20^][^21^][^23^]；"HBF 重构 EP/收敛为按需读"目前主要是我方基于证据的架构推演，尚无已落地系统直接验证，需待 2026–2028 硬件到位后实证。

---

## 参考文献与证据

[^1^]: Cao et al., "MoE-Lightning: High-Throughput MoE Inference on Memory-constrained GPUs," arXiv:2411.11217, 2024-11-18. https://arxiv.org/abs/2411.11217 摘录："MoE-Lightning can achieve up to 10.3x higher throughput than state-of-the-art offloading-enabled LLM inference systems for Mixtral 8x7B on a single T4 GPU (16GB)… the Mixtral 8x22B model requires over 256 GB of memory for the parameters of the expert feed-forward network (FFN), which is 4-5x higher than… dense models." 置信度：高。

[^2^]: Alizadeh et al. (Apple), "LLM in a flash: Efficient Large Language Model Inference with Limited Memory," arXiv:2312.11514, 2023-12-12. https://arxiv.org/abs/2312.11514 摘录："storing the model parameters in flash memory, but bringing them on demand to DRAM… 'windowing'… 'row-column bundling'… enable running models up to twice the size of the available DRAM, with a 4-5x and 20-25x increase in inference speed compared to naive loading approaches in CPU and GPU." 置信度：高。

[^3^]: "A Survey on Inference Optimization Techniques for Mixture of Experts Models," arXiv:2412.14219. https://arxiv.org/html/2412.14219 摘录："Mixtral-Offloading, AdapMoE, and HOBBIT use current gating inputs to feed the gating module for the following layers, predicting the required experts… the prediction accuracy can reach about 90%… Pre-gated MoE introduces a pre-gated MoE structure… may cause a decrease in model accuracy. EdgeMoE constructs a prediction table using a calibrated dataset." 置信度：高。

[^4^]: DAOP (arXiv:2501.10375) Related Work. https://arxiv.org/html/2501.10375v1 摘录："SiDA-MoE uses a hash function to predict expert activation patterns… Pre-gated MoE introduces a predictive pre-gating mechanism… EdgeMoE reduces expert size through expert-specific bit-width adaptation… and preloads anticipated experts using a compute-I/O pipeline." 置信度：高。

[^5^]: "On-Device Mixture-of-Experts" (综述), arXiv:2602.11192. https://arxiv.org/pdf/2602.11192 摘录："Fiddler… directly move intermediate activations to CPU memory and perform expert computation on the CPU for CPU-resident experts. As activations are smaller than the expert weights themselves, this method trades compute efficiency for a reduction in I/O latency." 置信度：高。

[^6^]: Fang et al., "Fate: Fast Edge Inference of Mixture-of-Experts Models via Cross-Layer Gate," arXiv:2502.12224, 2025-02-17. https://arxiv.org/html/2502.12224v1 摘录："achieves a prefetch accuracy of 97.15%… increases the expert hit rate to 99.08%… during the decoding stage, the lowest prediction accuracy reaches an impressive 76.94%… in shallow layers, token routing preferences are less distinct… deeper layers show a clear routing preference." 置信度：高。

[^7^]: He et al., "ExpertFlow: Efficient MoE Inference via Predictive Expert Caching and Token Scheduling," arXiv:2410.17954. https://arxiv.org/html/2410.17954v2 摘录："Our RPP achieves up to 95% expert prediction accuracy… The ECE attains a cache hit ratio of 91.96%, outperforming LRU by up to 61.15%… reduces GPU memory usage by up to 93.72% and improves throughput by up to 10×." 置信度：高。

[^8^]: "Speculating Experts Accelerates Inference for MoE," arXiv:2603.19289, 2026-03-09. https://arxiv.org/html/2603.19289v1 摘录："Zhang et al. evaluate on MoE architectures with relatively small routing combinatorial spaces, leaving it unclear whether such predictor-based schemes extend to modern MoEs with larger expert pools." 置信度：高。

[^9^]: Liang et al. (引述 Jiang 2024 / Eliseev&Mazur 2023), arXiv:2505.16056. https://arxiv.org/html/2505.16056v2 摘录："Jiang et al. (2024) first observed that Mixtral-8x7B is likely to choose the same expert for the next token, with probabilities higher than the random expectation. Eliseev & Mazur (2023) extended the argument to 2-4 consecutive tokens." 置信度：高。

[^10^]: Liang et al., "Not All Models Suit Expert Offloading: On Local Routing Consistency of Mixture-of-Expert Models," arXiv:2505.16056, 2025-05-21. https://arxiv.org/abs/2505.16056 摘录："We find a strong trade-off between local routing consistency and local load balance, while showing that global load balance can coexist with local routing consistency. Meanwhile, settings like shared experts that decrease expert combination space can lead to low local routing consistency… most models balance between cache effectiveness and efficiency with cache sizes approximately twice the active experts." 置信度：高。

[^11^]: Zhang et al., "DAOP: Data-Aware Offloading and Predictive Pre-Calculation for Efficient MoE Inference," arXiv:2501.10375, 2025-01 (DATE 2025). https://arxiv.org/pdf/2501.10375 摘录："trained to achieve balanced activation frequencies across various tasks. This balance leads to inherent variability in dominant experts for different inputs, resulting in cache misses and frequent migrations of experts between memory hierarchies… within individual input sequences [activation is balanced]… across different sequences, significant deviations in expert preference frequently occur." 置信度：高。

[^12^]: An et al. (DeepSeek), "Fire-Flyer AI-HPC: A Cost-Effective Software-Hardware Co-Design for Deep Learning," arXiv:2408.14158, 2024-08. https://arxiv.org/html/2408.14158v1 摘录："we deployed 180 storage nodes… each node contains 16 PCIe 4.0 NVMe SSDs and 2 Mellanox CX6 200Gbps InfiniBand HCAs. With totally 360 * 200Gbps outbound InfiniBand HCAs, the system can total provide 9TB/s outbound bandwidth, and we actually achieved total read throughput of 8TB/s. The total 2880 NVMe SSDs provide over 20PiB storage space." 置信度：高。

[^13^]: DeepSeek 3FS 开源（GitHub deepseek-ai/3FS）及发布报道, 2025-02-28. https://github.com/deepseek-ai/3FS ; 报道 https://www.c114.net.cn/ai/150191.html 摘录："在180节点集群中，3FS 实现了高达 6.6 TiB/s 的聚合读取吞吐量… 每个客户端节点的 KVCache 查找峰值吞吐量超过 40 GiB/s… 在 V3/R1 中训练数据预处理、数据集加载、检查点保存/重新加载、嵌入向量搜索和 KVCache 查找以进行推理." 置信度：高（官方 GitHub + 多源）。

[^14^]: DeepSeek Context Caching 说明（社区整理）, 2025-07. http://xinfinite.net/t/topic/13344 摘录："DeepSeek采用的是上下文硬盘缓存技术，把预计未来会重复使用的内容，缓存在分布式的硬盘阵列中，而不是缓存在gpu显存中… MLA 结构…大大压缩了上下文 KV Cache 的大小…缓存命中的部分收费 0.1元 每百万 tokens；没命中的部分收费1元." 置信度：中（第三方转述官方文档）。

[^15^]: DeepSeek-AI, "DeepSeek-V3 Technical Report," arXiv:2412.19437, 2024-12. https://arxiv.org/pdf/2412.19437 摘录："For the MoE part, we use 32-way Expert Parallelism (EP32)… we introduce a deployment strategy of redundant experts… we set 32 redundant experts for the prefilling stage. For each GPU, besides the original 8 experts it hosts, it will also host one additional redundant expert… a dynamic redundancy strategy… each GPU hosts more experts (e.g., 16 experts), but only 9 will be activated during each inference step." 置信度：高。

[^16^]: "Insights into DeepSeek-V3: Scaling Challenges and Reflections on Hardware for AI Architectures," arXiv:2505.09343. https://arxiv.org/html/2505.09343v2 摘录："NVLink provides 200GB/s bandwidth… while each 400Gbps IB NIC delivers only 50GB/s… we group 256 routed experts into 8 groups, with 32 experts per group, and deploy each group on a single node. On top of this deployment, we algorithmically ensure that each token will be routed to up to 4 nodes." 置信度：高。

[^17^]: "Scalable Training of Mixture-of-Experts Models with Megatron Core," arXiv:2603.07685, 2026-03-10. https://arxiv.org/html/2603.07685v2 摘录："At DeepSeek-V3 scale, this translates to 58 MoE layers × 2 operations/layer = 116 dispatch/combine operations per forward pass. The backward pass doubles this count. At 50 GB/s inter-node bandwidth… a single dispatch with 200 MB payload takes several milliseconds, accumulating to hundreds or thousands of milliseconds per iteration." 置信度：高。

[^18^]: Sandisk & SK hynix, "Begin Global Standardization of High Bandwidth Flash (HBF)," 2026-02-25. http://www.hughsnews.ca/sandisk-and-sk-hynix-champion-high-bandwidth-flash-0072383 摘录："announcing a joint effort to standardize High Bandwidth Flash (HBF), the next-generation memory solution designed for the AI inference era… under the Open Compute Project (OCP)… deliver high bandwidth with industry-leading capacity, while offering the persistence and thermal stability." 置信度：高（官方新闻稿）。

[^19^]: SK hynix, "Presents Next-Generation NAND Storage Product Strategy at OCP 2025," 2025-10-26. https://news.skhynix.com/sk-hynix-presents-next-generation-nand-storage-product-strategy-at-ocp-2025/ 摘录："AIN B (Bandwidth) is SK hynix's solution leveraging HBF technology… Similar to HBM which stacks DRAM dies, HBF is a product which is made by vertically stacking multiple NAND flash… such as placing together with HBM to enhance overall system capacity." 置信度：高（官方）。

[^20^]: LoveChip, "HBM VS HBF VS HBS," 2026-01-29. https://www.lovechip.com/blog/hbm-vs-hbf-vs-hbs 摘录："a single HBF stack can reach up to 512 GB, and an eight-stack configuration can deliver 4 TB… 8 to 16 times that of HBM4 (64 GB)… bandwidth can reach 1.6 TB/s to 3.2 TB/s, comparable to HBM3… NAND flash costs only one-tenth to one-twentieth per gigabyte compared to DRAM… Based on SK hynix's 238-layer 3D NAND, a 12-Hi HBF stack can achieve an effective 2,866-layer structure with a total capacity of 768 GB." 置信度：中（第三方汇总，数值与厂商口径一致）。

[^21^]: Futunn（转述 KAIST Kim Joungho）, "'Father of HBM': The commercialization of HBF…," 2026-01-17. https://news.futunn.com/en/post/67535813 摘录："HBF bandwidth can exceed 1638 GB/s, far higher than the approximately 7 GB/s bandwidth of NVMe PCIe 4.0 SSDs; its capacity is projected to reach 512GB… HBF supports unlimited reads but has a limited number of write cycles (approximately 100,000)… integrate HBF into products from NVIDIA, AMD, and Google by late 2027 to early 2028… market size could surpass that of HBM by around 2038. 'If HBM is likened to a home bookshelf, HBF is akin to studying in a library.'" 置信度：中（转述专家观点）。

[^22^]: Kioxia, "Achieves Successful Prototyping of 5TB Large-Capacity and 64GB/s High-Bandwidth Flash Memory Module," 2025-08-20. https://www.kioxia.com/en-jp/about/news/2025/20250820-1.html 摘录："a large capacity of five terabytes (TB) and a high bandwidth of 64 gigabytes per second (GB/s)… daisy-chained connections with beads of flash memories… 128 gigabits per second (Gbps)… flash prefetch technology… PCIe 6.0 (64 Gbps, 8 lanes)… less than 40 watts." 置信度：高（官方新闻稿）。

[^23^]: Semiconductor Engineering, "Flash Getting Stacked High-Bandwidth Version," 2026-06-29. https://semiengineering.com/flash-getting-stacked-high-bandwidth-version/ 摘录："Sandisk has proposed a 16-die-plus-base-die flash stack that fits the same footprint as HBM, although with a different interface protocol… The latest HBM stack can hold up to 192 GB, and the next product is targeting around 400 GB. But with HBF, they're already reaching 3 Tb… For this reason, HBF can't completely replace HBM… 'It's being targeted at inference rather than training… During inference, you leave them alone.'… first samples of HBF in the second half of 2026… first inference devices using HBF to sample in early 2027." 置信度：高（专业媒体，含多方引述）。

[^24^]: HyperAccel, "Memory in the AI Era, Part 1: Understanding HBF," 2026-04-23. https://hyper-accel.github.io/en/posts/what-is-hbf/ 摘录："its physical footprint and electrical interface (PHY level) are compatible with HBM… HBF is not a drop-in replacement for HBM… Latency: At approximately 10 µs, it's roughly 100x slower than HBM's tens to hundreds of nanoseconds… Write speed and endurance… remain. This makes HBF unsuitable for AI training… for AI inference workloads — where pre-loaded model weights are read repeatedly — these limitations are much less of a concern." 置信度：中高（技术博客，物理事实可靠）。

[^25^]: ComputeLeap, "iPhone 17 Pro Ran a 400B LLM. Here's How," 2026-03-23. https://www.computeleap.com/blog/iphone-17-pro-400b-llm-on-device-ai-2026/ 摘录："the model is specifically Qwen3.5-397B-A17B — 397 billion total parameters, but only 17 billion active per token… 512 experts per layer, where only 11 experts are activated for each token (10 routed plus 1 shared)… the iPhone's LPDDR5X RAM delivers approximately 51 GB/s, but the NVMe SSD tops out at roughly 4-6 GB/s. That 10x gap is the entire speed explanation… 0.6 t/s." 置信度：中（第三方实测转述）。

[^26^]: Eliseev & Mazur, "Fast Inference of Mixture-of-Experts Language Models with Offloading"（Mixtral-Offloading）, arXiv:2312.17238, 2023-12. 经 [^3^][^5^] 转述："uniformly quantizes experts to 3 bits and all remaining weights to 4 bits… employs a hybrid approach combining speculative expert prefetching with LRU-based expert caching." 置信度：高。

[^27^]: Xue et al., "MoE-Infinity: Activation-Aware Expert Offloading for Sparse MoE," arXiv:2401.14361, 2024-01. 经 [^5^][^9^] 转述："a sparsity-aware expert cache… keeping attention weights in GPU memory and streaming expert weights from host RAM… reported frequent expert reuse during decoding, and observed that the reused experts depend on the prefilled input." 置信度：高。

[^28^]: Yi et al., "EdgeMoE: Empowering Sparse Large Language Models on Mobile Devices," IEEE TMC 2025 / 2023. 经 [^4^][^9^] 转述："expert-specific bit-width adaptation… preloads anticipated experts using a compute-I/O pipeline." 置信度：高。

[^29^]: Kamahori et al., "Fiddler: CPU-GPU Orchestration for Fast Inference of MoE Models," 2024. 经 [^5^] 转述。置信度：高。

[^30^]: Tang et al., "HOBBIT: A Mixed Precision Expert Offloading System for Fast MoE Inference," arXiv:2411.01433, 2024-11-03. https://arxiv.org/html/2411.01433v1 摘录："these prediction methods offer limited benefits because the expert-loading cost is typically much greater than the GPU computation cost… demonstrating up to 9.93x speedup in decoding over state-of-the-art systems." 置信度：高。

[^31^]: "Efficient MoE Inference via Expert…"（引述 HOBBIT 命中率）, arXiv:2511.10676. https://arxiv.org/html/2511.10676v1 摘录："HOBBIT… the cache hit rate is only around 55% on Mixtral-8x7B and Phi-MoE." 置信度：高。

[^32^]: Hwang et al., "Pre-gated MoE: An Algorithm-System Co-Design for Fast and Scalable MoE Inference," ISCA 2024. 经 [^3^][^30^] 转述："modifies the MoE model architecture to predict the experts to route at the next layer… may cause a decrease in model accuracy." 置信度：高。

[^33^]: Du et al., "SiDA-MoE: Sparsity-Inspired Data-Aware Serving for MoE," 2024. 经 [^4^] 转述："achieves a hash hit rate of more than 90% on Switch-base-128." 置信度：高。

[^34^]: Zhang et al., "DuoServe-MoE," 2025. 经 arXiv:2511.10676 转述：https://arxiv.org/html/2511.10676v1 "Their lightweight layer-level expert predictor achieves 54-67% of top-2 accuracy and 90.3-95.5% hit-1 accuracy on Mixtral-8x7B and Mixtral-8x22B." 置信度：高。

[^35^]: "FlashMoE: Reducing SSD I/O Bottlenecks via ML-Based Cache Replacement for MoE Inference on Edge Devices," arXiv:2601.17063, 2026-01. https://arxiv.org/html/2601.17063v1 摘录："for OLMoE-1B-7B, it outperformed the widely adopted LRU by 21% and LFU by 51%… FlashMoE achieves 4× faster initial loading than llama.cpp and 6.8× faster than Fiddler and DAOP." 置信度：高。

[^36^]: "MoE-Beyond: Learning-Based Expert-Activation Predictor," arXiv:2508.17137, 2025-08. https://arxiv.org/pdf/2508.17137 摘录："training a lightweight four-layer transformer on 66 million expert activation traces, our system lifts prediction hit rate from 17% to 72% and boosts GPU cache hit rate by up to 55% compared with… MoE-Infinity." 置信度：高。

[^37^]: llama.cpp GitHub Issue #20757, "Two-tier GPU+RAM expert cache for MoE offload," 2026-03-19. https://github.com/ggml-org/llama.cpp/issues/20757 摘录："prefill sequences activate all experts in a roughly flat distribution, wiping the GPU slot buffer… SLRU + admission filter improved steady-state hit rate by 8–15 percentage points over plain LRU… Readahead (POSIX_MADV_WILLNEED): after each decode step, fire a prefetch hint for the experts just used." 置信度：中高（工程提案+PoC）。

[^38^]: Fire-Flyer AI-HPC（3FS 关键技术）, arXiv:2408.14158v2. https://arxiv.org/html/2408.14158v2 摘录："The storage service has an implementation of Chain Replication with Apportioned Queries (CRAQ) to provide strong consistency… To mitigate this congestion, a request-to-send control mechanism is implemented… The request-to-send control increases end-to-end IO latency but it's required to achieve sustainable high throughput." 置信度：高。

[^39^]: Fire-Flyer AI-HPC（存算一体网络/流量隔离）, arXiv:2408.14158. 摘录："our cost-effective network integrated computation communication and storage traffics together… By using InfiniBand's Service Level (SL) technology… map SL to IB physical queues Virtual Lanes (VLs)… preventing network congestion caused by Head-of-line (HOL) blocking." 置信度：高。

[^40^]: "A Reality Check on DeepSeek's Distributed File System Benchmarks"（独立复核）. https://maknee.github.io/blog/2025/3FS-Performance-Journal-2/ 摘录："each token requires approximately 70KB of storage in FP16 format… Average throughput hovers around 3 GB/s… Peak throughput reaches approximately 40 GB/s… the peak 40 GB/s achieves 80% network utilization, while average performance uses only 6%." 置信度：中高（独立分析）。

[^41^]: DeepEP.org, "3FS (Fire-Flyer File System)." https://www.deepep.org/en/3fs 摘录："Efficient KV Cache: Provides a cost-effective alternative to DRAM caching with high throughput and larger capacity, ideal for AI inference workloads… Data Loaders: Eliminate the need for prefetching or shuffling datasets by supporting random access to training samples across compute nodes." 置信度：中（第三方整理官方）。

[^42^]: 同 [^14^]（MLA 压缩 KV → 可上低成本硬盘）。置信度：中。

[^43^]: AtlasPeak Research, "DeepSeek DualPath and the Memory-Fabric Bottleneck in Agentic AI Inference," 2026-05-04. https://www.atlaspeakresearch.com/report/9b7d75 摘录："SGLang HiCache… 3FS integration doubled throughput and lifted hit rate from 40% to 80%… DeepSeek 3FS: README benchmarks cite 6.6 TiB/s aggregate read throughput and up to 40 GiB/s KVCache client read throughput… agentic serving can become storage-NIC and memory-fabric bound." 置信度：中（行业分析汇总）。

[^44^]: Alibaba Cloud, "Tair KVCache Implementation Based on 3FS," 2026-01-08. https://www.alibabacloud.com/blog/602856 摘录："bandwidth ≥ 20 GB/s/node… P99 < 50ms… 3FS, the open-source high-performance distributed file system developed by DeepSeek, provides a compelling storage foundation for AI training and inference." 置信度：中高（厂商技术博客）。

[^45^]: kandiga（Qwen3.5-35B-A3B 路由实证）, GitHub, 2026-04-04. https://github.com/kantheon/kandiga 摘录："Cross-layer expert indices are random. Adjacent layers share experts at 1.07x random chance (Jaccard 0.017 vs 0.016 expected)… Cross-layer speculation achieves 77% accuracy by predicting from hidden_state × next_gate_weights… Top-8 experts capture only 15.7% of total probability mass… Gini coefficient rises from 0.38 (layer 0) to 0.62 (layer 20)… Cross-token expert caching shows 35% hit rate. Deep layers hit 48%." 置信度：中（独立实测、单模型、待同行评审）。

[^46^]: "Serving Large Language Models on Huawei CloudMatrix384," arXiv:2506.12708, 2025-05-25. https://arxiv.org/html/2506.12708v2 摘录："DeepSeek-V3 expands upon its predecessor by increasing the number of routed experts per layer from 160 to 256… Kimi-K2 scales to 384… Qwen3-235B… incorporates 128 experts." 另见 "A Circular Taxonomy of LLMs," arXiv:2601.14053："MoE decouples these: total parameters can scale to 671B (DeepSeek-V3) while keeping active parameters at 37B—achieving quality(671B) at cost(37B)." 置信度：高。

[^47^]: DeepEP 库说明（GitHub/neuralmagic 镜像）, 2025-09-26. https://github.com/neuralmagic/DeepEP-test 摘录："DeepEP… provides high-throughput and low-latency all-to-all GPU kernels… supports low-precision operations, including FP8… optimized for asymmetric-domain bandwidth forwarding, such as forwarding data from NVLink domain to RDMA domain… For latency-sensitive inference decoding, DeepEP includes a set of low-latency kernels with pure RDMA… hook-based communication-computation overlapping." 置信度：高。

[^48^]: DeepSeek 影响综述（引 DeepEP 实测）, arXiv:2507.09955. https://arxiv.org/pdf/2507.09955 摘录："FP8 precision can increase throughput by 1.5-2.5×, MoE dispatch/combine latency can be reduced by 30-50%, and RDMA-based inference decoding can decrease end-to-end inference time by 10-25%." 置信度：中高。

[^49^]: Megatron-Core MoE（GB200/H100 调优）, arXiv:2603.07685. 摘录："The GB200 configuration uses HybridEP (optimized for NVL72) and CUDA Graphs… The H100 configuration uses FP8-blockwise precision with DeepEP and EP all-to-all overlap… Performance (TFLOPS/GPU) 1048 [GB200] / 368 [H100]." 置信度：高。

[^50^]: SK hynix OCP 2025 / 产业分层（"HBM 热层 + HBF 冷/温层"）. 见 [^19^][^20^]；"future large-scale AI systems are expected to increasingly rely on a combination of HBM as a 'hot tier' and HBF as a 'cold tier'." 置信度：中。

[^51^]: "Sticky Routing: Training MoE Models for Memory-Efficient Inference," arXiv:2607.08780, 2026-06-12. https://arxiv.org/html/2607.08780v1 摘录："All of the above methods are inference-time interventions. They exploit whatever locality the trained model's router provides but cannot alter the router's inductive bias. StickyMoE… instilling the locality bias from the first training step, allowing the expert representations and routing decisions to co-adapt." 置信度：中高（新工作）。

---

*调研完成。核心结论：HBF/大容量 Flash 不会使 MoE 失效，反而契合 MoE"稀疏读 + 推理只读 + 大容量"的特性；MoE 将从"EP/all-to-all 通信受限"回归"内存带宽受限"，演化为"HBM 算 + HBF 存全量专家 + 按需流式读 + SSD/3FS 存 KV/数据"的分层新形态。主要争议在于路由动态性对预取的挑战（在低带宽介质下严重、在 HBF 下被"治本"）与 HBF 自身的延迟/写寿命约束。*
