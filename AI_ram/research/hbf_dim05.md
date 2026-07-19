# 维度 05：HBM+HBF 两级近存后的推理系统架构变化、Batch Size 系统级优势、带宽/容量量化分析（2024–2026）

> 调研日期：2026-07（资料覆盖 2024-01 ~ 2026-07）。每条关键论断附内联引用 [^n^]，引用条目含原文摘录、URL、日期与置信度（高/中/低）。

## Key Findings

1. **Decode 是天然 memory-bound**：batch=1 时算术强度 ≈1–2 FLOP/byte（每读 1 字节权重只做一次乘加），比 H100 的 roofline 拐点（≈295 FLOP/byte，BF16）低两个数量级，Tensor Core 空闲率 99.7%[^15^][^16^][^17^]。H200 相对 H100 算力不变、带宽 +43%，decode 吞吐直接 +43%[^17^]——带宽即吞吐。
2. **算术强度是算法属性，但 batch 可摊薄权重流量**：增大 batch 把权重读取摊到 B 个请求上，等效算术强度 ≈2B FLOP/byte；要触到计算 bound 需要 batch≈90–160（BF16，H100/H200/B200 拐点 206–312 FLOP/byte）。FP8 权重使字节数减半，所需 batch 再减半[^15^][^16^]（拐点与 batch* 为本报告按公开规格计算）。
3. **实测：batch 1→64，H100 上 Llama-3.1-70B FP8 吞吐 550→12,000 tok/s（22×），TTFT 80ms→700ms（8.8×）**[^19^]；Llama-3.3-70B（TP4，BF16）H100 在 500 并发下达 ~7,000 TPS，而 A100 在 ~50 并发即饱和于 ~570 TPS[^20^]。大 batch 的吞吐红利真实存在，但受两道闸门限制：**HBM 容量（KV cache 驻留）**与**SLO（TTFT/TPOT）**。
4. **KV cache 公式与体量**：`KV/token = 2 × L × H_kv × d_head × bytes`。Llama-3-70B（80L、8 KV 头、GQA）= **320 KB/token** → 128K 上下文 ≈ 40 GiB/请求，1M ≈ 305 GiB[^25^][^26^][^28^]；Llama-3-405B（126L）= **504 KB/token**[^28^]；DeepSeek-V3 MLA（61L、d_c=512+d_rope=64）= **68.6 KB/token**（较 MHA 压缩 57×，较 GQA 7×），FP8 KV 再降至 ~38 KB/token[^26^][^27^][^29^]。同一 H200，MHA 版 128K 连 1 个并发都放不下，MLA 版可放 8–9 个[^28b^]。
5. **连续批处理下 batch 上限由 KV 内存锁定**：`B_max = (显存 − 权重) / (kv_per_token × ctx)`。H200 141GB 跑 FP8 70B 时 8K 上下文 B_max≈27、128K 仅 ≈2、1M 为 0（本报告计算）；实测中 vLLM 在 B=32、1600+1600 token 时 KV（102,400 tokens）已 2× 超出 HBM 分配（45,584 tokens），触发抢占与排队、吞吐饱和退化[^21^]。**HBF/ICMS 的直接价值就是把这条容量闸门抬升 1–2 个数量级**：8×H200+4TB HBF 跑 DSV3 时 128K B_max 从 51 → ~500（本报告计算）；FlashAccel 实测 405B 15K/6K 场景 batch 30→110[^14^]。
6. **KV 流量在并发×上下文积上反超权重流量**：decode 每步须重读全部活跃 KV，每请求带宽 = `S × kv_per_token × r`。Llama-3-70B@128K、20 tok/s → **0.84 TB/s/请求**；405B@1M → 10.3 TB/s/请求；DSV3 MLA@128K → 0.18 TB/s/请求（本报告计算）。交叉并发 N*（KV 流量=权重流量）在 128K 时仅 1.7（70B FP8）/4.1（DSV3）——**长上下文下 KV 而非权重成为带宽主体**，这正是"HBM 后加一层大容量闪存"的根本动因[^13^][^24^][^27^]。
7. **HBF 规格（SanDisk+SK hynix，OCP 标准化中）**：Gen1 单堆栈 512GB（16-high NAND+base die，BiCS+CBA 键合、TSV），读带宽 1.6 TB/s ≈ HBM4@6.4Gb/s，物理/功耗兼容 HBM4 封装位；Gen2 >2 TB/s、1TB；Gen3 >3.2 TB/s、1.5TB[^1^][^2^][^3^][^9^]。对比传统 NAND over PCIe5 NVMe ~14 GB/s，**同样介质仅靠封装即提升 ~100×**[^3^]。样品 H2 2026，首批推理设备 2027 年初[^2^][^5^][^6^]。
8. **HBF 时延是硬约束：读时延 ~4µs（tR）vs HBM ~100ns（40×），介质层差距 10–100×**[^3^][^14^]。结论：HBF 适合**读主导、可预取、可流水化**的数据（权重、KV 块流式读取、冷 KV 预驻），不适合低延迟随机访问（激活、热 KV 单点更新）[^3^][^14^]。SanDisk 官方仿真：HBF 承载 Llama-3.1-405B 权重，decode 性能落在"无限容量 HBM"的 2.2% 以内[^1^][^9^]。
9. **带宽利用率才是 HBF 的真瓶颈**：单 plane 仅 ~1 GB/s（4KB 页/4µs），堆满 4.8 TB/s 需 ~4,916 个 plane 并发；"超页"达 ~19MB，而 Qwen3-235B 单个权重矩阵仅 12MB；KV 随机分布时最大 plane 负载超均值 52% → 带宽损失 52%[^14^]。**数据布局（执行序轮排、超页对齐、HBM 热块卸载）与 SRAM 预取缓冲是 HBF 系统成败关键**[^14^]。
10. **NVIDIA 路线（ICMS/CMX + STX + BlueField-4）做的是"以太网挂载的 G3.5 闪存层"而非封装内 HBF**：pod 级 PB 容量、BF-4 DPU 终结 NVMe-oF/RDMA（2×400G=800Gb/s）、DOCA Memos/Dynamo KVBM 调度，官方宣称较传统存储 **5× tok/s、5× 能效**[^11^][^12^][^13^]。Dynamo KVBM 分层时延：G1 HBM ~µs、G2 DRAM ~ms、G3/G3.5 本地 SSD/ICMS ~10ms、G4 对象存储 ~100ms[^10^]。**HBF（封装内、1.6TB/s/堆栈、µs 级）与 ICMS（网络挂载、~10ms 级）是两种不同的"G3.5"实现，前者可进 decode 回路，后者只做预驻/复用**（本报告推演）。
11. **更大 batch 的系统级优势已被量化**：FlashAccel（6×HBF 堆栈集成 GPU）在 100ms TPOT SLO 下吞吐/能效分别 +2.54×/+1.93×；CSI 架构平均 +2.15× 吞吐——**收益来源即"HBM 容量瓶颈解除后，batch 上限从内存容量约束移到延迟预算约束"**[^14^]。Sarathi-Serve：朴素混合批使 TBT 恶化最高 28.3×，chunked-prefill+stall-free 在严格 SLO(100ms) 下容量 3.5×[^23^]；DistServe：PD 分离后 decode 可单独堆大 batch，goodput 最高 7.4×[^22^]。
12. **写寿命问题基本可解**：SLC ~100K P/E，5 年寿命折算 ~55 次/天全盘写；DeepSeek 生产数据：prefill 每 GPU 每天写 22.7TB KV、decode 26.9TB，1TB HBF 可承 ~55TB/天 → 可行；放宽 retention 还可延寿 50×[^14^]。但业界仍有"HBF 只放权重、KV 留 HBM/DRAM"的保守派观点[^3^]（见"争议"）。
13. **仿真工具链**：Vidur（Microsoft，MLSys'24，离散事件+随机森林时延预测，TTFT 误差 5–10%）[^43^]；LLMServingSim 2.0（ASTRA-sim+Chakra 扩展，显式建模 device/host/storage/CXL 四层、带宽竞争、KV 迁移、PIM）[^44^]；FlashAccel 自研周期级仿真（plane 级 NAND 时序+超页布局）[^14^]。**适配 HBF 必须在容量/带宽之外新增：µs 级读时延与预取流水、plane 并行度与负载均衡、写寿命、持久化命名空间、MLA/GQA/MHA 的 KV 形态差异**（见 §5）。

## 量化模型与数据

### 1. LLM 推理 memory-bound 特性：decode 算术强度与 roofline

**两阶段特性**：prefill 并行处理全部输入 token，compute-bound；decode 逐 token 生成，每步读全部权重但只做 ~2 FLOPs/字节，memory-bound[^15^][^16^]。

- 算术强度（batch=1）：`AI ≈ 2 FLOPs / weight-byte`（每个权重元素一次乘加）[^16^][^17^]；TPUv4 实测 batch-1 decode 仅 11–22 FLOP/byte，低于计算 roofline 数百倍[^16b^]。
- Roofline 拐点（ridge point）= 峰值算力/带宽（本报告按公开规格计算）：

| GPU | HBM | 带宽 | BF16 算力 | 拐点 | 饱和计算所需 batch*（AI=2B） |
|---|---|---|---|---|---|
| A100-80G | 80GB | 2.04 TB/s | 312 TF | ≈153 FLOP/B | ≈77 |
| H100 SXM | 80GB | 3.35 TB/s | 989 TF | ≈295 FLOP/B | ≈148 |
| H200 SXM | 141GB | 4.8 TB/s | 989 TF | ≈206 FLOP/B | ≈103 |
| B200 | 192GB | 8 TB/s | ~2.25 PF | ≈281 FLOP/B | ≈141 |
| Rubin R100 | 288GB HBM4 | 22 TB/s | ~4 PF(FP16) | ≈182 FLOP/B | ≈91 |

（规格来源：[^17^][^36^][^35^]；R100 22 TB/s 为 NVIDIA 官方页口径[^36^][^35^]，JEDEC 基线 8Gb/s pin 对应 ~16 TB/s）

- **单请求 decode 时 GPU 算力利用率 <1%**（"99.7% idle"[^17^]；"single-digit-percent utilization"[^16^]）；decode 功耗低于 TDP 不是利用率假象，而是带宽瓶颈的结构性结果[^15^]。
- **吞吐上限**：带宽/权重字节。7B FP16 on A100：TPOT 地板 ~7ms、单流 ~145 tok/s；而计算天花板 ~10⁴ tok/s——"TPOT 目标 100ms 时计算单元 90% 以上时间空转，batching 正是摊薄这段空闲"[^45^]。
- batch 提升吞吐但不改变算术强度本身（算法属性）；并行切分亦然（每 GPU 仍执行 memory-bound 核）[^15^]。
- **KV 侧的带宽墙**：每个 decode 步重读全部 KV。实测 Llama-3.1-8B-1M on H100（3 TB/s）：5K 上下文（~0.6GB KV）每步 ~5ms；500K（~60GB KV）每步 ~25ms——decode 时间随上下文线性增长，与"HBM 带宽÷加载量"预测吻合[^24^][^27^]。

### 2. KV cache 容量公式与实例

**通用公式**：`KV_bytes/token = 2 × L × H_kv × d_head × p`（MHA/GQA/MQA）[^25^][^26^][^28^]；MLA：`(d_c + d_rope) × L × p`[^26^][^27^][^29^]。

| 模型 | 结构 | KV/token (BF16) | 128K ctx | 1M ctx | 来源 |
|---|---|---|---|---|---|
| Llama-3-70B | 80L, GQA-8, d=128 | **320 KB** | ≈40 GiB | ≈305 GiB | [^25^][^26^][^28^] |
| Llama-3-405B | 126L, GQA-8, d=128 | **504 KB** | ≈62 GiB | ≈481 GiB | [^28^] |
| Qwen3-32B | 64L, GQA-8 | 256 KB | ≈31 GiB | — | [^14^]（8K≈2GB 反推一致） |
| DeepSeek-V3 | 61L, MLA(512+64) | **68.6 KB** | ≈8.4 GiB | ≈65 GiB | [^26^][^27^][^29^] |
| DeepSeek-V3 (FP8 KV) | 同上 | ~38 KB | ≈4.7 GiB | ≈36 GiB | [^27^][^31^] |
| DSV3 假设 MHA 版 | 61L, 128h×128 | 3.9 MB | ≈480 GB | — | [^26^][^27^] |
| DSV3 假设 GQA-16 版 | 61L, 16h×128 | 488 KB | ≈60 GB | — | [^27^] |

- MLA 压缩比：vs MHA **57×**、vs GQA **7×**[^26^][^27^]；DeepSeek-V3 架构参数（61 层、hidden 7168、128 头、d_c=512、d_rope=64、1 共享+256 路由专家、top-8、671B 总/37B 激活）[^29^]；Kimi-K2 同构放大（1.04T/32.6B、384 专家、64 头）[^30^]。
- 生产侧佐证：DeepSeek 自述其推理集群每天 608B 输入 token 中 342B 由 **KV cache 命中**免去重算（命中率 56%）——KV 驻留容量直接等于 prefill 算力节省[^14^]。
- 长上下文实证：Llama-3-70B MHA 假设下 128K 单请求 KV=336GB（4× 超 H100），GQA 后 ~42GB 仍占 HBM 一半以上[^26^]；Qwen-32B on H100：2K 上下文可 batch≈50，100K 时 batch=1[^24^]。

### 3. Batch size 增大的收益与代价

**收益（吞吐/MFU）**：
- H100 SXM FP8、Llama-3.1-70B（vLLM 连续批处理）：batch 1/8/32/64 → 吞吐 ~550/3,200/8,000/12,000 tok/s；权重读取被摊薄，吞吐近线性至 batch≈32[^19^]。
- Llama-3.3-70B NIM TP4：H100 并发 1→500 近线性至 ~7,000 TPS（200→200 负载）；1,000→200 负载下 250 并发 ~2,600 TPS；A100 ~50 并发即饱和（~570 TPS）——**容量+带宽共同决定饱和点**[^20^]。
- vLLM PagedAttention 把 KV 预分配浪费从 60–80% 降到近零，吞吐 2–4×；Llama-2-70B on 4×A100 达 2,200 tok/s @256 并发[^38^]。
- 大 batch 还摊薄多 GPU 通信（集合通信可占端到端时延 20%[^14^]）并提升 MFU——但 decode 的"MFU 提升"本质是带宽利用率的提升，而非算术强度变化[^15^]。

**代价（TTFT、SLO、调度）**：
- TTFT 随 batch 恶化：H100 上 batch 1→64，TTFT 80→700ms[^19^]；生产 SLO 典型值"P99 TTFT<500ms、TPOT<50ms"[^22b^]。
- 混合执行干扰：朴素 hybrid batch 使 TBT 最高恶化 **28.3×**；prefill 优先调度造成 decode"generation stall"可达数秒[^23^]。
- 内存闸门：KV 接近 100% 饱和 → 调度器抢占请求 → 重算导致 E2E 时延灾难性尖刺[^46^]；vLLM 实测 B=32 即因 KV 超 HBM 预算 2× 而停滞排队[^21^]。
- 缓释技术：Sarathi-Serve（chunked prefill + stall-free）严格 SLO(100ms) 下容量 3.5×、宽松 SLO 下 1.65×[^23^]；DistServe PD 分离，decode 池独立堆 batch 至"近 compute-bound"，goodput 7.4× 或 SLO 收紧 12.6×[^22^]；chunked prefill 使 TTFT p95 降 50–70%[^38b^]。
- **结论：continuous batching 的 batch 上限 = min(SLO 允许, HBM 容量允许)。HBF/近存层把后者抬升后，瓶颈转移到前者——"从容量约束变成延迟预算约束"**[^14^]。

### 4. HBF 带宽需求估算与规格数据

**HBF 公开规格**：

| 项 | Gen1 | Gen2 | Gen3 | 来源 |
|---|---|---|---|---|
| 单堆栈容量 | 512 GB（16-high+base die） | >1 TB | >1.5 TB | [^1^][^2^][^9^] |
| 读带宽 | 1.6 TB/s（=HBM4@6.4Gb/s） | >2 TB/s | >3.2 TB/s | [^1^][^3^][^9^] |
| 读时延 | ~µs 级（tR≈4µs，HBM 的 40×） | — | — | [^14^] |
| 封装 | 兼容 HBM4  footprint/高度/功耗，电接口相同、协议小改 | — | — | [^2^][^7^][^9^] |
| 容量/成本 | 同成本下容量 8–16× HBM | — | — | [^2^][^5^][^8^] |
| 路线 | 样品 H2 2026；首批推理设备 2027 初；OCP 标准化（SanDisk+SK hynix）；Samsung/Kioxia 自研，FlashDi 中国产线 | — | — | [^2^][^4^][^6^][^39^] |

（注：SanDisk 2025-02 投资者日原始概念曾展示 8-high 混合堆栈（NAND+HBM die 混插）设想；学术模型（FlashAccel）按 8 flash die+base die 建模；量产标准化为 16-high[^7^][^14^][^5^]。媒体普遍把"256Gb/die"误写为"256GB/die"，单堆栈 512GB=16×32GB 才自洽[^1^][^9^]。）

**场景带宽需求（本报告计算，公式均列明）**：

(a) **权重流（decode 回路直读）**：token-steps/s = BW / 权重字节。

| 权重驻留 HBF | 1×堆栈 1.6TB/s | 6×堆栈 9.6TB/s | 对照 H200 4.8TB/s |
|---|---|---|---|
| Llama-3-70B FP8 (70GB) | 23 steps/s | 137 steps/s | 69 steps/s |
| Llama-3.1-405B FP8 (405GB) | 4 steps/s | 24 steps/s | 12 steps/s |
| DSV3 激活参数 FP8 (37GB) | 43 steps/s | 259 steps/s | 130 steps/s |

→ 6 堆栈 HBF 聚合带宽（9.6 TB/s）≈ 2× H200；SanDisk 仿真 405B 权重读性能达"无限 HBM"的 97.8%[^1^][^9^]。**单 GPU 权重容量从 288GB（HBM4）跳到 ~4TB**：GPT-4 级 1.8T 参数（3.6TB BF16）可单卡容纳[^8^]。

(b) **KV 驻留近存进 decode 回路（每步流式重读）**：BW/请求 = `S × kv_per_token × r`（r=20 tok/s）：

| 模型/上下文 | 32K | 128K | 1M |
|---|---|---|---|
| Llama-3-70B GQA | 0.21 TB/s | **0.84 TB/s** | 6.6 TB/s |
| Llama-3-405B GQA | 0.33 TB/s | 1.32 TB/s | 10.3 TB/s |
| DSV3 MLA BF16 | 0.04 TB/s | 0.18 TB/s | 1.4 TB/s |
| DSV3 MLA FP8 KV | 0.02 TB/s | 0.10 TB/s | 0.78 TB/s |

→ 1 个 128K 上下文的 70B-GQA 请求就需要 ~1 个 HBF 堆栈一半的带宽；**GQA 模型 128K 级并发 >2 即需多堆栈聚合**。MLA 把同一带宽下的可服务并发提高 ~4.7×（0.84/0.18）。这是"HBF 承载热/温 KV"的带宽下界——也是 FlashAccel 必须做超页布局+SRAM 预取+HBM 热块卸载的原因[^14^]。

(c) **冷 KV 预驻/复用（G3.5 模式，一次性取回 HBM）**——取回一个请求的全部 KV 耗时：

| KV 块大小 | NVMe 14GB/s | ICMS 级 ~100GB/s | HBF 1.6TB/s |
|---|---|---|---|
| 70B@128K (42GB) | ~3.0 s | ~0.42 s | **~26 ms** |
| 70B@1M (328GB) | ~23.4 s | ~3.3 s | ~205 ms |
| DSV3@128K (9GB) | ~0.64 s | ~90 ms | ~5.6 ms |
| DSV3@1M (70GB) | ~5.0 s | ~0.7 s | ~44 ms |

→ 对"多轮对话回合间复用"（秒级可容忍）NVMe 勉强可用但 128K+ 已逾 TTFT 预算；**HBF 使 128K 级 KV 预驻进入 ~10–30ms 量级，可与一次 prefill chunk 重叠**——这是 HBF 相对 G3.5-NVMe 的代差价值。NVIDIA 宣称 ICMS 相对传统存储 5× tok/s[^11^]；KV 复用本身可能需要 ~4× 于工作集的容量来换取高命中率[^14^]。

(d) **MoE 专家驻留（HBF 当"专家库"）**：decode 每 token 只读激活专家（DSV3：top-8/256+1 共享 → 激活 37B/671B）。若全部 671B 驻 HBF、按激活流读：1.6TB/s ÷ 37GB ≈ **43 token-steps/s/堆栈**（batch 摊薄权重后，batch=64 时聚合 ~2,750 tok/s）；6 堆栈 ≈259 steps/s。对照 Apple"LLM in a Flash"（windowing+row-column bundling，2× DRAM 容量模型，速度 4–5×/20–25× vs naive）[^31^]与 Fiddler（CPU 侧算冷专家优于 PCIe 搬权重，PCIe 32GB/s 下搬运比片上慢 ~50×）[^32^][^33^]——**HBF 把"专家在慢介质上"的惩罚从 50× 压缩到个位数×（1.6TB/s vs 4.8TB/s HBM 仅 3× 差距）**，MoE 稀疏性与 HBF 大容量是天然互补。

(e) **HBM vs HBF vs NVMe 时延/带宽定位**（综合 [^3^][^10^][^14^][^48^]）：HBM ~100ns/数 TB/s；HBF ~4µs/1.6TB/s/堆栈；DDR 主机 ~10–100µs/63GB/s(PCIe5)；NVMe ~100µs–1ms/7–14GB/s；ICMS G3.5 ~10ms 级/pod 共享。

### 5. 仿真工具：适配 HBF 需考虑的模型因素

**现有工具**：
- **Vidur**（Microsoft Research, MLSys'24）：离散事件仿真+轻量 GPU  profiling 校准；ML 预测器（随机森林/线性回归）预测 kernel 执行时间；支持 Sarathi/vLLM/Orca/LightLLM/FasterTransformer 调度器、TP/PP；TTFT 误差 5–10%、吞吐 10–15%；用于容量规划与 Pareto 配置搜索[^43^]。
- **LLMServingSim 2.0**：面向异构+PD 分离集群；基于改造的 ASTRA-sim/Chakra；**显式扩展内存层级至 device/host/storage/CXL，建模带宽竞争、KV 迁移、内存共享与 PIM 算子**；与 RTX A6000/H100+vLLM 实测对照验证[^44^]。
- **FlashAccel 自研仿真**：plane 级 NAND 读时序（4KB/4µs/plane）、超页（hyper page）并行模型、ball-into-bins 负载偏斜模型（100GB KV→4,916 planes 时最大负载 +52%）、SRAM 双缓冲预取[^14^]。
- 其余可作组件：ASTRA-sim/Chakra（通信/算子图）[^44^]、DistServe 的仿真驱动并行度搜索（预测 vs 实测 ≤2% 误差）[^22^]、STAGE（符号化张量图工作负载合成，用于 HBM/互连带宽分配研究）[^47^]。

**适配 HBM+HBF 两级近存时必须纳入的模型因素**（本报告综合）：
1. **注意力形态**：MHA/GQA/MQA/MLA/稀疏注意力（DSA：indexer 132B/token 全读 + top-2048 稀疏读[^27^]）——直接决定 KV/token 字节数（57× 差距）与 HBF 上 KV 流带宽；
2. **模型结构参数**：层数 L、hidden、KV 头数/head_dim、MoE 专家数/激活数/top-k/共享专家（决定权重工作集与专家流模式）；
3. **精度**：权重 FP8/NVFP4、KV FP8/NVFP4（KV 字节再减半[^27^][^31b^]；MLPerf v6.0 已把 FP8 KV 作基准配置[^10^]）；
4. **上下文长度与分布**（8K/32K/128K/1M）× **并发**（KV=线性×两者[^13^]）；到达过程、输入/输出长度分布（影响 SLO 达成）；
5. **HBF 微架构参数**：堆栈数/die 数/plane 数、页大小、tR≈4µs、超页大小（带宽×时延）、聚合带宽 1.6TB/s×N、写寿命（P/E 与 retention 策略）；
6. **数据布局与调度**：权重执行序映射、KV 块→plane 均衡、HBM 热块卸载比例、预取深度（SRAM≥2×BW×tR）[^14^]；
7. **层级策略**：G1–G4 放置/晋升/降级策略（KVBM）、预驻时机（prefill chunk 重叠）、多轮复用命中率（DeepSeek 生产 56%[^14^]）；
8. **SLO 模型**：TPOT 50ms/100ms 两档[^14^]、TTFT 预算；抢占/重算代价[^46^]。

## 系统架构推演

**A. HBM+HBF 两级近存后的推理系统形态**（基于证据的推演）：
1. **封装形态两条路线**：CLI（co-located，HBF 部分替换 HBM 堆栈位，容量优先）vs CSI（cascaded，HBF 经 HBM base die 菊链，保留全部 HBM 带宽+容量）；FlashAccel 评估 CSI 带宽高 16.7%（6 vs 5 堆栈）、平均吞吐 +2.15×[^14^]。逻辑 die（NAND 控制器+PHY+SRAM 缓存）承担并行子阵列调度与预取，回应"逻辑 die 带计算核/SRAM"的架构设定[^3^][^14^]。
2. **数据分工**：HBM=热 KV（活跃 decode 工作集）、激活、小而易变中间态；HBF=权重（静态、读主导）、温/冷 KV（超页对齐流式读）、MoE 冷专家库[^3^][^14^]。新 KV 先写 HBM，攒满超页再刷回 HBF（写合并保带宽+保寿命）[^14^]。
3. **调度器变化**：batch 上限从"HBM 容量约束"变为"SLO/时延预算约束"[^14^]；调度器需感知层级（HBF-aware admission control）、把预取纳入 decode 流水（~4µs 时延用 SRAM 双缓冲+超页流水隐藏）；PD 分离架构下 decode 池更受益（DistServe 模式[^22^]）。
4. **内存管理**：PagedAttention 的块表需扩展为跨 HBM/HBF/DRAM/NVMe 的统一命名空间+持久化（HBF 非易失 → KV 可命名、可跨进程复用，Dynamo KVBM G1–G4 正是该方向的产品化[^10^][^11^]）。
5. **与 NVIDIA ICMS/STX 的关系**：ICMS 是网络挂载 G3.5（BF-4 DPU、~10ms、PB 级/pod、800Gb/s/DPU）[^11^][^13^]；HBF 是封装内近存（µs 级、1.6TB/s×堆栈、4TB/GPU 级）。推演：**HBF 对应"G2.5"（封装内容量层，可进 decode 回路），ICMS 对应 G3.5（pod 共享复用层，只做预驻）**——二者互补而非互斥；NVIDIA 自身押注 ICMS 而暂未采用 HBF[^41^]。
6. **对 GPU 数量经济性的影响**：模型容量不再强制多 GPU 堆卡（F/S 比失衡问题[^16^]）；405B FP8 单卡（HBF 4TB）即可驻留；少卡化还消除 20% 级集合通信开销与多卡故障率（1024 GPU 系统平均 7.9 小时一次故障）[^14^]。

**B. 更大 KV 驻留近存 → 更大 batch 的系统级优势链条**：
HBM 容量 ↑（+HBF 4TB）→ B_max 抬升 1–2 个数量级（§3 表）→ 权重/专家读取摊薄（AI 等效 ×B）→ decode 吞吐近线性升至 SLO 闸门（实测 batch64 达 batch1 的 22×[^19^]；FlashAccel +2.54×[^14^]）→ 单 token 成本与能耗同步下降（1.93× 能效[^14^]；A100→H100 12–14× 吞吐的代差说明带宽/容量投入的直接回报[^20^]）→ 同时 KV 复用容量池扩大（4× 容量换高命中[^14^]；DeepSeek 56% 命中免 prefill 重算[^14^]）→ prefill 算力需求下降（TTFT 与 GPU 数双降）。**边界条件**：吞吐增益受限于 (i) SLO（TTFT/TPOT）；(ii) HBF 聚合带宽与平面级利用率（布局不良时 −52%[^14^]）；(iii) 调度器消除 generation stall 的能力[^23^]；(iv) KV 流量反超权重流量后，HBF 上 KV 流带宽成为新瓶颈（§4b）。

**C. 各场景带宽/容量需求汇总（本报告计算）**：
- 权重近存：405B FP8 405GB → 单堆栈 HBF 即可容量满足；带宽要 ~24 steps/s 需 6 堆栈（9.6TB/s）。
- 热 KV 入回路（128K、20 tok/s）：GQA-70B 每请求 0.84TB/s → 8 并发 ≈6.7TB/s ≈ 4+ 堆栈专供 KV；MLA-DSV3 同条件 0.18TB/s/请求 → 8 并发 1.4TB/s ≈1 堆栈。**注意力形态决定 HBF 堆栈预算差 ~5×**。
- 冷 KV 预驻：128K 级 26ms/请求（1.6TB/s）；1M 级 205ms——与 chunked prefill 重叠可行。
- MoE 专家库：671B FP8 全驻需 2 堆栈容量；激活流读 43 steps/s/堆栈。
- 容量总账（4TB HBF/GPU）：70B-GQA@128K 可驻 ~95 请求、DSV3@128K ~445、DSV3@1M ~57（不含权重）。

## 争议

1. **HBF 该不该放 KV cache（写寿命 vs 容量诱惑）**：Chipstrat 直言"KV 每 token 都有新写入，NAND 寿命扛不住；激活要低延迟随机访问——所以 HBF 就是放权重的"[^3^]；FlashAccel 则用 DeepSeek 生产数据（每 GPU 日写 22.7–26.9TB）论证 1TB SLC HBF（~55TB/天）够用、放宽 retention 再延寿 50×[^14^]。NVIDIA ICMS 走中间路线：KV 放以太网闪存但靠"可重建/短暂"属性管理寿命[^11^][^13^]。**未决：TLC/QLC 版 HBF 的 KV 写入预算、写放大与垃圾回收对带宽的冲击尚无公开数据。**
2. **NVIDIA 不采纳 HBF**：报道称 NVIDIA 近期路线图不含 HBF，坚持以企业级 SSD（联合 Kioxia 开发"快 100×"的 PCIe Gen7 SSD）解决容量/带宽问题；Google 被点为潜在主要受益方[^41^]。该报道为单一来源（置信度低），但与 NVIDIA 官方 ICMS/CMX 路线一致[^11^][^12^]。
3. **HBF 时延可否真正隐藏**：介质差距 10–100×[^3^]；FlashAccel 承认 tR≈4µs 使单次 4µs GEMV 时延 +50%，靠预取/SRAM 隐藏[^14^]；SanDisk 称"大语言模型可以近 DRAM 速度流式读"[^1^]，其 405B 仿真落在无限 HBM 的 2.2% 内[^9^]——但那是权重顺序流；**随机化 KV 块访问模式下的有效时延尚无第三方实测**。
4. **带宽数字口径混乱**：Gen1 官方 1.6TB/s/堆栈[^1^][^9^]；NineScrolls 给 400–800GB/s[^4^]；Kioxia 的"HBF 模组"（5TB、64GB/s、PCIe6、<40W，面向 MEC 边缘）是同名不同物[^42^]。此外 SanDisk 曾演示 8-high 概念、标准化为 16-high[^5^][^7^][^14^]；"256GB/die"系媒体把 Gb 写成 GB[^1^][^9^]。**采用数据时须锁定"16-high、512GB、1.6TB/s"这一 OCP 送审口径**[^2^]。
5. **ICMS 实际 SSD 需求被高估**：SemiAnalysis 测算认为行业对 ICMS/CMX 的 SSD 用量预期"相当夸大"[^12^]；NVIDIA 官方 5× tok/s/5× 能效为自述口径[^11^]。
6. **batch 越大越好的边界**：decode 吞吐随 batch 近线性只到 KV 超出片上缓存/带宽饱和[^21^]；且大 batch 下 TPOT 本身随 KV 读量增长（500K 上下文每步 25ms[^24^]），"HBF 放大 batch"在长上下文下会被 KV 流带宽二次约束（§4b）——**HBF 解决容量，不解决 KV 带宽随上下文线性增长的根本问题**（稀疏注意力/DSA、KV 量化才是正交解[^27^]）。
7. **时间窗口风险**：HBM 已售罄至 2026、DRAM 合约价单季 +90–95%、NAND 连续 17 个月涨价[^39^]；但 HBF 样品 H2 2026、设备 2027 初才落地[^2^][^6^]——**2026–2027 间的空窗期由 HBM4（22TB/s、288GB）+ ICMS SSD 路线填补**，HBF 若错过窗口可能被"高带宽 SSD+HBM4E"组合挤压（HBM4E 已达 4.1TB/s/堆栈[^35^]）。Kim Jung-ho（"HBM 之父"）则判断十年内 NAND/HBF 需求将反超 HBM[^40^]。

---

## 参考引用

[^1^]: iTWire, "Sandisk's High Bandwidth Flash takes aim at the AI memory wall", 2026-07-01. 摘录："The published specs are eye-watering: 256GB per die [sic], 512GB per 16-high stack, and 1.6 TB/s of read bandwidth in the first generation… 8 to 16 times the capacity of HBM at a similar cost… up to 4TB of memory beside a single GPU. A second generation… more than 2 TB/s and 1TB stacks, a third at more than 3.2 TB/s and 1.5TB stacks… HBF reading the pretrained weights of a Llama 3.1 405B model landed within 2.2% of a hypothetical, unlimited-capacity HBM." https://itwire.com/business-it-news/storage/sandisks-high-bandwidth-flash-takes-aim-at-the-ai-memory-wall 置信度：中高（媒体转述官方数据，"256GB/die"应为 256Gb）。
[^2^]: IndexBox/SemiEngineering, "High-Bandwidth Flash (HBF): Sandisk's New Memory Standard", 2026-05-15. 摘录："Sandisk has submitted the HBF technology to the Open Compute Project (OCP) for standardization, in collaboration with SK Hynix… 16-die-plus-base-die flash stack that fits the same footprint as HBM… first samples of HBF in the second half of 2026… first inference devices… early 2027… 256 GB per die [sic], resulting in 512 GB per 16-high stack, with a read bandwidth of 1.6 TB/s… match the footprint, power profile, and physical stack height of HBM4." https://www.indexbox.io/blog/high-bandwidth-flash-hbf-sandisks-new-memory-standard-for-ai-inference/ 置信度：高。
[^3^]: Chipstrat, "High Bandwidth Flash: The Full Report", 2026-07-07. 摘录："The 16 flash dies are stacked and connected with through-silicon vias (TSVs). A controller logic die is then bonded directly onto the NAND array… HBF delivers 1.6 TB/s of read bandwidth, which is the same as an HBM4 stack at the JEDEC spec's 6.4 Gb/s… Conventional flash ships about 14 GB/s behind a PCIe 5.0 NVMe controller. Packaged as HBF, the same material delivers 1.6 TB/s. Roughly 100x the bandwidth, from packaging alone… HBF's latency is still 10-100x slower than HBM… the KV cache takes new writes every token; NAND's endurance can't handle that… So HBF is for storing model weights." https://www.chipstrat.com/p/high-bandwidth-flash-the-full-report 置信度：中（分析准确但带作者立场）。
[^4^]: NineScrolls, "SanDisk and SK Hynix Activate HBF Equipment Supply Chain", 2026-04-14. 摘录："A standard HBF stack targets approximately 1.6 TiB of capacity… aggregate bandwidth of 400–800 GB/s per stack. Per-stack power… 20–80 W… On February 25, 2026, SanDisk and SK Hynix formally announced… global standardization of HBF… Samsung Electronics and Kioxia are separately developing their own HBF products, and Chinese startup FlashDi has announced plans for an HBF pilot production line in H2 2026." https://ninescrolls.com/news/sandisk-and-sk-hynix-activate-hbf-equipment-supply-chain-tsv-etch-ald-and-pecvd- 置信度：低-中（容量/带宽口径与官方不符，供应链信息可参考）。
[^5^]: Sandisk Investor Relations, "Sandisk Forms HBF Technical Advisory Board", 2025-07-24. 摘录："HBF is a breakthrough memory solution designed to augment High Bandwidth Memory (HBM) for AI inference workloads, offering comparable bandwidth while delivering up to 8x the capacity at a similar cost. Enabled by BiCS technology and CBA wafer bonding, HBF leverages proprietary stacking with ultra-low die warpage for 16-high configurations."（TAB 成员含 David Patterson、Raja Koduri） https://investor.sandisk.com/news-releases/news-release-details/sandisk-forms-hbftm-technical-advisory-board-guide-development 置信度：高（官方新闻稿）。
[^6^]: Sandisk Newsroom, "Sandisk to Collaborate with SK hynix to Drive Standardization of HBF", 2025-08-06. 摘录："Sandisk targets to deliver first samples of its HBF memory in the second half of calendar 2026 and expects samples of the first AI-inference devices with HBF to be available in early 2027… awarded 'Best of Show, Most Innovative Technology' at FMS 2025." https://www.sandisk.com/tr-tr/company/newsroom/press-releases/2025/2025-08-06-sandisk-to-collaborate-with-sk-hynix-to-drive-standardization-of-high-bandwidth-flash-memory-technology 置信度：高（官方）。
[^7^]: Blocks & Files, "Sandisk investor day outlines roadmap post WD spin-off", 2025-02-12/20. 摘录："stacked HBM DRAM layers would be replaced in whole or part by NAND layers, connecting to a host GPU/CPU/TPU via a logic die and an interposer… It foresees 3 HBF generations with gen 2 having 1.5x the capacity of gen 1 and 1.45x the read bandwidth, and gen 3 being 2x gen in both categories… HBF is not drop-in compatible with HBM but does have the same electrical interface 'with minor protocol changes.'" https://blocksandfiles.com/2025/02/12/sandisk-spills-its-technolgy-futures-beans/ 置信度：中高（现场报道；其中 8-high 混合堆栈容量算例的单位印刷混乱，未采用）。
[^8^]: eeNews Europe, "Sandisk proposes HBF to replace HBM, enable AI at the edge", 2025-04-22. 摘录（Investor Day 2025-02-11, Alper Ilkbahar）："dividing the NAND memory array into multiple mini arrays that can be accessed in parallel… 16-layer R&D memories with 8 to 16x the capacity of HBM at a similar price point… An upcoming AI-GPU uses these eight HBMs to provide 192Gbytes of DRAM… using HBF could provide a component with 4Tbytes of non-volatile memory… GPT4 has 1.8 trillion parameters… requires 3.6Tbytes… the whole model can be put on a single GPU." https://www.eenewseurope.com/en/sandisk-proposes-hbf-to-replace-hbm-enable-ai-at-the-edge/ 置信度：高。
[^9^]: OSCOO, "SK Hynix and SanDisk Unveil High Bandwidth Flash for AI Inference", 2026-02-28. 摘录："Max Read Bandwidth Up to 1.6 TB/s | Single Die Capacity 256 GB [sic] | Max Stack Capacity 512 GB per stack | Matches HBM4 footprint, height, and power | Within 2.2% of 'unlimited HBM' setup in LLM tests… more than 50 times faster than top-tier PCIe 5.0 SSDs, while offering 8–16 times the capacity of comparable HBM stacks." https://www.oscoo.com/news/sk-hynix-and-sandisk-unveil-high-bandwidth-flash-for-ai-inference/ 置信度：中（规格表与官方一致，die 容量单位存疑）。
[^10^]: LeCompute, "The KV cache is no longer a side effect: it is the center of LLM serving in 2026", 2026-07-03. 摘录："NVIDIA Dynamo 1.0, generally available since March 16, 2026… KVBM… G1 GPU HBM hot ~µs; G2 Cross-node CPU RAM warm ~ms; G3/G3.5 Local SSDs + ICMS flash cold ~10 ms; G4 S3 archive ~100 ms… The G3.5 tier is specific to the Vera Rubin platform: ICMS… flash storage integrated into the BlueField-4 DPUs and driven by the DOCA Memos framework… NVIDIA's submissions on B200 use the FP8 KV cache as the reference configuration [MLPerf v6.0]… Google's TPU 8i tripled its on-chip SRAM (384 MB)." https://lecompute.fr/en/runtimes/kv-cache-objet-central-serving/ 置信度：中高。
[^11^]: NVIDIA Developer Blog, "Inside the NVIDIA Vera Rubin Platform: Six New Chips, One AI Supercomputer", 2026-04-21. 摘录："ICMS establishes a pod-level 'G3.5' context memory layer, an Ethernet-attached, flash-based tier optimized specifically for ephemeral, latency-sensitive KV cache, sized for petabytes of shared capacity per GPU pod and built for frequent pre-staging back into host and GPU memory to avoid decode stalls… NVIDIA reports up to 5x higher tokens-per-second and up to 5x better power efficiency versus traditional storage approaches… BlueField-4 runs the KV I/O plane and efficiently terminates NVMe-over-Fabrics and object/RDMA protocols." https://developer.nvidia.com/blog/inside-the-nvidia-rubin-platform-six-new-chips-one-ai-supercomputer/ 置信度：高（官方，5× 为厂商自述）。
[^12^]: SemiAnalysis, "GTC 2026 – The Inference Kingdom Expands", 2026-03-24. 摘录："NVIDIA introduced a 'new' intermediate storage 'tier G3.5'… Previously referred to as ICMS… and now branded as the CMX platform… KV cache grows linearly with input sequence length and number of users and is the primary tradeoff when it comes to prefill performance (time to first token)… STX is a reference rack architecture using Nvidia's BF-4 based storage solution."（另见 2026-02-28 Vera Rubin 篇："the volumes of SSDs going to ICMS / CMX are quite overblown by the industry… With 2×400G SerDes links providing 800Gb/s of bandwidth… a single BlueField-4 per tray may serve four Rubin processors"） https://newsletter.semianalysis.com/p/nvidia-the-inference-kingdom-expands ; https://newsletter.semianalysis.com/p/vera-rubin-extreme-co-design-an-evolution 置信度：高。
[^13^]: 同 [^12^]（SemiAnalysis Vera Rubin 篇, 2026-02-28）。摘录："KV cache grows linearly with sequence length and multiplicatively with workload parallelism, quickly expanding beyond what any single tier of memory was designed to hold." 置信度：高。
[^14^]: Wang et al. (ICT, CAS), "FlashAccel: Leveraging High-Bandwidth Flash for High-Throughput LLM Inference", arXiv:2607.10186, 2026. 摘录："the GPU receives the first batch of data roughly 4 μs (tR) after issuing an access request, whereas HBM requires only about 100 ns… a 40× gap… a plane reads a 4KB page in 4 μs, 1 GB/s… matching the 4.8 TB/s bandwidth of H200 requires 4,916 planes… hyper page size is about 19MB… a weight matrix in Qwen3-235B is only 12MB… distributing 100GB KV cache of Qwen3-235B across 4,916 planes causes the maximum plane load to exceed the average load by 52%… Each stack contains 8 Flash dies above a base die… SLC Flash typically provides about 100K P/E cycles… each GPU in the prefill cluster writes 22.7TB of KV cache per day… decode cluster… 26.9TB… a 1TB HBF device can sustain about 55TB of data writes per day… relaxing retention guarantees can extend endurance by up to 50×… integrating six HBF stacks into the GPU enables FlashAccel to deliver an average improvement of 2.54× and 1.93× in throughput per GPU and energy efficiency… for LLaMA3.1-405B with 15K/6K context length, each request requires 10GB of KV cache, limiting the maximum batch size of 8×H200 to 30, whereas… 8×CSI can support a theoretical batch size of 110… 2.15× average throughput gain… achieving high reuse efficiency may require up to 4× more memory capacity for KV cache… collective communication accounting for up to 20% of total latency." https://arxiv.org/html/2607.10186v1 置信度：高（学术仿真，未经硅验证）。
[^15^]: arXiv:2605.11999, "The Illusion of Power Capping in LLM Decode", 2026-05-12. 摘录："Decode is fundamentally memory-bound: each step performs matrix–vector operations with low arithmetic intensity, requiring repeated HBM weight fetches… all decode kernels lie far below the roofline ridge point (≈206 FLOPs/byte)… throughput is invariant above ≈1590 MHz… Increasing utilization via batching or parallelism does not change arithmetic intensity, which is an algorithmic property. While batching improves throughput and energy efficiency by amortizing memory traffic, the workload remains memory-bound." https://arxiv.org/html/2605.11999v1 置信度：高。
[^16^]: arXiv:2607.13068, "The Economics of AI Decoding Chips", 2026-06-01. 摘录："each step reads the model's weights from memory and performs only about two floating-point operations per weight byte read. Decoding is therefore memory-bound on all practical hardware… A datacenter GPU… carries a very high F/B, so during the decode phase most of its arithmetic units have nothing to do… floating-point units idle at single-digit-percent utilization… A high F/S converts a large model's memory footprint directly into a mandatory purchase of compute." https://arxiv.org/html/2607.13068v1 置信度：高。
[^16b^]: arXiv:2605.03109, "Gated Subspace Inference for Transformer Acceleration", 2026-05-04. 摘录："each weight element participates in one multiply-add, making the forward pass entirely memory-bandwidth-bound at batch size one… Pope et al., who showed that batch-one decode on TPUv4 operates at 11–22 FLOPs per byte, hundreds of times below the compute roofline." https://arxiv.org/html/2605.03109v1 置信度：高。
[^17^]: InferenceEngineering.tech, "GPU Inference: H100 vs A100 vs L4", 2026-06-01. 摘录："The matmul of [1×hidden_dim]×[hidden_dim×hidden_dim] has arithmetic intensity ≈ 1 FLOP/byte… An H100 SXM's peak arithmetic intensity ratio is 989 TFLOPS ÷ 3.35 TB/s ≈ 295 FLOP/byte… The Tensor Cores are 99.7% idle… The H200's advantage over the H100 isn't compute… it's bandwidth: 4.8 TB/s vs 3.35 TB/s, a 43% bandwidth increase that translates directly to 43% more tokens per second." https://inferenceengineering.tech/learn/gpu-inference/ 置信度：中高。
[^19^]: Spheron, "Cerebras vs NVIDIA H100: Wafer-Scale vs GPU for LLM Inference", 2026-04-28. 摘录（H100 SXM5, vLLM, FP8, Llama 3.1 70B）："Throughput at batch 1: ~550 tok/s; batch 8: ~3,200; batch 32: ~8,000; batch 64: ~12,000 tok/s. TTFT at batch 1: ~80 ms; batch 8: ~200; batch 32: ~400; batch 64: ~700 ms… H100 scales linearly from ~550 tokens/sec at batch 1 to ~12,000 tokens/sec at batch 64 because HBM can serve weight reads in parallel across batched token positions." https://www.spheron.network/blog/cerebras-vs-nvidia-h100-inference-2026/ 置信度：中（社区 benchmark 汇编）。
[^20^]: D. Lewis, "Evaluating Llama-3.3-70B Inference on NVIDIA H100 and A100 GPUs", 2025-04-17. 摘录（NIM, TP=4, BF16, genai-perf）："H100 scaled almost linearly up to 500 users, peaking at ≈7,000 TPS [200→200]… A100 saturated near ≈570 TPS and 50 users… [1000→200] H100 delivered ≈2,600 TPS at 250 concurrent users." https://dlewis.io/evaluating-llama-33-70b-inference-h100-a100/ 置信度：中高（可复现 benchmark）。
[^21^]: arXiv:2606.17104, "Prefill/Decode-Aware Evaluation of LLM Inference on Emerging AI Accelerators" (HPAI4S'26/IPDPS), 2026-06-14. 摘录："each Decode step… must access a larger portion of the accumulated KV cache, quickly exceeding on-chip cache capacity and inducing frequent L1 and L2 cache misses… At B=32 with 1,600 input and 1,600 output tokens, the KV cache footprint (102,400 tokens) exceeds the available HBM allocation (45,584 tokens reported by vLLM) by more than 2×… vLLM limits effective Decode concurrency to respect KV cache capacity, leading to run-time stalling and request queueing." https://arxiv.org/html/2606.17104v1 置信度：高。
[^22^]: Zhong et al., "DistServe: Disaggregating Prefill and Decoding for Goodput-optimized LLM Serving", OSDI 2024. 摘录："Since a single decoding job is heavily bandwidth-bound, batching is key… Post-disaggregation, the batch size for decoding may be constrained by GPU memory capacity, as it is necessary to maintain the KV caches for all active requests… enable further scaling of the decoding batch size to nearly compute-bound… up to 7.4× more goodput or sustains 12.6× stricter SLOs… transfer < 0.1% even on 175B with 25 Gb links." https://www.usenix.org/system/files/osdi24-zhong-yinmin.pdf 置信度：高。
[^22b^]: B. Su, "LLM Serving from Scratch", 2026-02-06. 摘录："serving systems have SLOs: '99th percentile TTFT < 500ms' or 'TPOT < 50ms'… maximize throughput within SLO constraints (goodput)." https://briansu.co/articles/optimization/llm-serving 置信度：中。
[^23^]: Agrawal et al., "Taming Throughput-Latency Tradeoff in LLM Inference with Sarathi-Serve", OSDI 2024 (arXiv:2403.02310). 摘录："Naive hybrid batching leads to dramatic increase of up to 28.3× in the TBT latency compared to a decode-only batch… Sarathi-Serve achieves 3.5× higher capacity compared to vLLM under strict SLO (100ms, Mistral-7B) using a small token budget of 512… 1.65× higher capacity… (1s, Yi-34B)… For Mistral-7B on single A100… 2.6× higher serving capacity… Falcon-180B… up to 5.6× gain." https://arxiv.org/abs/2403.02310 置信度：高。
[^24^]: arXiv:2605.17613, "VeriCache: Turning Lossy KV Cache into Lossless LLM Inference", 2026-05-17. 摘录："serving Qwen-32B (~64GB weights) on a single H100 80GB GPU, a 2K-token context requires ~0.3GB of KV per request, allowing a batch of ~50 requests; scaling to 100K tokens grows the KV to ~15GB, reducing the batch size to 1… serving Llama-3.1-8B-1M (~16GB weights) on an H100 (3TB/s HBM), each decode step takes ~5ms at 5K context (~0.6GB KV) and ~25ms at 500K context (~60GB KV)." https://arxiv.org/html/2605.17613v1 置信度：高。
[^25^]: 掘金, "【大模型基础设施工程】11：推理引擎基础", 2026-04-28. 摘录："LLaMA-3 70B (GQA, 8): 总 KV/token 320 KB… H100 80GB 减去权重后剩 ~40GB，只能同时服务 ~20 个 4K 上下文，或者 ~5 个 16K 上下文。" https://juejin.cn/post/7633658714650574889 置信度：中（数值与公式独立验算一致）。
[^26^]: arXiv:2604.26968, "Predictive Multi-Tier Memory Management for KV Cache in Large-Scale GPU Inference", 2026-04-19. 摘录："For Llama-3-70B (L=80, h=64, d=128, p=2 for BF16)… a single 128K-token sequence yields ≈336 GB [MHA]… Even with GQA (h_kv=8), the cache requires ~42 GB… DeepSeek-V3 uses d_latent=512 and d_rope=64 with BF16, yielding (512+64)×2=1,152 bytes/token/layer versus MHA's 2×128×128×2=65,536 bytes—a 57× compression." https://arxiv.org/html/2604.26968v1 置信度：高。
[^27^]: TensorEconomics, "DeepSeek Sparse Attention from First Principles", 2026-04-15. 摘录："In Multi-Head Attention… ≈ 4.0 MB per token… GQA… ≈ 500 KB per token… With MLA… (512+64)·61 = 35,136 elements… ≈ 70 KB per token… MLA achieves a 57× reduction compared to MHA, and is still 7× smaller than GQA… In dense MLA the KV cache grows at 40 KB/token [FP8]… the indexer reads all N tokens but at 132 bytes each… the sparse attention reads the full 656 bytes per token - but only for a fixed k=2048 tokens… dividing total memory loaded by H100 HBM bandwidth (3.35 TB/s) - the close match confirms decode is memory-bandwidth bound." https://www.tensoreconomics.com/p/deepseek-sparse-attention-from-first 置信度：高（含 H100 实测）。
[^28^]: Spheron, "KV Cache Optimization Guide", 2026-03-28. 摘录："KV_bytes = 2 × L × H_kv × D × S × B × bytes_per_element… Llama 3.1 8B: ~0.131 MB; Llama 3.1 70B: ~0.327 MB; Llama 3.1 405B: ~0.516 MB [KV/token at BF16]." https://www.spheron.network/blog/kv-cache-optimization-guide/ 置信度：中（数值验算一致）。
[^28b^]: Spheron, "Multi-Head Latent Attention (MLA) on GPU Cloud", 2026-06-25. 摘录："KV cache at 128K ctx, 1 user, 60 layers: ~480 GB [MHA] / ~30 GB [GQA-8] / ~7.5 GB [MLA]… Max concurrent users on H200 141 GB (after ~75 GB weights): 0 / ~2 / ~8-9… FP8 KV… halves the already-compressed MLA footprint again, from ~7.5 GB to ~3.75 GB per user at 128K." https://www.spheron.network/blog/multi-head-latent-attention-mla-gpu-cloud/ 置信度：中。
[^29^]: DeepSeek-AI, "DeepSeek-V3 Technical Report", arXiv:2412.19437, 2024-12. 摘录："We set the number of Transformer layers to 61 and the hidden dimension to 7168… n_h=128, d_h=128… d_c=512… d_c′=1536… d_h^R=64… Each MoE layer consists of 1 shared expert and 256 routed experts… 8 experts will be activated for each token… sent to at most 4 nodes… DeepSeek-V3 comprises 671B total parameters, of which 37B are activated for each token." https://arxiv.org/abs/2412.19437 置信度：高。
[^30^]: Kimi Team, "Kimi K2: Open Agentic Intelligence", arXiv:2507.20534, 2025. 摘录："Kimi K2 is a 1.04 trillion-parameter MoE… 32 billion activated… 384 experts… 8 active… 64 attention heads [vs 128 in DeepSeek-V3]." https://arxiv.org/abs/2507.20534 置信度：高。
[^31^]: Alizadeh et al. (Apple), "LLM in a Flash: Efficient Large Language Model Inference with Limited Memory", arXiv:2312.11514, 2023-12. 摘录（abstract）："storing the model parameters in flash memory, but bringing them on demand to DRAM… 'windowing'… 'row-column bundling'… enable running models up to twice the size of the available DRAM, with a 4-5× and 20-25× increase in inference speed compared to naive loading approaches in CPU and GPU." https://daringfireball.net/linked/2024/04/22/llm-in-a-flash 置信度：高。
[^31b^]: vLLM Recipes, "DeepSeek-V3.2-Exp", 2026-06-16. 摘录："The default config uses a custom fp8 KV cache… FP8 allows more tokens to be cached but incurs quantization/dequantization overhead." https://recipes.vllm.ai/deepseek-ai/DeepSeek-V3.2-Exp 置信度：中高。
[^32^]: Kamahori et al., "Fiddler: CPU-GPU Orchestration for Fast Inference of Mixture-of-Experts Models", ICLR 2025. 摘录："for single-batch, latency-critical inference, it is often faster to execute expert layers directly on the CPU rather than transferring their weights to the GPU… >3 tokens/second generation speed for unquantized Mixtral-8x7B on a single 24GB GPU… 8.2x - 10.1x speedup." https://syfi.cs.washington.edu/publications/fiddler/ 置信度：高。
[^33^]: arXiv:2411.08982 (Lynx/PROWL), 2024-11. 摘录："The transfer of model weights is bottlenecked by the limited PCIe bandwidth (32GB/s each direction in A100), making offloading about 50x slower than on-device inference… Fiddler improves over vanilla offloading by providing a 5x latency improvement." https://arxiv.org/html/2411.08982v2 置信度：高。
[^34^]: arXiv:2606.10493 (OSDI'26), "Achieving Cloud-Grade SLOs for Local MoE Inference through CPU–GPU Hybrid Design", 2026-06-09. 摘录："KTransformers delivers approximately 16 tokens/second on the Int4 quantized model, whereas cloud services… commonly target ≥20 tokens/second… implies an effective memory bandwidth of roughly 221 GB/s… only about 50% of the nominal aggregate DDR5 bandwidth." https://arxiv.org/html/2606.10493v1 置信度：高。
[^35^]: CSDN（LDZKKJ）, "英伟达 Vera Rubin HBM4 三家齐过", 2026-07-12. 摘录："JESD270-4（2025年4月发布）… 2048 bit… JEDEC 基线单栈带宽 ≥ 2 TB/s… pin 速度基线 8 Gb/s… 三星 HBM4… 11.7 Gbps/pin… 单栈带宽 3.3 TB/s… SK 海力士 10 Gb/s 以上… 2.8+ TB/s… 美光 12 层 36 GB HBM4 pin 速率 11 Gb/s、单栈带宽 >2.8 TB/s… 每颗 Rubin GPU 有 8 个 HBM4 接口，配 8 颗 12H 36 GB HBM4，合计 288 GB HBM4 / GPU、22 TB/s… HBM4E 每 pin 16 Gb/s、单栈带宽 4.1 TB/s… 8 stack × 48 GB = 384 GB HBM4E / GPU [Rubin Ultra 调整后]." https://blog.csdn.net/LDZKKJ/article/details/162797140 置信度：中（二手汇编，关键数字与官方页一致）。
[^36^]: Spheron GPU Catalog, "NVIDIA Rubin R100", 无日期（2026 抓取）; 另 WCCFTech 2026-03-19 引 NVIDIA 官方表. 摘录："288 GB HBM4 · 22 TB/s · 50 PFLOPS FP4… B200: 192GB HBM3e, 8 TB/s; H100: 80GB HBM3, 3.35 TB/s; H200: 141GB HBM3e, 4.8 TB/s [对照表]." https://www.spheron.network/gpu-rental/r100/ ; https://wccftech.com/nvidia-vera-rubin-achieves-40-million-times-more-compute-in-10-years/ 置信度：中高。
[^37^]: PC Watch, "Micron 12層36GB HBM3E", 2024-09-10. 摘录："ピンあたり9.2Gbps、合計1.2TB/sを超える広帯域… 12層36GB… 量産しており、主要な業界パートナーへの出荷を開始." https://pc.watch.impress.co.jp/docs/news/1622625.html 置信度：高。
[^38^]: EaseCloud, "vLLM Throughput Guide", 2026-04-10. 摘录："Llama 2 70B on 4x A100 achieves 2,200 tokens/second with 256 concurrent users… PagedAttention cuts memory waste by 55-80%… traditional wastes 87% memory [预分配]… [13B A100] Baseline 120 tok/s → Continuous batching 890 → +PagedAttention 1,240 → +max_num_batched_tokens=8192 1,580 tok/s." https://blog.easecloud.io/ai-cloud/increase-throughput-with-vllm-serving/ 置信度：中。
[^38b^]: Spheron, "LLM Serving Optimization: Continuous Batching, PagedAttention, and Chunked Prefill on H100", 2026-04-03. 摘录："Naive static batching leaves 60% of your GPU idle on average… Chunked prefill: -50-70% TTFT p95 on mixed workloads." https://www.spheron.network/blog/llm-serving-optimization-continuous-batching-paged-attention/ 置信度：中。
[^39^]: arXiv:2606.02775 (AURA), 2026-06-01. 摘录："HBM is sold out through 2026 across all three major suppliers, with Micron and SK Hynix holding zero uncommitted capacity while together committing over $45 B in capital expenditure… DRAM contract prices surged 90–95% quarter-over-quarter in Q1 2026… NAND flash posted its 17th consecutive monthly price record in May 2026… a 512 GB-per-stack, 1.6 TB/s read-bandwidth NAND stack in an HBM4-compatible footprint, with samples planned for H2 2026 and first inference devices for early 2027." https://arxiv.org/html/2606.02775v1 置信度：中高（学术引用一手行情）。
[^40^]: Futunn, "Kim Jung-ho, the 'father of HBM'", 2026-07-06. 摘录："'If traditional memory is an eight-lane highway, HBM is a 1,024-lane highway—now it's 2,048 lanes'… 'This is the era of HBM, but in ten years, market demand for NAND flash and HBF will surpass that for HBM'… companies currently developing HBF include SK Hynix, SanDisk, Samsung Electronics, and Japan's Kioxia." https://news.futunn.com/en/post/75540740/ 置信度：中高。
[^41^]: MT Labs, "NVIDIA Passes on Massive 4TB HBF Memory", 2026-05-01. 摘录："NVIDIA has reportedly shown little interest in adopting the technology, preferring to rely on enterprise solid-state drives instead… Google is positioning itself as a primary beneficiary… NVIDIA is collaborating with Kioxia to develop PCIe Gen7 SSDs capable of operating at speeds up to 100 times faster than conventional storage." https://mt-labs.net/nvidia-hbf-memory-passes-massive/ 置信度：低（单一来源）。
[^42^]: Kings Research, "U.S. NAND Flash Market", 2026-07-10. 摘录："In August 2025, Kioxia Corporation launched a 5 TB High-Bandwidth Flash (HBF) memory module prototype that delivers 64 GB/s bandwidth using a PCIe 6.0 interface… below 40 W… designed for Mobile Edge Computing (MEC) servers." https://www.kingsresearch.com/report/us-nand-flash-market-3117 置信度：中。
[^43^]: Microsoft Research, "Vidur" (MLSys'24, arXiv:2405.05465) + GitHub. 摘录："Vidur is a high-fidelity and extensible LLM inference system simulator… TTFT predictions within 5-10% of actual measurements and throughput predictions within 10-15%… supports multiple scheduling policies including Sarathi, vLLM, Orca, LightLLM, and FasterTransformer… Config Optimizer… Pareto curves… bottleneck analysis: KV cache memory exhaustion (leading to preemption and increased TTFT), compute saturation, communication overhead." https://github.com/microsoft/vidur ; https://pyshine.com/Vidur-Microsoft-LLM-Inference-System-Simulator/ 置信度：高。
[^44^]: arXiv:2602.23036, "A Unified Simulator for Heterogeneous and Disaggregated LLM Serving Infrastructure" (LLMServingSim 2.0), 2025-12-15. 摘录："LLMServingSim 2.0 builds on a modified version of ASTRA-sim and Chakra… we extend the memory hierarchy to include device memory, host memory, storage, and CXL-attached memory, and explicitly model memory sharing… we add PIM operations beyond memory load and store primitives… integrates a refined memory model to capture bandwidth contention, KV movement, and memory sharing with higher fidelity." https://arxiv.org/html/2602.23036v1 置信度：高。
[^45^]: arXiv:2606.20577, "Quantifying the Human Tax on Throughput", 2026-05-03. 摘录："The bandwidth-bound ceiling is set by HBM bandwidth (2039 GB/s A100) divided by weight footprint (14 GB for 7B FP16), giving a single-session TPOT floor near 7 ms and single-session throughput near 145 tokens/s… for a 7B FP16 model [compute ceiling] is on the order of 10^4 tokens/s per GPU… a TPOT target of 100 ms leaves the GPU compute units idle over 90% of each decode step. Batching amortizes this idle time across concurrent requests, but latency constraints limit how aggressively systems can batch." https://arxiv.org/html/2606.20577v1 置信度：高。
[^46^]: arXiv:2605.19775, "Understanding Inference Scaling for LLMs", 2025-12-12. 摘录："TPOT… a direct proxy for memory bandwidth efficiency during autoregressive decoding… KV-Cache Saturation… nearing 100% saturation forces the scheduler to preempt requests to free memory, causing catastrophic spikes in end-to-end latency due to re-computation costs… sublinear scaling of throughput with batch size reveals the concurrency wall where memory capacity limits active slots." https://arxiv.org/html/2605.19775v1 置信度：高。
[^47^]: arXiv:2511.10480 (STAGE), 2025-10-20. 摘录（DeepSeek-R1 EP decode）："Cluster Size 36/72/144, Batch Size 512/1024/2048, Step Time 227/187/163 ms, Throughput 62.5/75.9/86.9 tokens per second per GPU… the optimal HBM share consistently exceeds 50%." https://arxiv.org/html/2511.10480v3 置信度：高。
[^48^]: Spheron, "NVMe KV Cache Offloading for LLM Inference", 2026-03-31. 摘录："Hot GPU HBM ~3.35 TB/s, <1 µs; Warm CPU DRAM ~63 GB/s (PCIe 5.0 x16), ~10-100 µs; Cold NVMe SSD ~7 GB/s (PCIe 4.0), ~100 µs-1 ms." https://www.spheron.network/blog/nvme-kv-cache-offloading-llm-inference/ 置信度：中。

（本报告中所有未单独标注来源的计算——roofline 拐点、B_max、KV 带宽/请求、预驻时间、HBF steps/s——均基于上述引用参数以列明公式推算，可用相同参数复现。）
