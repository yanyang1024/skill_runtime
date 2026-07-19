# 维度 01：大模型推理 KV Cache 冷热分层与分层卸载机制现状（2024–2026）

- 调研日期：2026-07（检索执行日）；覆盖窗口 2024–2026
- 方法：中英文混合独立搜索 20 次（英文为主），优先 arXiv / 官方文档 / 厂商博客
- 引用格式：正文 [^n^] 内联引用；文末附原文摘录、URL、日期、置信度
- 核心问题：冷/热 KV 能否卸载到 HBF（High Bandwidth Flash）

---

## Key Findings

### KF1. KV cache 冷热划分的三种主流信号（频率/新近性、reuse 距离/前缀局部性、attention 重要性）

1. **访问频率与新近性（系统层，块/对象粒度）**：生产系统主流做法是对 KV block/object 做 LRU/LFU/租约(TTL)/频率计数。Mooncake 的 CPU 内存 KVCache 池按块存储并支持 LRU、LFU 或基于请求特征的驱逐算法[^4^]；Mooncake Store 主服务用高水位（默认 `eviction_high_watermark_ratio 0.9`）+ 批量驱逐比例（`eviction_ratio 0.1`）+ 对象租约 TTL（`default_kv_lease_ttl`）管理生命周期，并支持把驱逐对象自动落盘到 SSD[^5^]。NVIDIA Dynamo KVBM 采用**频率型驱逐**：每个 block 访问频率初始化为 1，命中翻倍，随时间衰减，频率 ≥2 的块才有资格从低层晋升[^9^]。AIBrix 的 KVCache Connector 支持**可插拔驱逐策略（LRU、S3FIFO）**[^12^]。SGLang HiCache 在 L1/L2 从 HiRadixTree 叶子节点开始驱逐以保持前缀完整性，而 L3 目前只能做对象级 LRU（前缀感知驱逐列为后续工作）[^8^]。
2. **Reuse 距离 / 前缀局部性（请求间共享）**：RadixAttention/HiRadixTree 以基数树组织前缀，"热"等价于"近期被多个请求共享的前缀"；调度器把请求路由到已持有该前缀 KV 的节点（cache-aware routing），Mooncake Conductor 按 KVCache 分布与负载派发请求并主动复制/迁移热点块[^4^][^6^]。
3. **Attention 重要性（模型层，token 粒度）**：H2O 按累计注意力保留 "heavy hitter" token、SnapKV 用 prompt 末端观察窗投票选重要位置、PyramidKV 按层做金字塔式预算分配[^13^][^14^]。注意这一族是**不可逆驱逐**（信息永久丢失），与"卸载到慢层、需要时取回"的可逆分层是正交的两类机制[^15^]。
4. **冷热的时间尺度证据**：Tutti 测算约 2 TB DRAM 只能保留约 5 分钟的 KV cache，而商用服务器 100 TB+ NVMe 可保留 1 小时以上[^16^]；Third Bridge 专家测算 100B 模型、1000 万 DAU 全量保留 KV 需要约 250 PB SSD/天，迫使业界每 0.5–1 小时就激进删除缓存、浪费算力[^22^]。**"冷 KV"实质上是一个容量/时间问题，不是价值问题。**

### KF2. 分层卸载的四个机制件（placement / eviction / prefetch / layer-wise pipeline）

- **Placement（放置）**：vLLM 侧是 GPU→CPU→KVConnector 的层级查找，CPU 侧块池用 LRU 驱逐、D2H/H2D 走独立流异步传输[^7^]；Dynamo KVBM 明确四层 G1(HBM)→G2(DRAM)→G3(本地 SSD)→G4(网络存储)，并支持 GPU→CPU、GPU→CPU→Disk、实验性 GPU→Disk 三种配置[^9^][^10^]；FlexKV 用 DRAM/本地 SSD/云存储三级，做"逻辑 LRU 驱逐"（空间不足时只改索引、不搬数据）[^26^]。FlexGen 更早把放置形式化为线性规划搜索（GPU/CPU/disk 三级、z 字形块调度），但面向吞吐离线场景[^17^]。
- **Eviction（驱逐）**：见 KF1。趋势是从纯 LRU 走向频率/租约/预测式（如贝叶斯预测 reuse 概率、S3FIFO），以及把前缀结构信息传给 L3 做前缀感知驱逐[^8^][^27^]。
- **Prefetch（预取）**：LMCache 利用排队间隙把后续请求的 KV 从慢层预取到快层（远程盘→本地内存/GPU）[^3^]；HiCache 提供 `best_effort`/`wait_complete`/`timeout` 三种预取停止策略，预取完成时间不确定是核心工程难点，并用专用 prefetch 线程 + RDMA 并行多节点读[^8^]；Mooncake 多轮对话基准里"预填充(pre-populated) Mooncake"拿到全场最优 TTFT[^25^]。
- **Layer-wise pipeline（逐层流水）**：LMCache 用三条 CUDA stream（compute/load/store）在第 N 层计算时异步加载第 N+1 层 KV，GPU 侧只需单层 KV 大小的缓冲[^3^][^28^]；CachedAttention、LayerKV、vLLM 社区 RFC（layerwise offload connector）、TensorRT-LLM 的 layer-wise async transfer 均采用同思路，使 TTFT ≈ prefill 计算时间 + 最后一层传输时间[^29^][^30^]。**但 Tutti 证明该机制对 SSD 层适得其反**（见 KF6）。

### KF3. 卸载介质层级与数量级（HBM→DRAM→NVMe→对象存储→HBF）

| 层级 | 容量量级 | 带宽量级 | 时延量级 | 证据 |
|---|---|---|---|---|
| GPU HBM | 80–192 GB/卡（B300 288 GB） | 3.3–8 TB/s | ~ns–1 µs | [^18^][^19^] |
| CPU DRAM | 0.5–2 TB/服务器 | ~300–540 GB/s（DDR5 12ch） | 50–100 ns | [^18^] |
| 本地 NVMe SSD | 单盘 8–30 TB，整机 30–120 TB；Gen5 ~14 GB/s/盘 | Tutti 实测 2 盘聚合读 29 GB/s、写 12 GB/s | ~50–500 µs | [^16^][^18^][^19^] |
| 分布式 KV 池（RDMA） | 数百 GB–TB 级聚合 | 受 NIC 限制（100–400 Gbps） | ~µs–ms | [^25^][^20^] |
| 对象存储 S3 | 近乎无限 | 随并发扩展 | 10–500 ms | [^19^][^21^] |
| **HBF（目标值，未流片量产）** | 512 GB/16-die 堆栈（8–16× HBM 容量） | 读 1.6 TB/s/堆栈 | 读延迟劣于 DRAM，写更慢、寿命有限 | [^23^][^24^] |

补充数量级锚点：KV cache 每 token 体积 ≈ 250 KB（Qwen3-32B，bf16；LMCache 256-token chunk ≈ 62.5 MiB）[^31^]；小消息严重吃不满链路——64 KB 传输仅 4 GB/s、1 MB 约 30 GB/s、16 MB 才到 49 GB/s[^3^]。

### KF4. 代表系统实测数据（命中率 / TTFT / 吞吐）

- **Mooncake（FAST'25 最佳论文）**：真实 trace 下有效请求容量 +59%~498%（满足 SLO）；模拟场景吞吐最高 +525%；生产环境 A800/H800 集群分别多承载 115%/107% 请求；数千节点、日处理 1000 亿+ token[^1^][^2^]。
- **SGLang HiCache**：官方复测吞吐最高 6×、TTFT 最高降 80%；蚂蚁集团在线通用 QA（DeepSeek-R1-671B，PD 分离）缓存命中时 TTFT 平均降 84%；Novita AI（Qwen3-Coder-480B + 3FS）命中率 40%→80%、TTFT 降 56%、吞吐翻倍[^8^]；Mooncake 后端基准：轮次增加后 L2 命中率下滑、Mooncake L3 维持高命中，pre-populated 时 TTFT 最优[^25^]。
- **LMCache + vLLM**：跨负载最高 15× 吞吐、TTFT 小 1.9–8.1×；企业经验：远程存储取 KV 仍改善 prefill 延迟；但 context truncation 会把前缀命中率砍掉一半[^3^]。
- **Dynamo KVBM（CPU 卸载）**：20 个多轮会话、15 用户、Qwen3-8B/H100、20K ISL 下 TTFT 改善 2.2×–12×（随 QPS 变化）[^11^]。
- **Tutti（SSD-backed）**：对比 GDS 版 SSD-LMCache，严格 SLO 下 TTFT −78.3%、可承载请求率 2×、服务成本 −27%；性能逼近 DRAM 版 LMCache 而容量近乎无限[^16^]。
- **NetApp（LMCache + S3/pNFS 第三层）**：加 S3 层相比纯 GPU 聚合处理速度最高 +173%、单请求平均 TTFT 最高 −99%、decode 吞吐最高 +290%，且"几乎无反面代价"[^21^]。
- **AIBrix**：分布式 KV cache 带来吞吐 +50%、时延 −70%（论文口径）[^12^]。
- **命中率实况**：编码 agent 多轮会话（Claude Code/SWE-bench trace）次轮起前缀命中率 >95%、均值约 98%[^33^]；某预测式多层管理论文称 Mooncake 报告命中率 65–80%、其预测式方案 70–84%（二手引用，低置信）[^27^]。

### KF5. 软件栈接口（KVConnector / NIXL / GDS / Transfer Engine / io_uring）

- **vLLM KVConnector 框架**：LMCache、NixlConnector、MooncakeConnector、AIBrix Offloading Connector、OffloadingConnector（CPU LRU）均挂在该接口；调度器侧 `get_num_new_matched_tokens`→`build_connector_meta`，model runner 侧 `start_load_kv/wait_load_kv/start_store_kv/wait_store_kv`，支持层wise 钩子[^3^][^7^]。
- **NIXL（NVIDIA Inference Xfer Library，GTC 2025 开源）**：统一抽象 GPU VRAM/DRAM/存储的描述符注册与单边 RDMA 传输；后端含 UCX（IB/RoCE/TCP）、GPUDirect Storage（GDS）、NVMe-oF、S3 对象存储；KVBM 位于其上做四层放置与频率驱逐[^9^][^19^][^20^]。
- **GDS（GPUDirect Storage）**：P2P DMA 去掉 CPU 拷贝，但**每次 I/O 仍需 CPU 发起**，控制路径仍是 CPU-centric——这是 Tutti 的核心批评[^16^]。
- **Mooncake Transfer Engine / Store**：RDMA 批量异步传输、多网卡聚合、拓扑感知选路；Store 主服务管放置/驱逐，客户端经 Transfer Engine 点对点搬数据，master 不在数据路径[^5^][^6^]。
- **SGLang HiCache 存储后端**：`--hicache-storage-backend` 支持 mooncake / hf3fs(3FS) / nixl / aibrix / file，运行时可 attach/detach；IO 后端 kernel/direct，布局 layer_first/page_first/page_first_direct（page_first_direct 使一页 KV 连续、可零拷贝整存整取）[^8^]。
- **新方向**：Tutti 的 GPU io_uring（gio_uring，SQ/CQ 置于 HBM、green context 划分计算/IO SM 域）；FlexKV 用 CPU 侧 io_uring 加速[^16^][^26^]。

### KF6. 反方观点与局限（关键）

1. **SSD 层 CPU-centric 开销与 GPU stall 70–80%**：Tutti 实测 Llama3-8B、64K 序列、75% 命中下，从 SSD 恢复 KV 的 GPU 气泡 >70%（占推理总时延），逐层流水（SSD-LW）反而把气泡推到 ~80%；GDS 版仍 >70%。128K token 在 64 层 Qwen3-32B（block=64）上要取约 25.6 万个 80 KB 碎片对象，CPU 发起的海量小随机 I/O 是根因[^16^]。
2. **"取回慢于重算"风险**：Tutti 显示随 vLLM 版本升级（v0.12→v0.17，计算侧变快），SSD 恢复从"勉强划算"变为"不再划算"（虚线重算基线被击穿）[^16^]。
3. **多层缓存收益可能被频繁换入换出抵消**：ThunderAgent 指出 HBM/DRAM/NVMe 分层缓存在高频 agentic 工作流中，受层间带宽限制，频繁 swap-in/out 的开销常抵消收益[^32^]。
4. **容量焦虑的另一面**：DRAM 层性价比有限（2 TB≈5 分钟 KV），SSD 带宽不是瓶颈、I/O 路径才是[^16^][^22^]。
5. **eviction 不可逆族 vs 分层族**：attention 重要性驱逐（H2O/SnapKV）信息永久丢失，对需要全史随机访问的多轮/长文档任务有质量风险[^15^]。

---

## 数据点

| # | 指标 | 数值 | 系统/来源 | 置信度 |
|---|---|---|---|---|
| D1 | 有效请求容量提升 | +59%~498%（真实 trace） | Mooncake, FAST'25 | 高[^1^] |
| D2 | 生产吞吐提升 | A800 +115% / H800 +107%；模拟最高 +525% | Mooncake | 高[^1^][^2^] |
| D3 | TTFT 降低 | 84%（蚂蚁在线，HiCache+Mooncake）；最高 80%（官方复测） | SGLang HiCache | 高[^8^] |
| D4 | 命中率提升 | 40%→80%（Novita, 3FS 后端）；编码 agent 均值 ~98% | HiCache/3FS；Netpreme trace | 中[^8^][^33^] |
| D5 | 吞吐提升 | 最高 15×（LMCache+vLLM）；6×（HiCache）；2× 请求率（Tutti vs GDS-LMCache） | 各系统 | 高[^3^][^8^][^16^] |
| D6 | Tutti vs SSD-LMCache | TTFT −78.3%，成本 −27%，≈DRAM 级性能 | Tutti (arXiv 2605.03375) | 高[^16^] |
| D7 | SSD 恢复 GPU 气泡 | >70%（普通/GDS），~80%（层wise） | Tutti 实测 | 高[^16^] |
| D8 | KV 容量时间窗 | 2 TB DRAM ≈ 5 min；100 TB NVMe ≈ >1 h | Tutti 引述 | 中[^16^] |
| D9 | 加 S3 层收益 | 聚合速度最高 +173%，TTFT 最高 −99%，"几乎无代价" | NetApp+LMCache | 中（厂商）[^21^] |
| D10 | KVBM CPU 卸载 TTFT | 2.2×–12× 改善（Qwen3-8B/H100） | NVIDIA Dynamo 文档 | 中高[^11^] |
| D11 | 每 token KV 体积 | ~250 KB（Qwen3-32B bf16）；256-token chunk=62.5 MiB | Ceph/LMCache 文档 | 高[^31^] |
| D12 | 消息大小 vs 吞吐 | 64 KB→4 GB/s；1 MB→30 GB/s；16 MB→49 GB/s | LMCache 论文表 1 | 高[^3^] |
| D13 | HBF 目标规格 | 512 GB/16-die 栈，读 1.6 TB/s，8–16× HBM 容量，成本对标 HBM；样品 2H2026、设备 2027 初 | SanDisk/SK hynix | 中（全为目标值）[^23^][^24^] |
| D14 | 100B 模型 10M DAU 全量 KV | ~250 PB SSD/天 | Third Bridge 专家访谈 | 中低[^22^] |
| D15 | Kioxia 高带宽闪存模组 | 5 TB、64 GB/s、<40 W、PCIe 6.0 原型 | Kioxia 新闻稿 2025-08 | 高[^34^] |

---

## 争议与冲突

1. **SSD 层到底可不可用？**
   - 反方：Tutti 测得 SSD 恢复 GPU 气泡 70–80%，且随引擎计算变快"取回不如重算"；既有系统因此倾向把 KV 留在 DRAM（容量受限、命中率受损）[^16^]。
   - 正方：NetApp 报告加 S3/pNFS 第三层"几乎无场景变差"且大幅提速[^21^]；HiCache+Mooncake/3FS 在线数据 TTFT −84%/−56%[^8^]；Tutti 自己也证明换 GPU-centric I/O 路径后 SSD 可达近 DRAM 性能[^16^]。
   - **调和**：分歧不在介质而在 **I/O 路径（CPU-centric vs GPU-centric）、对象粒度（页/chunk 大小）、命中粒度与工作负载命中率**。命中率 ≥95% 的 agentic 负载下，层间带宽成为主瓶颈，介质带宽收益放大[^33^]；低命中、高算力新引擎下 SSD 恢复可能不划算。
2. **Layer-wise pipeline 普适性**：LMCache/CachedAttention 视逐层流水为隐藏时延的关键手段[^3^][^29^]；Tutti 指出其在 SSD 上会切碎传输、降低有效带宽并把气泡推到 ~80%——**适用于 DRAM/RDMA，不适用于 SSD（除非 I/O 聚合成大块）**[^16^]。
3. **GDS 是否"去 CPU"**：NVIDIA/NIXL 叙事把 GDS 作为 GPU 直通存储[^20^]；Tutti 指出 GDS 每次 I/O 仍要 CPU 发起，控制路径 CPU-centric，气泡依旧 >70%[^16^]。这是厂商话术与学术论文的直接冲突。
4. **冷热判定依据之争**：LRU/租约（Mooncake、vLLM）vs 频率衰减（KVBM）vs 预测式（贝叶斯 reuse 概率，声称 70–84% 命中 vs Mooncake 65–80%，但系未同行评议论文的二手数据，低置信）[^27^] vs attention 重要性（H2O 族，不可逆）[^13^][^15^]。生产系统目前仍以 LRU/租约为主，频率/预测式刚进入代码。
5. **冷 KV 的归宿分层**：DRAM 池（Mooncake 主力、Strata）vs 本地 SSD（Tutti、FlexKV、KVBM G3）vs 对象存储（NetApp、NIXL S3）vs 专用新介质（CXL 内存 TraCT、Netpreme MPU、HBF）——尚无收敛，取决于命中时延预算与容量目标的乘积[^6^][^16^][^21^][^33^][^35^]。

---

## 对 HBF 卸载判断的启示

1. **工作负载匹配度高**：冷 KV 是典型的"写一次、读多次、容量饥渴、可容忍 10–100 µs 级取回（经预取/流水隐藏）"数据，与 HBF 的设计点（读优化、512 GB/栈、1.6 TB/s 读、8–16× HBM 容量）高度吻合；FlashAccel 等学术原型已明确把"模型权重 + KV cache"划给 HBF、把"频繁更新的小中间数据"留给 HBM[^24^][^36^]。
2. **软件栈已就绪、介质可插拔**：vLLM KVConnector、SGLang HiCache `--hicache-storage-backend`、Dynamo KVBM G3/G4、NIXL 后端插件都是**层无关**抽象；HBF 可作为 L2.5/L3 新层接入，无需重写调度逻辑[^3^][^8^][^9^]。
3. **最大教训——I/O 路径比介质带宽更重要**：Tutti 证明 NVMe 的 29 GB/s 都吃不满是因为 CPU-centric 控制路径 + 页碎片化（25.6 万个 80 KB 对象）；HBF 若走 PCIe+CPU 老路会重蹈覆辙，必须配套 **GPU-centric 直接 I/O（gio_uring 类）、大对象整存整取（page_first_direct、≥256-token chunk）、P2P 内存映射**[^16^][^8^]。HBF 近封装/TSV 形态天然绕开 PCIe+CPU，方向与 Tutti 结论一致。
4. **经济性窗口**：DRAM 保 5 分钟、NVMe 保 1 小时的容量断档正是 HBF 的目标区间（"8–16× 容量、成本对标 HBM"→ 每 GB 成本约为 HBM 的 1/8–1/16）[^16^][^23^]；但注意 HBF 官方口径是"**容量对标 HBM 的 8–16 倍、成本与 HBM 相当（at similar cost）**"——即等容量更便宜，但绝对成本不低，需按每 token KV 成本核算。
5. **主要风险/未知**：(a) 所有 HBF 数字均为目标值，样品 2H2026、推理设备 2027 初，无量产实测[^24^]；(b) NAND 写速慢、寿命有限，而多轮/agentic 负载每轮追加新 KV，写流量不小，需要写合并/磨损均衡与读多写少的放置策略；(c) 与 CXL 内存、Netpreme MPU 等"专用 KV 内存层"路线竞争[^33^][^35^]；(d) 命中率 <95% 的负载下，"取回 vs 重算"的盈亏平衡点会随引擎计算提速继续移动，HBF 的价值依赖高前缀复用负载[^16^][^33^]。
6. **判断**：冷热 KV 卸载到 HBF 在**机制层面没有障碍**（分层、驱逐、预取、逐层流水均已产品化），在**工作负载层面有强证据支撑**（命中率 80–98% 的 agentic/多轮负载），关键前提是 I/O 路径 GPU 化与对象粗粒度化；短期（2026–2027）它是介于 DRAM 与 NVMe 之间的"温/冷层"候选，而非 HBM 替代。

---

## 引用与出处

[^1^]: Mooncake 生产与实验数据 — "Mooncake increases the effective request capacity by 59%~498% ... operational across thousands of nodes, processing over 100 billion tokens daily ... 115% and 107% more requests on NVIDIA A800 and H800 clusters" — https://www.usenix.org/conference/fast25/presentation/qin — 2025-02（FAST'25）— 置信度：高（同行评议最佳论文）
[^2^]: Mooncake 概述 — "achieve up to a 525% increase in throughput in certain simulated scenarios ... handle 75% more requests" — https://github.com/kvcache-ai/Mooncake（镜像 https://gitcode.com/openFuyao/mooncake）— 2024-06 起 — 置信度：高
[^3^]: LMCache 论文（机制+数据） — "up to 15× improvement in throughput ... 1.9–8.1× smaller TTFT ... Layer-wise pipelining ... only a fixed-size GPU buffer—whose size is a single layer's KV cache—is required ... context truncation ... can greatly reduce prefix cache hit ratio by half"；消息大小表 "64KB→4GBps, 1MB→30GBps, 16MB→49GBps" — https://arxiv.org/html/2510.09665v2 — 2025-10（v2）— 置信度：高
[^4^]: Mooncake 论文技术报告 — "In CPU memory, KVCache is stored as paged blocks ... cache eviction algorithms such as LRU, LFU ... Conductor ... replicates or swaps certain blocks ... load and store operations of the KVCache layer are performed layer-by-layer and in parallel with the prefill computation" — https://arxiv.org/html/2407.00079v2 — 2024-06/2025-02 — 置信度：高
[^5^]: Mooncake Store 部署/驱逐 — "mooncake_master --eviction_high_watermark_ratio 0.9 --eviction_ratio 0.1 --default_kv_lease_ttl 11000"；"Master Service ... enforces eviction/placement policies ... never in the data path"；"lease-based object lifecycle management ... automatic eviction to SSD" — https://kvcache-ai.github.io/Mooncake/deployment/mooncake-store-deployment-guide.html ; https://deepwiki.com/kvcache-ai/Mooncake — 2025-2026 — 置信度：高（官方文档）
[^6^]: Mooncake SSD/3FS 驱逐 RFC — "Mooncake has already support KVCache offloading to SSD in 3FS ... simple lease mechanism to approximate LRU ... SSDs ... over 100x slower than DRAM ... each eviction cycle could clear 30%" — https://github.com/kvcache-ai/Mooncake/issues/952 — 2025-10-23 — 置信度：中高（设计讨论）
[^7^]: vLLM KVConnector/CPU Offload — "First it checks for the existence of cache blocks in GPU memory ... then CPU memory ... then any configured KV connectors"；"CPU Block Pool ... Asynchronous Transfer ... LRU Eviction" — https://ceph.io/en/news/blog/2025/vllm-kv-caching/ ; https://docs.vllm.ai/projects/ascend/en/latest/user_guide/feature_guide/kv_cache_cpu_offload.html — 2025 — 置信度：高
[^8^]: SGLang HiCache 设计与实测 — "organizes GPU memory as L1, host memory as L2, and distributed storage as L3"；"achieved up to 6× throughput improvement and up to 80% reduction in TTFT"；"cache hits achieved an 84% reduction in TTFT"（蚂蚁）；"hit rate jumped from 40% to 80% ... TTFT dropped by 56%"（Novita）；预取三策略、page_first_direct、L3 驱逐局限 — https://www.lmsys.org/blog/2025-09-10-sglang-hicache/ ; https://docs.sglang.ai/advanced_features/hicache_design.html ; https://zhuanlan.zhihu.com/p/1959366095443064318 — 2025-09/2026-07 — 置信度：高（官方博客+文档）
[^9^]: Dynamo KVBM 四层与频率驱逐 — "places KV cache blocks across four tiers: GPU HBM (G1 ... 192 GB per B200), CPU DRAM (G2), local SSD (G3), and networked storage (G4). Eviction follows a frequency-based policy: each block's access frequency is initialized at 1, doubled on cache hit, and decremented ... ≥2 are eligible for promotion" — https://arxiv.org/html/2606.17081v1 — 2026-06 — 置信度：中高（第三方论文描述官方架构，与官方文档一致）
[^10^]: KVBM 层级配置 — "GPU → CPU；GPU → CPU → Disk；GPU → Disk (Experimental)" — https://docs.vultr.com/how-to-manage-kv-cache-in-nvidia-dynamo（转述 NVIDIA Dynamo 文档）— 2026-03 — 置信度：中
[^11^]: KVBM 实测 — "KVBM with CPU memory offloading achieved a 2.2×–12× improvement in TTFT (depending on QPS) ... Qwen3-8B on H100. Avg 20K ISL / 100 OSL" — https://github.com/NVIDIA/Dynamo docs/design-docs/architecture.md — 2026-03 — 置信度：中高（厂商文档）
[^12^]: AIBrix — "L1 DRAM-based caching ... optionally enable L2 remote caching ... InfiniStore, a high-performance RDMA-based KV cache server ... pluggable eviction strategies (e.g., LRU, S3FIFO)"；"50% increase in throughput and a 70% reduction in inference latency" — https://aibrix.github.io/posts/2025-05-21-v0.3.0-release/ ; https://arxiv.org/html/2504.03648v1 — 2025-05/2025-04 — 置信度：高
[^13^]: H2O/SnapKV/PyramidKV 综述性描述 — "H2O ... evicts KV states based on accumulated attention importance ... heavy-hitter tokens"；"SnapKV ... selecting important tokens based on attention patterns observed during prefilling"；"PyramidKV ... assigns cache budgets in a pyramid-like manner across layers" — https://arxiv.org/html/2606.31145v1 — 2026-06 — 置信度：高
[^14^]: attention 驱逐族谱 — "H2O retains 'heavy-hitter' tokens ... SnapKV identifies important positions before generation via observation windows ... Quest adds query-aware sparsity ... Ada-KV head-wise adaptive budget" — https://arxiv.org/html/2605.18053v1 — 2026-05 — 置信度：高
[^15^]: 不可逆性局限 — "The critical limitation of eviction is irreversibility. Once a token is evicted, its information is permanently lost ... works poorly for tasks that require random access to the full history" — https://github.com/quantumaikr/quant.cpp/blob/main/docs/blog/kv-cache-landscape.md — 2026-03 — 置信度：中（社区博客，观点与多篇论文一致）
[^16^]: Tutti（反方核心证据+方案） — "restoring KV cache from SSDs ... induce 70~80% GPU stalls"；"GPU bubbles to exceed 70% of total inference latency ... layer-wise ... around 80%"；"GDS ... still relies on CPU intervention to initiate each I/O ... GPU bubble time remains high at above 70%"；"about 2 TB of DRAM retains only around five minutes of KV cache ... over 100 TB ... more than one hour"；"reduces TTFT by 78.3% ... improves the achievable request rate by 2×. The serving cost is reduced by 27% ... nearly the same inference performance as DRAM-backed LMCache"；"restoring KV cache from SSDs is no longer beneficial (vLLM v0.12.0 vs. v0.17.0)"；"256K scattered 80 KB objects" — https://arxiv.org/abs/2605.03375 — 2026-05-05 — 置信度：高（arXiv，vLLM 集成实测）
[^17^]: FlexGen — "aggregates memory from the GPU, CPU, and disk ... linear programming-based search ... I/O complexity within 2× of optimality ... 40× higher throughput compared to DeepSpeed ... 100× with compression" — https://arxiv.org/abs/2303.06865 — 2023-03（ICML'23）— 置信度：高（基线参照，吞吐导向、延迟不敏感）
[^18^]: 介质数量级（HBM/DRAM/NVMe） — "GPU HBM: 288 GB, 8 TB/s, 10-30 ns, ~$100/GB；DDR5: 512 GB–2 TB, 540 GB/s, 50-100 ns；NVMe: 30–120 TB/server, 28 GB/s (PCIe Gen6), 60 µs, $0.26/GB" — https://www.cloudidr.com/blog/ai-memory-architecture — 2026-05 — 置信度：中（行业博客，数量级合理）
[^19^]: NIXL 分层时延表 — "Tier 1 GPU HBM ~1µs 80–192GB；Tier 2 Local NVMe 50–500µs 1–8TB；Tier 3 S3 10–500ms unlimited"；"RDMA/IB sub-1ms；NVMe-oF 2–10ms；S3 50–500ms" — https://www.spheron.network/blog/nvidia-nixl-disaggregated-inference-guide/ — 2026-04 — 置信度：中（云厂商博客）
[^20^]: NIXL/GDS 机制 — "callers register memory regions (GPU VRAM, CPU DRAM, or storage) with a NIXL agent as descriptors ... supported backends are UCX and NVIDIA Magnum IO GPUDirect Storage (GDS)" — https://ai-infrastructure.net/kv-cache-transfer-nixl/ — 2026-06 — 置信度：中
[^21^]: NetApp 三层实测 — "adding the StorageGRID S3 tier yields ... Aggregate system processing speed up to 173% increase ... Average TTFT up to 99% decrease ... virtually no downside to enabling the S3 tier" — https://community.netapp.com/t5/Tech-ONTAP-Blogs/KV-cache-offloading-with-vLLM-LMCache-and-StorageGRID/m-p/467946 — 2026-07-01 — 置信度：中（厂商博客，自建基准）
[^22^]: 容量测算与 HBF 预判 — "retaining full KV cache for a 100B model with 10 million DAU would require 250 PB of SSD storage daily ... forced to delete cache aggressively (e.g., every 0.5–1 hour)"；"current 'HBM → CPU DRAM → SSD' three-tier offloading architectures are inefficient due to CPU involvement and slow PCIe links ... speculated about future 'direct SSD to NVLink' solutions" — https://www.thirdbridge.com/en-us/about-us/media/perspectives/explainer-why-storage-and-memory-are-the-new-ai-database-for-agi — 2025-11-11 — 置信度：中低（专家访谈）
[^23^]: HBF 官方口径 — "HBF is targeted to offer comparable bandwidth to High Bandwidth Memory (HBM) while delivering up to 8-16x the capacity of HBM at a similar cost ... first samples ... second half of calendar 2026 ... first AI-inference devices with HBF ... early 2027"（SanDisk/SK hynix MOU 新闻稿）；"offering comparable bandwidth while delivering up to 8x the capacity at a similar cost ... 16-high configurations"（TAB 新闻稿，David Patterson/Raja Koduri 加入顾问委员会） — https://investor.sandisk.com/news-releases/news-release-details/sandisk-collaborate-sk-hynix-drive-standardization-high ; https://investor.sandisk.com/news-releases/news-release-details/sandisk-forms-hbftm-technical-advisory-board-guide-development — 2025-08-06 / 2025-07-24 — 置信度：高（公司官方，但全为目标值）
[^24^]: HBF 规格细节与风险 — "read bandwidths of 1.6 TB/s with 512GB of total capacity per 16-die stack ... 8 to 16 times the capacity of DRAM-based HBM at comparable cost"；"HBF is a projected technology ... every figure attached to it is a target, not a measurement ... Writes are far slower than reads, endurance is finite, and latency is worse than DRAM" — https://getnestdaily.xyz/blog/sandisk-vs-micron-ai-memory-war/ ; https://www.buysellram.com/blog/inside-the-gpu-memory-hierarchy-how-ai-servers-move-data-from-ssd-to-hbm/ — 2026-05/2026-07 — 置信度：中（二手但多源一致）
[^25^]: HiCache+Mooncake 基准 — "pre-populated Mooncake achieves the best results ... as the number of rounds increases and the KV cache size exceeds the +L2's memory capacity, +L2's hit rate gradually decreases ... Mooncake maintains a high hit rate, and its TTFT grows only very slowly" — https://kvcache-ai.github.io/Mooncake/performance/sglang-hicache-benchmark-results-v1.html — 2025 — 置信度：高（官方基准）
[^26^]: FlexKV — "three-level cache hierarchy: CPU memory ... Local SSD ... Scalable storage(e.g., cloud storage) ... logical LRU eviction without triggering physical data movement ... io_uring ... Distributed RadixTree ... Lease Mechanism" — https://github.com/taco-project/FlexKV — 2025-07 — 置信度：中高（开源 README）
[^27^]: 预测式驱逐（争议数据点） — "our Bayesian predictor proactively positions blocks based on predicted reuse probability, achieving 70–84% hit rates vs. Mooncake's reported 65–80%" — https://arxiv.org/html/2604.26968v1 — 2026-04 — 置信度：低-中（未评议，二手引用 Mooncake 命中率）
[^28^]: LMCache 层wise 实现 — "Three CUDA streams ... current_stream / load_stream / store_stream ... overlaps layer N+1 computation with layer N storage" — https://docs.lmcache.ai/kv_cache_optimizations/layerwise.html — 2025-2026 — 置信度：高（官方文档）
[^29^]: CachedAttention 层wise 预载 — "uses a layer-wise pre-loading scheme to overlap the loading of the KV cache with the inference computation layer by layer" — https://arxiv.org/pdf/2403.19708 — 2024-03（USENIX ATC'24）— 置信度：高
[^30^]: TRT-LLM 层wise 传输 — "TTFT ≈ prefill computation time + last layer KV transfer time" — https://github.com/NVIDIA/TensorRT-LLM/issues/9212 — 2025-11 — 置信度：中高（官方 issue）
[^31^]: 每 token KV 体积 — "LMCache uses a larger 256 token block by default ... For a model like Qwen3-32B this works out to be approximately 62.5 MiB" — https://ceph.io/en/news/blog/2025/vllm-kv-caching/ — 2025 — 置信度：高
[^32^]: 多层缓存局限（反方） — "the practical efficiency of these methods is fundamentally constrained by the inter-tier bandwidth ... In high-frequency agentic workflows, the overhead of frequent swap-in and swap-out cycles often negates the benefits of multi-tier caching" — https://arxiv.org/html/2602.13692v3 — 2026-06 — 置信度：中高
[^33^]: 高命中率负载与带宽论点 — "the cache-hit ratio consistently exceeds 95% in subsequent rounds ... mean hit ratio being around 98%. In this regime, scaling KV-caching bandwidth beyond what is achievable with Host CPU offloading results in a 3x performance boost"；"improves TTFT by 6.7× compared with Host DRAM-based SGLang HiCache" — https://netpreme.com/blog/accelerating-sglang-hicache-with-netpreme-xmem-mpu — 2026-07-08 — 置信度：中（厂商，但 trace 方法透明；是"专用 KV 内存层"路线的代表）
[^34^]: Kioxia 高带宽闪存模组 — "prototype memory module with a capacity of 5 TB and a bandwidth of 64 GB/s ... PCIe 6.0 (64 Gbps, 8 lanes) ... less than 40 watts" — https://www.kioxia.com/en-jp/about/news/2025/20250820-1.html — 2025-08-20 — 置信度：高（官方新闻稿）
[^35^]: CXL/其他新层路线 — "TraCT (2025): Uses CXL shared memory as a rack-scale KV cache tier ... 9.8x TTFT reduction" — https://thelastprogrammers.com/post/06-inference-the-kv-cache-problem-why-memory-is-the-new-comp-rvjvlg8 — 2026-05 — 置信度：低-中（聚合博客，需核原文）
[^36^]: FlashAccel（HBF×KV 学术原型） — "HBM handles small, frequently updated intermediate data ... while HBF stores large, read-dominated data such as model weights and KV cache ... We target SLC-based HBF for its lower read latency and higher write endurance" — https://arxiv.org/html/2607.10186v1 — 2026-04（arXiv）— 置信度：中（模拟/原型研究）

---

### 检索记录（20 次独立查询）
1. Mooncake Kimi KV cache FAST 2025 tiered；2. LMCache multi-tier offloading vLLM；3. vLLM PagedAttention CPU swap KVConnector；4. SGLang HiCache L3 storage；5. NVIDIA Dynamo KVBM NIXL；6. AIBrix InfiniStore eviction prefetch；7. AIBrix InfiniStore ByteDance；8. FlexGen offloading arxiv；9. Tutti SSD KV cache GPU stall；10. HBF SanDisk Kioxia specs；11. KV cache hot/cold reuse distance eviction（0 结果，换词重试于 13）；12. H2O SnapKV attention importance eviction；13. KV tier HBM DRAM NVMe latency bandwidth；14. SGLang HiCache benchmark TTFT；15. Mooncake cache-aware scheduling eviction；16. layer-wise KV loading pipelining LMCache；17. KV cache 冷热分层 卸载 SSD HBF 高带宽闪存（中文，0 结果）；18. Mooncake Store eviction lease TTL；19. FlexKV hierarchical 2026；20. SanDisk HBF announcement specification。另精读全文 2 篇（Tutti、LMCache 论文 HTML）。
