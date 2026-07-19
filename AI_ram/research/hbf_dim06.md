# Dim06 调研：LLM 各层计算特性（MAC vs 数字运算）与软件层调度 —— 面向混合精度层-器件映射（数字 vs 模拟 CIM / NAND CIM）

- 调研窗口：2020–2026；独立检索 ≈ 47 条英文查询（10 轮 web_search）+ 4 篇原文全文/摘要页精读。
- 引用格式：正文 [^n^] → 文末参考列表（含原文摘录、URL、日期、置信度 高/中/低）。
- 面向场景：NAND CIM（compute-in-memory）部署 LLM；模拟 CIM 只能高效做 MAC/GEMV，softmax/layernorm/residual 需数字单元；核心问题是"哪些层放数字、哪些层放模拟"。

---

## Key Findings

### KF-1 LLM 推理的 FLOPs 与运行时结构：FLOPs ≈ 全在 MAC，时间≠全在 MAC

1. **FLOPs 高度集中于线性层（QKV/O、FFN up/gate/down、LM head），非线性算子 FLOPs 占比 <0.2%，但占运行时可达 ~39%**。PALUTE 对 LLM 推理的分解："GEMM contributes 99.8% of FLOPs but only 61.0% of runtime, while Softmax/LayerNorm/element-wise kernels contribute <0.2% FLOPs yet consume ∼39% runtime (Ivanov et al., 2021)"——这是 memory-wall 效应：非 GEMM 核由 HBM↔SRAM 数据搬运主导 [^5^]（置信度：高）。BERT 单层 A100 实测：4 个 GEMM 占 61%（seq=256）/40%（seq=1024），attention（含 softmax+2 个 batched GEMM）在 seq=1024 时占 49%，layernorm+add-bias+activation 合计仅 11–17% [^6^]（高）。TurboTransformers 对 BERT 端到端：GEMM 占 70.3%（seq=20）/82.8%（seq=400），softmax 1.9–4.6%，LayerNorm 2.7–3.6% [^7^]（高）。

2. **参数/FLOPs 分布：FFN ≈ 2/3 参数，attention 投影 ≈ 1/3；attention 分数 FLOPs 随序列长线性增长**。Geva et al.："Feed-forward layers constitute two-thirds of a transformer model's parameters" [^8^]（高）。FP8 TCO 分析："the FLOPs for attention increase linearly with sequence length"，而线性层 FLOPs 不变；GQA/MLA 把 attention 变成 thin GEMM 但仍是 memory-bound [^3^]（高）。

3. **两阶段异质性：prefill = compute-bound GEMM，decode = memory-bound GEMV（算术强度极低），decode 主导端到端时间**。"the prefill phase is inherently compute-bound, dominated by large matrix-matrix GEMMs… During the decode phase… computation degenerates into a memory-bound GEMV-like operation" [^1^]（高）。OPT-13B/A100 实测（输入512/输出32）："the overall execution is overwhelmingly dominated by the GEMV-centric decode stage (73.8%)"；Roofline 显示 decode 单 batch 全部落在 memory-bound 区 [^2^]（高）。→ **这正是模拟/NAND CIM 的甜点：权重驻留、GEMV 免权重搬运**；而 prefill GEMM 与 CIM 的匹配度差（需要激活重用与数字累加精度）。

4. **decode 内部各 GEMM 的瓶颈不同**：GPU 微架构级分析发现 "FFN-Up is memory-bound（Memory Dependency 58%，GEMV-like 无法隐藏 HBM 权重加载延迟），而 O-Proj/FFN-Down 是 execution-bound（寄存器压力≈130 live registers）"；LayerNorm 的同步 stall 从 prefill 11.0% 升到 decode 27.7%（小批量归约造成 barrier 尾延迟） [^4^]（高）。→ 层-器件映射时 FFN up/gate 是 CIM 的最优候选（纯权重流），O/down 在数字端也未必高效。

### KF-2 模拟 CIM 的能力边界：只做 MAC，非 MAC 必须数字协处理

5. **模拟 CIM 有效精度仅 ~3–8 bit（器件涨落 + ADC/DAC 量化），只适合"容错"的 MVM；敏感层与非线性操作放数字单元**。IBM 综述信："Their limited effective precision (typically 3–8 bits due to device variability and peripheral circuit quantization)… analog tiles handle precision-tolerant MVMs, while digital CUs execute sensitive layers or non-linear operations at full precision" [^20^]（高）。

6. **软/硬两侧共识：softmax、LayerNorm、激活函数、residual/gather 都不适合模拟域**。DG-FeFET Transformer CIM："dedicated functional units (Softmax, LayerNorm, Activation) handle operations incompatible with analog computation. This split compute model—analog multiplication for attention scores, digital for non-linearities—maximizes energy efficiency" [^38^]（高）。TransPIM 在 HBM-PIM 中也必须加 ACU（auxiliary computing units）做 vector reduction 与 softmax，因为 "vector reduction and Softmax function … cannot be efficiently processed by bit-serial row-parallel PIM operations"；PIM-only 方案里 reduction 占 23–32% 时间（Transformer 归约向量长 512，远长于 CNN 的 9） [^34^]（高）。

7. **ADC/DAC 是模拟 CIM 的"隐形数字税"**：ISAAC 论文自述 "the ADCs accounting for nearly half the chip power"，尽管如此 crossbar 仍取得 14.8×/5.5×/7.5×（吞吐/能效/计算密度 vs DaDianNao） [^22^]（高）。Nature Comms 大规模 HWA 研究进一步指出：**对精度杀伤最大的是 I/O 侧噪声而非权重侧**——"nonidealities that effectively add noise to the inputs or outputs—such as ADC and DAC resolution, additive output noise, and S-shaped nonlinearity of the ADC—have the largest impact on the DNN accuracy"，权重相关非理想性影响小得多 [^21^]（高）。

### KF-3 层-器件映射的方法学已收敛成"剖析→映射→评估"流水线，但结论粒度在变细

8. **九种主流异构映射方法被统一为四阶段工作流**：硬件刻画 → 精度敏感度剖析（perturbation/Hessian/activation saliency）→ 架构感知映射（启发式/解析式/学习型）→ 系统级评估（DNN+NeuroSim、ALPINE、3D-CiM 等） [^20^]（高）。映射粒度从整层（PAWDD、LionHeart、MPS）到逐权重（Hessian-driven）；粒度越细精度-能效越优，但互连流量与复杂度上升 [^20^]（高）。

9. **首个 decoder-only LLM（GPT-2-small）的 AIMC 逐投影敏感度画像（2026）**：49 个投影中仅 4 个主导敏感度——block0 的 attention 输出投影 c_proj（ΔPPL=33.1，比绝大多数层高一个数量级）、block1/2 的 FFN up（14.0/11.8）、block0 的 FFN down（12.8）；LM head Δ=6.4、block11 attn out Δ=7.3；**40/49 个投影 Δ<3（~82% 可放模拟）**；中间 block（2–10）的 attention 输出投影极其耐噪（Δ<0.22），QKV 全程中等敏感（Δ≈1–3） [^20^]（高）。→ 结论：**per-block 均匀映射必然错配，需 projection 级粒度**；"最敏感层是内部投影"这一点背离 CNN 的 first-last 模式。

10. **"首末层放数字"（first-last scheme）是最广泛使用的启发式，但被实测证明不稳定**。Lammie 综述："the widely used first-last scheme, which maps the first and last layers to digital CUs, is the simplest example" [^20^]（高）。LionHeart 在多个 CNN+transformer 上对比 FLMS（first-last mapping strategy）基线："The behavior of the FLMS configuration, however, is unpredictable… For 62% of configurations, the last FC layer is retained in analog. However, for only 18%, the first CONV layer is retained. This means that the first layer is usually the most sensitive. **Intermediary layers are observed to be more sensitive than the last layer.**" [^25^]（高）。→ 直接回答用户前提：**"前几层数字、后几层模拟"只对第一层成立率高；末层经常可以留在模拟域，中间层敏感度无单调规律**。

### KF-4 量化文献的层敏感度排序（数字域证据，可迁移到 CIM 层映射）

11. **激活比权重难量化；异常通道/outlier 是主因，且在 ≥6.7B 模型上"全层"出现**。SmoothQuant："weights are easy to quantize while activations are not" [^10^]（高）。LLM.int8()："the emergence of large magnitude features across all layers of a transformer occurs suddenly between 6B and 6.7B parameters… the percentage of layers affected increases from 65% to 100%"；解法是 vector-wise INT8 + outlier 维度 FP16 混合精度分解，">99.9% of values are multiplied in 8-bit" [^9^]（高）。最强 outlier 通常出现在 FFN 输出："The strongest in magnitude outliers typically appear at the output of the feed-forward network, FFN, although for big enough transformer-based language models they start appearing after every linear layer, including query, key, and value projection layers" [^11^]（高）。ZeroQuant-V2 报告"激活量化比权重量化更敏感"并研究逐层敏感度做混合精度分配 [^45^]（中高）。

12. **工程惯例：embedding、LM head、首末层保高精度**。NVFP4 研究："Following from standard practice with PTQ, we keep sensitive layers and operations, including embedding layers, the LM head, and Attention calculations in high precision" [^41^]（高）。ViT QAT："due to the first (patch embedding) and the last (classification) layer are more sensitive to perturbation compared to intermediate layers, we fix their bitwidth to 8-bit following previous work" [^14^]（高）。CNN 混合精度惯例："academic research is always make the first layer of model unquantized or allocate a big bits number, because generally speaking, the first layer is very sensitive to the bits number" [^13^]（中）。剪枝侧旁证：LLM-pruner "identifies that the first and last layers have a profound effect on model performance"；Shortened LLaMA 保留前 4 块+末 2 块不参与剪枝 [^17^]（高）。

13. **KV cache 量化：早期层（0–3 或 0–7）普遍最敏感；K 与 V 不对称**。TurboAngle/MixedKV："early layers typically encode broad contextual features that are more sensitive to quantization error, while later layers can tolerate coarser precision… early layers (0-3 or 0-7) are universally the most sensitive to quantization… K-cache norms are 10-20x more sensitive to quantization error than V-cache norms"；并发现"negative transfer layers"（提升精度反而变差） [^39^]（中）。工程实践（Qwen3 实测）：Layer0 KV 敏感度是中位层的 56×；lm_head 权重敏感度是中位层的 8×；"The most sensitive layers are always at the boundaries: first/last transformer blocks, lm_head, and embedding layers. Middle MLP layers are consistently robust" [^47^]（低-中，工业博客但含实测数据）。

14. **敏感度度量本身有分歧**：HAWQ 用 Hessian top-eigenvalue / HAWQ-V2 用平均 trace 排序层敏感度 [^12^]（高）；LLM-MQ 指出"in LLMs, the hessian matrix of ~15% layers are not positive semi-definite… second-order information struggles to show the change of loss function accurately"，改用一阶梯度 + 整数规划分配 2/3/4-bit，并保留 0.5% outlier 权重 FP16 [^15^]（高）；CMPQ 反过来批评"the gradient of a converged LLM is approximately zero, making it challenging for LLM-MQ to effectively differentiate the sensitivities of each layer"，改做 channel-wise 分配 [^16^]（高）。

### KF-5 NAND CIM 谱系与 LLM 化趋势（用户背景直接相关）

15. **3D NAND CIM 主线**：Wang et al. TVLSI 2019（3D NAND 阵列做 VMM） [^26^]；Macronix Lue et al. IEDM 2019（nvCIM 把 3D NAND 变高密度高带宽 DNN 加速器）、Hsu et al. IMW 2020（校准与 read disturb 分析） [^27^]；Shim & Yu MEMSYS 2021（3D NAND CIM 推理引擎架构设计） [^28^]；3D-FPIM MICRO 2022（3D NAND in-situ PIM 极致能效 DNN） [^29^]；S-FLASH TC 2021（位级稀疏） [^29^]。
16. **NAND×LLM 混合架构（2024–2026）**：Cambricon-LLM（MICRO 2024）：chiplet NPU+NAND die，"the NPU collaborates with the flash chip for matrix operations and handles special function computations beyond the flash's on-die processing capabilities"，用 hardware-tiling 最小化 NPU↔flash 数据搬运；70B 3.44 tok/s、7B 36.34 tok/s，比 flash-offloading 快 22–45× [^30^]（高）。IFC-NPU 范式总结："IFC subsystems accelerate memory-bound operations involving model weights in the decode phase. The NPU handles the prefill phase and nonlinear computations… KV caches maintained in DRAM" [^31^]（高）。NASiC（2026）：3D NAND CAM-selected 多比特 CIM 面向 MoE——CAM 掩码把专家选择与 CIM 计算融合到单周期、thermometer 编码原位多比特输入扩展、多比特 cell，4–114.8× 性能 / 3.9–70× 能效优于 SOTA [^32^]（高）。→ **NAND CIM 在 LLM 上的分工共识：flash 做权重的 GEMV（decode），NPU/数字做 prefill、softmax/LN/sampling 与 KV 相关计算**。

### KF-6 软件调度栈：从图划分到运行时并发

17. **通用编译器层（ONNX Runtime/TVM/Glow）按"能力"贪心划分子图**：ONNX Runtime 对每个 EP 查询 GetCapability()，"assigns it the largest possible contiguous subgraph(s) that it is capable of executing"，CPU EP 兜底 [^36^]（中）。BYOC 批评 ONNX Runtime "executes the graph operator-by-operator, which may introduce unnecessary data transfer overheads" [^35^]（高）。Edge 部署经验：不支持的算子会把子图打断成"fallback islands"，每个边界引入"tensor reformatting, precision conversions, memory copies, and synchronization. These costs can exceed the compute time saved by acceleration" [^37^]（中）。→ **对 CIM+GPU 混合系统的直接教训：按层交替映射（数字-模拟-数字-模拟）会产生每层的激活搬运与 ADC/DAC 之外的格式转换，可能吃光 CIM 收益；应尽量让模拟段连续成块。**

18. **CIM 专用工具链**：AIHWKit（HWA 训练/注入噪声） [^21^]；DNN+NeuroSim、CiMLoop、ALPINE、3D-CiM-LLM-Inference-Simulator（映射评估） [^20^]；LionHeart（精度约束的逐层映射搜索，O(L) 复杂度启发式，先排最大 MAC 层） [^25^]；MPS（每层 analog/INT8/FP16 三条路的 supernetwork + 梯度 Pareto） [^20^]；代理指标 analog MAC ratio、digital weight size [^20^]（均高）。
19. **运行时异构调度（数字 GPU/NPU + PIM）**：NeuPIMs 指出朴素 NPU+PIM 的两大问题——PIM "blocked mode" 无法并发、GEMM-GEMV 数据依赖；解法：dual row buffer 让 PIM 计算与常规访存并发 + sub-batch interleaving 运行时调度 + 内存控制器交错 PIM/访存命令（PIM_GEMV 复合命令降低命令开销）；vs NPU-only 2.3×、vs 朴素 NPU+PIM 1.6× [^33^]（高）。AttAcc/AQPIM：GPU↔PIM 分工 attention，量化收益分解显示"elimination of the offloading penalty yields 11.39×… roughly aligns with the gap between GPU's memory bandwidth (3.35TB/s) and PCIe bandwidth (256GB/s)"；且 attention 卸载后 "the un-accelerated operations (e.g. FFN) dominate the decoding latency" [^34^]（高）。TransPIM：token-based dataflow 替代 layer-based dataflow，避免层间激活回搬，数据流本身快 4.6× [^34^]（高）。MoNDE：热专家搬 GPU、冷专家在内存内算 [^43^]（高）。

---

## 层敏感度证据

按模块类型组织（量化文献=数字域代理证据；AIMC 噪声文献=模拟域直接证据）。**敏感度结论对"层-器件映射"的含义：越敏感 → 越应留数字/高精度；越耐噪 → 越适合模拟 MAC。**

### E-1 Embedding（输入嵌入）
- 工程惯例保高精度：NVFP4 "keep … embedding layers, the LM head, and Attention calculations in high precision" [^41^]（高）；llama.cpp Q4_K_M 等主流格式把 embedding 保 Q5_K/Q6_K，因为"errors in the embedding propagate through every subsequent layer" [^47^]（低-中）。
- 但 embedding 参数量大、每次 decode 只查一行 → 移动端把它放 Flash/片外 bf16 存储："The weights of the embedding layer account for approximately 15% of the total model weight. Since only a small portion of these weights are utilized during each decoding step, they are stored in Flash memory… allows for the use of bfloat16 storage" [^50^]（高）。→ **对 NAND CIM：embedding 是"存储在 NAND、查表式读取"，不参与 MAC，天然适合 NAND 的高密度而非其计算。**

### E-2 Attention QKV 投影
- GPT-2 AIMC 画像：Q/K/V 投影全程中等敏感（Δ≈1–3），是"可放模拟但需逐层确认"的灰色带 [^20^]（高）。
- KV cache 量化侧：K 比 V 敏感——"K-cache norms are 10-20x more sensitive to quantization error than V-cache norms"；早期层 KV 最敏感 [^39^]（中）。
- 异常激活在大模型上蔓延到 QKV："for big enough transformer-based language models they start appearing after every linear layer, including query, key, and value projection layers" [^11^]（高）。

### E-3 Attention 输出投影（O proj）
- **最深的灰色带：敏感度随深度剧烈变化**。GPT-2 AIMC：block0 c_proj 是全模型最敏感（Δ=33.1，"the first point at which the residual stream aggregates attention-weighted representations; noise injected here propagates through all subsequent blocks"）；而 block2–10 的 c_proj 最耐噪（Δ<0.22）；"the output projection is either the most or least sensitive depending on block depth" [^20^]（高）。
- GPU 侧 O-Proj 在 decode 是 execution-bound 而非 memory-bound [^4^]（高）——即使放模拟/数字的选择不同，性能收益结构也与 FFN 不同。

### E-4 Softmax / Attention 分数
- 非 MAC（exp+归约+除法），CIM 无法高效执行；需数字 SFU/ACU/NPU [^38^][^34^][^30^]（高）。
- 量化侧：softmax 输出常被保 INT16 或不量化（QAT 实践："we use INT16 precision for … the query tensor and the softmax output tensor"） [^44^]（高）。FlashAttention 把 softmax 融进 kernel 正是为了避免 HBM 往返 [^5^]（高）。

### E-5 FFN（up/gate/down）
- 参数与权重流量大头（2/3 参数 [^8^]）；decode 中 FFN-Up 是最典型 memory-bound GEMV [^4^] → **CIM 最佳候选（权重驻留收益最大）**。
- 敏感度：GPT-2 AIMC 画像中 FFN up（block1-2: Δ=14.0/11.8）与 FFN down（block0: Δ=12.8）构成"第二梯队"敏感层 [^20^]（高）；但 middle-block FFN 普遍耐噪，"Middle MLP layers are consistently robust" [^47^]（低-中）。
- 激活 outlier 集中在 FFN 输出（小模型 BERT 起即是） [^11^]（高）→ 模拟域做 FFN 时，ADC 输入动态范围被 outlier 拉大，是 NAND/PCM CIM 的实际痛点（与 KF-2 的 I/O 噪声结论呼应 [^21^]）。

### E-6 LayerNorm / residual
- 逐元素+归约，FLOPs 可忽略但访存与同步开销不可忽略：GPU 上 LN 在 decode 的 sync stall 11.0%→27.7% [^4^]；BERT 单层 LN 占 11–17% 运行时 [^6^]（高）。CIM 一律放数字 [^38^][^31^]（高）。
- residual stream 动态决定逐层敏感度的新观点：DynamicPTQ 用 Jump Ratio/Historical Feature SNR 找"残差更新突变"的层，只对这些层升 A8，其余保 A4 [^18^]（中）。

### E-7 LM head / logits
- 公认敏感、保高精度："the LM head (Δ=6.4) and block 11's attention output (Δ=7.3) confirm that the last layer is precision-sensitive, consistent with the first-last pattern observed in CNNs, but the most sensitive layer overall is an internal projection" [^20^]（高）；NVFP4 惯例保 HP [^41^]（高）；lm_head 权重敏感度实测为中位层 8× [^47^]（低-中）。
- 移动端 MNN-LLM：embedding bf16、层与 LM head 权重 int4/int8、激活 int8（W4A8/W8A8）[ ^50^]（高）。

### E-8 逐层排序的直接证据汇总（"第一层/最后一层最敏感"命题）
| 证据 | 结论 | 置信度 |
|---|---|---|
| CNN 量化惯例（ISQuant 综述）| 第一层不量化或给大位宽，"the first layer is very sensitive" [^13^] | 中 |
| ViT QAT（Quantization Variation）| patch-embed 首层与分类末层固定 8-bit [^14^] | 高 |
| Hybrid-Net 实验（Purdue 论文）| ResNet-32/CIFAR-100：首层二值化 44.8% vs 末层二值化 56.9%（首层更敏感）；末层全精度→二值掉 ~7pt [^49^] | 中 |
| LLM-pruner / Shortened LLaMA | 首末层剪枝掉点最大；保留前 4+末 2 块 [^17^] | 高 |
| KV cache（TurboAngle MixedKV）| 早期层（0-3/0-7）普遍最敏感 [^39^] | 中 |
| AIMC first-last 启发式 | "widely used"：首末层放数字 [^20^] | 高（作为惯例存在性） |
| LionHeart 实测 | 第一层通常最敏感（仅 18% 配置首层留模拟）；末层 62% 可留模拟；**中间层有时比末层更敏感**；FLMS 行为"unpredictable" [^25^] | 高 |
| GPT-2 AIMC 画像 | 最敏感=block0 内部投影；末块 attn out 与 LM head 中等敏感；中间块 attn out 最耐噪 [^20^] | 高 |
| Nature Comms HWA（ImageNet CNN）| 只对"少数最敏感层"做 PCM 噪声豁免即可达 99% iso-accuracy（ResNet-50/18/DenseNet-121 各只需几层）；敏感层集合因模型而异 [^21^] | 高 |
| FastEWQ | "late-stage semantic integration layers exhibit unexpected quantization tolerance"→ 把末几块压到 4-bit [^19^] | 中 |
| vLLM 社区（混合精度 KV 提案）| "middle layers of Llama-3 may be more sensitive to precision loss with e4m3, while early layers may better suit e5m2" [^42^] | 低（issue 陈述） |
| 架构拓扑（Nature Comms）| CNN 对 AIMC 非理想最敏感、RNN 最耐噪、BERT/transformer 可达 iso-accuracy [^21^] | 高 |

### E-9 模拟 CIM 上的混合精度/层映射先例（2016–2026）
- **ISAAC（ISCA'16）**：每层专用 crossbar 流水，16-bit 权重/激活经 bit-slicing（2-bit/cell × 多 cell + shift-add）实现；ADC/DAC 约占芯片一半功耗；"out-perform DaDianNao significantly in early layers, while the last layers suffer from under-utilization" [^22^]（高）。
- **PRIME（ISCA'16）**：ReRAM 主存内计算，FF 子阵列可重构（存储/计算），2×3-bit 输入拼 6-bit、2×4-bit cell 拼 8-bit 权重；vs NPU ~2360× 性能、~895× 能效 [^23^]（高）。
- **DIANA（ISSCC'22）**：数字+模拟混合 SoC（模拟核做容错 MVM、数字核做敏感层/非线性）——Lammie 综述引为混合架构代表 [^20^]（中）。
- **Hessian-driven（Dash et al., TCAD'21/22）**：免全 Hessian 的敏感度度量，"identify and protect the 'important' network parameters while allowing large variations in unprotected parameters"，用实测 RRAM 数据在 ResNet/MobileNetv2/DenseNet 验证 [^24^]（高）。
- **PAWDD（ISOCC'22）/LionHeart（TETC'25）/MPS（Nat. Commun.）/OSA-HCIM（ASP-DAC'24）/Harmonica（IPDPS'24）/CIMQ（TCAD'24）/ODiMO/RH-IMC**：粒度从整层到逐权重；起点分 FP 权重直映射 vs HWA 训练后"选择性提升敏感层到高精度 CU" [^20^][^25^]（高）。
- **3D NAND 线**：Wang et al. TVLSI'19（VMM） [^26^]；Lue et al. IEDM'19 nvCIM + Hsu et al. IMW'20 校准/read-disturb [^27^]；Shim & Yu MEMSYS'21 架构设计 [^28^]；3D-FPIM MICRO'22、S-FLASH TC'21 [^29^]；Cambricon-LLM MICRO'24（NPU+flash chiplet 分工） [^30^]；AiF ISCA'25、KVNAND'25、NVLLM'26（IFC-NPU 范式） [^31^]；NASiC'26（CAM 选专家 + 多比特 cell 的 MoE NAND CIM） [^32^]（均高）。

## 调度机制

### S-1 编译期：图划分与层-器件分配
1. **通用 DL 编译器/运行时（ONNX Runtime、Glow、TVM-BYOC）**：
   - ONNX Runtime：EP 通过 `GetCapability()` 上报可执行节点，运行时按优先级贪心分配"最大连续子图"，CPU EP 兜底 [^36^]（中）。
   - BYOC 批评：ONNX Runtime "executes the graph operator-by-operator, which may introduce unnecessary data transfer overheads"；Glow 允许厂商自定义 graph partitioner + codegen [^35^]（高）。
   - Edge 经验法则：unsupported op 产生 "fallback islands"，边界代价 = "tensor reformatting, precision conversions, memory copies, and synchronization… can exceed the compute time saved by acceleration"；建议重写算子、静态 shape、把后处理显式留 CPU [^37^]（中）。
   - **对 CIM 混合精度映射的推论**：层-器件划分的目标函数必须包含跨设备搬运项；数字-模拟交替（如 LN→CIM→LN）每层都产生 DAC/ADC + 格式转换 + 同步，应聚合成"连续模拟段 + 连续数字段"。
2. **CIM 专用映射工具链（编译期层-器件分配）**：
   - 四阶段统一工作流：硬件刻画（tile 配置、ADC/DAC、互连、代理模型）→ 精度敏感度剖析（perturbation O(L) 次前向 / Hessian / activation saliency）→ 架构感知映射（启发式/解析/学习型 supernetwork）→ 系统级评估（DNN+NeuroSim、CiMLoop、ALPINE、3D-CiM-LLM-Sim） [^20^]（高）。
   - 代理指标：analog MAC ratio（模拟 MAC 占比）、digital weight size（数字端权重足迹），"effective when validated against system-level simulation" [^20^]（高）。
   - 粒度权衡："Coarser granularity simplifies dataflow and reduces inter-unit communication… finer granularity can improve accuracy–energy trade-offs at the cost of increased interconnect traffic and system complexity"；对 transformer 推荐 projection 级 [^20^]（高）。
   - HWA 训练作为映射前置：AIHWKit 注入噪声重训，5/11 个负载（含 BERT）达 1h 后 99% iso-accuracy；再"选择性提升"少数敏感层到数字即可补救大 CNN [^21^]（高）。

### S-2 运行期：异构并发与数据搬运控制
3. **NPU↔PIM 并发调度（NeuPIMs, ASPLOS'24）**：
   - 问题：PIM "blocked mode"（同一时刻 NPU 或 PIM 只有一个能干活）+ GEMM/GEMV 数据依赖 [^33^]。
   - 机制：dual row buffer（PIM 计算与常规访存并行）；sub-batch interleaving（两个子批的 GEMM 与 GEMV 互相填充）；内存控制器交错调度 PIM/访存命令（"NeuPIMs prioritize PIM commands over memory read/write commands"）；复合命令 PIM_GEMV 摊薄命令带宽 [^33^]。
   - 收益：vs NPU-only 2.3×、vs 朴素 NPU+PIM 1.6×；GPT3-7B batch8 ~3k tok/s @ ~76W [^33^]（均高）。
4. **GPU↔PIM attention 卸载（AttAcc/AQPIM）**：attention 的 QK^T/AV（GEMV）放 PIM，softmax 放 PIM 侧 BufferPE（PIM_SFM 命令），FFN/投影留 GPU；offload 惩罚消除 = 11.39×，恰≈HBM 3.35TB/s 与 PCIe 256GB/s 的带宽差 [^40^]（高）。→ **跨设备链路（PCIe/CXL/die-to-die）带宽决定"卸载边界"划在哪才划算。**
5. **数据流层调度（TransPIM, HPCA'22）**：token-based sharding 替代 layer-based dataflow——"the token-based dataflow avoids the memory traffic for reused data"，各 bank 独立跑自己 token 分片的全部层；配套 ACU 做 reduction/softmax；数据流优化本身 4.6×，端到端 vs GPU 22–115× [^34^]（高）。
6. **NAND CIM 系统的软硬分工**：
   - Cambricon-LLM："hardware-tiling strategy that minimizes the data movement overhead between NPU and NAND flash chip"；flash 做精确轻量片上计算 + on-die ECC，NPU 做矩阵运算协作与 special function（softmax/LN 等） [^30^]（高）。
   - IFC-NPU 范式（KVNAND 等）："flash is used solely for storing weights, with KV caches maintained in DRAM. IFC subsystems accelerate memory-bound operations involving model weights in the decode phase. The NPU handles the prefill phase and nonlinear computations" [^31^]（高）。
   - NASiC：把 MoE 路由（专家选择）与 CIM 计算融合——CAM 掩码在单周期内完成 expert 筛选+激活专家 MAC，避免动态稀疏造成的冗余计算 [^32^]（高）。
   - MoE offloading 对照（MoNDE）：热专家搬 GPU、冷专家留内存内计算，达到近似无限显存 GPU 的延迟 [^43^]（高）。

### S-3 搬运代价的量级（设计约束）
- 数据搬运能耗：现代数据密集型系统中片外搬运占系统能耗 >60%（行业统计口径） [^43^ 引述，低-中]。
- GPU↔CPU offload：PCIe 256GB/s vs HBM 3.35TB/s → 13× 带宽差、11.39× 端到端惩罚 [^40^]（高）。
- 模拟域接口税：ISAAC ADC 约占芯片功耗一半 [^22^]（高）；ADC/DAC/输出噪声是精度最大杀手 [^21^]（高）。
- 子图边界税：fallback island 的格式转换/拷贝/同步可超过加速收益 [^37^]（中）；ONNX op-by-op 引入不必要搬运 [^35^]（高）。
- PIM 内部：Transformer 长向量 reduction 在 PIM-only 方案占 23–32% 时间（bank 内搬运重排数据） [^34^]（高）。

---

## 争议

### C-1 "前几层数字、后几层模拟"是否最优？——只有"第一层"证据稳，"后几层"证据弱甚至反例
- **支持"首层必须保"**：CNN/ViT/LLM 三域一致（首层不量化惯例 [^13^]、ViT 首末固定 8-bit [^14^]、Hybrid-Net 首层二值化掉 20pt [^49^]、LionHeart 仅 18% 配置首层留模拟 [^25^]、KV 早期层最敏感 [^39^]）。机理：误差在残差流入口注入会穿过所有后续层 [^20^]。
- **反对"末层可以随便放模拟"的另一派**：LLM-pruner/Shortened LLaMA 显示首末层都最重要 [^17^]；NVFP4 惯例 LM head 保 HP [^41^]；GPT-2 AIMC 中 LM head Δ=6.4、block11 attn out Δ=7.3，确为敏感 [^20^]。
- **但 LionHeart 实测末层 62% 配置可留模拟，中间层有时比末层更敏感，FLMS 行为"unpredictable"** [^25^]；FastEWQ 甚至发现末几块"unexpected quantization tolerance"，主动把末块压 4-bit [^19^]；vLLM 社区观察到 Llama-3 中间层对 e4m3 更敏感 [^42^]（低）。
- **综合判断（本调研）**：可靠结论是"**边界层（首层/embedding/LM head）敏感、中间 MLP 普遍耐噪**"；但"单调递减的前后排序"不成立——GPT-2 上最敏感的是 block0 的内部投影，中间层注意力输出最耐噪，敏感度是**投影类型×深度**的二维函数 [^20^]。置信度：高。

### C-2 敏感度度量：Hessian vs 一阶梯度 vs 激活统计 vs 扰动实验——互相拆台
- HAWQ 系：二阶曲率排层敏感度 [^12^][^48^]；LLM-MQ：指出 LLM 约 15% 层 Hessian 非半正定、二阶失真，改用一阶梯度+ILP [^15^]；CMPQ：反指收敛 LLM 梯度≈0，LLM-MQ 一阶信号无法区分层敏感度，改 channel-wise [^16^]；KV 量化侧 RateQuant：gradient-based 敏感度"qualitatively superior to activation-based" [^39^ 引文，中]。AIMC 侧 Dash et al. 用免全 Hessian 的近似 [^24^]；Lammie 用 one-at-a-time 扰动（承认不捕捉层间交互） [^20^]。**没有公认度量；跨度量排序结果可能不同。**置信度：高。

### C-3 Attention 比 FFN 更敏感吗？
- 一派（量化综述/熵加权）："attention blocks typically require 2-4x higher precision than feedforward layers" [^19^ 引述，中-低]；QK 保精度优先级高 [^39^]。
- 另一派（AIMC 实测）：attention 输出投影既可能全模型最敏感（block0）也可能最耐噪（block2-10），QKV 只中等敏感；FFN up/down 的早期块反而构成第二敏感梯队 [^20^]；outlier 激活最强在 FFN 输出 [^11^]。**结论依赖模型、噪声模型与粒度。**置信度：中高。

### C-4 激活更难量化 vs 权重-only 就够？
- SmoothQuant/Bondarenko/ZeroQuant-V2：激活 outlier 是主矛盾，W8A32 远好于 W8A8 [^10^][^11^][^45^]；LLM.int8 必须 FP16 outlier 通道 [^9^]。
- 权重-only 系（GPTQ/AWQ/OWQ 等）：W4A16 已接近无损，且权重-only 不省计算能耗 [^45^ 引述]。**对 CIM 的含义不同：模拟 CIM 的"权重误差"是静态可校准的，而"激活/IO 噪声"是动态的——Nature Comms 实测恰恰是 I/O 侧噪声杀伤最大 [^21^]，与量化文献"激活更难"同向。**置信度：高。

### C-5 HWA 训练能否消除层映射问题？
- 乐观：HWA 训练后 5/11 负载达 iso-accuracy，BERT 在列 [^21^]；大 CNN 只需豁免"少数最敏感层" [^21^]。
- 谨慎：WideResNet-50 即使全豁免 PCM 噪声仍差 ~2%（残余系统噪声），"non-PCM nonidealities would need to be improved" [^21^]；Lammie 指出 PCM 漂移会让静态映射"within hours"失效，需要运行时自适应 [^20^]；LionHeart 显示模拟 MAC 占比越高，漂移鲁棒性越差 [^25^]。**层映射仍必要，且需考虑时间维度。**置信度：高。

### C-6 CIM 做 LLM：decode-only offload vs 全模型 offload
- 主流（NeuPIMs/AttAcc/IFC-NPU）：只把 decode 的 GEMV/attention 给 PIM/CIM，prefill 与非线性留数字 [^33^][^40^][^31^]；
- 反例（TransPIM/HPIM）：全模型（含 prefill）用 token-based 数据流在 PIM 上跑，声称更大收益 [^34^][^2^]；
- 注意点：attention 卸载后 FFN 重新成为 decode 瓶颈 [^40^]——**Amdahl 定律决定卸载边界**。置信度：高。

### C-7 剪枝/稀疏化 vs 量化的层敏感度结论不完全一致
- 剪枝侧（ShortGPT/LLM-pruner/Shortened LLaMA）：中间层冗余大、首末层不可动 [^17^]；量化侧存在"末层反而耐 4-bit"（FastEWQ [^19^]）与"中间层更敏感"（vLLM [^42^]，LionHeart [^25^]）的反例。**两种扰动（删除整层 vs 加性噪声）敏感度排序不可直接互推。**置信度：中。

---

## 参考文献（含原文摘录 / URL / 日期 / 置信度）

[^1^] MxGLUT (arXiv:2607.01607, 2026-07-02)。摘录："the prefill phase is inherently compute-bound, dominated by large matrix-matrix GEMMs… During the decode phase… computation degenerates into a memory-bound GEMV-like operation"。https://arxiv.org/html/2607.01607v1 （高）
[^2^] HPIM (arXiv:2509.12993, 2025-09)。摘录："the overall execution is overwhelmingly dominated by the GEMV-centric decode stage (73.8%)"；"decoding stage in single-batch inference predominantly operates in the memory-bound regime"。https://arxiv.org/html/2509.12993v3 （高）
[^3^] FP8 LLM Inference TCO (arXiv:2502.01070, 2025-07-24)。摘录："two distinct phases: a compute-bound prefill phase and a memory-bound decode phase"；"the FLOPs for attention increase linearly with sequence length"。https://arxiv.org/html/2502.01070v4 （高）
[^4^] A Systematic Characterization of LLM Inference on GPUs (arXiv:2512.01644, 2025-12)。摘录："FFN-Up is memory-bound, with Memory Dependency reaching 58%… O-Proj/FFN-Down are execution-bound… ≈130 live registers"；"LayerNorm shows significantly increased Synchronization stalls (from 11.0% to 27.7%)"。https://arxiv.org/html/2512.01644v1 （高）
[^5^] PALUTE (arXiv:2606.08891, 2026-06-08)。摘录："GEMM contributes 99.8% of FLOPs but only 61.0% of runtime, while Softmax/LayerNorm/element-wise kernels contribute <0.2% FLOPs yet consume ∼39% runtime (Ivanov et al., 2021)"。https://arxiv.org/html/2606.08891v1 （高）
[^6^] ByteTransformer (arXiv:2210.03052, 2022-10)。摘录："the compute-bound GEMM operations account for 61% and 40% of the total execution time… attention accounts for 49%… (layernorm, add bias and activation) only take up 11%-17%"。https://ar5iv.labs.arxiv.org/html/2210.03052 （高）
[^7^] TurboTransformers (arXiv:2010.05680, 2020-10)。摘录："the GEMM kernels account for 70.31%… Softmax… 1.85%… LayerNorm… 2.71%；seq=400：GEMM 82.80%, Softmax 4.57%, LayerNorm 3.64%"。https://ar5iv.labs.arxiv.org/html/2010.05680 （高）
[^8^] Geva et al., FFN Are Key-Value Memories (arXiv:2012.14913, 2020-12-29)。摘录："Feed-forward layers constitute two-thirds of a transformer model's parameters"。https://arxiv.org/abs/2012.14913 （高）
[^9^] Dettmers et al., LLM.int8() (arXiv:2208.07339, 2022-08-15)。摘录："isolates the outlier feature dimensions into a 16-bit matrix multiplication while still more than 99.9% of values are multiplied in 8-bit"；"emergence of large magnitude features across all layers… occurs suddenly between 6B and 6.7B parameters (65%→100% layers)"。https://arxiv.org/abs/2208.07339 （高）
[^10^] Xiao et al., SmoothQuant (arXiv:2211.10438, 2022-11-18)。摘录："weights are easy to quantize while activations are not… migrates the quantization difficulty from activations to weights"。https://arxiv.org/abs/2211.10438 （高）
[^11^] Bondarenko et al., Quantizable Transformers (arXiv:2306.12929, 2023-06)。摘录："The strongest in magnitude outliers typically appear at the output of the feed-forward network, FFN, although… they start appearing after every linear layer, including query, key, and value projection layers"。https://arxiv.org/html/2306.12929v1 （高）
[^12^] Gholami et al., Survey of Quantization Methods (arXiv:2103.13630, 2021-03)。摘录："HAWQ introduces an automatic way to find the mixed-precision settings based on second-order sensitivity… the trace of the Hessian can be used to measure the sensitivity of a layer"。https://arxiv.org/pdf/2103.13630v3.pdf （高）
[^13^] ISQuant (arXiv:2407.11037, 2024-07)。摘录："academic research is always make the first layer of model unquantized or allocate a big bits number, because generally speaking, the first layer is very sensitive to the bits number"。https://arxiv.org/html/2407.11037v1 （中）
[^14^] Quantization Variation (arXiv:2307.00331, 2023-07)。摘录："For ViTs, due to the first (patch embedding) and the last (classification) layer are more sensitive to perturbation compared to intermediate layers, we fix their bitwidth to 8-bit following previous work"。https://arxiv.org/html/2307.00331v2 （高）
[^15^] Li et al., LLM-MQ (NeurIPS 2023 ENLSP Workshop)。摘录："in LLMs, the hessian matrix of ~15% layers are not positive semi-definite… We focus on the first-order information… model the bit-width allocation task as the following integer programming problem"；另保留 0.5% outlier FP16。https://nicsefc.ee.tsinghua.edu.cn/%2Fnics_file%2Fpdf%2F5c805adc-b555-499f-9882-5ca35ce674b5.pdf （高）
[^16^] CMPQ (arXiv:2410.13056, 2024-10)。摘录："the gradient of a converged LLM is approximately zero, making it challenging for LLM-MQ to effectively differentiate the sensitivities of each layer"。https://arxiv.org/html/2410.13056v2 （高）
[^17^] Extreme Pruning Mixed Sparsity (arXiv:2503.11164, 2025-03)。摘录："LLM-pruner identifies that the first and last layers have a profound effect on model performance… Shortened LLaMA retains the first four and last two blocks, excluding them from pruning candidates"。https://arxiv.org/html/2503.11164v1 （高）
[^18^] DynamicPTQ (arXiv:2606.12487, 2026-06-10)。摘录："introducing Jump Ratio and Historical Feature SNR to identify layers where 4-bit activation quantization becomes unstable… applies 8-bit activation precision only to these sensitive layers"。https://arxiv.org/html/2606.12487v1 （中）
[^19^] FastEWQ / Universality of Layer-Level EWQ (arXiv:2503.04704, 2025-03)。摘录："the 4-bit/8-bit FastEWQ mixed quantization specifically targets final transformer blocks with the highest execution indices for maximal compression, capitalizing on our observation that late-stage semantic integration layers exhibit unexpected quantization tolerance"；并引述"attention blocks typically require 2-4x higher precision than feedforward layers"。https://arxiv.org/html/2503.04704v2 （中）
[^20^] Lammie, Heterogeneous Mapping for AIMC: A Unified Workflow (arXiv:2606.02672, 2026-06-01, IEEE)。摘录："limited effective precision (typically 3–8 bits)"；"the widely used first-last scheme, which maps the first and last layers to digital CUs"；"Sensitivity is dominated by 4 of 49 projections, with the first decoder block's attention output dominating by an order of magnitude (Δ=33.1)… 40 of 49 projections have Δ<3"；"projection-level mapping appears to strike a practical balance"。https://arxiv.org/html/2606.02672v1 （高）
[^21^] Rasch et al., HWA Training (Nature Communications 14, 2023-08-30)。摘录："nonidealities that effectively add noise to the inputs or outputs—such as ADC and DAC resolution, additive output noise… have the largest impact on the DNN accuracy"；"for ResNet-50, ResNet-18, and DenseNet-121 reducing PCM noise in just a few layers allows an AIMC crossbar model to achieve iso-accuracy"；"CNNs are the most-sensitive DNN topology, while RNNs are the least-sensitive"；BERT 可达 iso-accuracy。https://www.nature.com/articles/s41467-023-40770-4 （高）
[^22^] Shafiee et al., ISAAC (ISCA 2016)。摘录："the ADCs accounting for nearly half the chip power"；"a crossbar is dedicated to process a set of neurons in a given CNN layer… pipelining"；"14.8×, 5.5×, and 7.5× in throughput, energy, and computational density"。https://users.cs.utah.edu/~rajeev/pubs/isca16.pdf （高）
[^23^] Chi et al., PRIME (ISCA 2016)。摘录（经二手引述核实）："PRIME improved performance by approximately 2360x and energy consumption by approximately 895x compared to a state-of-the-art neural processing unit design"；6-bit 输入/8-bit 权重拼接方案。https://nicsefc.ee.tsinghua.edu.cn/nics_file/pdf/publications/2016/ISCA16_203.pdf （高）
[^24^] Dash et al., Hessian-driven Mixed-Precision ReRAM PIM (IEEE TCAD 41(4), 2021-05-07)。摘录："a Hessian-based sensitivity metric that can be computed without computing or storing the full Hessian to identify and protect the 'important' network parameters while allowing large variations in unprotected parameters"。https://ieeexplore.ieee.org/document/9425549 （高）
[^25^] Lammie et al., LionHeart (arXiv:2401.09420, 2024-01-17; IEEE TETC 2025)。摘录："The behavior of the FLMS configuration, however, is unpredictable… For 62% of configurations, the last FC layer is retained in analog. However, for only 18%, the first CONV layer is retained. This means that the first layer is usually the most sensitive. Intermediary layers are observed to be more sensitive than the last layer"；runtime/能效收益 >6×。https://arxiv.org/html/2401.09420v1 （高）
[^26^] Wang et al., Three-Dimensional NAND Flash for Vector-Matrix Multiplication (IEEE TVLSI 27:988-991, 2019)。3D NAND 阵列内做 VMM 的早期工作（经 NASiC 参考文献核实条目）。引用条目见 https://arxiv.org/html/2605.23294 参考文献 [163]（高）
[^27^] Lue et al., 3D NAND nvCIM (IEDM 2019)；Hsu et al., nvCIM calibration & read disturb (IMW 2020)。Macronix 3D NAND nvCIM DNN 加速器及其校准分析（经 NASiC 参考文献核实条目）。同上 https://arxiv.org/html/2605.23294 参考文献（高）
[^28^] Shim, Jiang, Peng, Yu, Architectural Design of 3D NAND Flash Based Compute-in-Memory for Inference Engine (MEMSYS 2021, p.20)。（经 Wiley 综述参考文献核实条目）https://advanced.onlinelibrary.wiley.com/doi/pdfdirect/10.1002/aisy.202501499 （高）
[^29^] Lee et al., 3D-FPIM (MICRO 2022, pp.1359-1376)；Kang et al., S-FLASH (IEEE TC 2021)。3D NAND in-situ PIM 极致能效 DNN 系统；NAND 位级稀疏 DNN 加速（经多篇参考文献核实条目）。（高）
[^30^] Yu et al., Cambricon-LLM (arXiv:2409.15654, 2024-09-24; MICRO 2024)。摘录："the NPU collaborates with the flash chip for matrix operations and handles special function computations beyond the flash's on-die processing capabilities"；"hardware-tiling strategy that minimizes the data movement overhead between NPU and NAND flash chip"；"3.44 token/s (70B), 36.34 token/s (7B), over 22× to 45× faster than existing flash-offloading"。https://arxiv.org/abs/2409.15654 （高）
[^31^] KVNAND (arXiv:2512.03608, 2025-12)。摘录："IFC subsystems accelerate memory-bound operations involving model weights in the decode phase. The NPU handles the prefill phase and nonlinear computations… flash is used solely for storing weights, with KV caches maintained in DRAM"。https://arxiv.org/html/2512.03608v1 （高）
[^32^] Xu et al., NASiC (arXiv:2605.23294, 2026-05-22)。摘录："fuses the dynamical expert selection through CAM-based masking mechanism and activated expert computation through CIM into a single computation cycle"；"modified thermometer encoding scheme… in-situ multibit input expansion"；"4∼114.8× improved performance and 3.9∼70× improved energy efficiency over state-of-the-art designs"。https://arxiv.org/html/2605.23294v1 （高）
[^33^] Heo et al., NeuPIMs (arXiv:2403.00579, 2024-03-01; ASPLOS 2024)。摘录："existing PIMs typically operate in a 'blocked' mode, allowing only either NPU or PIM to be active at any given time"；"dual row buffers… sub-batch interleaving"；"NeuPIMs achieves 2.3× and 1.6× throughput improvement"。https://arxiv.org/abs/2403.00579 （高）
[^34^] Zhou et al., TransPIM (HPCA 2022; NSF PAR 10345536)。摘录："TransPIM adds lightweight modifications… auxiliary computing units (ACUs) within each memory bank to perform vector reduction and Softmax function that cannot be efficiently processed by bit-serial row-parallel PIM operations"；"the token-based dataflow avoids the memory traffic for reused data… 4.6× faster"；PIM-only 时 reduction 占 23-32% 时间。https://par.nsf.gov/servlets/purl/10345536 （高）
[^35^] BYOC (arXiv:2105.03215, 2021-05)。摘录："ONNX runtime executes the graph operator-by-operator, which may introduce unnecessary data transfer overheads"；"All of them provide a mechanism to partition a deep learning model and partially offload the model to the accelerator"。https://ar5iv.labs.arxiv.org/html/2105.03215 （高）
[^36^] ONNX Runtime 架构分析（Uplatz 博客, 2025-11-29）。摘录："assigns it the largest possible contiguous subgraph(s) that it is capable of executing… default CPU Execution Provider… acts as a universal fallback"。https://uplatz.com/blog/onnx-runtime-a-comprehensive-analysis-of-architecture-performance-and-deployment-for-production-ai/ （中，二手）
[^37^] Edge AI 课程（Cursa）。摘录："Any unsupported operator breaks the subgraph into multiple segments. Each segment boundary can introduce: tensor reformatting, precision conversions, memory copies, and synchronization. These costs can exceed the compute time saved by acceleration"。https://cursa.app/en/page/hardware-aware-optimization-and-accelerator-utilization （中，二手）
[^38^] Trilinear CIM (arXiv:2604.07628, 2026-04-08)。摘录："dedicated functional units (Softmax, LayerNorm, Activation) handle operations incompatible with analog computation. This split compute model—analog multiplication for attention scores, digital for non-linearities—maximizes energy efficiency"。https://arxiv.org/html/2604.07628v1 （高）
[^39^] TurboAngle/MixedKV (arXiv:2603.27467, 2026-03)。摘录："early layers (0-3 or 0-7) are universally the most sensitive to quantization"；"K-cache norms are 10-20x more sensitive to quantization error than V-cache norms"；存在"negative transfer layers"。https://arxiv.org/pdf/2603.27467 （中）
[^40^] AQPIM (arXiv:2604.18137, 2025-04-10)。摘录："The elimination of the offloading penalty yields a performance gain of 11.39×. This roughly aligns with the gap between GPU's memory bandwidth (3.35TB/s) and PCIe bandwidth (256GB/s)"；"the un-accelerated operations (e.g. FFN) dominate the decoding latency"。https://arxiv.org/html/2604.18137v1 （高）
[^41^] Four Over Six / NVFP4 (arXiv:2512.02010, 2026-05-07)。摘录："Following from standard practice with PTQ, we keep sensitive layers and operations, including embedding layers, the LM head, and Attention calculations in high precision"。https://arxiv.org/html/2512.02010v4 （高）
[^42^] vLLM GitHub Issue #22195（混合精度 KV 提案, 2025-08-04）。摘录："middle layers of Llama-3 may be more sensitive to precision loss with e4m3, while early layers may better suit e5m2's dynamic range"。https://github.com/vllm-project/vllm/issues/22195 （低）
[^43^] LLM Inference Acceleration: A Comprehensive Hardware Perspective (arXiv:2410.04466, 2024-09-30)。摘录：NeuPIMs/IANUS/Cambricon-LLM/MoNDE/AttAcc 分类与数据；"MoNDE reduces the volume of MoE parameter movement by transferring only the hot experts to the GPU, while computing the remaining cold experts inside the host memory device"。https://arxiv.org/html/2410.04466v4 （高）
[^44^] HW-SW Co-design of Softmax and LayerNorm (arXiv:2510.17189, 2025-10)。摘录："Non-linear operations occupy significant parts in the transformer computation… These operations contribute a large fraction of run-time in transformer inference when implemented with costly FP32 arithmetic"。https://arxiv.org/html/2510.17189v1 （高）
[^45^] Deployment-Time Layer Profiling (arXiv:2604.21026, 2026-04-12)。摘录（引述）："ZeroQuant-V2 reports that activation quantization is more sensitive than weight quantization and studies layer-wise sensitivity for mixed-precision assignment"；LLM.int8 为运行时 outlier 分解而非逐层剖析。https://arxiv.org/html/2604.21026 （中高，二手引述）
[^46^] IMPQ (arXiv:2509.15455, 2025-06-07)。摘录："LLM-MQ uses first-order Taylor approximations to measure how sensitive each layer is to quantization… assigns bit-widths based on sensitivity scores"；对比 LIM/ZD/activation-norm 等打分基线。https://arxiv.org/html/2509.15455v1 （高）
[^47^] mlx-optiq 工程博客（Apple Silicon 混合精度实测, 2026-03-20）。摘录："lm_head has 8× the sensitivity of the median layer… Layer 0's KV cache is 56× more sensitive than average"；"The most sensitive layers are always at the boundaries: first / last transformer blocks, lm_head, and embedding layers. Middle MLP layers are consistently robust"。https://mlx-optiq.com/blog/not-all-layers-are-equal （低-中，非同行评审）
[^48^] HAWQ 描述（arXiv:2604.20079, 2026-04-22）。摘录："HAWQ assigns higher precision to layers that are more sensitive to perturbations in the loss surface, as measured by second-order curvature information, and allocates lower precision to more robust layers"。https://arxiv.org/html/2604.20079v1 （中，二手描述原始 HAWQ）
[^49^] Gonugondla et al. 博士论文（Purdue, Hybrid-Net 实验）。摘录：ResNet-32/CIFAR-100："Binary weights and activations"首层 44.79% vs 末层 56.93%（全精度基线 64.34%）——首层量化破坏远大于末层。https://hammer.purdue.edu/articles/thesis/15048828/files/28974048.pdf （中）
[^50^] MNN-LLM (arXiv:2506.10443, 2025-06)。摘录："The weights of the embedding layer account for approximately 15% of the total model weight… stored in Flash memory… use of bfloat16 storage, ensuring computational accuracy. Non-embedding parameters… quantized using int4 or int8… W4A8 or W8A8"。https://arxiv.org/html/2506.10443v1 （高）

---

### 给 NAND CIM 层-器件映射的落点建议（基于上述证据）
1. **必留数字/高精度**：embedding（查表，非 MAC，适合 NAND 存储而非计算 [^50^]）、第一层（尤其首块 attention 输出投影 [^20^][^25^]）、LM head/logits [^41^][^20^]、全部 softmax/LayerNorm/residual/gather（非 MAC [^38^][^34^]）、早期层 KV 相关投影（若做 KV 低精度 [^39^]）。
2. **优先放模拟 NAND MAC**：decode 阶段的 FFN up/gate（最大权重流、最 memory-bound [^4^][^8^]）、中间块 attention 输出投影（实测最耐噪 [^20^]）、中间层 QKV（中等耐噪，需校准 [^20^]）。
3. **映射方法**：先 perturbation 剖析（O(L) 前向）再映射，勿用 first-last 一刀切 [^20^][^25^]；用 analog MAC ratio 做代理指标 [^20^]；HWA 训练打底 + 选择性提升敏感层 [^21^]。
4. **系统层**：模拟段聚合成块以摊薄 ADC/DAC 与跨设备搬运 [^35^][^37^]；NPU 侧承接 prefill 与非线性、flash 侧承接 decode 权重 GEMV 的 IFC-NPU 分工是当前 NAND CIM 主流 [^30^][^31^]；跨设备链路带宽决定卸载边界（PCIe 教训 11.39× [^40^]）。
