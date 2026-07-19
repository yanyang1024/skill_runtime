# HBF Dim-03：冷热 KV 卸载到 NAND/HBF 类闪存介质的可行性判定标准

**调研范围**：2024–2026 学术系统论文（arXiv/ATC/FAST/EuroSys/ASPLOS/HPCA）+ 工业界规格（SanDisk/SK hynix HBF、NVIDIA ICMS）。主题：KV cache 卸载到 NAND/HBF 层的可行性判定标准（reuse 距离、访问频率、块大小、时延预算、prefetch 可掩盖性、写耐久），及命中率/命中时间对 TTFT/ITL/吞吐的影响。
**检索规模**：30+ 次独立搜索（英文为主），核心证据来自 ≥15 篇一手论文/规格文档。

---

## Key Findings

**KF-1 「读不如重算」的拐点已被实测跨越，SSD 层 KV 恢复在朴素实现下普遍劣于重算；只有消除 CPU 中心化 I/O 路径+大块聚合 I/O 后才翻盘。**
Tutti（2026）实测：vLLM+LMCache 三级层次下，从 SSD 恢复 KV 导致 **GPU bubble 占总推理时延 70–80%**（即使开 GDS 仍 >70%），"restoring KV cache from SSDs is no longer beneficial due to severe I/O bottleneck"[^1^]。其根因不是 SSD 原始带宽，而是 paged KV 布局碎片化：128K token KV（Qwen3-32B，64 层、block=64）= **约 25.6 万个散落的 80KB 对象**；LMCache 按 256-token chunk 聚合后仍需 >1000 次（多为随机）访问[^2^]。Tutti 用 GPU 中心化对象存储+GPU io_uring+slack 感知调度后，SSD 后端达到接近 DRAM 后端的性能：TTFT 较 GDS 方案降 78.3%、可承载请求率 2×、成本降 27%[^1^]。（置信度：高）

**KF-2 时延预算模型（判定核心公式）**：层叠预取能完全掩盖加载的充要条件是 **T_load·L_hist ≤ T_pref·L_new**（AttentionStore 推导）；不足部分可用 HBM 读缓冲补齐，**S_buf = B·(T_load·L_hist − T_pref·L_new)**[^3^]。这直接给出"prefetch 可掩盖性"的判定：追加新 token 越多（agent 短 append 场景 L_new 小）越难掩盖，需要的缓冲/提前量越大。同时 HCache 给出"读 vs 重算"带宽平衡点：7B/13B/30B 模型约需 **24/21/37 GB/s** 存储带宽才能使传输与（hidden-state）重算等速[^4^]；另一独立工作（3D-parallel restoration, 2026）给出链路级拐点：**80 Gbps 下 I/O 恢复快于重算，10 Gbps 下慢于重算**（长上下文重算 1.2–1.5s vs 典型 200ms 目标）[^5^]。（置信度：高）

**KF-3 KV reuse 的时间分布呈强偏斜+短寿命，但 workload 相关**：阿里云生产 trace（ATC'25, KVCache Cache in the Wild）实测：**80% 的 KV 复用间隔 <10 分钟（to-C 聊天 trace）/ <10 秒（to-B API trace）；KV 块 P99 寿命仅 97 秒（to-B）；10% 的块贡献 77% 的复用**[^6^]。单轮请求（系统提示词/模板前缀）在 to-B 负载中贡献 97% 的复用，跨用户复用极低[^6^]。多轮对话侧：ShareGPT 78% 会话为多轮，历史 token 占比随轮数升到 >98%，重算占 prefill 成本 98%[^7^]；HCache 指出长上下文场景"同一上下文可能隔数小时才被复用"[^4^]。Agent 轨迹侧：DualPath 实测 coding agent 轨迹 **平均 157 轮、平均上下文 32.7K token、平均每轮仅 append 429 token → KV 命中率 98.7%**；agent 类负载命中率典型 ≥95%，cache-compute 比约 22 GB/PFLOP（DeepSeek-V3.2），I/O 而非算力成为主导瓶颈[^8^]。（置信度：高）

**KF-4 分层放置策略已从 LRU/FIFO 演进到"未来感知/预测驱动"四类**：(a) **调度器感知**（AttentionStore look-ahead 取数/驱逐窗口，利用作业队列未来信息，命中率 76% vs LRU 31% / FIFO 48%，且 >99.9% 命中落在 DRAM）[^9^]；(b) **workload 分布拟合**（ATC'25：按请求类别拟合复用概率指数分布+寿命调节，hit +8.1–23.9% vs LRU/LFU/S3-FIFO，QTTFT −28.3–41.9%）[^6^]；(c) **FLOP 感知/准入控制**（Marconi：按复用可能性 taxonomy 准入、按"省算力/占空间"比驱逐，token 命中率最高 34.4×，TTFT 降 71.1%/617ms）[^10^]；(d) **学习型多步预测**（PBKV：图+语义多步预测、保守预取仅用空闲带宽 S_bw=Bandwidth×StepDuration，1.85× vs LRU；CacheSage：agent 转移矩阵+生存驱逐，hit +13–37pp；贝叶斯 Beta 共轭先验预测复用，70–84% 命中率）[^11^][^12^][^13^]。SGLang HiCache 工业实现提供 write_through / write_through_selective（按命中计数只备份热点）/ write_back 三档写策略与 best_effort/wait_complete/timeout 预取策略[^14^]。（置信度：高）

**KF-5 命中率→TTFT/吞吐的定量传导链已有多个实测锚点**：Marconi：token 命中率提升对应 TTFT −71.1%[^10^]；ATC'25：hit +1.5–3.9pp（vs 最优基线）→ QTTFT −28.3–41.9%[^6^]；RTP-LLM（阿里生产）：分层 KV+前缀缓存 → TTFT P95 −35~37%、缓存复用 +215%、prefill 机器 −75%[^15^]；LMCache+vLLM 社区报告 3–10× 时延下降；VAST+DGX SuperPOD 实测 128K 上下文 TTFT 从 >11s 降到 1.5s（400Gbps RDMA+GDS）[^16^]。反向地，KVServe 实测 10–50Gbps 链路下 KV 通信占 JCT 16–60%，5–15Gbps 云链路下可占端到端 66%[^17^]——即命中时间（hit time）与命中率同样决定收益。（置信度：高）

**KF-6 NAND 写耐久对 KV 的约束取决于"哪类 KV"：活跃 decode KV 不适合，历史/共享 KV 可计算验证可行。** KV 具有写一次读多次特性：FlexGen-SSD 块层 trace 实测 KV 读带宽 2.0GiB/s vs 写 11MiB/s（**读:写≈186:1**），单 sector 最多被读 256 次（每个输出 token 读一次）[^18^]。但每 token 都产生新 KV 写入：业界共识 HBF 不能放活跃 KV（"the KV cache takes new writes every token; NAND's endurance can't handle that"）[^19^][^20^]。FlashAccel（2026）给出迄今最完整的耐久预算核算：每 HBF-GPU 写 988MB/s KV（decode 276MB/s + prefill 712MB/s，agent 负载），5 年共 148,570TB；1152GB 容量 × 100 万 P/E（靠把 retention 从 3 年降到 3 天换取 10× 耐久提升）= 1,125,000 TBW → **有 7.6× 余量，可行**；但若按常规 10 万 P/E 则只有 112,500 TBW < 需求，**不可行**——判定对 P/E 假设极其敏感[^21^]。SK hynix H³ 方案由此把 KV 分两类：**共享预计算 KV（read-only）放 HBF，生成的活跃 KV 放 HBM**，B200+8×HBM3E+8×HBF 模拟吞吐 1.25×（1M ctx）/6.14×（10M ctx）、能效 2.69×[^22^]。（置信度：中高）

**KF-7 HBF 规格定位（判定基准面）**：Gen1 512GB/stack（16 die）、读带宽 1.6TB/s（≈HBM4@6.4Gbps）、容量为 HBM 8–16×、成本/GB 约 1/10；**读时延仍为 µs 级（Ma & Patterson ballpark：数千 ns，最小读粒度 4KB，vs HBM 10–100ns/32B）**，写耐久低（公开口径 10^4–10^5 P/E，SemiEngineering 访谈称"some 10,000, rare 100,000, in the level of thousands"）；SanDisk 自测 Llama 3.1 405B 权重流读与无限 HBM 基线差距 <2.2%；样品 H2'2026、设备 2027[^20^][^23^][^24^][^25^]。判定含义：HBF 相对 NVMe SSD（~14GB/s、~10⁴ns+）带宽提升约 100×，但时延/粒度仍是 NAND 物理约束——**只有"可预知地址的大块流式读"负载能吃满 HBF，这恰好匹配前缀 KV 恢复（哈希寻址、整块顺序读），不匹配 decode 期随机细粒度读**[^19^][^23^]。（置信度：高）

**KF-8 产业趋势交叉验证**：Mooncake（FAST'25 最佳论文，Kimi 生产，千节点、日 100B+ token）以 CPU/DRAM/SSD/NIC 建分布式 KV 池，长上下文有效请求容量 +59–498%[^26^]；NVIDIA 2025 宣布 ICMS（Inference Context Memory Storage）：BlueField-4 DPU 上的 **flash 后端 KV cache，硬件辅助驱逐与预取**[^27^]；DualPath 指出 Ampere→Blackwell 的 I/O-compute 比恶化 14.4×，agent 负载下 prefill 侧存储网卡带宽成为全系统瓶颈，其双路径方案离线/在线吞吐 +1.87×/1.96×[^8^]。（置信度：高）

---

## 定量数据

### A. HBF / NAND 介质参数

| 参数 | 数值 | 来源 |
|---|---|---|
| HBF Gen1 容量/带宽 | 512GB/stack，1.6TB/s 读（Gen2 目标 >2TB/s/1TB，Gen3 >3.2TB/s/1.5TB） | SanDisk/SK hynix[^24^][^25^] |
| HBF vs HBM 容量/成本 | 8–16× 容量；同带宽下约 2× 功耗；成本/GB 约低 10× | chipstrat[^19^] |
| HBF 读时延/粒度 | 数千 ns（µs 级）、最小 4KB/read；HBM 10–100ns、32B | Ma & Patterson, IEEE Computer 2026[^20^] |
| HBF 写耐久 | 公开口径 ~10^5 P/E；访谈口径 10^3–10^5 不一 | [^22^][^23^] |
| NAND tR / tProg | 读远快于写：FlashAccel 实测配置读 4.6TB/s vs 峰值写 245.8GB/s | [^21^] |
| 常规 NVMe SSD | ~14GB/s（PCIe5）、时延万 ns 级 | [^20^] |

### B. SSD 卸载系统实测

| 系统 | 关键实测数据 | 来源 |
|---|---|---|
| Tutti (2026) | 朴素 SSD 恢复 GPU bubble 70–80%；Tutti TTFT −78.3%（vs GDS-LMCache）、请求率 2×、成本 −27%；2×Solidigm D7-PS1010 读 29GB/s、写 12GB/s | [^1^][^2^] |
| AttentionStore/CachedAttention (2024, ATC) | 命中率：HBM-only ≈0%、HBM+DRAM 0.9–11.2%、加 SSD 后 56–89%；TTFT −84/50/88/88%（13B/65B/70B/40B）；prefill 吞吐 2–8.2×；成本 −31~56% | [^7^][^9^] |
| HCache (EuroSys'25) | TTFT 1.27–1.90× vs KV offload、2.21–3.57× vs 重算；TBT 劣化 ≤4%；重算 TTFT 为理想值 20–26×、offload 为 6.5–13×；hidden state 存储量为 KV 一半 | [^4^] |
| InstInfer (HPCA'25) | 13B+A6000 长序列吞吐 ≤11.1× vs FlexGen；数据迁移 −94%；CSD（OpenSSD, PCIe Gen3x4）内做 decode attention | [^28^] |
| Strata (2025) | GPU 辅助 I/O+cache 感知调度；TTFT 5× vs vLLM+LMCache、3.75× vs TRT-LLM；75% PCIe 带宽利用时 stall 仍占 prefill 24% | [^29^] |
| Cake (ICML'25) | 双向（前向算+反向读）调度，TTFT 平均 −2.6× vs 纯算/纯读 | [^30^] |
| FlashGen (ASPLOS'25) | GPU/CPU/Disk 多级 KV+请求重排+proactive(inclusive) 备份，利用 host memory 做 Disk 中转；面向多轮对话 prompt amplification 与队头阻塞 | [^31^] |
| KVDrive (2026) | 注意力感知 GPU 缓存+SFC 解耦流水+SSD 感知布局，吞吐 1.74× vs SOTA offloading | [^32^] |
| FlexGen-SSD I/O trace (CHEOPS'25) | KV 读:写≈186:1（2.0GiB/s vs 11MiB/s）；128KiB 请求为主；sector 最多读 256 次；libaio>POSIX | [^18^] |

### C. Reuse 时间分布与命中率

| 指标 | 数值 | 来源 |
|---|---|---|
| 生产 reuse 间隔 | 80% <10min（to-C）/ <10s（to-B API） | ATC'25[^6^] |
| KV 寿命 | P99 = 97s（to-B）；LFU 不适用（短命块历史频率高） | [^6^] |
| 复用偏斜 | 10% 块→77% 复用；跨用户复用极低 | [^6^] |
| 理想命中率所需容量 | to-B：2× GPU HBM 即可；to-C（GQA）：4× HBM | [^6^] |
| 生产 vs 合成 hit | 生产 54%/62% vs 合成 >80% | [^6^] |
| Agent 轨迹 | 157 轮、32.7K ctx、429 append → 98.7% hit；≥95% 典型；22GB/PFLOP | DualPath[^8^] |
| ShareGPT | 78% 多轮；历史 token >98%；重算占 prefill 98% | AttentionStore[^7^] |
| 长上下文联用 | 同一上下文可隔数小时复用；对话轮间隔实验设 30s | HCache[^4^] |
| Pensieve | 用户 think time 60s→600s 时命中率下降、吞吐递减；驱逐偏好"久未活跃+重算便宜"的会话 | [^33^] |

### D. 命中时间/带宽拐点

| 判据 | 数值 | 来源 |
|---|---|---|
| 读 vs 重算带宽平衡 | 7B/13B/30B ≈ 24/21/37 GB/s（hidden-state 混合方案） | HCache[^4^] |
| 链路级拐点 | 80Gbps：I/O 快于重算；10Gbps：慢于重算（长上下文） | 3D-parallel[^5^] |
| KV 通信占 JCT | 10–50Gbps：16–60%；5–15Gbps：≤66% | KVServe[^17^] |
| DRAM 容量换算 | ~2TB DRAM 仅保留约 5 分钟 KV；100TB NVMe 可留 >1 小时 | Tutti[^2^] |
| 128K KV 恢复 I/O 规模 | 25.6 万个 80KB 随机对象（64 层 block64）；聚合后 >1000 次 chunk 访问 | Tutti[^2^] |
| PCIe Gen4 x16 实测 | 26GB/s 有效；2K token KV（5GB）加载 192ms vs prefill 360ms（65B） | AttentionStore[^3^] |
| KV 生成速率 | LLaMA-65B：13.9GB/s → 190GB 空闲 HBM 14 秒写满 | [^7^] |

### E. 写耐久核算（FlashAccel, 2026）

| 项 | 数值 |
|---|---|
| 每 HBF-GPU KV 写入 | 988MB/s（decode 276 + prefill 712），占用 3.9ms/s ≈ 4% 开销 |
| 5 年总写入 | 148,570 TB |
| TBW 供给 | 1152GB × 1M P/E = 1,125,000 TBW（余量 7.6×）；若 100K P/E → 112,500 TBW（不足） |
| 耐久增强杠杆 | retention 3 年→3 天可延寿至 50×；保守取 10×（100K→1M P/E） |

来源[^21^]。另：GQA/MLA 减少 KV 写量是可行性的前提之一[^21^]。

---

## 判定标准归纳

**什么冷热程度的 KV 适合放 NAND/HBF 层——五档判定矩阵**

| KV 类别 | 复用间隔 | 访问模式 | 适合介质 | 依据 |
|---|---|---|---|---|
| ① 活跃 decode KV（逐 token 追加） | 每 step | 细粒度随机读+持续写 | HBM/DRAM 专属，**禁放 NAND** | 写耐久+时延[^19^][^20^] |
| ② 热前缀/系统提示（秒级复用） | <10s（to-B 80%） | 高频整块读 | HBM→DRAM；小容量即可（2×HBM） | ATC'25[^6^] |
| ③ 温历史会话 KV（多轮/agent） | 10s–10min | 大块顺序读、可预取 | DRAM 为主，SSD/HBF 经预取兜底 | [^6^][^8^][^9^] |
| ④ 冷历史 KV（小时级） | 数小时 | 整块批量读，可提前预取 | NVMe SSD / HBF / 对象存储 | HCache[^4^]、Mooncake[^26^] |
| ⑤ 共享预计算只读 KV（CAG/权重式） | 写一次读 N 次 | 流式大块只读 | **HBF 最佳适配场景** | H³[^22^]、Ma&Patterson[^20^] |

**五条判定标准（可操作的判定式）**

1. **读-算拐点（reuse 价值 vs 时延预算）**：卸载读回划算 ⟺ `KV_bytes/BW_eff + t_fixed < T_recompute(ctx)`。带宽拐点约 24–37GB/s（单机）或 10–80Gbps（网络链路）；低于拐点宁可重算或用 Cake 式双向混合[^4^][^5^][^30^]。
2. **Prefetch 可掩盖性**：`T_load·L_hist ≤ T_pref·L_new + B_buf/BW`；短 append（agent 98%+ 命中率）场景掩盖窗口最小，必须靠调度器/队列信息提前预取（look-ahead 窗口、wait_complete 策略）[^3^][^8^][^14^]。
3. **块大小/粒度匹配**：NAND 页（4–16KB）与 HBF 最小读（4KB）要求聚合到 ≥256-token chunk / 对象级批量 I/O；碎片化 paged 布局（80KB×25 万）是 GPU bubble 主因——粒度聚合与前缀共享细粒度存在 trade-off[^1^][^2^]。
4. **复用可预测性**：按（请求类型×轮数）拟合的复用概率可预测 → 用预测驱动放置/驱逐（WA 分布拟合、PBKV 多步预测、贝叶斯先验、CacheSage 转移矩阵）；不可预测则退化为 LRU 并接受较低 hit[^6^][^11^][^12^][^13^]。
5. **写耐久预算**：`Σ(每日 KV 写入量) × 365 × 年限 ≤ 容量 × P/E × WAF 折减`；KV 写一次读多次（读:写≈186:1[^18^]）使历史 KV 可行，但须满足 GQA/MLA 低写量+retention 折短换耐久两个前提；活跃逐 token KV 一律不入 NAND[^21^]。

---

## 争议

1. **HBF 放 KV 是否可行——阵营分裂**。SanDisk/SK hynix 营销与 H³ 论文称 HBF "includes support for large KV caches"[^24^][^22^]；FlashAccel 给出有条件可行的 TBW 核算[^21^]；但 chipstrat/Ma & Patterson 明确"KV cache takes new writes every token; NAND's endurance can't handle that"[^19^][^20^]。分歧实质是**对象界定**：反对者指活跃 decode KV，支持者指历史/共享只读 KV。且 HBF 耐久本身无官方统一数字（10^3–10^5 P/E 口径不一[^23^]），可行性结论对 P/E 假设有一阶敏感性（FlashAccel 场景下 100K P/E 即不可行[^21^]）。
2. **SSD 层到底值不值**——Tutti 前（2024–2025）多个系统（AttentionStore、HCache、Strata、Cake）显示 SSD offload 优于重算；Tutti（2026）实测朴素三级层次"读不如重算"、GPU bubble 70–80%，并称随推理引擎变快该劣势扩大[^1^]；Tutti 自身又用 GPU 中心化 I/O 翻盘。争议点转化为：**瓶颈在介质还是 I/O 栈软件**（CPU 中心化、碎片化）。若 Tutti 结论成立，HBF 的高带宽也需 GPU 直连 I/O 路径才能兑现。
3. **生产 trace 对"需要多深层次"的反直觉结论**：ATC'25 实测 to-B 负载 2×HBM 即够、GPU 内缓存即可，"eliminating the cost and complexity of deploying a CPU-RDMA-SSD hierarchy"[^6^]——与 Mooncake/Tutti 的深分层叙事相反。分歧来自负载类型（API 短前缀 vs 长上下文多轮/agent），提示 HBF 层需求强度高度 workload 相关。
4. **预测驱动 vs 简单策略的边际收益**：ATC'25 WA 策略仅 +1.5–3.9pp（vs 最优基线）hit，虽带来 28–42% QTTFT 改善[^6^]；PBKV/CacheSage 报告更大收益但多为 agent 负载新场景[^11^][^12^]。学习驱动的放置策略在容量充足时收益递减，工程复杂度是否值得仍有争议。
5. **Rubin CPX 取消与 ICMS 走向**：NVIDIA 以 GDDR7 做上下文层的 CPX 于 2026 GTC 取消、转向 SRAM 方案，但 BlueField-4 ICMS（flash 后端 KV+硬件驱逐/预取）仍在推进[^27^][^34^]——产业界对"上下文/KV 放哪一层"尚无收敛答案。

---

## 引用

[^1^]: Tutti: Making SSD-Backed KV Cache Practical for Long-Context LLM Serving. "restoring KV cache from SSDs performs much worse than from DRAM, causing GPU bubbles to exceed 70% of total inference latency in all cases… Even with GDS, GPU bubble time remains high at above 70%… Tutti reduces TTFT by 78.3% under strict SLO constraints and improves the achievable request rate by 2×. The serving cost is reduced by 27%." https://arxiv.org/abs/2605.03375 （v1: 2026-05-05）置信度：高（系统论文实测）
[^2^]: Tutti PDF §1/§2. "even about 2 TB of DRAM retains only around five minutes of KV cache… over 100 TB capacity of NVMe SSDs, enough to retain more than one hour of KV cache"; "reloading a 128K-token KV requires fetching about 256K scattered 80 KB objects"; "the default LMCache chunk stores 256 tokens, causing a 128K-token KV to require more than 1,000 chunk accesses, most of which are random." https://arxiv.org/pdf/2605.03375 （2026-05-05）置信度：高
[^3^]: AttentionStore §3.2. "Imperfect overlapping happens when T_load·L_hist > T_pref·L_new… the buffer size can be set by S_buf = B(T_load·L_hist − T_pref·L_new)"; "prefilling 2K tokens consumes about 360 ms… loading the KV cache of the 2K tokens (5GB) from host memory consumes about 192 ms (26GB/s effective)". https://arxiv.org/html/2403.19708v1 （2024-03）置信度：高
[^4^]: HCache (EuroSys'25). "To achieve a balanced speed between computation and transmission using only hidden states, approximately 24GB/s, 21GB/s, and 37GB/s of storage bandwidth are needed for the 7B, 13B, and 30B models"; "the TTFT for recomputation is 20.0-26.0× slower than the ideal case, while KV offloading is 6.5-13.0× slower"; "in long context applications, the same context may be reused hours apart". https://arxiv.org/abs/2410.05004 （2024-10）置信度：高
[^5^]: Efficient LLM Serving with 3D-Parallel KV Cache Restoration. "recomputation can take over 1.2–1.5 seconds for long contexts… far exceeding typical latency targets (~200 ms). I/O-based restoration can be faster under ideal conditions (e.g., 80 Gbps), but… under realistic conditions (e.g., 10 Gbps)… its latency can exceed that of recomputation." https://arxiv.org/html/2604.25080v1 （2026-04-28）置信度：高
[^6^]: KVCache Cache in the Wild (USENIX ATC'25, SJTU+Alibaba). "In Trace A, 80% of the reuse time falls within less than 10 minutes, while in Trace B it falls within 10 seconds"; "the P99 lifespan of KV$ in to-B workloads is 97 seconds"; "10% of KV$ blocks contribute to 77% of the reuses"; "WA achieves 8.1–23.9% higher hit rate compared to other baselines… 28.3–41.9% QTTFT reduction"; "a KV$ with capacity 2× of the GPU HBM per-GPU is sufficient to approach an ideal hit rate". https://arxiv.org/abs/2506.02634 （v1 2025-06-03; ATC'25）置信度：高（生产 trace）
[^7^]: AttentionStore (CachedAttention, ATC'24). "78% of conversations are multi-turn… the percentage of historical tokens will be more than 98%… The repetitive computation time occupies 98% of the prefilling time"; "the generation speed of the KV cache is about 13.9GB/s… the remaining 190GB of free HBM space will be fully occupied within 14 seconds." https://arxiv.org/abs/2403.19708 （2024-03）置信度：高
[^8^]: DualPath: Breaking the Storage Bandwidth Bottleneck in Agentic LLM Inference. "the mean number of rounds is 157… The average context length is 32.7k, while the append length mean is only 429, which means a KV-Cache hit rate of 98.7%"; "typically ≥95%"; "the cache-compute ratio… is approximately 22 GB/PFLOP for DeepSeek-V3.2"; "from NVIDIA Ampere to Blackwell, the I/O-compute ratio decreases by 14.4×". https://arxiv.org/abs/2602.21548 （2026-02-25）置信度：高
[^9^]: AttentionStore §4.3.3/§4.3.8. "AS achieves a remarkable hit rate of 76%, surpassing LRU (31%) and FIFO (48%)… over 99.9% of the hits occurring in DRAM due to its scheduler-aware policy"; "HBM-only… nearly 0%… HBM with DRAM… 1.9–11.2%… with SSDs… 76%, 56%, 87%, and 89%". https://arxiv.org/html/2403.19708v1 （2024-03）置信度：高
[^10^]: Marconi: Prefix Caching for the Era of Hybrid LLMs. "only accepting states with a high reuse likelihood based on a taxonomy of potential prefix reuse scenarios… a FLOP-aware eviction policy that balances recency and potential compute savings… Marconi achieves up to 34.4× higher token hit rates (71.1% or 617 ms lower TTFT)". https://arxiv.org/abs/2411.19379 （2024-11-28）置信度：高
[^11^]: PBKV: Prediction-based KV-Cache Management. "predicts the agent invocations in several future steps… estimates the reuse potential of cache entries… up to 1.85× speedup over LRU… improves the KV-Cache hit rate by up to 2.55× over LRU"; prefetch budget "S_bw = Bandwidth × StepDuration". https://arxiv.org/abs/2605.06472 （2026-05-07）置信度：高
[^12^]: CacheSage (A Policy-Driven Runtime Layer for Agentic LLM Serving). "learns the per-workload agent transition matrix online and uses it for survival-based eviction and between-step prefetch… +13 to +37 pp cache hit-rate lift, 12% to 29% lower mean TTFT, and 6% to 14% higher throughput". https://arxiv.org/abs/2605.27744 （2026-05-26）置信度：中高（初步结果）
[^13^]: Predictive Multi-Tier Memory Management for KV Cache in Large-Scale GPU Inference. "Bayesian reuse prediction with Beta conjugate priors over 16 (block-type, transition-type) pairs, achieving 70–84% cache hit rates and 1.4–2.1× projected TTFT reductions… six-tier memory hierarchy… 40 GB to over 38 TB per node". https://arxiv.org/abs/2604.26968 （2026-04-19）置信度：中（分析投影为主）
[^14^]: SGLang HiCache Best Practices. "write_through: Immediately writes to all tiers… write_through_selective: Uses hit-count tracking to back up only frequently accessed data… write_back: Writes to slower tiers only on eviction"; prefetch policies "best_effort / wait_complete / timeout". https://docs.sglang.ai/advanced_features/hicache_best_practices.html （检索 2026-07）置信度：高（官方文档）
[^15^]: RTP-LLM (Alibaba). "Production evaluations demonstrate 35-37% TTFT P95 latency reduction and 215% cache reuse improvement, enabling 75% reduction in prefill machine count." https://arxiv.org/abs/2605.29639 （2025-11）置信度：高
[^16^]: Backend.AI 工程综述（引 LMCache/VAST 基准）. "Reports from LMCache and vLLM benchmarks show 3 to 10× latency reductions… When VAST Data tested vLLM and LMCache on a DGX SuperPOD… loading a precomputed KV cache cut TTFT at 128K context from over 11 seconds down to 1.5." https://www.backend.ai/blog/2026-04-how-to-save-gpu-memory-in-llm-serving-kv-cache-offloading （2026-06-16）置信度：中（二手汇总）
[^17^]: KVServe. "At 10–50 Gbps, communication accounts for 16%–60% of JCT"; "Under 5–15Gbps links in typical cloud servers, KV communication accounts for up to 66% of end-to-end time". https://arxiv.org/html/2605.13734v1 （2026-01-29）置信度：高
[^18^]: Ren et al., An I/O Characterizing Study of Offloading LLM Models and KV Caches to NVMe SSD (CHEOPS'25). "the read bandwidth of the KV cache is significantly higher (186.2×) than the write bandwidth because the KV cache is written once but read multiple times… a peak of around 256 times… dominant request size is 128KiB". https://atlarge-research.com/pdfs/2025-cheops-llm.pdf （2025-03）置信度：高
[^19^]: Chipstrat, High Bandwidth Flash: The Full Report. "the same material delivers 1.6 TB/s. Roughly 100x the bandwidth, from packaging alone… HBF's latency is still 10-100x slower than HBM… But the KV cache takes new writes every token; NAND's endurance can't handle that." https://www.chipstrat.com/p/high-bandwidth-flash-the-full-report （2026-07-07）置信度：中高（分析媒体，引一手资料）
[^20^]: Ma & Patterson, Challenges and Research Directions for LLM Inference Hardware (IEEE Computer 2026; arXiv 2601.05047). Table 3: "1 HBF stack: 512 GB, 1638 GB/s read, <80W, read latency 1,000s ns, 4096 bytes per read, low write endurance; 1 HBM4 stack: 48 GB, 1638 GB/s, 10-100 ns, 32 bytes"; "HBF must hold infrequently-updated data, such as weights at inference time or slow-changing context." https://arxiv.org/pdf/2601.05047 （2026-01）置信度：高
[^21^]: FlashAccel: Leveraging High-Bandwidth Flash for High-Throughput LLM Inference. "the peak write bandwidth is only 245.8 GB/s [vs read 4.6 TB/s]… each HBF-based GPU writes 988MB of KV cache per second… Over a 5-year deployment… 148,570TB of total KV cache writes. With 1152GB capacity and 1M P/E cycles, CSI provides 1,125,000 TBW, sufficient for KV cache storage"; "reducing the retention time can extend the endurance by up to 10×, increasing the P/E cycles from 100K to 1M". https://arxiv.org/abs/2607.10186 （2026-07-11）置信度：中高（模拟/原型系统）
[^22^]: SK hynix H³（经 semiwiki 报道）. "the shared precomputed KV cache is inherently read-only… Model weights and shared pre-computed KV caches are stored in the HBF. The generated KV caches… are stored in the HBM… H³ is 1.25× higher with 1 million tokens and 6.14× higher with 10 million tokens… 2.69× improvement in performance per watt"; "HBF has limited endurance – only approximately 100,000 write cycles". https://semiwiki.com/forum/threads/sk-hynix-proposes-hbm-and-hbf-hybrid-for-llm-inference.24754/ （2026-03-17）置信度：中（二手报道 IEEE 论文）
[^23^]: Semiconductor Engineering. "Some products offer 10,000 writes, and some rare products offer 100,000, but they are in the level of thousands"（Yun）; "HBF capacity is 256 GB per die, which gives 512 GB per 16-high stack. Read bandwidth is 1.6 TB/s… samples in H2'2026, systems in 2027". https://semiengineering.com/flash-getting-stacked-high-bandwidth-version/ （2026-06-29）置信度：中高
[^24^]: iTWire（SanDisk HBF 规格）. "256GB per die, 512GB per 16-high stack, and 1.6 TB/s of read bandwidth in the first generation… 8 to 16 times the capacity of HBM at a similar cost… within 2.2% of a hypothetical, unlimited-capacity HBM… includes support for large KV caches". https://itwire.com/business-it-news/storage/sandisks-high-bandwidth-flash-takes-aim-at-the-ai-memory-wall （2026-07-01）置信度：中（媒体报道官方规格）
[^25^]: OSCOO/VideoCardz（SK hynix+SanDisk OCP 标准化）. "Max Read Bandwidth Up to 1.6 TB/s; Single Die Capacity 256Gb; Max Stack Capacity 512 GB per stack; Matches HBM4 footprint… February 2026 moved standardization into OCP". https://www.oscoo.com/news/sk-hynix-and-sandisk-unveil-high-bandwidth-flash-for-ai-inference/ （2026-02-28）置信度：中
[^26^]: Mooncake (FAST'25 最佳论文). "efficiently utilizes the underexploited CPU, DRAM, SSD and NIC resources of the GPU cluster to establish a disaggregated KVCache… increases the effective request capacity by 59%~498%… operational across thousands of nodes, processing over 100 billion tokens daily… 115% and 107% more requests on A800 and H800 clusters". https://www.cs.tsinghua.edu.cn/csen/info/1084/4580.htm + arXiv:2407.00079 （2025-02）置信度：高
[^27^]: NVIDIA ICMS（经 arXiv 2603.21576 引用）. "Inference Context Memory Storage (ICMS): BlueField-4 DPU for LLM Inference… flash-backed KV cache with hardware-assisted eviction and prefetch." https://arxiv.org/pdf/2603.21576 （2026-03，转引 NVIDIA 2025 公告）置信度：中（转引）
[^28^]: InstInfer (HPCA'25). "the first work to exploit CSDs to address the performance penalty incurred from KV cache offloading. For a 13B model with an NVIDIA A6000 GPU, the throughput for long-sequence inference is improved by up to 11.1× compared to FlexGen… data migration overheads are effectively mitigated by up to 94.0%". https://arxiv.org/abs/2409.04992 （2024-09）置信度：高
[^29^]: Strata: Hierarchical Context Caching. "Strata achieves up to 5× lower TTFT compared to vLLM + LMCache and 3.75× speedup over NVIDIA TensorRT-LLM"; "even with an I/O mechanism achieving 75% of theoretical PCIe bandwidth, stalls still account for up to 24% of prefill execution time"; delay-hit 现象. https://arxiv.org/abs/2508.18572 （2025-08-26）置信度：高
[^30^]: Cake: Compute Or Load KV Cache? Why Not Both? (ICML'25). "a bidirectional scheduling strategy that dynamically balances KV cache computation and loading… Cake achieves on average 2.6× reduction in TTFT compared to compute-only and I/O-only methods." https://arxiv.org/abs/2410.03065 （2024-10-04）置信度：高
[^31^]: FlashGen (ASPLOS'25, Jeong & Ahn). "proposes a multi-level KV cache spanning GPU, CPU, and SSD with request reordering to improve utilization"（HybridGen 引）；"proactive (inclusive) 主动备份 KV Cache（GPU=>CPU, CPU=>Disk），利用 host memory 作为 GPU 和 Disk 的中转站"（二手解读）. https://arxiv.org/html/2604.18529v1 引文 + sanzo.top 解读（2025）置信度：中（未直接读原文）
[^32^]: KVDrive (2026). "KVDrive improves throughput by 1.74× over state-of-the-art offloading systems… SSD-aware layout to maximize sequential I/O locality… importance-guided warm-up". https://arxiv.org/html/2605.18071 （2025-05/2026）置信度：中高
[^33^]: Pensieve. "It evicts cached data to the next tier… preferring conversations that have been inactive for longer and/or those that are cheaper to recompute… the throughput of Pensieve decreases as the average user think time increases [60s→600s]". https://arxiv.org/abs/2312.05516 （2023-12）置信度：高
[^34^]: Spheron（Rubin CPX 取消分析）. "NVIDIA put Rubin CPX on its roadmap at the AI Infra Summit in September 2025, then pulled it six months later at GTC 2026… What replaced it was… the Groq 3 LPX Rack". https://www.spheron.network/blog/nvidia-rubin-cpx-long-context-inference/ （2026-04-10）置信度：中（行业媒体）
