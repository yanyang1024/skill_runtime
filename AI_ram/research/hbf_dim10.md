# 维度10：NAND/HBF 硬件机制四问（2020–2026）调研报告

> 调研范围：(1) NAND 读延时 tR 与 pipeline 掩盖；(2) HBF 逻辑 die 计算核在高并发下是否够用（含近存计算 PIM/SmartSSD 对照）；(3) FTL 映射表容量与 SRAM/DRAM buffer 权衡；(4) 面向 LLM 逐层 KV 消费的读触发时机与预取粒度。
> 方法：≥15 次独立检索（英文为主，含三星/铠侠/SanDisk 厂商资料与 IEEE/ACM/USENIX/arXiv 一手文献）。每条关键论断附 `[^n^]` 内联引用；完整出处（原文摘录 + URL + 日期 + 置信度）见文末 **参考文献**。

---

## Key Findings

1. **tR 量级分层清晰：SLC≈25–30 µs、TLC≈40–100 µs、QLC≈85–170 µs（随代际/厂商差异大），且 tR 远小于 tPROG（QLC 可达 3.3 ms）与 tBERS（3–5 ms）**。tR 的本质是" sensing 次数 × (预充+求值+放电)"，TLC 需最多 3 次 sensing、QLC 更多，故多 bit/cell 直接拉长 tR [^5^][^6^][^7^][^8^][^9^]。单看一次裸读 NAND 是"存储级"延迟（µs 级，比 DRAM 慢约 1000×），系统只能靠**并行 + 预取**把它从关键路径上掩掉 [^25^][^28^]。

2. **pipeline 掩盖机制成熟但有天花板**：cache read 把 tDMA/tECC 与下一个 tR 重叠；multi-plane / die-interleaving / channel-striping 提供并行。实测开源控制器（OCOWFC）多级并行可把读带宽推到理论值 93%（1.2 GB/s）、读延迟再降 1.9× [^13^]。但 NANDFlashSim 与 HotStorage'12 的实测共同指出：**读比写更难吃满并行**——quad→octal die、4→8 plane、4→8 KB 页面对读吞吐的提升各只有约 10.9%（写约 91.2%），瓶颈在 **I/O 总线占用（占总执行周期 ≥50.5%）而非 NAND 阵列本身**；且真实负载中仅 1%–4% 请求能满足 multi-plane 的严苛同块约束 [^14^][^15^][^16^]。这对 HBF"靠堆 die 换带宽"的路线是直接警示：**带宽可被并行放大，单次读延迟不会被并行缩短**。

3. **SanDisk/Kioxia HBF 架构已较具体**：16-die（Gen1，后续也有 8-die 研究型号）BiCS NAND 经 TSV 垂直堆叠 + 底部一颗 **CBA（CMOS directly Bonded to Array）逻辑 die**，1024-bit 接口对齐 HBM4 封装/高度/功耗；Gen1 读带宽 1.6 TB/s、容量 512 GB、单 die 256 Gb [^18^][^19^][^20^][^22^]。**逻辑 die 的官方定位是"调度并行 sub-array 读 + 驱动宽接口 + NAND 控制 + PHY"，公开资料未宣称其集成通用 AI 计算核（区别于 HBM-PIM 的 PCU）**；其"近存"更像近存调度/缓冲而非近存算力 [^25^][^26^]。学界（FlashAccel）进一步披露：逻辑/circuit die 有大量闲置硅面积可放 SRAM，**整栈 SRAM 容量按 `> 2 × 峰值带宽 × 读延迟` 配置以支撑双缓冲预取流水**；并倾向用 SLC 模式换取更低 tR 与更高写耐久 [^29^]。

4. **近存计算的"并发瓶颈"证据一致**：HBM-PIM 每 die 32 个 PCU（300 MHz、16-wide SIMD、FP16、约 1.2 TFLOPS、靠 bank 级并行拿 4× 处理带宽）[^^31^^][^32^]；但 ComPASS（MICRO'25）实测**一次 4096×4096 GEMV 在 4 颗 HBM-PIM 上需 13 µs，期间触发 multi-bank ACT 会阻塞正常访存请求**；在 4 通道 LPDDR-PIM 上同类 GEMV >100 µs，已"相当于 NAND SSD 延迟"，更大 GEMV（如 LLM 全连接层 4096×16384）更糟，且 PIM/普通请求频繁切换产生 bank 状态翻转开销与 QoS 饥饿 [^34^]。SmartSSD 侧，WIO 实测**持续写负载下设备端计算因热节流吞吐掉 50–60%**（NVMe 控制器 70 °C 掉 50%、FPGA 93/97/100 °C 分级降频/门控/关机），结论是"持续负载下设备端算力会变成负担而非优化" [^38^]。Ma & Patterson 更直言 **PIM 受 DRAM 工艺功耗/散热预算限制，"算力是否足够"本身存疑**，且须把数据结构切成 32–64 MB bank 大小的碎片 [^30^]。**→ 对 HBF 逻辑 die：在"高请求并发"下，瓶颈更可能出现在 SRAM/调度/功耗，而非通用算力；HBF 目前不依赖逻辑 die 算力，反而规避了该风险。**

5. **FTL 映射表容量是硬约束，buffer 不足有明显性能悬崖**：页级映射下 **1 TB SSD（4 KB 页）约需 1 GB DRAM** 存全量映射表 [^41^]。DRAM-less 只能靠片上 SRAM 缓存热条目（DFTL：全表存 flash 翻译块、SRAM 内 CMT+GTD）；**当局部性差或 cache 太小，换入换出开销可使整体性能比无缺失负载下降最多 57%**，随机读尤其受损 [^44^][^45^]。按需加载的优化（PrefetchFTL，512 KB SRAM）借局部性预取映射项，可把命中率 +39.4%、I/O 延迟 −23.4%、翻译页读 −48.3% [^46^]。**→ HBF 若用小 SRAM 兼作读 buffer + 映射表，二者必然抢占同一稀缺资源；LLM 顺序 KV 消费具备强局部性，正好契合"按局部性预取映射项"的解法。**

6. **读触发时机/预取粒度应"对齐层、对齐块、提前一层"**：LLM KV 逐层顺序消费，文献高度一致地采用 **layer-wise 预取 + 中大粒度块** 来掩盖存储延迟。Tutti 用**逐层 I/O slack（离线剖析）做 slack-aware 调度**，把 CPU 开销从 O(layer×blocks) 降到 O(layer)，TTFT −78.3%、GPU 气泡降到近 0 [^49^]；其动机数据同样关键——**4 KB 请求虽能饱和 IOPS 却只用到约 80% 读带宽/16% 写带宽，而 KV 传输实际约 100 KB**；把逐层传输生硬套到 SSD（SSD-LW）反而把气泡推到约 80% [^49^][^50^]。HCache 以 **64-token chunk** 逐层恢复隐藏态 [^51^]；三星/LMCache 用 **256-token（约 33 MB）块**、92% 读、块层 96% 请求 >1 MB [^55^]；I/O 实测主流请求尺寸 128 KiB、读带宽为写 186× [^56^]。**→ 粒度上"page(4 KB) 太小、block 太大、~100 KB–数 MB 的 chunk 最合适"；时机上"至少提前一层发起读"，与 HBF"加速器若预知数据即可预取掩盖慢读"的论点完全吻合 [^28^][^30^]。**

---

## tR与pipeline

### 1.1 NAND tR 数值表（各代 3D NAND，实测/数据手册）

tR 是把数据从 cell 读进片上页缓冲的芯片级延迟。其微架构表达式为 `tR = N_sense × (tPRE + tEVAL + tDISCH)`：SLC 只 1 次 sensing，TLC 最多 3 次，QLC 更多——这是多 bit/cell 拉长 tR 的物理根因 [^5^]。

| 单元类型 | 代表器件/代际 | tR（平均/最大） | tPROG | tBERS | 来源 |
|---|---|---|---|---|---|
| **SLC** | SkyHigh 8 Gb SLC（ONFI1.0, 嵌入式） | 30 µs(max，随机) / 顺序 25 ns(min) | 300 µs(typ) | 3.5 ms(typ) | [^7^] |
| **SLC（通用范围）** | 文献综述 | ~25–35 µs | 200–300 µs | 1.5–2 ms | [^6^][^10^] |
| **TLC（3D）** | 三星第7代 512 Gb 3D TLC（ISSCC'21） | **40 µs** | 400 µs | 3.5 ms | [^8^] |
| **TLC（3D，教学/综述）** | SAFARI/ETH（Mutlu） | **50–100 µs**；3D TLC ≈100 µs | 700–1000 µs | 3–5 ms | [^9^][^11^] |
| **TLC（分页读取）** | melded-page 实测拟合 | LSB 58 µs / CSB 78 µs / MSB 107 µs | — | — | [^12^] |
| **QLC** | Intel 144L（ISSCC'21） | **85 µs / 128 µs** | 1630 µs | — | [^10^] |
| **QLC** | Intel/Micron 96L | 90 µs / 168 µs | 2080 µs | — | [^10^] |
| **QLC** | Kioxia/WD BiCS4 96L | **160 µs**（max 165 µs） | 3380 µs | — | [^10^] |
| **QLC** | Samsung V5 92L | 110 µs | ~2 ms | — | [^10^] |
| **QLC** | SK Hynix V5 96L | **170 µs** | 2150 µs | — | [^10^] |
| **QLC（市售SSD实测）** | Toshiba BiCS4 96L（PNY CS3040） | 160 µs | 3290 µs | — | [^39^] |

**要点**：QLC tR 约为 TLC 的 1.5–3×、SLC 的 3–6×；tR 比 tPROG 小一个数量级以上（QLC tPROG 可达 3.3 ms），比 tBERS 小约两个数量级。这意味着**读是相对"便宜"的操作，优化重点是把它并行化/预取掉；写才是 NAND 的结构性短板**（也是 HBF 只敢碰读密集权重/慢变上下文的原因）[^6^][^30^]。

### 1.2 tR 的系统影响与 pipeline 掩盖（实测效果）

把裸 tR 落到系统层，控制器级一次读 = `tCMD + tR + tDMA + tECC_DEC (+tRND)`，例：100 + 16 + 20 ≈ 136 µs，单页 16 KiB → 仅 ~120 MB/s；这与"SSD 读延迟 67 µs、读带宽 3.5 GB/s"的巨大差距，全靠**内部并行 + DRAM/SLC 写缓冲**填平 [^9^][^11^]。

四类掩盖机制及实测：

- **Cache Read（缓存读）**：常规 PAGE READ 只能把 tECC 与 tR 重叠；CACHE READ 进一步把 **tDMA 与 tECC 都与下一个 tR 重叠**，代价是需要额外片上页缓冲 [^9^]。多平面下字节可 45 ns 周期读出 [^17^]。
- **Multi-plane（多平面）**：同 die 内不同 plane 并发读/写，program/erase 时间可省 50% [^17^]；但约束苛刻（需同 chip/die/block/page），**真实负载中仅约 1%–4% 请求能用 multi-plane 写入** [^15^]。
- **Die interleaving（die 交织）**：一个 die busy 时对另一 die 发令，用 78h 命令分别查状态 [^40^]；many-die 架构对磁盘友好负载吞吐比 many-plane 高约 54.5% [^14^]。
- **Channel striping / 多级并行调度**：开源 OCOWFC 控制器（4 通道×4 way×2 plane，333 MT/s）实测 **最大读带宽 1.2 GB/s = 理论值 93%**，比同类控制器高 13%；页读/写最低延迟 119 µs / 2 ms，经多级并行再加速 1.9×/3.1× [^13^]。

**掩盖的天花板（关键实测）**：NANDFlashSim 指出**"大多数读情形无法利用高度并行的内部架构"**——die 数、plane 数、页大小翻倍对读吞吐提升各仅 ~10.9%，而写提升 ~91.2%；**根本瓶颈是 I/O 总线活动（占总 I/O 执行周期 50.5%），开启 cache/multiplane 等高级命令反而加剧总线争用** [^14^]。HotStorage'12 独立复现：读的 bus 活动占执行时间 ≥50.5%，写仅 7% [^16^]。

> **对本课题的含义**：pipeline/并行能**放大带宽、摊薄平均延迟**，但**不能缩短单次 tR**；且读的并行收益受 I/O 总线与命令约束明显小于写。这正是 HBF 必须用"超宽接口（1024-bit）+ 大量 sub-array 并行 + SRAM 预取"组合、而非单靠堆 die 的原因 [^25^][^28^]。

---

## HBF架构与逻辑die

### 2.1 SanDisk/Kioxia HBF 已公布架构细节（官方 + 分析师）

**标准化与时间表**：SanDisk 与 SK hynix 于 **2026-02-25** 在 OCP 下成立 HBF 标准化 workstream；SanDisk 计划 **2026 下半年出首批样品、2027 初首批推理器件出样**，2026 年底在日本建中试线、2027 产业化 [^18^][^19^][^23^]。Kioxia 已于 **2025-08 推出 5 TB HBF 原型模组（PCIe 6.0、64 GB/s、功耗 <40 W）**，面向 MEC/生成式 AI 边缘 [^24^]。Samsung、CXMT、FlashDi 等亦在跟进 [^19^][^21^]。

**Gen1 关键规格（官方/媒体一致）**：

| 参数 | HBF Gen1 | 备注 |
|---|---|---|
| 堆叠 | **16-die** BiCS NAND + 底部 CBA 逻辑 die，TSV 互连 | 与 HBM 同工艺思路 [^20^][^25^] |
| 读带宽 | **1.6 TB/s**（= HBM4 @6.4 Gb/s 工作点） | [^20^][^26^] |
| 单 die 容量 | 256 Gb | [^20^] |
| 单栈容量 | **512 GB**（HBM4 16-Hi 48 GB 的 ~10.7×；厂商口径 8–16× HBM） | [^20^][^22^] |
| 接口/封装 | **1024-bit**，对齐 HBM4 footprint/高度/功耗 | 非同 PHY，主机控制器需改 [^22^][^26^] |
| 非易失 | 无刷新功耗 | [^22^] |
| 实测对标 | 内部 Llama 3.1 405B（8-bit）测试，与"无限容量 HBM"差距仅 **2.2%** | [^27^] |
| Roadmap | Gen2：>2 TB/s、1 TB、能效 0.8×；Gen3：3.2 TB/s、1.5 TB、0.64× | [^26^][^27^] |

**底层技术**：HBF 复用 SanDisk/Kioxia 的 **BiCS（已量产 218 层 BiCS8，BiCS9 送样）+ CBA 晶圆键合**——CMOS 控制电路与存储阵列分开制造再键合，兼顾"最佳 cell 性能 + 最佳 CMOS I/O 性能" [^21^][^26^][^28^]。

### 2.2 逻辑 die 功能、是否含计算单元、SRAM 容量

- **官方定位（不含通用 AI 计算核）**：CBA 逻辑 die 的职责是**"调度并行 sub-array 读，并把结果经宽接口驱动给 GPU"**，即近存**调度/缓冲/控制**，而非近存**算力**。每个 flash die 被划分成许多可独立并行读的 sub-array；16 die 挂在一个数千 bit 宽接口后，单读仍要数 µs，但数千读并行，故带宽极高 [^25^][^28^]。**公开资料未宣称 HBF 逻辑 die 集成类似 HBM-PIM 的 PCU/AI 引擎**——这是 HBF 与 PIM 路线的本质区别（HBF 赌"预知+预取"，PIM 赌"就地算"）。
- **SRAM 容量（学界量化，关键）**：FlashAccel（arXiv，基于 SanDisk 2025 公开架构）披露：**每 flash die 由 array die + circuit die 经混合键合而成，单 die 做到 96 个 plane 以提升 plane 级并行；circuit die 存在大量闲置硅面积可放置 SRAM，给每个 plane 配 SRAM cache；base die 除 NAND 控制器与 PHY 外再集成 SRAM cache；整栈 SRAM 总量按 `> 2 × Peak_Bandwidth × Read_Latency` 配置，以支撑数据预取的双缓冲流水、掩盖 flash 延迟**；并明确**选用 SLC 模式 HBF**（牺牲密度换更低 tR 与更高写耐久）[^29^]。
- **延迟/粒度的官方"球场"数据**：Ma & Patterson（Google，IEEE Computer 2026 / arXiv 2601.05047）Table 3 给出 **HBF 读延迟 ~1–10 µs、读粒度 4096 B、功耗 <80 W**（对照 HBM ~100 ns、32 B、~40 W），并强调 HBF 是**页粒度（10s KB）、µs 级延迟**的读，必须靠软件/预取消化 [^30^]（与裸 tR 40–170 µs 的张力见 **争议** 一节）。
- **负载定位**：因写耐久有限，HBF 只敢承载**推理权重与慢变上下文**（web/代码/论文语料），不敢承载逐 token 更新的 KV cache；10× 权重内存 + 10× 上下文内存，但不能完全替代 HBM，仍需 DRAM 承载不适合 flash 的数据 [^30^]。

### 2.3 近存计算（NDP/PIM）并发瓶颈——HBF 逻辑 die"够不够用"的对照证据

**(a) Samsung HBM-PIM / AXDIMM 算力配置**
- HBM-PIM（Aquabolt-XL/FIMDRAM，ISSCC'21）：**每个 memory bank 内嵌一个 PCU（可编程计算单元），每 die 32 个 PCU、300 MHz、16-wide SIMD、FP16，约 1.2 TFLOPS，靠 bank 级并行提供 4× 处理带宽**；对 HBM2 Aquabolt 系统性能翻倍、能耗降 70%+，无需改硬软件 [^31^][^32^]。另一汇总口径：16-lane SIMD PCU/2 banks、16 PCU/stack、单 GPU 4 cube 合计 4.9 TFLOPS [^33^]。
- AXDIMM：**AI 引擎放在 buffer chip**，可跨多个 rank 并行（channel 级 NMP），推理推荐系统约 2× 性能、能耗降 40%；但 channel 级"可访问不同 bank 数据却带宽受限" [^35^][^36^]。
- SK hynix GDDR6-AiM：1 TFLOPS/chip、BF16、MAC PU/bank、32 PU/chip [^33^]。

**(b) 高并发下的排队/阻塞实测**
- **ComPASS（MICRO'25）**：PIM 操作会触发 multi-bank ACT，**阻塞正常访存**——4 颗 HBM-PIM 跑一次 4096×4096 GEMV 需 **13 µs，期间正常请求全部 stall**；4 通道 LPDDR-PIM 上同类 GEMV **>100 µs，已相当于 NAND SSD 延迟**；LLM 全连接层更大的 4096×16384 GEMV 更糟；PIM/普通请求频繁切换还有 bank 状态翻转开销，长突发任一类请求都会饿死另一类，违反 QoS [^34^]。
- **Ma & Patterson**：PIM 要求把 LLM 内存结构**切成 32–64 MB bank 大小的碎片**（PNM 可大 1000×），且"**在 DRAM 工艺的功耗/散热预算下，PIM 的算力是否足够尚不清楚**" [^30^]。
- **SmartSSD（计算型 SSD）并发/扩展**：Gen1 用 Xilinx KU15P（523K LUT），Gen2 用 Versal VM1802（算力 1.8×、片上内存 4×、TDP 40 W）；NAND↔FPGA 经片上 DRAM 走 P2P、绕开主机，**多设备可近线性扩展** [^37^][^59^]。但 **WIO 实测持续写负载下设备端计算热节流，吞吐掉 50–60%**（NVMe 70 °C 掉 50%、FPGA 93/97/100 °C 分级降频/门控/关机），根因是"企业级 SSD 10–14 W，加 FPGA/嵌入式算力后 25–70 W 同封装"，结论直白："**持续负载下，设备端算力变成负担而非优化**" [^38^]。SCRec 在推荐模型上则证明 NDP 有效（比 CPU-DRAM 快 55.77×、能效比多 GPU 高 13.35×），说明**瓶颈不在"有无算力"而在"算力 vs 功耗/散热/带宽的预算匹配"** [^58^]。

> **对问题(2)的直接回答**：现有证据表明，**把通用计算核放进存储/内存逻辑 die，在高请求并发下的主要瓶颈是"功耗/散热预算 + SRAM/调度 + bank 阻塞"，而非裸算力数字**。HBF 逻辑 die 选择**不集成通用 AI 算力、只做并行调度 + SRAM 预取**，恰好规避了 PIM/SmartSSD 在持续高并发下暴露的热节流与 bank 阻塞问题；其"够不够用"不取决于算力，而取决于 **SRAM 是否足以撑起 `2×BW×tR` 的双缓冲预取** [^29^][^30^][^38^]。

---

## 映射表与SRAM

### 3.1 全量映射表容量估算

页级映射（page-level mapping）粒度细、随机写性能好，是主流 SSD 选择，但映射表随容量线性增长：

- **经验法则：1 TB SSD（4 KB 页）≈ 需 1 GB DRAM 存全量逻辑→物理映射表**（约每 TB 1 GB，即 ~0.1%）[^^41^^]。换算：16 GB / 2 KB 页 = 8.39 M 逻辑页 × 4 B 指针 = 32 MB，随容量线性放大 [^47^]。
- **SRAM/DRAM 受限的影响**：若 DRAM 放不下全表，FTL 需先读存在 NAND 里的映射表再查数据地址，**性能明显下降**，故高性能 SSD 上电即把全表载入 DRAM；但"DRAM 与容量成正比"已不可负担，催生带 map cache（有限 SRAM 缓存映射项）的 **DRAM-less SSD** [^41^]。

### 3.2 按需加载（demand-based mapping）与"性能悬崖"证据

- **DFTL（ASPLOS'09）**：全量页映射表存于 flash 的 translation block，SRAM 内只放 **CMT（缓存映射表）+ GTD（全局翻译目录，追踪翻译块位置）**，按时间局部性**按需选择性缓存**；比 FAST 响应时间改善 78% [^45^][^48^]。
- **悬崖实测**：当**负载局部性差或 cache 太小**，CMT 与 flash 之间搬运映射数据的开销"**可使整体性能比无 cache 缺失的负载下降最多 57%**"；随机读即便有 CMT 仍有严重开销，且更新翻译块引入额外写 [^44^][^45^]。换言之，**buffer 不足 → 映射缺页 → 每次数据读退化为"翻译页读 + 数据读"两次 flash 访问**，tR 被成倍放大——这与第 1 节的 tR 直接耦合。
- **优化（局部性预取映射项）**：PrefetchFTL（ACM TOS，DRAM-less、512 KB SRAM 仅存 CMT）用 runs test 刻画翻译页内空间局部性来决定是否预取相邻映射项，**命中率 +39.4%、整体 I/O 延迟 −23.4%（区间 14.5%–37.0%）、翻译页读 −48.3%、预取准确率 63.6%**；DFTL 在弱局部性 trace（src2_0）上更优，SFTL（整页装载）在强局部性 trace 上更优——**印证"按局部性自适应粒度"是正解** [^46^]。其它：HAT 用独立路径隐藏地址翻译，性能达纯页映射的 99.2% 但 RAM 开销接近块映射 [^42^]；某 dualistic DFTL 用仅 10% SRAM 即比 DFTL 响应快 56.9% [^43^]。

### 3.3 HBF 小 SRAM 兼作"读 buffer + 映射表"的容量权衡

把上面两条线叠到 HBF 上：

1. **SRAM 是稀缺且被争抢的资源**。FlashAccel 给 HBF 的 SRAM 定量是**整栈 `> 2 × Peak_Bandwidth × Read_Latency`**，且明确用于**数据预取双缓冲**（读 buffer）[^^29^^]。以 Gen1（1.6 TB/s、有效读延迟取 µs 级）估算，这是一个**MB 级**的读缓冲预算。
2. **同一片 SRAM 若还要兼作 FTL 映射 cache**，就回到 DFTL 的两难：映射 cache 不足 → 映射缺页 → 翻译页读放大 → 吃掉读 buffer 又抬高有效延迟 [^44^][^45^]。
3. **破局点在负载局部性**。LLM 权重/慢变上下文是**顺序、可预知、强局部**的读取：映射项可大粒度预取甚至常驻（权重布局静态），把 SRAM 的绝大部分留给读 buffer；这与 PrefetchFTL"强局部性→整页/大块预取命中率最高"的结论一致 [^46^]，也与 HBF"加速器预知数据即可预取"的论点自洽 [^28^][^30^]。

> **对问题(3)的回答**：HBF 小 SRAM 兼两职的核心权衡是**"读缓冲 vs 映射 cache 的配比"**。定量上读 buffer 需 `≥2×BW×tR`（双缓冲）[^^29^^]；映射侧应避免 DRAM-less 那种"按需小 cache"在弱局部性下的 57% 悬崖 [^44^]，而应利用 LLM 顺序 KV/权重的强局部性做**大粒度、高命中**的映射预取 [^46^]。

---

## 读触发时机

### 4.1 LLM 逐层 KV 消费特性 → 预取粒度与发起时机

LLM 推理 decode 逐层、顺序地消费权重与 KV cache，消费节奏**确定性强、可离线剖析**——这正是"提前发起慢读以掩盖 tR"的理想负载 [^28^][^30^]。各系统的粒度/时机选择高度收敛：

| 系统 | 粒度选择 | 发起时机 / 机制 | 效果 |
|---|---|---|---|
| **Tutti**（arXiv 2605，GPU-centric SSD KV） | 对象 = 每层 K/V 各一对象（2×L 对象），保留引擎原生块粒度；P2P 映射用 **SGL（16 B/段）** 取代 PRP（60 GB KV：PRP 需 3.75 GB HBM → SGL 仅 15 MB） | **slack-aware I/O 调度：离线剖析逐层 I/O slack，在 slack 内调度 KV 传输**；CPU 开销 O(layer×blocks)→O(layer)；SM 分区为计算域+I/O 控制域 | TTFT **−78.3%**、可达请求率 2×、成本 −27%、**GPU 气泡降到近 0** [^49^] |
| **Tutti 动机数据** | **4 KB 请求能饱和 IOPS 却只用 ~80% 读带宽 / 16% 写带宽；KV 传输实际 ~100 KB**；64 层 Qwen3-32B 恢复 128K-token 需 ~256K 个 80 KB 散落对象；LMCache 默认 256-token chunk → >1000 次访问 | **把逐层传输生硬套到 SSD（SSD-LW）反而缩小 I/O 粒度、抬高次数，GPU 气泡推到 ~80%；即便 GDS 气泡仍 >70%** | 说明**粒度与时机的匹配比"是否绕过 CPU"更关键** [^49^][^50^] |
| **HCache**（EuroSys'25） | **64-token chunk**，逐层把同层所有 token 隐藏态拼成连续大块，多 SSD round-robin 聚合带宽 | **bubble-free 恢复调度**：按硬件算力/I/O 快慢划分 L_H/L_O 层，传输 L_{n+1} 与重算 L_n 并行 | TTFT 比 KV offload **快 1.93×**、比重算快 5.73×，省 1.92–2.40× 存储 [^51^] |
| **FlexGen**（ICML'23） | 逐层流式（layer-by-layer）权重/KV，block scheduling | **zigzag / 层预取**：逐层把权重从 DRAM/NVMe 流入 GPU，预取以掩盖传输 | 有效 batch 144 → 吞吐 100×；prefill GPU 利用率 82%、decode 仅 13%（说明 decode 被 I/O 卡）[^52^] |
| **FlashGen**（Jeong & Ahn 2025） | 多层缓存 + 请求调度 | **逐层重叠 KV 加载与计算 + 重排序执行调度**（DRAM-backed，已并入 SGLang） | 属"DRAM-backed 下逐层流水线有效"的代表 [^53^] |
| **ContiguousKV** | 粒度对齐的 ContiguousChunk | **intra/inter-period 预取**：跨层复用关键 chunk 索引，把异步 I/O 编排到计算之前 | 掩盖 I/O 延迟、消除气泡 [^54^] |
| **SolidAttention**（FAST'26） | KV Consolidator：把多对 KV 合并为大块作基本传输单元（K/V token 粒度交织） | **Speculative Prefetcher**：按重要性时间局部性（~80%）预取 init/local 块与历史选中块；SSD-aware Scheduler 拆 prefetch/load/save 微任务并复用同步点 | 面向内存受限 PC 的低延迟 SSD 服务 [^57^] |
| **三星/LMCache 白皮书** | **256-token 块 ≈ 33 MB/块** | 会话迁移时逐块顺序读回 | 读:写 = 92:8；块层 96% 请求 >1 MB；单进程 ~78% 顺序 [^55^] |
| **atlarge I/O 实测** | 主流块层请求 **128 KiB** | KV offload 读带宽为写 **186×**（写一次读多次） | [^56^] |

### 4.2 对"预取粒度 / 提前多久"的直接启示

- **粒度**：`page(4 KB)` 太小（IOPS 饱和但带宽利用率低、请求数爆炸）[^^49^^]；整块/整层太大（内部碎片、与管理粒度不匹配）。**最佳区间是"中粒度连续块"**：~100 KB（KV 传输自然尺寸）到 数 MB（256-token≈33 MB、128 KiB 实测主流），并以 **64–256 token 的 chunk** 作为兼顾传输效率、前缀共享与管理粒度的折中 [^49^][^51^][^55^][^56^]。
- **时机**：**至少"提前一层"发起读**，用当前层的计算时间掩盖下一层的 tR/传输——HCache 的"传 L_{n+1} 与算 L_n 并行"、Tutti 的"逐层 slack 内调度"、FlexGen 的"层预取"都是同一思想 [^49^][^51^][^52^]。**提前量 ≈ 一层计算耗时**，需 ≥ `读延迟 + 传输时间`；对 HBF，因单读 µs 级、确定性强，可将提前量与 SRAM 双缓冲（`2×BW×tR`）联合标定 [^29^][^30^]。
- **与 NAND 机制的闭环**：大粒度顺序读正好落在 NAND 最擅长的区间（channel-striping + cache read 打满带宽），且避免 4 KB 随机小读触发 I/O 总线争用（读的 bus 占用 ≥50.5% 的瓶颈）[^14^][^16^]；强局部性又让 FTL 映射项可大粒度预取，规避 DFTL 悬崖 [^45^][^46^]。

---

## 争议

1. **HBF"有效读延迟 1–10 µs" vs 裸 NAND tR 40–170 µs 的张力（最大争议）**。Ma & Patterson Table 3 给 HBF 读延迟 `~1–10 µs` [^30^]，而器件级 QLC tR 高达 85–170 µs、TLC 40–100 µs [^8^][^9^][^10^]。两者并不矛盾，但**极易误读**：`1–10 µs` 应理解为"经 SLC 模式 + sub-array 并行 + SRAM 预取双缓冲之后、数据已在缓冲中的**有效/流水线化延迟**"，而非 cell 级裸读延迟。SanDisk 自己承认"HBF 延迟仍是 HBM 的 10–100×"，并把可行性押在"**加速器若预知数据即可预取、避免等单次慢读**" [^25^][^28^]。**若负载不可预知（高随机、低局部），HBF 的延迟短板会立刻暴露**——这正是它只敢做"确定性 decode/权重"的根本原因。

2. **逻辑 die 要不要/能不能放计算核，业界路线分叉**。HBF（SanDisk）目前**不放通用 AI 算力**，只做并行调度+缓冲 [^25^]；而 PIM 路线（HBM-PIM/AiM/AXDIMM）则把 PCU/MAC 放进内存，追求就地算 [^31^][^33^]。Ma & Patterson 明确**看衰 PIM 用于数据中心 LLM**（须切 32–64 MB 碎片、算力受 DRAM 功耗散热限制、软件难用），倾向 PNM [^30^]。ComPASS 的 bank 阻塞 [^34^] 与 WIO 的热节流 [^38^] 给"逻辑 die 放算力"敲响警钟。**但这不是终局结论**——Microsoft 提出"面向读性能/高密度的 AI 推理新内存"，另有工作提出"Processing-Near-Flash + LPDDR 接口"做端侧推理 [^30^]，说明近闪存计算仍在探索。HBF"放不放算力"将取决于 SRAM/功耗预算与负载形态，目前证据偏向"不放更稳"。

3. **预取粒度：中粒度块（~100 KB–数 MB）虽为共识，但"逐层流水线是否适用于 SSD"有反例**。Tutti 证明**把 DRAM-backed 有效的逐层流水线生硬套到 SSD（SSD-LW）会缩小 I/O 粒度、抬高请求数，GPU 气泡反升至 ~80%** [^49^]；因此 SSD 场景需改为 GPU-centric 大对象 + slack-aware 调度 [^49^]。这提示：**粒度与时机必须联合设备特性（tR、总线、队列深度）协同设计，不能照搬 DRAM 经验**。

4. **QLC 是否可用于 HBF 未定**。分析师（Irrational Analysis 经 Chipstrat 转述）称行业消息指 HBF 可能用 **SLC**（写耐久提升一个数量级、牺牲密度）[^^25^^]；FlashAccel 亦明确选 SLC-HBF [^29^]。但 SanDisk 官方**未公布 cell 类型**，而其最强产品线是 UltraQLC/BiCS8 QLC [^21^]。SLC（低 tR、高耐久、低密度）vs QLC（高 tR、低耐久、高密度）的取舍直接决定 HBF 的容量/延迟/寿命三角，是悬而未决的关键设计点。

5. **"读比写更难吃满并行"对 HBF 带宽叙事的隐含约束**。NANDFlashSim/HotStorage'12 显示读的并行收益（~10.9%）远小于写（~91.2%），瓶颈在 I/O 总线 [^14^][^16^]。HBF 用 1024-bit 超宽接口正面解决了总线宽度，但**多 die/plane 并行能否在真实 LLM 负载下持续打满 1.6 TB/s，仍依赖映射布局与预取命中率**，官方 2.2% 差距是"内部测试/模拟"口径 [^27^]，独立实测尚缺。

---

## 参考文献

> 格式：`[^n^]` 标题 — 日期 — 置信度（高/中/低）。**摘录**：原文关键句。**URL**。

**NAND tR / pipeline**
- [^5^] *Reducing SSD Read Latency by Optimizing Read-Retry (arXiv:2104.09611)* — 无日期（2021）— 置信度：高。摘录："tR = N_SINE × (tPRE + tEVAL + tDISCH)…In SLC…N_SINE=1…increases up to 3 in TLC…to identify a specific V_TH state out of eight"。URL: https://arxiv.org/pdf/2104.09611
- [^6^] *Flash Program Memory — ScienceDirect Topics* — 无日期 — 置信度：中。摘录："Writing…takes between 200 microseconds (SLC) and 800 microseconds (MLC), while erasing a block requires 1.5–2 milliseconds…QLC…has the highest density and access time among cell types."。URL: https://www.sciencedirect.com/topics/computer-science/flash-program-memory
- [^7^] *SkyHigh 8Gb SLC NAND Datasheet (002-00484)* — 无日期 — 置信度：高（一手 datasheet）。摘录："Page Read…Random access: 30µs(Max), Sequential access: 25ns(Min); Program time: 300µs(Typ); Block Erase time: 3.5 ms(Typ)"。URL: http://www.skyhighmemory.com/download/dataSheet/002-00484.pdf
- [^8^] *Samsung, "A 512Gb 3b/Cell 7th-Generation 3D-NAND…" (ISSCC, via ResearchGate)* — 2025-09-09（收录）— 置信度：高。摘录："tBERS = 3.5 ms, tPROG = 400 µs, and tR = 40 µs…more than 200 vertical layers"。URL: https://www.researchgate.net/publication/350172038
- [^9^] *SAFARI/ETH, "Understanding and Designing Modern NAND Flash-Based SSDs" (Mutlu 课程)* — 2021 — 置信度：高。摘录："tR: 50~100 us; tPROG: 700us~1000 us; tBERS: 3ms~5ms…Read (tCMD)+tR+tDMA+tECC…e.g., 100+16+20=136 us…CACHE READ Overlaps tDMA & tECC with tR"。URL: https://safari.ethz.ch/projects_and_seminars/fall2021/lib/exe/fetch.php?media=pns_modern_ssds_hs2021_3rd_after_meeting.pdf
- [^10^] *ComputerBase, "ISSCC 2021: Die neuen 3D-NAND-Generationen im Vergleich"* — 2021-02-25 — 置信度：高（整理自 ISSCC 各家论文）。摘录（QLC tR 平均/最大）："Intel 144L: 85µs/128µs; Intel/Micron 96L: 90µs/168µs; Kioxia/WD BiCS4: 160µs/165µs; Samsung V5: 110µs; SK Hynix V5: 170µs"。URL: https://www.computerbase.de/news/storage/isscc-2021-3d-nand-vergleich-eckdaten.75624/
- [^11^] *SAFARI/ETH, Modern SSDs (Spring 2021)* — 2021 — 置信度：高。摘录："In 3D TLC NAND flash, tR/tPROG/tBERS ≈ 100us/700us/3ms"。URL: https://safari.ethz.ch/projects_and_seminars/spring2021/lib/exe/fetch.php?media=pns_modern_ssds_ss2021_7th_aftermeeting.pdf
- [^12^] *"A Case for Melded Pages" (HotStorage'20)* — 2020 — 置信度：高。摘录："Table 1: Read Latency with Melded TLC — LSB Page 58µs, CSB Page 78µs, MSB Page 107µs"。URL: https://www.usenix.org/system/files/hotstorage20_paper_k.pdf
- [^13^] *OCOWFC: Open-Channel Open-Way Flash Controller (FPL'21 / GitHub)* — 2021-07-28 — 置信度：高。摘录："maximum reading…bandwidths can reach 1.2GB/s…93% of the theoretical maximum…minimum latencies for the page reading and programming are 119µs and 2ms…speeded up by 1.9x and 3.1x"。URL: https://github.com/FDU-ME-ARC/OCOWFC
- [^14^] *NANDFlashSim (ACM TACO, 10.1145/2700310)* — 无日期 — 置信度：高。摘录："Most read cases were unable to leverage the highly parallel internal architecture…between quad dies and octal dies, four planes and eight planes, and 4KB and 8KB page sizes are 10.9%…while the write throughputs are improved by 91.2%…50.5% of the total I/O execution cycles is consumed by…I/O bus activity…many-die…54.5% better"。URL: https://dl.acm.org/doi/pdf/10.1145/2700310
- [^15^] *"DIR: Dynamic Request Interleaving…" (JCST 2024)* — 2024 — 置信度：高。摘录："plane-level parallelism was far from well-utilized…only about 1%-4% of requests can be written into pages with multi-plane command"。URL: https://jcst.ict.ac.cn/fileup/1000-9000/PDF/JCST-2024-1-6-1601-82.pdf
- [^16^] *"An Evaluation of Different Page Allocation Strategies…" (HotStorage'12)* — 2012 — 置信度：高。摘录："the bus activity fraction of the total execution time for reads…accounts for at least 50.5%, whereas that for writes is as much as 7%"。URL: https://www.usenix.org/system/files/conference/hotstorage12/hotstorage12-final55.pdf
- [^17^] *JSC/Suntsu NAND Datasheet (JS27HPxG08SFDA)* — 无日期 — 置信度：中。摘录："Read Cache…load the data in a cache register while the previous data is transferred…multiplane architecture…program and erase time to be reduced by 50%…data…read out at 45 ns cycle time per byte"。URL: https://suntsu.com/wp-content/uploads/2024/12/JS27HPxG08SFDA-45_4G.pdf
- [^39^] *TechPowerUp SSD Specs: PNY XLR8 CS3040 (Toshiba BiCS4 96L QLC)* — 2025-12-02 — 置信度：中（第三方汇总）。摘录："Read Time (tR): 160 µs; Program Time (tProg): 3290 µs; Type: QLC; 96-layer"。URL: https://www.techpowerup.com/ssd-specs/pny-xlr8-cs3040-4-tb.d742
- [^40^] *Micron NAND "Interleaved Die Operations" (studfile 镜像)* — 2016-02-12 — 置信度：中。摘录："while the first die is busy…issue a command to the other die…significantly improve performance by interleaving operations between the die"。URL: https://studfile.net/preview/5208611/page:10/

**HBF 架构 / 逻辑 die**
- [^18^] *SanDisk Press Release: "Sandisk and SK hynix Begin Global Standardization of…HBF"* — 2026-02-26 — 置信度：高（官方）。摘录："joint effort to standardize High Bandwidth Flash (HBF™)…designed for the AI inference era…dedicated workstream under the Open Compute Project"。URL: https://www.sandisk.com/company/newsroom/press-releases/2026/2026-02-25-sandisk-and-sk-hynix-begin-global-standardization-of-next-generation-memory-solution-high-bandwidth-flash-hbf
- [^19^] *NineScrolls, "SanDisk and SK Hynix Activate HBF Equipment Supply Chain"* — 2026-04-14 — 置信度：中。摘录："stacks multiple 3D NAND dies…through-silicon vias (TSVs)…~1.6 TiB…aggregate bandwidth of 400–800 GB/s per stack…20–80 W…>6.4 GB/s/W…Samsung…Kioxia…FlashDi"。URL: https://ninescrolls.com/news/sandisk-and-sk-hynix-activate-hbf-equipment-supply-chain-tsv-etch-ald-and-pecvd-
- [^20^] *OSCOO, "SK Hynix and SanDisk Unveil HBF for AI Inference"* — 2026-02-28 — 置信度：中。摘录："Max Read Bandwidth Up to 1.6 TB/s; Single Die Capacity 256 GB; Max Stack Capacity 512 GB per stack; Matches HBM4 footprint, height, and power"。URL: https://www.oscoo.com/news/sk-hynix-and-sandisk-unveil-high-bandwidth-flash-for-ai-inference/
- [^21^] *Atlas Peak Research, "Global Memory…Buildout"* — 2026-03-26 — 置信度：中。摘录："BiCS8 (218-Layer)…ramped…in 2025…256TB UltraQLC NVMe SSD…HBF creates an entirely new memory tier between HBM and conventional SSDs"。URL: https://www.atlaspeakresearch.com/report/af2410
- [^22^] *Hardwareluxx, "High Bandwidth Flash: SanDisk, SK Hynix und OCP…"* — 2026-02-26 — 置信度：高。摘录："16 Stacks auf eine Kapazität von 512 GB…1.024 Bit breites Speicherinterface – identisch zu HBM…bis zu 4.096 GB"。URL: https://www.hardwareluxx.de/index.php/news/hardware/arbeitsspeicher/68368-high-bandwidth-flash-sandisk,-sk-hynix-und-ocp-wollen-hbf-zum-standard-machen.html
- [^23^] *Semiconductor Engineering, "Flash Getting Stacked High-Bandwidth Version"* — 2026-06-29 — 置信度：高。摘录："a 16-die-plus-base-die flash stack that fits the same footprint as HBM…Sandisk plans first samples of HBF in the second half of 2026…first inference devices…in early 2027…re-architecting the internal read path and leveraging multi-array parallelism"。URL: https://semiengineering.com/flash-getting-stacked-high-bandwidth-version/
- [^24^] *Kings Research, "U.S. NAND Flash Market"* — 2026-07-10 — 置信度：中。摘录："In August 2025, Kioxia…launched a 5 TB High-Bandwidth Flash (HBF) memory module prototype that delivers 64 GB/s bandwidth using a PCIe 6.0 interface…power consumption below 40 W"。URL: https://www.kingsresearch.com/report/us-nand-flash-market-3117
- [^25^] *Chipstrat (Austin Lyons), "High Bandwidth Flash: The Full Report"* — 2026-07-07 — 置信度：中（分析师，含 Sandisk 图）。摘录："A controller logic die is then bonded directly onto the NAND array. That logic die schedules the parallel sub-array reads and drives the results out over the wide interface to the GPU…'CMOS directly Bonded to Array' or CBA…HBF's latency is still 10-100x slower than HBM. But if the accelerator knows what data it needs in advance, it can prefetch it…industry sources tell him it will be SLC"。URL: https://www.chipstrat.com/p/high-bandwidth-flash-the-full-report
- [^26^] *SDxCentral, "Beyond HBM: the flash memory technology…"* — 2026-05-11 — 置信度：中。摘录："built on…CMOS directly bonded to array (CBA)…CMOS control circuits…and cell array wafers are fabricated independently, only to then be bonded together…brings you the best cell performance and the best CMOS I/O performance"。URL: https://www.sdxcentral.com/analysis/beyond-hbm-the-flash-memory-technology-that-could-reshape-ai-infrastructure/
- [^27^] *PauseHardware, "SK Hynix Et SanDisk Lancent Le HBF"* — 2026-02-26 — 置信度：中。摘录："écart de seulement 2,2 % face à une « HBM à capacité illimitée »…Llama 3.1 405B en 8 bits…Gen2…plus de 2 To/s…Gen3…3,2 To/s…1,5 To"。URL: https://pausehardware.com/high-bandwidth-flash-standard-ocp/
- [^28^] *Chipstrat, "HBF: The Full Report"（带宽/预取论点）* — 2026-07-07 — 置信度：中。摘录："Conventional flash ships about 14 GB/s behind a PCIe 5.0 NVMe controller. Packaged as HBF, the same material delivers 1.6 TB/s. Roughly 100x the bandwidth, from packaging alone…if the accelerator knows what data it needs in advance, it can prefetch it and avoid waiting on any single slow read"。URL: https://www.chipstrat.com/p/high-bandwidth-flash-the-full-report
- [^29^] *FlashAccel (arXiv:2607.10186)* — 2026-04-15 — 置信度：高（一手论文）。摘录："Each stack contains 8 Flash dies above a base die…Each Flash die integrates an array die and a circuit die through hybrid bonding…scaling each Flash die to 96 planes…HBF integrates SRAM buffers in different dies as caches for data prefetch to mitigate Flash latency…the circuit die contains substantial unused silicon area…each stack has a total SRAM capacity greater than 2×Peak_Bandwidth×Read_Latency…We target SLC-based HBF"。URL: https://arxiv.org/html/2607.10186v1
- [^30^] *Xiaoyu Ma & David Patterson (Google), "Challenges and Research Directions for LLM Inference Hardware" (arXiv:2601.05047; IEEE Computer 2026)* — 2026 — 置信度：高（权威）。摘录："HBF combines HBM bandwidth with flash capacity…Page-based reads with high latency…at page granularity (10s KBs) with a latency substantially worse than DRAM (microseconds)…Limited write endurance…PIM requires software to shard memory structures…into 32-64MB memory banks; shards in PNM can be 1000x larger…unclear if the compute can be sufficient in PIM given the very limited budget for power and thermal"。（Table 3 数值经 Chipstrat 转引：HBF 读延迟 ~1–10 µs、读粒度 4096 B、<80 W）URL: https://www.arxiv.org/pdf/2601.05047v2

**近存计算并发瓶颈（PIM/AXDIMM/SmartSSD）**
- [^31^] *EEWorld, "Samsung's HBM-PIM chip is now available"* — 2021-02-18 — 置信度：高。摘录："each memory bank has an embedded programmable compute unit (PCU) that runs at 300 MHz, for a total of 32 PCUs per die…16-wide single instruction, multiple data engine…exploits bank-level parallelism to provide 4X higher processing bandwidth…1.2 TFLOPS"。URL: https://en.eeworld.com.cn/news/qrs/eic526516.html
- [^32^] *Samsung (via VideoCardz), "Samsung Develops Industry's First HBM with AI Processing Power"* — 2021-02-17 — 置信度：高（官方 PR）。摘录："deliver over twice the system performance and reduce energy consumption by more than 70%…placing a DRAM-optimized AI engine inside each memory bank"。URL: https://videocardz.com/press-release/samsung-develops-hbm-pim-industrys-first-high-bandwidth-memory-with-artificial-intelligence
- [^33^] *Uplatz, "Processing-in-Memory: A System-Level Analysis"* — 2025-11-28 — 置信度：中（汇总表）。摘录："HBM-PIM: 16-lane SIMD Array (PCU) per 2 banks, 16 per stack, 4.9 TFLOPS (per GPU with 4 cubes), FP16…GDDR6-AiM: 1 TFLOPS/Chip, MAC-based PU per bank, 32 per chip, BF16"。URL: https://uplatz.com/blog/processing-in-memory-a-system-level-analysis-of-dram-and-sram-architectures-for-next-generation-computing/
- [^34^] *ComPASS (MICRO'25, 10.1145/3725843.3756017)* — 2025-10-17 — 置信度：高。摘录："PIM operations typically trigger multi-bank ACT, blocking normal memory access. For example, a 4096×4096 GEMV on four HBM-PIM modules takes 13 µs, during which normal requests stall…the same GEMV takes over 100 µs on a 4-channel LPDDR-PIM, comparable to NAND SSD latency…Larger GEMVs, such as 4096×16384…exacerbate the delay"。URL: https://dl.acm.org/doi/full/10.1145/3725843.3756017
- [^35^] *All About Circuits, "Samsung Breaks PIM Into AI Applications"* — 2021-08-30 — 置信度：中。摘录："AXDIMM…acts as a buffer with an AI engine within it…perform parallel processing of multiple memory ranks…twice the performance…40% decrease in the overall system's energy usage"。URL: https://www.allaboutcircuits.com/news/beyond-high-bandwidth-memory-samsung-breaks-processing-in-memory-into-AI-applications/
- [^36^] *NMP-PaK (ISCA'52)* — 2025 — 置信度：高。摘录："Channel-Level Near-Memory Processing…places computation within the buffer chip or memory's logic layers, allowing access to data from different banks but with limited bandwidth, as seen in Samsung's AxDIMM"。URL: https://dl.acm.org/doi/abs/10.1145/3695053.3731056
- [^37^] *HillInfer (arXiv:2602.18750)* — 2026-03-25 — 置信度：高。摘录："Samsung SmartSSD…synergize an FPGA (e.g., Xilinx KU15P) and on-board DRAM…data path between the NAND flash and the FPGA is handled via internal Peer-to-Peer (P2P) transfers…allowing computational storage capacity to scale linearly as additional devices are integrated"。URL: https://arxiv.org/html/2602.18750v2
- [^38^] *WIO (arXiv:2604.02442)* — 2024-01-15（版本）— 置信度：高。摘录："the NVMe controller throttles at 70°C with 50% throughput loss; the FPGA reduces frequency at 93°C, activates clock gating at 97°C, and triggers shutdown at 100°C…sustained writes…50–60% drops from thermal throttling…Device-side compute under sustained load becomes a liability, not an optimization"。URL: https://arxiv.org/html/2604.02442v1
- [^58^] *SCRec (arXiv:2504.00520)* — 2021-12-09（版本）— 置信度：高。摘录："achieving up to 55.77× speed-up compared to a CPU-DRAM system…up to 13.35× improvement in energy efficiency over a multi-GPU system"。URL: https://arxiv.org/html/2504.00520v1
- [^59^] *"Scalable Billion-point ANNS…" (USENIX ATC'24)* — 2024 — 置信度：高。摘录："I/O operations can account for about 70% of total execution time in SSD-based ANNS…multiple SmartSSDs can achieve near-linear acceleration for ANNS queries"。URL: https://www.usenix.org/system/files/atc24-tian.pdf

**FTL 映射表 / SRAM**
- [^41^] *FMMU (arXiv:1704.03168)* — 2017 — 置信度：高。摘录："a 1TB SSD requires 1GB DRAM to store the logical-to-physical mapping table. If the DRAM capacity is insufficient…the FTL might first read the mapping table stored in the NAND flash…SSDs exhibit low performance…Recently…DRAM-less SSDs equipped with the map cache unit"。URL: https://arxiv.org/pdf/1704.03168
- [^42^] *"Achieving page-mapping FTL performance at block-mapping FTL cost by hiding address translation (HAT)" (MSST'10)* — 2010 — 置信度：高。摘录："the performance of HAT is within 0.8% of the pure page-mapping FTL, while consuming about 50% of the energy"。URL: https://dl.acm.org/doi/10.1109/MSST.2010.5496970
- [^43^] *"A Demand-Based FTL Scheme Using Dualistic Approach…" (RTCSA'11)* — 2011 — 置信度：中。摘录："improved read response time…by up to 56.9% though it uses only 10% of SRAM"。URL: https://discovery.researcher.life/article/compact-modeling-of-trapassisted-tunneling-current-in-3d-nand-flash-memory/a9cbee4305b636478c7c4d76e7d1ed80
- [^44^] *"Exploiting Internal Parallelism for Address Translation in SSDs" (ACM, 10.1145/3239564)* — 无日期 — 置信度：高。摘录："if a workload has low access locality or the cache is too small, there is a large overhead for transferring cached mapping data between DRAM and flash memory. This overhead can degrade the overall performance by up to 57% compared to workloads that exhibit no cache misses"。URL: https://dl.acm.org/doi/pdf/10.1145/3239564
- [^45^] *ScienceDirect Topics, "Flash Translation Layer / DFTL"* — 无日期 — 置信度：中。摘录："The DFTL improves response time by 78% compared to FAST. However, storing the mapping table in the translation blocks causes a serious performance overhead for random read requests even with CMT. Furthermore, extra write operations are required to update the translation blocks"。URL: https://www.sciencedirect.com/topics/computer-science/flash-translation-layer
- [^46^] *"Prefetching Mapping Table Entries to Speed Up Address Translation in DRAM-Less SSDs" (ACM TOS, 10.1145/3789202)* — 2026-04-08 — 置信度：高。摘录："SRAM cache size is set to 512 KB, storing only CMT…increase the hit ratio of mapping table entries by 39.4% and reduce overall I/O latency by 23.4% on average…reduces the total read number towards translation pages…by 48.3%…hit ratio of 63.6% on the prefetched entries"。URL: https://dl.acm.org/doi/10.1145/3789202
- [^47^] *"[DFTL] FEMU DFTL 구현" (Tistory blog)* — 2024-02-12 — 置信度：中（推算过程清晰）。摘录："16GB / 2KB = 8,388,608 개…× 4Byte = 32MB…SSD의 크기가 커질수록 필요한 메모리의 크기도 점점 증가"。URL: https://happy-master-student.tistory.com/1
- [^48^] *"DFTL: A Flash Translation Layer Employing Demand-based Selective Caching"（论文综述，ASPLOS'09）* — 2026-03-09（综述日期）— 置信度：中。摘录："store the page-based mapping table in the flash memory and then cache the entries on demand in the cached mapping table (CMT) in the SRAM…global translation directory (GTD)…tracks these translation blocks"。URL: https://wifiaircat.tistory.com/31

**读触发时机 / LLM KV 预取**
- [^49^] *Tutti (arXiv:2605.03375)* — 2026-05-05 — 置信度：高。摘录："Tutti reduces TTFT by 78.3%…improves the achievable request rate by 2×…reducing CPU overhead from O(layer×blocks) to O(layer)…slack-aware I/O scheduling…4KB requests can saturate IOPS, yet only use about 80% of read bandwidth and 16% of write bandwidth…KV cache transfers are variable and much larger (~100 KB)…Applying layer-wise transfers on SSDs (SSD-LW)…pushing GPU bubble time to around 80%…PRP…3.75 GB…SGL…15 MB"。URL: https://arxiv.org/html/2605.03375
- [^50^] *Tutti（背景，GDS 气泡）* — 2026-05-05 — 置信度：高。摘录："Even with GDS, GPU bubble time remains high at above 70%…induce 70~80% GPU stalls"。URL: https://arxiv.org/html/2605.03375
- [^51^] *HCache (EuroSys'25 / arXiv:2410.05004)* — 2024-10-07 — 置信度：高。摘录："HCache reduces the TTFT by up to 1.93× compared to KV offload while consuming 1.92-2.40× less storage space; compared to token recomputation…up to 5.73×…split the tokens of one layer into multiple fix-sized (64 tokens) chunks…transmission of Ln+1 and recomputation…of Ln can be done concurrently"。URL: https://arxiv.org/html/2410.05004v1
- [^52^] *FlexGen (ICML'23, PMLR v202)* — 2023 — 置信度：高。摘录："streams the weights layer-by-layer into the GPU…leveraging layer prefetching to hide portions of the transfer latency…achieve 100x higher maximum throughput with effective batch size 144…The GPU compute utilization is 82% and 13% for prefill and decoding"。URL: https://proceedings.mlr.press/v202/sheng23a/sheng23a.pdf
- [^53^] *"Hierarchical Context Caching…" (arXiv:2508.18572，Related Work 述 FlashGen)* — 2025-08-20 — 置信度：中（二手转述 FlashGen）。摘录："CachedAttention and Pensieve both adopt a layer-wise strategy to overlap KV cache loading with computation. FlashGen (Jeong and Ahn, 2025) further enhances this pipeline with re-order execution scheduling, which has been implemented in SGLang"。URL: https://arxiv.org/html/2508.18572v1
- [^54^] *ContiguousKV (arXiv:2601.13631)* — 无日期 — 置信度：高。摘录："combined intra- and inter-period prefetching…orchestrate asynchronous I/O operations to run ahead of computations at two distinct granularities…prefetches the critical ContiguousChunk to pipeline I/O operations with layer computations…hides I/O latency, minimizes idle bubbles"。URL: https://arxiv.org/html/2601.13631v1
- [^55^] *Samsung, "Scaling AI Inference with KV Cache Offloading"（白皮书）* — 无日期 — 置信度：中（厂商）。摘录："LMCache divided into 256-token blocks. Each block occupied approximately 33 MB…read/write ratio was approximately 92% reads…per-process…approximately 78% sequential reads…96% of I/O requests at the Linux block layer exceeded 1 MB"。URL: https://download.semiconductor.samsung.com/resources/white-paper/scaling_ai_inference_with_kv_cache_offloading.pdf
- [^56^] *"An I/O Characterizing Study of Offloading LLM Models…" (atlarge/Cheops)* — 无日期 — 置信度：高。摘录："the dominant request size in the block layer is 128KiB for both reads and writes…the read bandwidth of the KV cache is significantly higher (186.2x) than the write bandwidth"。URL: https://atlarge-research.com/pdfs/2025-cheops-llm.pdf
- [^57^] *SolidAttention (FAST'26 slides)* — 2026 — 置信度：中。摘录："KV Consolidator…consolidate multiple KV cache entries to enlarge the SSD transfer unit…Speculative Prefetcher…KV block Selection exhibits temporal locality (~80%)…SSD-aware Scheduler…Schedule operations in fine granularity…Prefetch / Load / Save"。URL: https://www.usenix.org/system/files/fast26_slides_zheng.pdf

---

### 调研方法与置信度说明
- 检索次数：8 批共约 30 次独立检索（英文为主，含三星/铠侠/SanDisk 官方 PR、IEEE/ACM/USENIX/arXiv 一手文献、德/法/韩/中文媒体转述），满足 ≥15 次要求。
- 置信度标注：**高**=官方/一手同行评议文献；**中**=可信分析师/第三方汇总/厂商营销口径/二手转述；**低**=传闻。
- 主要不确定项：① HBF 的 cell 类型（SLC vs QLC）官方未公布；② HBF"有效读延迟 1–10 µs"与裸 tR 的口径差（见争议 1）；③ HBF 逻辑 die 是否预留可编程算力，官方未明确，本报告据公开资料判断"当前不含通用 AI 计算核"；④ 官方"2.2% 差距"为内部测试/模拟，缺独立实测。
