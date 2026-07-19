# Dim-07 调研：影响 LLM 推理能力的最大因素 × LLM 相对图像分类模型的误差容忍度（2020–2026）

> 背景：NAND CIM 的模拟 MAC 噪声（读扰动、cell 电流波动、编程误差、retention）等效于权重/激活注入噪声。本报告回答：LLM 推理对这类误差容忍度如何？比图像分类（ResNet 等）更高还是更低？
> 调研日期：2026-07；检索 ≥15 次独立搜索（Google/arXiv/IEEE/Nature，英文为主）。引用格式 [^n^]，文末附 URL+日期+置信度。

---

## Key Findings

### KF-1 影响 LLM 推理能力的因素排序（总体结论）

**(a) 训练侧（决定基线能力）：数据量×数据质量 ≈ 参数量 ≫ 架构细节。**
Chinchilla 标度律表明参数与数据需等比扩展；70B 的 Chinchilla 靠 4 倍数据击败 280B 的 Gopher[^16^]。
> "The Chinchilla scaling law emphasizes data over model size … Chinchilla outperformed much larger models because it was trained on far more tokens … L(N,D)=406.4 N^{−0.34}+410.7 D^{−0.28}+1.69" — arXiv:2411.01042（转述 Hoffmann et al. 2022, arXiv:2203.15556）

**(b) 部署侧（决定实际精度损失）：对量化/噪声的敏感度排序为 激活(outlier) > KV cache（Key>Value）> 权重；层维度上 首/末层 & attention > 中间 FFN。**
- SmoothQuant 核心观察："weights are easy to quantize while activations are not"[^4^]；朴素 W8A8 把 OPT-175B 平均精度从 71.6% 打到 32.3%（≈随机），而同样 8-bit 的权重量化几乎无损[^4^][^6^]。
- ZeroQuant-V2 的结论（经综述转引）："activation quantization is generally more sensitive than weight quantization, especially in larger models (>10B)"[^13^]。
- KV cache 内部：**Key 比 Value 敏感得多**。QuaRot 消融（Llama-2-7B, WikiText-2 PPL）：K4V2=5.75 vs K2V4=8.06（FP16=5.47）→ "keys are more sensitive to quantization"[^9^]；KV-AdaQuant：同预算下 4bit-K+2bit-V 得 75.2% 精度，反过来 2bit-K+4bit-V 仅 54.7%，因 key 矩阵谱范数更大、量化误差被放大[^10^]。
- 层维度：LLaMA3-70B 的 W8 量化误差集中在**初始层**（max_abs 比其它层高 1–2 个数量级）[^14^]；首层/输出层与 attention 被多篇工作标记为高敏感，FFN 中间层最耐量化[^13^][^15^]。

**(c) 模型规模与训练程度是容忍度的"调节变量"：越大越耐受，训练越充分（token 越多）越敏感。**
- GPTQ：175B 上 4-bit 仅损 ≤0.25 PPL，"larger models generally appear easier to quantize"[^1^]。
- QiD 标度律（1500+ checkpoint）："models with larger sizes or fewer training tokens experience less quantization-induced degradation (QiD) … smaller models with extensive training tokens suffer significant QiD"，并预测 100T token 训练的未来模型低比特量化将"不可取"[^17^]。
- Scaling Laws for Precision：PTQ 退化随训练数据量增大而加剧，"eventually making additional pretraining data actively harmful"（对低比特推理而言）[^18^]。
- 权重高斯扰动实验同样显示"progressive sensitivity to noise"：固定扰动幅度下，PPL 退化随训练 token 数单调上升[^19^]。

**对 NAND CIM 的含义**：把"误差预算"优先分配给 (1) 激活/KV 路径（尤其 Key、attention sink token、首末层），(2) 再考虑权重；权重的模拟噪声容忍度相对最高，4-bit 权重 + 模拟噪声的联合误差大概率可由现代补偿/旋转方法吸收（见 §量化敏感性数据 与 §争议 C1）。

### KF-2 LLM 权重对随机模拟噪声相当"皮实"，但激活/KV 路径是阿喀琉斯之踵

- 权重 3–4 bit（等效 SNR 约 20–25dB 的确定性误差）在 GPTQ/AWQ 下近乎无损；即使 2-bit 也有 QuIP/AQLM 等方法保可用[^1^][^2^][^7^]。
- LLM.int8() 证明：只要 ~0.1% 的 outlier 通道走 FP16，其余 99.9% 值用 INT8，175B 模型无精度损失[^6^]。把 outlier 特征置零会使验证集 PPL 恶化 600–1000%，而置零同数量随机特征仅恶化 0.1%[^6^]——**误差的"落点"比"总量"更重要**：集中在 outlier 通道/敏感 token 的误差破坏力是均匀随机误差的 3–4 个数量级。
- 模拟硬件噪声是**随机、零均值、遍布所有权重**的：Nature Comm. 2020（PCM）指出量化误差是确定性的、而 AIMC 误差是随机的，因此注入高斯噪声训练是天然对策，ResNet 经噪声训练后可恢复到接近软件精度[^23^]。

### KF-3 LLM/Transformer vs CNN/图像分类：对"权重噪声"Transformer 更鲁棒；对"激活量化误差"LLM 更敏感——不能一概而论

**权重/器件非理想性维度（Transformer 占优）**：
- IBM Nature Comm. 2023（11 个 DNN、统一 AIMC 非理想性模型 + HWA 训练）：**BERT transformer 与全部 LSTM 负载达到 >99% iso-accuracy，而 CNN 普遍掉点最多 3.6%**（DenseNet-121 归一化精度仅 85.8–96.4%）[^21^]。
> "five out of the 11 … can be trained to reach the >99% iso-accuracy targets, including the BERT transform model as well as all workloads based on LSTMs … Most of the remaining workloads use CNNs and exhibit more-pronounced accuracy drops of up to 3.6%."
- 官方博客总结："recurrent DNNs … perform generally very well, while convolutional networks are typically the most challenging"[^22^]。
- 医学影像对比（Hamzaoui et al. 2024，经专题页转引）：Swin U-Net（transformer）在 analog-aware 训练下 Dice 下降 <0.04，金字塔 CNN 下降 0.15–0.22[^26^]。

**激活量化维度（LLM 反而更难）**：
- SmoothQuant 引言："unlike CNN models or smaller transformer models like BERT, the activations of LLMs are difficult to quantize. When we scale up LLMs beyond 6.7B parameters, systematic outliers with large magnitude will emerge"[^4^]。CNN 的 INT8 PTQ 自 Jacob et al. 2018 起已基本解决[^6^]；LLM 的 W8A8 却需要 outlier 处理，W4A4 至今只有旋转类方法（QuaRot/FlatQuant/SpinQuant）能稳住[^11^]。

**规模与任务维度**：decoder-only LLM 在模拟噪声下未经适配会崩得很厉害——LLaMA-3.1-8B 注入 6.7% 权重高斯噪声后多个零样本任务掉 >40 个百分点，GSM8K 从 67.63%→37.98%；同实验里 BERT-Large 比 MobileBERT 抗漂移（10 年漂移仅掉 0.48 vs ~4 点）→ **更大的模型更耐受**[^24^]。

**结论**：若 NAND CIM 噪声主要落在**权重**（编程误差/retention → 权重偏移）且做噪声感知训练/补偿，LLM 容忍度**不低于甚至高于** ResNet 类 CNN；若噪声进入**激活/KV 通路**（读出电流波动直接影响 MAC 结果，尤其长上下文 KV 与 outlier 通道），LLM 比 CNN **更敏感**。

### KF-4 自回归误差累积：短答案/困惑度很耐噪，长链推理最先崩（"自纠错"与"漂移"并存）

- **自纠错面（离散 token 的 argmax 提供天然余量）**：分类/语言离散步长下，只要 top-1 与 top-2 logit 间隔（margin）不被噪声翻转，输出不变；连续域（如视频/运动生成）没有这层保护[^31^]。
> "In NLG, the bias of predicted probability distribution can be corrected by sampling strategy … we can still generate the target word with index 2 by sampling on [0.3,0.3,0.4] whose groundtruth is [0,0,1]." — Dance Revolution (arXiv:2006.06119)
- **漂移面（exposure bias 经典问题）**：训练用 teacher forcing、推理用自身输出，误差逐步累积，长程生成尤甚[^30^]。
- **实测：量化/噪声对长 CoT 推理的杀伤远大于对 PPL/短问答的杀伤**：
  - "Quantization Hurts Reasoning?"：4-bit 权重在 R1-Distill 上近乎无损，3-bit 在 LiveCodeBench 掉 >7%；KV cache 4-bit 无损、3-bit 严重受损；"The degradation is most pronounced on difficult tasks with long response lengths such as AIME-120 and LiveCodeBench"[^11^]。
  - 机制证据：量化模型与 FP 模型的分歧点集中在**高熵（低 margin）位置**（KL 与 next-token 熵相关系数 ρ=0.92），噪声在这些位置把采样推向 "Wait/But" 分支，引发过度思考与路径漂移[^12^]。
  - 基准层面：PPL 几乎不变时下能力已显著下降（LLM-KICK）[^28^]；4-bit 量化下 workflow/tool-use 仅掉 1–3%，但真实应用场景掉 10–15%（ACBench）[^29^]。
- **对 NAND CIM 的含义**：用 PPL 评估硬件噪声会**低估**损伤；应直接用长生成推理任务（GSM8K/AIME/长上下文检索）做验收。LLaMA-3.1-8B 模拟噪声实验亦显示推理任务（GSM8K 67.6→38.0）比知识问答掉得更狠[^24^]。

### KF-5 提高容忍度的方法谱系（有效性有实测支撑）

1. **噪声感知训练（NAT/HWA training）**：最通用有效。PCM 上 ResNet 经权重高斯噪声注入训练后接近软件精度[^23^]；VANT（方差感知调度）把 CIFAR-10 噪声下精度从 72.3%→97.3%、TinyImageNet 38.5%→89.9%[^25^]；IBM HWA 训练使 11 个负载 1h 归一化精度全部 >96%[^21^]。
2. **低秩适配（硬件冻结 + 数字 LoRA 补偿）**：AHWA-LoRA 只训练 ~0.5–6.6% 参数即可把模拟噪声下的 LLaMA-3.1-8B 从崩盘拉回（HellaSwag +38.23pt，GSM8K 37.98→70.74），并支持温漂/ADC 变化的动态重适配；"hardware adaptation could be inherently a low-rank problem"[^24^]。
3. **误差补偿（量化即补偿）**：GPTQ 用二阶信息把已量化列的误差摊到未量化权重，175B@3-bit 仅损 0.3–0.6 PPL 而 RTN 直接崩溃[^1^]；QuIP/QuIP# 的不相干处理给出 2-bit 保证[^7^]。
4. **冗余/稀疏保护（把敏感分量拿出来走高精度）**：LLM.int8() 的 outlier FP16 混合精度[^6^]；SpQR/SqueezeLLM dense-and-sparse（3-bit 仅差 FP16 0.55–0.67 PPL）[^3^]；KVQuant 每向量 1% outlier 隔离使 3-bit KV 降到 <0.1 PPL 退化[^8^]；混合精度"Key 多给位、Value 少给位"[^10^]。
5. **分布整形（从源头消除 outlier）**：Hadamard/可学习旋转（QuaRot/SpinQuant）[^9^]；**Outlier-Safe Pre-Training**（Muon+单尺度 RMSNorm+嵌入投影，1.4B×1T token）使 4-bit 下 10 项基准均分 35.7 vs 26.5，excess kurtosis 0.04 vs 1818.56——"outliers are not inherent to LLMs but are consequences of training strategies"[^27^]。
6. **电路/系统级**：write-verify、选择性刷新、ECC（NVLLM 在 flash 逻辑内集成 ECC 对抗 RBER）[^33^][^36^]；温度补偿参考电压（Shim 2022 指出无补偿时 >310K 精度显著下降）[^34^]；权重位翻转避错（WISER：flash 老化下 VGG-16 精度损失从 17.09% 压到 <0.79%）[^37^]。

---

## 量化敏感性数据

### 权重量化（weight-only）

| 方法 | 位宽 | 模型 | 基线→量化后 | 损失 | 来源 |
|---|---|---|---|---|---|
| GPTQ | 4-bit | OPT-175B | Wiki2 8.34→≤8.59 | ≤0.25 PPL；"loses only 0.03 perplexity at 4-bit on the 175B"（相对 RTN 的 2.2 点） | [^1^] |
| GPTQ | 3-bit | OPT-175B | 8.34→8.68（g128 8.45） | 0.3–0.6 PPL；RTN 3-bit "collapses completely"（PPL 7.3e3） | [^1^] |
| AWQ | INT4 g128 | Llama-2-7B | 5.47→~5.60 | ≈0.1 PPL，一致优于 RTN(5.73)/GPTQ | [^2^] |
| AWQ | INT3 g128 | Llama-2-7B | 5.47→5.73 | 0.26 PPL（RTN 6.66） | [^2^] |
| SqueezeLLM | 3-bit | LLaMA-7B | — | 仅差 FP16 0.55–0.67 PPL；4-bit ~0.1 PPL | [^3^] |
| 经验阈值 | 3-bit | 多模型 | — | "critical 3-bit threshold, beyond which accuracy degradation transitions from linear to exponential collapse"；量化普遍优于剪枝（4-bit <5% vs 剪枝 15–20%） | [^13^] |
| 规模效应 | 4-bit | 7B–405B | — | "quantizing a larger LLM to a similar size as a smaller FP16 LLM generally performs better"；weight-only 方法在大模型上更好 | [^20^] |
| 4-bit 最优性 | 4-bit | 多族 | — | "4-bit parameters can reach optimal performance compared to other bit-precisions in the 3 to 16-bit range"（Dettmers & Zettlemoyer 2023, k-bit 推理标度律） | [^5^] |

### 激活/权重联合（W×A）

| 方法 | 配置 | 结果 | 来源 |
|---|---|---|---|
| 朴素 W8A8 | OPT-175B | 71.6%→32.3%（≈随机）；"naively quantizing the activation of LLMs will destroy the performance" | [^4^] |
| LLM.int8() | INT8+outlier FP16 | 175B 内与 FP16 等精度；内存减半（BLOOM-176B 1.96×） | [^6^] |
| SmoothQuant | W8A8 | OPT-175B 71.2–71.4%、BLOOM-176B 68.3–68.4%、GLM-130B 73.7%（≈FP16）；1.56× 加速/2× 省内存 | [^4^] |
| SmoothQuant | W8A8, OPT-IML-30B | LAMBADA 69.12→69.77%；朴素 W8A8 仅 4.21% | [^4^] |
| W4A4 | R1-Distill | 只有 FlatQuant 保住精度；W8A8 无损 | [^11^] |
| 敏感排序 | — | "activation quantization is generally more sensitive than weight quantization"（ZeroQuant-V2 转引）；attention 层对精度退化最敏感，FFN 层 INT8 可接受 | [^13^] |

### KV cache 量化

| 方法 | 位宽 | 结果 | 来源 |
|---|---|---|---|
| KVQuant | 3-bit | 全模型族 <0.1 PPL 退化（4-bit <0.02；2-bit <0.5）；朴素 int2 PPL 爆炸至 573–100870 | [^8^] |
| KIVI | 2-bit | "only has up to 2% accuracy drop despite the KV cache being stored in 2bit"（tuning-free，key per-channel/value per-token 非对称） | [^32^] |
| QuaRot 消融 | K/V 分位 | Llama-2-7B：K4V4 5.51 / K4V2 5.75 / K2V4 8.06 / K2V2 9.23（FP16 5.47）→ Key 敏感性 ≫ Value | [^9^] |
| KV-AdaQuant | K4V2 vs K2V4 | 75.2% vs 54.7%（key 谱范数更高，量化误差放大更显著） | [^10^] |
| 推理模型 | KV4/KV3 | R1-Distill：KVQuant*/QuaRot 4-bit KV 无损，3-bit KV 全部严重受损，长回答任务（AIME、LiveCodeBench）最明显 | [^11^] |
| 长上下文服务 | 2-bit KV | OSCAR(2026)：INT2 KV + 旋转协方差校正，Qwen3-32B AIME25 74.0 vs KIVI-KV2 59.05（BF16 72.59）→ 2-bit KV 在长 CoT 下仍需精细设计 | [^38^] |

**低比特下"什么先崩"**：长链推理/难样本先崩（PPL 不变时任务已退化）[^11^][^28^][^29^]；其次 3-bit 是线性→指数崩溃的阈值[^13^]；激活/KV 路径先于权重崩[^4^][^13^]；Key 先于 Value 崩[^9^][^10^]；首/末层与 attention 先于中间 FFN 崩[^13^][^14^]。

---

## NAND 噪声证据

### N-1 Shim (2022) "Impact of 3D NAND Current Variation on Inference Accuracy for In-memory Computing"（JSTS 22(5):341–345）——核心器件级证据

仿真 3D NAND string 电流变化的三大来源（retention、温度、编程图样依赖）对推理精度的影响[^34^]：
- **温度**：多晶硅沟道晶界阻碍电子漂移，400K 时电子迁移率比室温高 30%；"the inference accuracy significantly drops at a temperature above 310 K if any temperature compensation schemes are not applied"（需温度相关参考电压/电流补偿）。
- **图样依赖**：32-WL string 中，即使选中 WL 的 64 个 cell 阈值完全一致，未选 WL 的随机编程图样仍引起擦除 cell 阈值 −1V~0V 波动与开态电流 2–3.5nA 波动；"By applying the weight value variation with the on current standard variation results above, 84.5% of inference accuracy for CIFAR-10 dataset was achieved which is around 5% lower than the case without on-state current variation"。
- **阈值**："Noticeable degradation was shown when the threshold voltage shift of erased cells in NAND string shifts larger than 0.25 V, or temperature increases 10 degrees."
- **结论**："The current variation drops the accuracy significantly so that the compensating design schemes must be implemented for the practical designs."
> 注：该实验是 CNN（CIFAR-10）而非 LLM——恰说明即便是容忍度较高的 CNN 负载，~1nA 级开态电流 σ 也造成 ~5pt 掉点；与 KF-3 联读，LLM 权重通路预计类似或更耐受，激活/KV 通路需重点防护。

### N-2 同组 3D NAND CIM 架构工作（Shim & Yu）

- EDL 2021 "Technological design of 3D NAND based compute-in-memory architecture for GB-scale deep neural network"（IEEE EDL 42(2):160–163）：GB 级 DNN 的 3D NAND CIM 技术设计[^35^]。
- MEMSYS 2020 / 后续 TCAD（工业级原型芯片参数 + DNN+NeuroSim 评测）："Compared to SRAM or RRAM, 3D NAND CIM can achieve 17–24% chip size and 1.9–2.7× energy efficiency for 8-bit precision inference … No accuracy degradation by current variation was observed with the proposed input mapping scheme while accuracy drops sensitive to the current drift"[^36^]——**随机变化可经映射方案吸收，系统性 drift 是主要威胁**。

### N-3 LLM 级 3D NAND（近存/存内）系统的误差-精度结果

- **Acta Physica Sinica 2025（产品级 3D NAND CIM，GPT-2 124M/355M，PyTorch 行为级仿真）**："maintaining system-level reliability for open-state current distributions with σ<2.5 nA; **in INT8 mode, quantization error is the dominant accuracy bottleneck**"；20 tok/s、5.93 TOPS/W（124M）[^39^]。→ 对 LLM，INT8 量化本身已接近精度预算极限，留给模拟噪声的余量小，电流 σ 需 <2.5nA 量级。
- **NVLLM（arXiv 2026）**：3D NAND 内执行 FFN、attention 留在 DRAM；"NAND read-induced RBER increases perplexity and lowers accuracy"→ 对 INT8 权重注入随机位翻转评估鲁棒性，架构内集成 ECC 单元；OPT/LLaMA 至 30B[^33^]。
- **NASiC（arXiv 2026）**：面向 MoE-LLM 的 3D NAND CAM 选择式 CIM，引用 Shim 2022 作为电流变化-精度依据[^40^]。
- **Flash 数字存算（IFC）路线旁证**：Cambricon-LLM（LLaMA2-7B 36.3 tok/s）、Lincoln（LLaMA-65B 11.5 tok/s）、AiF 等均选择"数字 flash 存权重 + 近存计算"而非模拟 MAC，侧面反映模拟 NAND CIM 噪声对 LLM 的风险[^41^]。

### N-4 Flash 老化/读扰动误差模型（存储权重场景）

- **读扰动**（Cai & Mutlu, DSN 2015）：RBER 随读次数增长，且 P/E 磨损以近似二次方速率放大扰动斜率；低阈值态最易受扰，P3 态反而以 retention 漏电为主[^37b^]。
- **WISER（DATE 2021）**：16-bit 定点权重在 flash 老化（16K P/E、1e5 读扰动、1e8 秒 retention）下 VGG-16 分别掉 17.09%/5.96%/10.15%；位翻转避错（WISE/R）后全条件 <0.79%[^37^]。

---

## 争议

**C1 "LLM 比 CNN 更耐噪还是更怕噪？"——两类证据看似矛盾，实则按误差落点统一。**
权重随机噪声：BERT/LSTM > CNN（Rasch 2023）[^21^][^22^]；但 LLM 激活 outlier 使 W×A 联合量化远难于 CNN（SmoothQuant）[^4^]；decoder-only LLM 在 6.7% 权重高斯噪声下零样本掉 >40pt（AHWA-LoRA）[^24^]，与"transformer 天然耐噪"矛盾。调和解释：(i) Rasch 的 BERT 是 encoder、且经过 HWA 训练；(ii) 自回归长生成对误差落点（高熵 token、outlier 通道）高度敏感；(iii) 模型越大越耐受。因此**不能简单说 LLM 比 ResNet 耐噪**；对 NAND CIM，权重通路的模拟误差（编程/retention）LLM 大概率 ≥CNN 容忍度，激活/KV 通路（读出波动）LLM <CNN 容忍度。置信度：中。

**C2 自回归是"自纠错"还是"漂移放大器"？** 两派都有实测：离散 argmax/margin 提供每步容错[^31^][^12^]；但 exposure bias 与长 CoT 分支漂移使难任务先崩[^30^][^11^][^12^]。共识是：**评估指标决定结论**——teacher-forced PPL 显示高容忍，自由生成长推理显示低容忍。

**C3 Outlier 是规模涌现还是训练副产品？** Dettmers 2022：>6.7B 必然涌现[^6^]；Ahmadian 2023/2405.20835：outlier 是旧训练配方（OPT 系）的产物，新模型更易量化[^5^]；OSP 2025 直接证明可训练出无 outlier 的 1.4B×1T 模型[^27^]。若 C3 成立，未来 LLM 对 NAND 噪声的激活通路敏感性会下降——但 C4 反向作用。

**C4 趋势性坏消息：训练越充分，量化/噪声容忍度越差。** QiD 标度律[^17^]、Scaling Laws for Precision[^18^]、overtrained 模型对高斯扰动渐进敏感[^19^] 三方独立证据指向：随着 SOTA 模型 token/param 比攀升（Llama-3 已达 15T:8B），未来 LLM 对低比特与硬件噪声**更敏感**。对 NAND CIM 路线图是关键风险项。

**C5 评估方法学争议**：PPL 与下游能力脱节（LLM-KICK[^28^]、ACBench[^29^]、Quantization Hurts Reasoning[^11^]）；MT-Bench 区分度不足[^20^]。硬件噪声研究若只报 PPL 会系统性低估损伤——建议报告同时给 PPL + 长 CoT 任务 + KL 散度。

---

## 参考文献（URL / 日期 / 置信度）

[^1^]: Frantar et al., "GPTQ: Accurate Post-Training Quantization for Generative Pre-trained Transformers", arXiv:2210.17323 (ICLR 2023), 2022-10-31. https://arxiv.org/abs/2210.17323 （置信度：高）
[^2^]: Lin et al., "AWQ: Activation-aware Weight Quantization for LLM Compression and Acceleration", arXiv:2306.00978 (MLSys 2024), 2023-06. https://arxiv.org/pdf/2306.00978 （高）
[^3^]: Kim et al., "SqueezeLLM: Dense-and-Sparse Quantization", arXiv:2306.07629 (ICML 2024), 2023-06. https://arxiv.org/html/2306.07629 （高）
[^4^]: Xiao et al., "SmoothQuant: Accurate and Efficient Post-Training Quantization for Large Language Models", arXiv:2211.10438 (ICML 2023), 2022-11. https://arxiv.org/pdf/2211.10438 （高）
[^5^]: (a) "Outliers and Calibration Sets have Diminishing Effect on Quantization of Modern LLMs", arXiv:2405.20835, 2024-05; (b) Dettmers & Zettlemoyer, "The case for 4-bit precision: k-bit inference scaling laws", ICML 2023. https://arxiv.org/html/2405.20835v2 （高）
[^6^]: Dettmers et al., "LLM.int8(): 8-bit Matrix Multiplication for Transformers at Scale", arXiv:2208.07339 (NeurIPS 2022). https://proceedings.neurips.cc/paper_files/paper/2022/file/c3ba4962c05c49636d4c6206a97e9c8a-Paper-Conference.pdf （高）
[^7^]: "GPTQ as Babai's Nearest Plane Algorithm"（含 AQLM/QuIP#/QTIP 对比：≥4-bit 所有方法接近 FP 基线）, arXiv:2507.18553, 2025. https://arxiv.org/html/2507.18553v3 （中高）
[^8^]: Hooper et al., "KVQuant: Towards 10 Million Context Length LLM Inference with KV Cache Quantization", arXiv:2401.18079 (MLSys 2024), 2024-01. https://arxiv.org/html/2401.18079v5 （高）
[^9^]: Ashkboos et al., "QuaRot: Outlier-Free 4-Bit Inference in Rotated LLMs", arXiv:2404.00456, 2024-04. https://web3.arxiv.org/pdf/2404.00456 （高）
[^10^]: Hariri et al., "More for Keys, Less for Values: Adaptive KV Cache Quantization", arXiv:2502.15075, 2025-02-20. https://arxiv.org/abs/2502.15075v1 （高）
[^11^]: "Quantization Hurts Reasoning? An Empirical Study on Quantized Reasoning Models", arXiv:2504.04823, 2025-04. https://arxiv.org/html/2504.04823v1 （高）
[^12^]: "Quantized Reasoning Models Think They Need to Think Longer, but They Do Not", arXiv:2606.00206, 2026-05-29. https://arxiv.org/html/2606.00206v1 （中高，新论文）
[^13^]: "Model Hemorrhage and the Robustness Limits of Large Language Models", arXiv:2503.23924, 2025. https://arxiv.org/pdf/2503.23924v1.pdf （中高）
[^14^]: "The Uniqueness of LLaMA3-70B Series with Per-Channel Quantization", arXiv:2408.15301, 2024-08. https://arxiv.org/html/2408.15301 （中高）
[^15^]: "You Had One Job: Per-Task Quantization Using LLMs' Hidden Representations", arXiv:2511.06516, 2025-11. https://arxiv.org/html/2511.06516v2 （中）
[^16^]: Hoffmann et al., "Training Compute-Optimal Large Language Models" (Chinchilla), arXiv:2203.15556, 2022；转引自 "Introduction to AI Safety, Ethics, and Society", arXiv:2411.01042, 2024. https://arxiv.org/pdf/2411.01042 （高）
[^17^]: Ouyang et al., "Low-Bit Quantization Favors Undertrained LLMs: Scaling Laws for Quantized LLMs with 100T Training Tokens", arXiv:2411.17691, 2024-11-26. https://arxiv.org/abs/2411.17691 （高）
[^18^]: Kumar et al., "Scaling Laws for Precision", arXiv:2411.04330, 2024-11-07. https://arxiv.org/abs/2411.04330 （高）
[^19^]: Spring et al., "Overtrained Language Models Are Harder to Fine-Tune", arXiv:2503.19206, 2025. https://arxiv.org/html/2503.19206v2 （高）
[^20^]: Lee et al., "A Comprehensive Evaluation of Quantized Instruction-Tuned Large Language Models: An Experimental Analysis up to 405B", arXiv:2409.16625, 2024-09-17. https://www.x-mol.com/paper/1836544881092440064 （高）
[^21^]: Rasch et al., "Hardware-aware training for large-scale and diverse deep learning inference workloads using in-memory computing-based accelerators", Nature Communications 14:5282, 2023 (arXiv:2302.08469). https://arxiv.org/pdf/2302.08469 （高）
[^22^]: Springer Nature Research Communities 博客（IBM Analog AI 团队）, 2025-09-02. https://communities.springernature.com/posts/analog-ai-training-larger-scale-dnns-for-deployment-on-future-analog-in-memory-computing-hardware-without-accuracy-loss （中高，官方博客）
[^23^]: Joshi et al., "Accurate deep neural network inference using computational phase-change memory", Nature Communications 11:2473, 2020. https://www.nature.com/articles/s41467-020-16108-9.pdf （高）
[^24^]: Li et al., "Efficient transformer adaptation for analog in-memory computing via low-rank adapters (AHWA-LoRA)", arXiv:2411.17367, 2024-11（2025 修订）. https://arxiv.org/html/2411.17367v3 （高）
[^25^]: "Variance-Aware Noisy Training: Hardening DNNs against Unstable Analog Computations", arXiv:2503.16183 (ECML-PKDD 2025). https://arxiv.org/html/2503.16183v1 （高）
[^26^]: Emergent Mind 专题页（转引 Hamzaoui et al. 2024 等）, 2026-03-17. https://www.emergentmind.com/topics/analog-in-memory-computing-aimc （中，二手）
[^27^]: Park et al., "Outlier-Safe Pre-Training for Robust 4-Bit Quantization of Large Language Models", arXiv:2506.19697 (ACL 2025), 2025-06-24. https://arxiv.org/abs/2506.19697 （高）
[^28^]: Jaiswal et al., "Compressing LLMs: The Truth is Rarely Pure and Never Simple (LLM-KICK)", arXiv:2310.01382 (ICLR 2024). https://www.x-mol.com/paper/1709319353768103936 （高）
[^29^]: "ACBench: Agentic Compression Benchmark" (ICML 2025), GitHub README, 2024-12-09. https://github.com/pprp/ACBench （中高）
[^30^]: 曝光偏差综述：Emergent Mind "Exposure Bias in Machine Learning", 2025-11-24；原始文献 Bengio et al. 2015 (scheduled sampling)、Ranzato et al. 2016. https://www.emergentmind.com/topics/exposure-bias （中高）
[^31^]: "Dance Revolution: Long-Term Dance Generation with Music via Curriculum Learning", arXiv:2006.06119, 2020（离散 NLG vs 连续域误差累积对比）. https://arxiv.org/pdf/2006.06119v3 （中高）
[^32^]: Liu et al., "KIVI: A Tuning-Free Asymmetric 2bit Quantization for KV Cache", arXiv:2402.02750 (ICML 2024), 2024-02. https://arxiv.org/html/2402.02750v2 （高）
[^33^]: Hao et al., "NVLLM: A 3D NAND-Centric Architecture Enabling Edge on-Device LLM Inference", arXiv:2604.25699, 2026-04-28. https://arxiv.org/html/2604.25699 （中高，预印本）
[^34^]: W. Shim, "Impact of 3D NAND Current Variation on Inference Accuracy for In-memory Computing", J. Semiconductor Technology and Science 22(5):341–345, 2022. 全文 PDF: http://journal.auric.kr/AURIC_OPEN_temp/RDOC/ieie02/ieiejsts_202210_005.pdf ；摘要页: https://www.kci.go.kr/kciportal/ci/sereArticleSearch/ciSereArtiView.kci?sereArticleSearchBean.artiId=ART002888604 （高）
[^35^]: W. Shim, S. Yu, "Technological design of 3D NAND based compute-in-memory architecture for GB-scale deep neural network", IEEE Electron Device Letters 42(2):160–163, 2021（作者主页确认）. https://shimeng.ece.gatech.edu/publication/ （高）
[^36^]: W. Shim, H. Jiang, X. Peng, S. Yu, "Architectural design of 3D NAND flash based compute-in-memory for inference engine", MEMSYS 2020, pp.77–85；及后续 System-Technology Co-Design（IEEE TCAD 2021）摘要. https://www.researchgate.net/publication/350279159 （中高）
[^37^]: "Deep Neural Network Weight-bit Inversion for State Error Reduction (WISE/WISER)", DATE 2021. https://past.date-conference.com/proceedings-archive/2021/pdf/1567.pdf （高）
[^37b^]: Cai, Luo, Ghose, Mutlu et al., "Read Disturb Errors in MLC NAND Flash Memory", DSN 2015. https://people.inf.ethz.ch/omutlu/pub/flash-read-disturb-errors_dsn15_shortlist.pdf （高）
[^38^]: "OSCAR: Offline Spectral Covariance-Aware Rotation for 2-bit KV Cache Quantization", arXiv:2605.17757, 2026-05-18. https://arxiv.org/html/2605.17757v1 （中，新预印本）
[^39^]: "基于 3D NAND 闪存的存算一体大模型推理系统（产品级芯片行为级仿真）", Acta Physica Sinica（物理学报）74, 2025, DOI:10.7498/aps.74.20250891. https://wulixb.iphy.ac.cn/pdf-content/10.7498/aps.74.20250891.pdf （高）
[^40^]: Xu et al., "NASiC: 3D NAND-based CAM-Selected Multibit CIM Architecture for Efficient On-Device Mixture-of-Experts LLM Inference", arXiv:2605.23294, 2026-05-22. https://arxiv.org/html/2605.23294 （中高，预印本）
[^41^]: "KVNAND: Efficient On-Device LLM Inference Using DRAM-Free In-Flash Computing"（综述 Cambricon-LLM/Lincoln/AiF 指标）, arXiv:2512.03608, 2025-12. https://arxiv.org/html/2512.03608v1 （中高）
