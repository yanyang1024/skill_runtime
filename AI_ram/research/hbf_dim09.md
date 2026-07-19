# Dim09：AI 推理系统的"存力"权衡与快照回放瓶颈定位（2024–2026）

> 调研范围：(A) 面向需求的推理系统设计流程与内存/存储（"存力"）的容量-带宽-成本权衡、每 token 成本（TCO）；(B) 快照/轨迹回放（snapshot / trace replay）定位瓶颈的方法论与存力监测指标清单。共执行 32 次独立检索；关键论断均附内联引用，文末脚注含原文摘录、URL、日期与置信度。

## Key Findings

1. **设计流程已被公式化**：显存需求 = 权重（参数量×字节数）+ KV cache（`2 × 层数 × KV头数 × 头维 × 字节 × 上下文长度 × 并发数`）+ 激活与框架开销（≈5–10%）+ 碎片余量（10–15%）；KV cache 随上下文与并发**线性**增长，是容量规划的中心变量[^1^][^2^][^4^]。
2. **Llama-3.1-70B（GQA）单请求 128K 上下文 KV cache ≈40 GB**，4 并发即需 160 GB——超过单张 H200（141 GB）的全部显存；KV 超过权重的"交叉点"对 LLaMA-7B（MHA）约在 26.7K token[^1^][^4^]。
3. **瓶颈分相**：prefill 算术强度高（≈batch×seq），越过拐点（A100 ≈156 FLOP/B、H100 SXM ≈295 FLOP/B）后 compute-bound；decode 算术强度≈batch，常态 **memory-bound**（受 HBM 带宽限制）。A100 上 4K token 后 MBU <10%、16K 时 <1%——prefill 几乎不碰 HBM 带宽[^5^][^6^][^7^]。
4. **存力阶梯（2025–2026 量级）**：HBM3e ≈1.2 TB/s/栈、$8–25/GB；DDR5 ≈38–51 GB/s/条、$3–12/GB、~80 ns；CXL 内存 200–500 ns、$4–7/GB；NVMe SSD ≈7–14.5 GB/s、~50–100 µs、$0.10–0.21/GB。"TB 容量 × TB/s 带宽"的层级目前不存在[^10^][^11^][^12^][^13^]。
5. **容量→batch→吞吐的实例**：FlexGen 用 T4 16 GB + 208 GB DRAM + 1.5 TB SSD 跑 OPT-175B，offload 扩容把有效 batch 推到 144–256，同延迟下吞吐比 ZeRO-Inference 高 >40×——但只适用于延迟不敏感场景，是显式的 latency-throughput 权衡[^16^][^17^]。
6. **decode 扩容提吞吐的机理**：decode 每步需把全部权重+KV 读一遍，增大 batch 摊薄权重读取、提高算术强度；代价是 KV 占用线性上涨、TPOT 恶化与 SLO 风险。PD 分离（DistServe/Splitwise）把两相放到不同 GPU 池，goodput 提升最高 7.4× 或 SLO 收紧 12.6×，KV 传输耗时 <0.1%[^5^][^8^][^9^]。
7. **每 token 成本的主导变量是"有效利用率"而非硬件单价**：同一 H100、同一模型，请求率从 1 rps 到饱和，每百万输出 token 成本从 $15.25 降到 $0.21（2.5–24× 差距）；公开计算器按 100% 利用率估算会系统性低估真实成本 1/U 倍[^18^]。批大小 1→64 可降成本 5×[^20^]。
8. **存储层级扩容边际收益递减有实证**：阿里 Kareto（arXiv 2603.08739）将 DRAM 容量/磁盘 TTL/介质选型建成多目标 Pareto 问题，用**历史 trace 回放仿真**寻优；相比静态 1024 GB DRAM，吞吐 +9.3%、平均 TTFT −58.3%、总成本 −20.2%，并发现某些 trace 的复用集中于少数前缀子树——"超过某点后存储成本超过节省的算力"[^22^]。
9. **回放方法栈**：Chakra execution trace（MLCommons 标准，图结构表达 compute/memory/comm 算子与依赖，供仿真器/回放器消费）[^24^]；vLLM/SGLang 内置 torch profiler + `/start_profile` 动态抓取 + nsys 全栈时间线[^25^][^26^][^27^]；trace 驱动仿真器（微软 Vidur，TTFT 误差 5–10%；DistServe/Kareto 的 trace 重采样仿真）[^28^][^8^][^22^]；公开生产 trace（Azure LLM trace、BurstGPT、Mooncake FAST'25 trace）[^29^][^30^]。
10. **瓶颈归因四分类的可操作判据**：MBU（`DCGM_FI_PROF_DRAM_ACTIVE`）>80–90% 且 SM 利用率 <60% → memory-bound；SM>80% 且 MBU<60% → compute-bound；两者都低 → 查 CPU/网络/IO；nsys 时间线上 memcpy/memset 与 kernel 间空隙（GPU 气泡）是 IO-bound 的直接证据[^32^][^34^][^39^]。
11. **SSD 层是最大争议点**：Tutti 实测 LMCache+SSD 恢复 KV 时 GPU 气泡 >70%（逐层流水更恶化到 ~80%），GDS 也因 CPU 在控制路径上而无解，"从 SSD 恢复已不如重算"[^39^]；而 IBM Storage Scale（G4 层共享存储）报 130K 提示 TTFT 加速 56×、并发吞吐 22×[^31^]。差异根源在于 I/O 粒度（分页小块随机读 vs 大块聚合）、预取与流水线。
12. **长上下文/Agentic 负载把瓶颈推向"KV 搬运"**：编码 agent trace 显示平均 157 轮、32.7K 上下文、429 token 增量 → KV 命中率 98.7%，cache-compute 比 ≈22 GB/PFLOP，瓶颈在存储 NIC 带宽；Ampere→Blackwell I/O-算力比下降 14.4×[^40^]。SGLang HiCache 实测：命中率 >95% 时扩容 KV 分层带宽可再提速 3×，专用 TB/s 层 TTFT 改善 6.7×[^41^][^42^]。

---

## 设计权衡框架

### A1. 从需求反推硬件：六步设计流程

**Step 1 — 权重显存**：`权重 GB = 参数量(B) × 每参数字节数`；FP16/BF16=2 B、FP8=1 B、INT4=0.5 B。工程上再加 20–40% 给 KV/激活/框架[^1^][^3^]。
**Step 2 — KV cache 显存**：`每 token KV = 2 × 层数 × KV头数 × 头维 × 字节`。实例：LLaMA-3.1-70B（80 层、8 KV 头、128 头维、BF16）≈0.31 MB/token（MHA 需 2.5 MB，GQA 省 8×）；总量 = 每 token × 上下文 × 并发[^1^][^3^]。
**Step 3 — 反推 GPU 型号/数量**：总显存 ≤ GPU 显存 × `gpu_memory_utilization`（生产常设 0.85–0.92）。NVIDIA 内部范式："LLaMA-70B，TP=4 上 4×H100，FP8 KV，`gpu_memory_utilization=0.92` → ~60 并发 4K 请求"[^3^]。VMware 给出可执行计算器与分 GPU 的 TTFT/TPOT/吞吐表（L40S/H100 NVL/H200 NVL/MI300X）[^2^]。
**Step 4 — SLO 反推并行与拓扑**：TTFT 由 prefill 决定、TPOT 由 decode 决定；用排队模型（prefill ≈ M/D/1）+ 仿真搜索 TP/PP/副本数。DistServe：13B 模型单 A100 goodput 1.6 rps，拆成 2 prefill + 1 decode GPU 后 10 rps（3.3 rps/GPU，2.1×）；评测最高 7.4× goodput / 12.6× 更严 SLO[^8^][^9^]。
**Step 5 — 互联反推并行上限**：NVLink 4 = 900 GB/s（H100/H200）、NVLink 5 = 1.8 TB/s（B200）、PCIe Gen5 = 128 GB/s；TP 尽量留在 NVLink 域内，跨节点 PD 传 KV 依赖 IB/RDMA——25 Gb 链路下 DistServe 的 KV 传输占比仍 <0.1%，但 Tutti 等指出单 NIC 是 agentic 场景的瓶颈[^14^][^15^][^9^][^40^]。
**Step 6 — 存储层级设计**：HBM（热 KV/权重）→ DRAM（温 KV）→ 本地 NVMe/远端存储（冷 KV/模型权重），对应 SGLang HiCache L1/L2/L3 与 NVIDIA Dynamo G1–G4 分层；LMCache/Mooncake 提供跨层搬运与复用[^23^][^38^][^47^]。

### A2. 存力 trade-off：阶梯、扩容收益与时延代价

**（a）2025–2026 存力阶梯（量级表，多来源合成）**

| 层级 | 带宽 | 时延 | 容量量级 | 单价（$/GB） | 来源置信度 |
|---|---|---|---|---|---|
| SRAM（片上） | ~TB/s | ~1 ns | MB–数十 MB | 极高 | 中[^10^] |
| HBM3e/HBM4 | ~1.2 TB/s/栈（HBM3e）；~2 TB/s/栈（HBM4） | ~10–100 ns | 36–48 GB/栈；GPU 级 80–288 GB | $8–25（合约价估计，波动大） | 中[^10^][^12^][^14^][^15^] |
| DDR5 DRAM | ~38–51 GB/s/条 | ~80 ns（CXL 200–500 ns） | 数百 GB–TB/节点 | $3–12（2026 涨价周期） | 中[^10^][^11^][^12^] |
| NVMe SSD | Gen4 ~7 GB/s；Gen5 ~12–14.5 GB/s | ~50–100 µs | TB–数十 TB | $0.10–0.21 | 高[^10^][^11^][^13^] |

关键缺口：HBM 有带宽没容量、SSD 有容量没带宽，"TB 级容量 + TB/s 带宽"的层级缺位——这正是 HBF（High Bandwidth Flash）、CXL 内存池、KV 分层存储要填的空[^10^][^11^]。

**（b）容量扩大 → batch 增大 → 吞吐提升 vs 时延恶化**

- 机理：decode 算术强度≈batch size（线性层 I≈B），远低于拐点 → memory-bound；加大 batch 摊薄权重/KV 读取，吞吐近似线性上升至带宽饱和[^5^]。
- 显存换 batch 的极限案例（FlexGen）：单 T4 16 GB，offload 到 208 GB DRAM + 1.5 TB SSD，OPT-175B 有效 batch 达 144–256，吞吐 1.12 token/s（压缩后），同延迟（5000 s 预算）下比 ZeRO-Inference 高 >40×；明确"以时延换吞吐"定位[^16^][^17^]。
- 代价：batch ↑ → KV 占用线性 ↑（挤占可服务并发）、排队时延 ↑、TPOT 恶化；SLO 约束下 goodput 才是目标函数，而非裸吞吐[^8^]。
- 分层 offload 的时延代价实测：DRAM 层高效（逐层流水可把搬运藏在 attention 计算后）；SSD 层 GPU 气泡 70–80%，逐层流水反而更糟[^39^]。

**（c）GPU 代际存力阶梯（选型锚点）**：H100 80 GB / 3.35 TB/s → H200 141 GB / 4.8 TB/s（同 die，纯存力升级，Llama2-70B 推理 1.9×）→ B200 192 GB / 8 TB/s + FP4 → B300 288 GB。H200 类"显存加大"直接转化为更大 KV 池与更大 batch[^14^][^15^]。

### A3. TCO 视角：每 token 成本构成与边际收益递减

**成本构成**：`$/M tokens = GPU 时租 ÷ 每小时 token 产出 × 10^6`。实测范式：H100 $6.88/GPU·h，SGLang 离线引擎稳定吞吐 35,094 tok/s → 1.263×10^8 tok/GPU·h → **$0.054/M tokens**[^19^]。分硬件参考（TRT-LLM 资料）：A100 $0.20–0.30、H100 $0.15–0.25、L4 $0.25–0.50 /M tokens[^20^]。

**三大杠杆**：
1. **利用率/并发**（最大）：同 H100 上每百万输出 token $0.21（饱和）↔ $15.25（1 rps），企业低负载（1–10 rps）有 2.5–24× 低估惩罚；计算器普遍按 100% 利用率，误差恰为 1/U[^18^]。
2. **批大小**：batch 1→64，吞吐 1000→5000 tok/s，成本 $3→$0.6 /M tokens（5×）；推荐 batch 32–128[^20^]。
3. **量化**：FP8 对 MoE 吞吐 +69–74%（vs dense +31%）；KV cache FP8/INT8 减半占用、等效翻倍并发或上下文[^18^][^1^]。

**存储层级扩容的边际收益递减（Kareto，阿里+浙大，arXiv 2603.08739）**：
- 建模：决策变量 = (DRAM 容量, 磁盘 TTL, 介质档位如 ESSD PL1/PL2/PL3)；派生指标 = 动态容量 X5、命中率 X6、有效 I/O 带宽 X7；成本 `C(x)=C_compute(X2,利用率)+Σ C_resource,i(X3,X4)`[^22^]。
- 核心观察："Simply expanding storage does not always yield performance gains; beyond a certain point, storage cost can outweigh computation savings"——目标函数非解析、变量耦合，须靠 **trace 回放仿真**逼近 Pareto 前沿[^22^]。
- 结果：吞吐 +9.3%（算力受限场景）/ TTFT −58.3% / 成本 −20.2%；算力充裕时"扩容几乎无吞吐收益"，Trace B 复用集中于少数前缀块→应减配省钱；分组 TTL（按前缀子树复用间隔）优于一刀切[^22^]。
- 旁证：SGLang HiCache 文档明确"a larger HiCache size leads to higher cache hit rate… However, the relationship is not linear. Once most reusable KV data is cached, further increases yield marginal gains"[^23^]。

---

## 快照回放方法

### B1. 方法栈总览：采集 → 回放/仿真 → 归因

| 层 | 工具/格式 | 产出 | 用途 |
|---|---|---|---|
| 算子图 trace | **Chakra ET**（MLCommons 标准，protobuf 图：compute/memory/comm 节点 + 数据/控制依赖 + 时序 + 资源约束） | 可移植执行图 | 喂给仿真器/模拟器/回放器做 SW-HW 协同设计；Meta/NVIDIA/AMD/HPE 等共建[^24^] |
| 框架内 profiling | vLLM：`VLLM_TORCH_PROFILER_DIR` + `/start_profile` API；SGLang：`--enable-torch-profiler`；TRT-LLM：`--profiling-verbosity detailed` | Chrome/Perfetto trace | 请求级火焰图、kernel 序列[^25^][^26^][^27^] |
| 全栈系统 trace | `nsys profile --trace-fork-before-exec=true --cuda-graph-trace=node`（vLLM 需 `VLLM_WORKER_MULTIPROC_METHOD=spawn`） | .nsys-rep 时间线 | CUDA kernel/memcpy/NCCL/NVTX 逐事件归因，定位气泡[^25^][^26^] |
| 指标采集 | dcgm-exporter → Prometheus；vLLM/SGLang `--enable-metrics` | 时序指标 | 生产监测与告警[^32^][^33^][^36^] |
| 负载回放 | `vllm bench serve`（ShareGPT/random 数据集）、AIPerf（Dynamo）、inference-perf（K8s SIG） | TTFT/TPOT/吞吐分布 | 可复现基准；inference-perf 定义 $/M tokens 计算式[^21^][^31^] |
| 生产 trace 数据集 | Azure LLM inference trace、BurstGPT、Mooncake FAST'25 trace | 到达时间+输入/输出长度 | 注入仿真器或 bench 工具回放[^29^][^30^] |
| 离散事件仿真 | Vidur（微软，ML 预测 kernel 时间，TTFT 误差 5–10%）、DistServe 模拟器（trace 重采样，SLO 达成误差 ≤2%）、Kareto 模拟器（KV 分层 + I/O stall 建模） | 全配置空间的 Pareto 前沿 | 不烧 GPU 即可做容量规划与回放瓶颈分析[^28^][^8^][^22^] |

### B2. 回放定位瓶颈的操作流程

1. **固化可复现负载**：固定并发、输入/输出长度（`vllm bench serve --dataset-name sharegpt --profile`），服务端动态抓取 profile[^25^]。
2. **nsys 时间线归因**：memory-bound 负载中 HBM 读/memcpy 占据时间线而非计算 kernel；关注 `paged_attention_v1_kernel`（decode）、`fused_add_rms_norm_kernel`、`fmha_v2_flash_attn`（TRT-LLM）等关键 kernel[^34^][^27^]。
3. **缓存命中对照实验**：SGLang 在不同命中率下 profile——radix cache 命中时 `radix_cache_decode` 近零耗时；未命中则出现完整 KV 重算序列；"Profile at multiple cache hit rates to see the latency cliff"[^27^]。
4. **指标-瓶颈决策树**：MBU>80% & SM<60% → memory-bound（手段：换大带宽 GPU、KV 量化、NVMe 分层）；SM>80% & MBU<60% → compute-bound（加 GPU/TP）；双低 → 查 CPU 预处理/tokenizer/Python/网络[^34^]。
5. **仿真回放做 what-if**：Vidur/Kareto 用上周同时段 trace 回放数百种（容量×策略×硬件）配置，输出 Pareto 前沿指导下一周期供给——利用负载的日/周周期性[^22^][^28^]。
6. **MLPerf 交叉校验**：MLPerf Inference（如 v6.0 Llama2-70B/GPT-OSS-120B）提供跨厂商可比的 tokens/s 基准与可复现提交，但只报结果不做 kernel 分解，需自建 roofline 分析补位[^48^][^6^]。

---

## 存力监测指标清单

> 分层列出"指标 — 工具 — 解读/阈值"。★ 为存力直接相关。

| 层级 | 指标 | 工具/来源 | 解读与经验阈值 |
|---|---|---|---|
| ★HBM 带宽 | `DCGM_FI_PROF_DRAM_ACTIVE`（MBU） | dcgm-exporter | >80–90% 持续 = memory-bound；与 `PIPE_TENSOR_ACTIVE` 配对分类[^32^][^33^][^34^] |
| ★HBM 容量 | `DCGM_FI_DEV_FB_USED/FREE` | DCGM | 推理副本 free <4 GB 告警；留 5–10% 头部[^32^][^36^] |
| 算力 | `DCGM_FI_PROF_SM_ACTIVE`、`PIPE_TENSOR_ACTIVE` | DCGM | Tensor<30% = 算子没走 TC（如 fp16 算子跑 fp32）[^32^][^33^] |
| ★KV cache 占用 | `vllm:gpu_cache_usage_perc` | vLLM metrics | >95% 触发 preemption；趋近 1 = 并发上限被打满[^36^] |
| ★Prefix 命中率 | `Prefix cache hit rate: GPU/CPU`（vLLM ≥0.3.0 日志分层报告）；SGLang `cached_tokens/prompt_len` | vLLM/SGLang 日志+metrics | 命中率下降 = 容量不足或复用性差；agentic 负载应 >95%[^35^][^41^] |
| ★分层命中 | HiCache L1/L2/L3 hit、L3_pf_io_ms（预取 I/O）、L2 DMA 时间 | SGLang（提案 issue #28047）；LMCache "token 级 prefix 命中、请求级 KV 性能"指标族 | TTFT 分解 = queue + schedule + forward；L3 I/O 高 = 存储层瓶颈[^37^][^38^] |
| ★Offload 流量 | KV 搬运字节数/耗时（LMCache/NIXL/Dynamo 传输指标）；cache-compute 比（GB/PFLOP） | LMCache/Dynamo；自算 | agentic 参考值 ~22 GB/PFLOP（DeepSeek-V3.2）；比值越高越吃存储带宽[^38^][^40^] |
| ★GPU 气泡 | 时间线空隙占比（bubble ratio）；IO stall 时长 | nsys / Kareto 仿真 | SSD 恢复 KV 时气泡 70–80% 为实测上界；DRAM 层应被流水隐藏[^39^][^22^] |
| ★PCIe | `DCGM_FI_PROF_PCIE_TX/RX_BYTES`、`PCIE_REPLAY_COUNTER` | DCGM | 对比 Gen5 x16 上限 128 GB/s；offload 走 PCIe 时是第一嫌疑[^33^][^14^] |
| ★NVLink | `DCGM_FI_PROF_NVLINK_TX/RX_BYTES`、`NVLINK_BANDWIDTH_TOTAL` | DCGM | 单向应 <900 GB/s（NVLink4）/1.8 TB/s（NVLink5）；骤降 = 链路故障[^33^][^32^] |
| ★SSD | 顺序读/写带宽、IOPS、时延（iostat/厂商计数器）；GDS 传输量 | iostat、存储阵列监控 | 参考：Gen5 企业盘 ~14.5 GB/s 读；Tutti 实测双盘聚合读 29 GB/s / 写 12 GB/s[^13^][^39^] |
| 网络 | NIC 带宽利用率（agentic 场景单 NIC 瓶颈）、RDMA 时延 | 交换机/DCGM/Perftest | "KV-Cache loading speed is the bottleneck due to the limited bandwidth of the single storage NIC"[^40^] |
| 引擎队列 | `vllm:num_requests_running/waiting`、TTFT/TPOT 直方图 | vLLM metrics | waiting 持续 >0 = 容量不足；TTFT p95 >1.5×SLO 告警[^36^] |
| 健康 | 温度（die >83°C、HBM >95°C）、ECC、XID、功耗/降频时长 | DCGM/nvidia-smi | HBM 高温与降频直接压低有效带宽[^32^] |

注意：host 侧 **page cache 命中率**（`/proc/vmstat`、`perf`/eBPF）在文献中很少作为推理 KPI 出现——主流引擎用 GDS/O_DIRECT 或自管缓冲绕过 page cache（Unified KV Pooling 论文还指出文件系统开销主导 SSD KV 检索，故倾向裸设备/自研栈）[^44^]。建议将其列为"低置信度补充指标"，仅在文件后端 KV 存储（如 local file backend）场景下监测。

---

## 争议

1. **SSD 层值不值得放进 KV 层级？** 反方：Tutti 实测 LMCache+SSD 恢复 KV 时 GPU 气泡 >70%（逐层流水 ~80%），GDS 也无解（CPU 仍在控制路径），"restoring KV cache from SSDs is no longer beneficial… severe I/O bottleneck"[^39^]；Unified KV Pooling 另指出串行 I/O 路径与文件系统开销是主因[^44^]。正方：IBM Storage Scale（共享存储 G4 层）130K 提示 TTFT 56×、并发吞吐 22×、 noisy-neighbor 下仍有 18×[^31^]；HiFC（NeurIPS'25）用 GDS 直连 GPU-SSD、DRAM-free，宣称以"零头成本"达到 DRAM 级性能[^43^]；PCR 用队列预取把 SSD 读延迟藏到 CPU 内存之后，TTFT 再降 15%[^45^]。**调和观点**：结论差异主要来自 I/O 粒度（分页小块随机 vs 大块聚合/条带化）、预取/流水机制与负载命中率；存储行业的工程杠杆（大块化、聚合 I/O、预取、绕过文件系统）正是分水岭。
2. **"HBM 是否被过度配置"**：HBM-Is-Not-All-You-Need 论证 prefill 在 >1K token 后 compute-bound，A100 上 16K 时 MBU<1%，"HBM bandwidth is wasted in prefill"，主张 GDDR 做 prefill、HBM/SRAM 做 decode 的异构分解[^6^]；反方实践是 decode 与长上下文 KV 搬运持续吃带宽，且 B200/H200 的卖点恰是存力[^14^][^40^]。争议本质是"单芯片全能 vs 分相异构"的 TCO 之争。
3. **KV 容量扩多少才够**：扩派（Mooncake/HiCache/ICMSP：用廉价层扩容量提命中率，HiCache 实测命中 40%→80%、TTFT −56%、吞吐 2×[^42^]；NVIDIA ICMSP+VAST 报 prefill ~10×[^47^]）vs 边际递减派（Kareto：超过拐点后存储成本超过算力节省，应 Pareto 寻优甚至减配[^22^]；SGLang 官方文档承认命中-容量关系非线性[^23^]）。两派不矛盾——拐点位置取决于负载复用结构（前缀集中度、复用间隔），须用 trace 回放实测。
4. **成本估算口径**：学术/厂商计算器按 100% 利用率报 $/M tokens，实测企业 1–10 rps 负载下真实成本高 2.5–24×[^18^]；"LLMflation"（每年 ~10× 降本）叙事容易掩盖低利用率部署的浪费[^18^][^19^]。
5. **监测口径碎片化**：SGLang issue #28047 指出社区缺 per-request TTFT 分解与 HiCache 分层命中指标（"HiCache tier performance is invisible"）[^37^]；vLLM 与 SGLang 的命中率口径不同（GPU only vs cached_tokens/prompt_len 跨层）[^35^][^37^]——跨系统比较指标前必须先对齐口径。

---

## 脚注（原文摘录 / URL / 日期 / 置信度）

[^1^]: Spheron, "GPU Memory Requirements for LLMs" — "KV Cache per Token: 2 × Layers × KV Heads × Head Dimension × Bytes per Element… A single Llama 3.1 70B request at 128K context consumes approximately 40 GB of KV cache alone." https://www.spheron.network/blog/gpu-memory-requirements-llm/ （2026-05-15，厂商博客，置信度：中）
[^2^]: VMware, "LLM Inference Sizing and Performance Guidance" — "GPU_memory_foot_print = model_weights_size + kv_cache_size… = 26GB for llama-3-8B with average 8192 tokens… and 10 concurrent requests"，含分 GPU TTFT/TPOT/吞吐计算器表。 https://blogs.vmware.com/cloud-foundation/2024/09/25/llm-inference-sizing-and-performance-guidance/ （2024-09-25，页面更新 2026-02，企业技术博客，置信度：高）
[^3^]: tutorialq, "KV Cache Sizing" — "deploy LLaMA-70B with TP=4 on 4×H100, FP8 KV cache, gpu_memory_utilization=0.92, yielding ~60 concurrent 4K-context requests"；"MHA 512KB/token → GQA 128KB → MQA 16KB"。 https://tutorialq.com/ai/dl-infrastructure/kv-cache-sizing （2026-03-27，教程站，置信度：中）
[^4^]: M. Brenndoerfer, "KV Cache Memory: Calculating GPU Requirements" — "LLaMA 7B crossover point: 26,702 tokens… KV cache equals model weights: 13.0 GB"；"Generation is memory-bound at typical context lengths"。 https://mbrenndoerfer.com/writing/kv-cache-memory-calculation-llm-inference-gpu （2026-01-07，个人技术站含代码，置信度：中-高）
[^5^]: 掘金《大模型基础设施工程 11：推理引擎基础》— "A100 SXM4 peak: FP16 312 TFLOPS, HBM 2.0 TB/s, 拐点 I≈156 FLOPs/byte… 算术强度几乎就是 batch size… Decode…memory-bound，瓶颈在读权重和读 KV"。 https://juejin.cn/post/7633658714650574889 （2026-04-28，中文技术社区，置信度：中）
[^6^]: arXiv 2606.29986, "HBM Is Not All You Need" — "prefill… becomes compute-bound past ≈1K tokens; decode… firmly memory-bound"；"At L=4K the A100 leaves 96.8–97.2% of its HBM bandwidth idle, rising above 99% at 16K"。 https://arxiv.org/html/2606.29986v1 （2026-06-29，arXiv 预印本，置信度：高）
[^7^]: arXiv 2606.06256 (RedKnot) — "For a 70B-class model at 128K context length, the KV cache alone can exceed 40 GB… balance point ∼156 FLOP/Byte on A100 and ∼295 FLOP/Byte on H100 SXM"。 https://arxiv.org/html/2606.06256v2 （2026-06-26，arXiv，置信度：高）
[^8^]: OSDI'24 / arXiv 2401.09670, DistServe — "DistServe can serve 7.4× more requests or 12.6× tighter SLO… staying within latency constraints for >90% of requests"；单 A100 1.6 rps vs 拆分后 10 rps。 https://www.usenix.org/conference/osdi24/presentation/zhong-yinmin ; https://arxiv.org/html/2401.09670v2 （2024-03/OSDI'24，顶会，置信度：高）
[^9^]: wentao.site DistServe 解读 — "transfer < 0.1% even on 175B with 25 Gb links"；prefill M/D/1 排队模型；局限"prefill/decoding replicas each keep full model weights, doubling GPU memory"。 https://wentao.site/disaggregated_inference_summary/ （2026-07-04，个人笔记，置信度：中-高）
[^10^]: HyperAccel, "Understanding HBF" — 层级表："DRAM(DDR5) ~50 GB/s、~10–100 ns；HBM4 ~2 TB/s、36–48 GB/stack；NAND(SSD) ~7 GB/s、~50–100 µs… there is no memory that provides 'TB-scale capacity at TB/s-level bandwidth'"。 https://hyper-accel.github.io/en/posts/what-is-hbf/ （2026-04-23，HBF 厂商博客，置信度：中-高）
[^11^]: Introl, "CXL 4.0 Infrastructure Planning Guide" — "HBM3e $15-25/GB ~10ns；DDR5 $3-5 ~80ns；CXL DDR5 $4-7 200-500ns；NVMe SSD $0.10-0.20 ~100µs"。 https://introl.com/blog/cxl-4-0-infrastructure-planning-guide-ai-memory-pooling-2025 （2026-04-27，集成商博客，置信度：中）
[^12^]: memorysupercycle.xyz — "HBM3E ≈ $300 / 36 GB stack (~$8–13/GB)… peaked at ~$17–20/GB in H1 2025… DDR5 ≈ $12/GB currently"；声明所有数字为分析师三角估计、无公开价格指数。 https://memorysupercycle.xyz/ （未知日期/2026 滚动，聚合仪表盘，置信度：低-中）
[^13^]: Metrum AI (Solidigm KV offload) — "H200 $30,000-40,000 for 141 GB → $213-$284/GB（整卡口径）；Solidigm D7-PS1010 15.36TB $3,250 → ~$0.21/GB，seq read 14,500 MB/s"。 https://www.metrum.ai/blog/solidigm-kv-cache-offload-ai-inference （2026 年，厂商合作博客，置信度：中）
[^14^]: Spheron, "NVIDIA H200 Specs" — "H100 80GB/3.35TB/s；H200 141GB/4.8TB/s；B200 192GB/8.0TB/s；NVLink 900 GB/s；PCIe 5.0 ~128 GB/s"。 https://www.spheron.network/blog/nvidia-h200-specs/ （2026-05-20，云厂商，规格与官方一致，置信度：高）
[^15^]: JarvisLabs, "NVIDIA B200 Specs" — "192GB HBM3e… up to 8 TB/s… NVLink 5th gen 1.8 TB/s"。 https://jarvislabs.ai/ai-faqs/nvidia-b200-specs （2026 年，云厂商 FAQ，置信度：高）
[^16^]: arXiv 2303.06865, FlexGen — "aggregates memory from the GPU, CPU, and disk… running OPT-175B on NVIDIA T4 (16GB)… reaching a generation throughput of 1 token/s for the first time with an effective batch size of 144"。 https://arxiv.org/abs/2303.06865 （2023-03-13，ICML'23，置信度：高）
[^17^]: FlexGen GitHub — 吞吐表 "FlexGen with Compression OPT-175B 1.12 tok/s (144 on CPU)… With the same latency of 5000 seconds, FlexGen… more than 40× higher throughput than DeepSpeed Zero-Inference"；"One key idea of FlexGen is to play the latency-throughput trade-off"。 https://github.com/FMInference/FlexGen （2023，官方仓库，置信度：高）
[^18^]: arXiv 2606.11690, "Beyond Per-Token Pricing" — "on identical H100 hardware, effective cost spans $0.21 to $15.25 per million output tokens, an underutilization penalty of 2.5-24x… any utilization-naive estimate understates true cost by exactly 1/U"；"FP8… +69 to +74% vs +31% peak throughput (MoE vs dense)"。 https://arxiv.org/abs/2606.11690 （2026-06-10，arXiv，置信度：高）
[^19^]: arXiv 2606.22902 (Agent-as-a-Router) — "H100 $6.88/GPU-hour… sustained 35,094 tokens/s… $0.054 per 1M tokens"。 https://arxiv.org/html/2606.22902v1 （2026-06-24，arXiv 附录方法，置信度：中）
[^20^]: firecrawl AI-research-SKILLs, TRT-LLM serving reference — "Batch size 1: $3/M tokens；Batch size 64: $0.60/M — 5× cost reduction；Target batch 32-128"；分硬件 $/M tokens 表。 https://github.com/firecrawl/ai-research-skills/blob/main/12-inference-serving/tensorrt-llm/references/serving.md （2026-02-06，工程资料，置信度：中）
[^21^]: kubernetes-sigs/inference-perf paper — 标准指标含 "Price per million output/input tokens, Throughput per dollar"。 https://github.com/kubernetes-sigs/inference-perf/blob/main/paper/paper.md （2025-01-14，K8s 社区，置信度：高）
[^22^]: arXiv 2603.08739, Kareto（阿里+浙大）— "Simply expanding storage does not always yield performance gains; beyond a certain point, storage cost can outweigh computation savings"；"Compared to the fixed setup with 1024 GB DRAM, Kareto can improve throughput by up to 9.3%, or reduce latency by up to 58.3%, or lower cost by up to 20.2%"；仿真器"replays historical request traces… KV-cache hit rates, throughput, TTFT, cloud cost"。 https://arxiv.org/abs/2603.08739 （2026-02-25，arXiv，置信度：高）
[^23^]: SGLang HiCache 文档 — "a larger HiCache size leads to higher cache hit rate… However, the relationship is not linear. Once most reusable KV data is cached, further increases yield marginal gains"；L1 GPU/L2 host/L3 storage 参数族。 https://docs.sglang.io/advanced_features/hicache.html （2026-03-04，官方文档，置信度：高）
[^24^]: arXiv 2605.11333, MLCommons Chakra — "Chakra execution trace (ET)… represent key operations, such as compute, memory, and communication, data and control dependencies, timing, and resource constraints… adopted by MLCommons… NVIDIA, AMD, Meta, Keysight, HPE"。 https://arxiv.org/abs/2605.11333 （2026-05-11，MLCommons，置信度：高）
[^25^]: vLLM 官方 Profiling 文档 — "nsys profile --trace-fork-before-exec=true --cuda-graph-trace=node vllm bench latency…"；"VLLM_WORKER_MULTIPROC_METHOD=spawn"；`vllm bench serve --profile` 动态抓取。 https://docs.vllm.ai/en/stable/contributing/profiling/ （2025-03-05 起多版本，官方文档，置信度：高）
[^26^]: Red Hat Developer, "Profiling vLLM Inference Server" — 三段式流程：PyTorch profiler（VLLM_TORCH_PROFILER_DIR + /start_profile）→ Nsight Systems；trace 用 Perfetto 打开。 https://developers.redhat.com/articles/2025/10/16/profiling-vllm-inference-server-gpu-acceleration-rhel （2025-10-16，企业技术博客，置信度：高）
[^27^]: Spheron, "GPU Profiling for AI Workloads" — "Key kernels to watch: paged_attention_v1_kernel…"；"SGLang exposes --enable-torch-profiler… Profile at multiple cache hit rates to see the latency cliff when cache pressure increases"。 https://www.spheron.network/blog/gpu-profiling-ai-workloads-nsight-compute-pytorch-profiler-guide/ （2026-05-09，云厂商，置信度：中）
[^28^]: PyShine, "Vidur: Microsoft's LLM Inference System Simulator" — "trace-driven workloads that replay real production request patterns… TTFT predictions within 5-10%… throughput within 10-15%… Chrome Trace Export"。（论文 arXiv 2405.05465） https://pyshine.com/Vidur-Microsoft-LLM-Inference-System-Simulator/ （2026-04-28，解读+官方论文，置信度：高）
[^29^]: Aalto 大学论文, "Characterizing LLM inference workload patterns" — 基于 Azure LLM inference trace 与 BurstGPT："arrival times… clear diurnal and weekly patterns"。 https://aaltodoc.aalto.fi/items/5607c667-f6fe-4d48-98d2-c5018dfbbf06 （2025-12-29，学位论文，置信度：中-高）
[^30^]: kvcache-ai/Mooncake — "Mooncake can achieve up to a 525% increase in throughput… enables Kimi to handle 75% more requests"；"Kimi K2 on 128 H200 GPUs… 224k tokens/sec prefill and 288k tokens/sec decode"；"Feb 21, 2025: The updated traces used in our FAST'25 paper have been released"。 https://github.com/kvcache-ai/Mooncake （FAST'25 最佳论文，2026-04 更新，置信度：高）
[^31^]: IBM Redbooks MD260021 — "TTFT remains nearly flat… 56x speedup with an input sequence length of 130k tokens… throughput… 0.19 RPS to 4.26 RPS, a 22x improvement… noisy-neighbor… 18x"；用 NVIDIA AIPerf 基准。 https://www.redbooks.ibm.com/docs/MD260021/MD260021.html （2026-06-05，厂商验证架构，置信度：中-高）
[^32^]: Yobitel, "NVIDIA H100 Tensor Core GPU" — 生产告警清单："DCGM_FI_PROF_DRAM_ACTIVE — HBM bandwidth utilisation; pair with PIPE_TENSOR_ACTIVE to classify compute-bound vs memory-bound regimes"。 https://yobitel.com/knowledge-base/nvidia-h100 （2026-07-04，运维知识库，置信度：中）
[^33^]: NVIDIA Run:ai 文档, "GPU Profiling Metrics" — DCGM 字段全表："DCGM_FI_PROF_DRAM_ACTIVE… DCGM_FI_PROF_PCIE_TX/RX_BYTES… DCGM_FI_PROF_NVLINK_TX/RX_BYTES… FB_USED/FREE"。 https://run-ai-docs.nvidia.com/self-hosted/2.24/platform-management/monitor-performance/gpu-profiling-metrics （2026-05-26，官方文档，置信度：高）
[^34^]: Spheron, "AI's Memory Wall Problem" — 决策树："MBU% > 80% and SM% < 60%: memory-bound… SM% > 80% and MBU% < 60%: compute-bound… Both low: check CPU… or network I/O"；"dcgm-exporter exports DCGM_FI_PROF_DRAM_ACTIVE… Alert when the ratio… exceeds 2:1"。 https://www.spheron.network/blog/ai-memory-wall-inference-latency-guide-2026/ （2026-04-10，云厂商，置信度：中）
[^35^]: 知乎《vLLM 里面的 Prefix cache hit rate 是什么意思》— "Prefix cache hit rate 指标从 vLLM 0.3.0（2024-01）正式引入… 细化为分别报告 GPU 和 CPU 的缓存命中率"。 https://zhuanlan.zhihu.com/p/31951576481 （2025-04-21，中文社区，置信度：中）
[^36^]: cnblogs《开源大模型本地部署硬件选型深度指南》— 监控清单："vllm:gpu_cache_usage_perc KV 占用 >95% 触发 preemption；num_requests_waiting 持续>0 即容量不足…"。 https://www.cnblogs.com/skyseraph/p/21109151 （2026-07-04，中文技术博客，置信度：中）
[^37^]: SGLang issue #28047 — "TTFT cannot be decomposed… HiCache tier performance is invisible — L2 DMA time, L3 prefetch I/O time, and per-tier hit/miss counts are not available per-request"，提出 L1/L2/L3_hit 与 queue/schedule/forward 分解 JSON。 https://github.com/sgl-project/sglang/issues/28047 （2026-06-12，特性提案，置信度：中）
[^38^]: LMCache 文档 — "Production-level KV cache observability… token-level prefix cache hits, lifecycle, request-level KV cache performance"；后端含 CPU RAM/local disk/Redis/Mooncake/S3/NIXL/GDS。 https://docs.lmcache.ai/ （2026-06-23，官方文档，置信度：高）
[^39^]: arXiv 2605.03375, Tutti — "restoring KV cache from SSDs… causing GPU bubbles to exceed 70% of total inference latency… SSD-LW… around 80%"；"Even with GDS, GPU bubble time remains high at above 70%… restoring KV cache from SSDs is no longer beneficial"；实测双 SSD 聚合读 29 GB/s/写 12 GB/s、DRAM-HBM 50 GB/s。 https://arxiv.org/html/2605.03375 （2026-05-05，arXiv，置信度：高）
[^40^]: arXiv 2602.21548, "Breaking the Storage Bandwidth Bottleneck in Agentic LLM Inference" — "KV-Cache loading speed is the bottleneck due to the limited bandwidth of the single storage NIC… mean number of rounds 157… average context 32.7k, append 429 → hit rate 98.7%… cache-compute ratio ≈22 GB/PFLOP for DeepSeek-V3.2… from Ampere to Blackwell, the I/O-compute ratio decreases by 14.4×"。 https://arxiv.org/html/2602.21548v1 （2026-02-25，arXiv，置信度：高）
[^41^]: Netpreme / lmsys blog, "Accelerating SGLang HiCache with X-Mem MPU" — "When hit rate exceeds 95%, scaling the bandwidth of KV-cache tiering can significantly reduce TTFT… Claude Code traces… mean hit ratio ~98%… 3x performance boost… improves TTFT by 6.7×"。 https://www.lmsys.org/blog/2026-06-27-netpreme-xmem/ （2026-07-08，厂商合作博客，置信度：中）
[^42^]: lmsys blog, "SGLang HiCache" — "average TTFT dropped by 56%, inference throughput doubled, and the cache hit rate jumped from 40% to 80% (Novita AI)… cache hits achieved an 84% reduction in TTFT (Ant Group)… up to 6× throughput improvement and up to 80% reduction in TTFT"。 https://lmsys.org/blog/2025-09-10-sglang-hicache/ （2025-09-10，项目官方+用户数据，置信度：中-高）
[^43^]: NeurIPS 2025, HiFC — "DRAM-free online inference… leverages GPU Direct Storage (GDS) to create a direct data path between the GPU and a commodity SSD… achieving DRAM-comparable performance at a fraction of the cost"。 https://papers.neurips.cc/paper_files/paper/2025/file/4431224d3762aa655f0aee4eaf04ff16-Paper-Conference.pdf （NeurIPS'25，置信度：高）
[^44^]: arXiv 2606.14779, "Unified KV Pooling" — "high serving latency stems from a serialized IO path for KV cache… filesystem overhead that dominates SSD-based KV retrieval"；测试台 DDR4 21.3 GB/s vs 双 NVMe 63 GB/s。 https://arxiv.org/html/2606.14779 （2026-03-02，arXiv，置信度：高）
[^45^]: arXiv 2603.23049, PCR — "layer-wise overlapping… reduces the effective overhead to only the first-layer loading and the last-layer offloading… queue-based prefetching… average 15% reduction in TTFT"。 https://arxiv.org/html/2603.23049v1 （2026-03-24，arXiv，置信度：高）
[^46^]: NVIDIA Technical Blog, "NVFP4 KV Cache" — "When that pool fills, the KV cache manager evicts portions of older context… the actual performance gain hinges on cache-hit rate"。 https://developer.nvidia.com/blog/optimizing-inference-for-long-context-and-large-batch-sizes-with-nvfp4-kv-cache/ （2025-12-05，官方博客，置信度：高）
[^47^]: Spheron, "NVMe KV Cache Offloading" — 三级层级 GPU HBM/CPU DRAM/NVMe；"VAST Data reported roughly 10x faster prefill times using ICMSP"；"H100 serving Llama 3.1 70B at 128K… Eight concurrent users need ~320 GB… 4x the H100's entire HBM"。 https://www.spheron.network/blog/nvme-kv-cache-offloading-llm-inference/ （2026-03-31，云厂商，置信度：中）
[^48^]: Guru3D, "AMD MI355X Breaks 1M Tokens/s in MLPerf" — "MLPerf Inference 6.0… surpassed 1 million tokens per second in multinode… single-node 100,282 tokens/s on Llama 2 70B Server… 288 GB HBM3E"。 https://www.guru3d.com/story/amd-instinct-mi355x-breaks-1m-tokens-per-second-in-mlperf/ （2026-04-02，媒体报道 MLPerf 提交，置信度：中）

---
*检索方法：32 次独立 web 检索（其中 6 次空结果后以改写查询重试），覆盖 arXiv 论文、厂商官方文档（NVIDIA/vLLM/SGLang/LMCache/Mooncake）、企业技术博客（VMware/RedHat/IBM）与中文社区资料。价格类数据（HBM/DDR5 $/GB）为分析师估计，存在 ±2× 不确定性，已在正文标注置信度。*
