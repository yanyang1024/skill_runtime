## 3. 大模型分层计算特性与 NAND CIM 调度（对应模型问题 4）

用户问题 4 有两问：大模型各层计算类型不同（有些做乘加、有些做数字运算），软件层面如何调度；其引述文献"适合 MAC 的场景，前几层高精度数字运算、后几层模拟 MAC 则精度较高"是否成立。本章依次展开：计算类型分解（3.1）、层敏感度证据与启发式检验（3.2）、存内计算（compute-in-memory, CIM）与 GPU/NPU 的软件调度（3.3），3.4 节给出专家判定。全部结论面向 NAND CIM 部署场景：模拟 CIM 只能高效执行乘加（multiply-accumulate, MAC）类运算，非 MAC 算子必须由数字单元协处理，"哪些层放 NAND、哪些层留数字"本质上是计算类型约束与层敏感度约束的联合优化问题。

### 3.1 各层/算子的计算类型分解

#### 3.1.1 99.8% FLOPs 为 MAC：FFN 占 2/3 参数、decode 权重 GEMV 占 73.8% 执行时间

大模型推理的浮点运算几乎全部是 MAC。PALUTE 对 LLM 推理的核级分解（引述 Ivanov et al., 2021）显示，通用矩阵乘（general matrix-matrix multiplication, GEMM）贡献 99.8% 的 FLOPs，但只占 61.0% 的运行时 [^505^]。参数侧的分布同样高度集中：前馈网络（feed-forward network, FFN）层占 Transformer 模型约三分之二的参数 [^508^]，注意力投影（QKV 与输出投影）约占其余三分之一；注意力分数的 FLOPs 随序列长度线性增长，而线性层 FLOPs 不随序列变化 [^503^]。

更关键的是两阶段异质性。预填充（prefill）阶段是计算受限（compute-bound）的大 GEMM；解码（decode）阶段退化为访存受限（memory-bound）的通用矩阵-向量乘（general matrix-vector multiplication, GEMV），算术强度极低 [^501^]。OPT-13B 在 A100 上的实测（输入 512 token、输出 32 token）显示，端到端执行时间的 73.8% 由以 GEMV 为主的 decode 阶段占据，roofline 分析表明单 batch 的 decode 全部落在 memory-bound 区 [^502^]。这一结构正是模拟 CIM 与 NAND CIM 的"甜点"：权重驻留阵列、GEMV 免除权重搬运，恰好消除 decode 的主要瓶颈；反之 prefill GEMM 需要激活重用与高精度数字累加，与 CIM 的匹配度差。

decode 内部各 GEMM 的瓶颈并不一致。GPU 微架构级分析发现，FFN 上投影（FFN-Up）是纯 memory-bound（访存依赖占比达 58%，GEMV 形态无法隐藏 HBM 权重加载延迟），而注意力输出投影（O-Proj）与 FFN 下投影（FFN-Down）是执行受限（execution-bound）的，瓶颈在寄存器压力（约 130 个活跃寄存器）[^504^]。这意味着做层-器件映射时，FFN up/gate 是 CIM 的最优候选——它是纯粹的权重流；O/down 即使留在数字端其瓶颈也不在带宽，卸载到 CIM 的收益结构不同。

#### 3.1.2 softmax/LN/residual：FLOPs<0.2% 但占约 39% 运行时，必须数字单元

与 GEMM 相对照，softmax、层归一化（LayerNorm, LN）、残差相加与逐元素激活等非 MAC 算子合计贡献不到 0.2% 的 FLOPs，却消耗约 39% 的运行时 [^505^]——这是典型的存储墙效应：这些核的运行时间由 HBM 与片上 SRAM 之间的数据搬运主导，而非算术。其他口径的实测结论一致：BERT 单层在 A100 上 GEMM 占执行时间 61%（序列长 256）至 40%（序列长 1024），注意力（含 softmax 与两个 batched GEMM）在长序列下占 49%，LN、加偏置与激活合计 11–17% [^506^]；TurboTransformers 端到端分解给出 GEMM 占 70.3–82.8%、softmax 占 1.9–4.6%、LN 占 2.7–3.6% [^507^]。LN 的同步 stall 占比从 prefill 的 11.0% 升至 decode 的 27.7%（小批量归约的 barrier 尾延迟）[^504^]，进一步说明非 MAC 算子的成本在访存与同步。

模拟 CIM 的能力边界由此划定：受器件涨落与模数转换器（analog-to-digital converter, ADC）/数模转换器（digital-to-analog converter, DAC）量化限制，模拟阵列的有效精度通常只有 3–8 bit，只适合"容错"的矩阵-向量乘（matrix-vector multiplication, MVM）；精度敏感层与非线性操作必须由数字计算单元在全精度下执行 [^520^]。软硬两侧文献对此有共识：Transformer CIM 设计普遍配置专用功能单元执行 softmax、LN 与激活，"模拟做乘、数字做非线性"的分工被视为能效最大化的必要条件 [^538^]；即便在 HBM-PIM 这类数字 PIM 中，也必须增设辅助计算单元（auxiliary computing unit, ACU）执行向量归约与 softmax，因为位串行、行并行的 PIM 操作无法高效处理它们——PIM-only 方案里归约占 23–32% 的时间 [^534^]。

表 3-1 汇总各层/算子的计算类型、运行时特征、敏感度证据与部署建议。

**表 3-1 大模型各层/算子的计算类型、运行时特征与 NAND CIM 部署建议**

| 层/算子 | 计算类型 | 运行时/瓶颈特征 | 敏感度证据（模拟噪声/量化） | 部署建议 |
|---|---|---|---|---|
| Embedding | 查表（非 MAC） | 约占模型权重 15%，每个 decode 步仅访问一行 [^550^] | 误差传播至全部后续层，PTQ 惯例保高精度 [^541^] | 以 bf16 存于 NAND 做查表读取，不参与 CIM 计算 [^550^] |
| Attention QKV 投影 | MAC（GEMM/GEMV） | prefill 为 compute-bound，decode 为 memory-bound [^501^] | 全程中等敏感（ΔPPL≈1–3）[^520^]；早期层 KV 最敏感 [^539^] | 中间层可放 NAND CIM；早期层需逐层确认 |
| Attention 输出投影（O proj） | MAC | decode 中为 execution-bound（约 130 活跃寄存器）[^504^] | 随深度剧烈摆动：block0 ΔPPL=33.1（全模型最敏感）vs block2–10 ΔPPL<0.22 [^520^] | 首块留数字；中间块优先放模拟 |
| Softmax / attention 分数 | 非线性（exp+归约+除法） | 与 LN 等合计 <0.2% FLOPs、约 39% 运行时 [^505^] | 输出常保 INT16 或不量化 [^544^] | 必须数字单元（SFU/ACU/NPU）[^538^][^534^] |
| FFN up/gate | MAC（decode 为 GEMV） | FFN 占 2/3 参数 [^508^]；decode 最典型 memory-bound（访存依赖 58%）[^504^] | block1/2 ΔPPL=14.0/11.8 构成第二敏感梯队 [^520^]；中间块耐噪 [^547^] | NAND CIM 最佳候选（首两块除外） |
| FFN down | MAC | execution-bound [^504^] | block0 ΔPPL=12.8 [^520^]；最强激活 outlier 出现在 FFN 输出 [^511^] | 中间块可放模拟；需 outlier 旁路保护 ADC 输入 |
| LayerNorm / residual | 逐元素+归约（非 MAC） | LN 同步 stall 占比 prefill 11.0%→decode 27.7% [^504^] | —（非线性归约，CIM 能力集外） | 一律数字 [^538^][^531^] |
| LM head / logits | MAC（大 GEMV） | 每个 decode 步一次大 GEMV | ΔPPL=6.4 [^520^]；权重敏感度为中位层的 8 倍 [^547^] | 数字/高精度 [^541^] |

表 3-1 的核心读法有三点。第一，计算类型是硬约束：softmax/LN/residual 与 embedding 查表根本不在模拟 CIM 的能力集内，部署列没有取舍空间，这部分回答了"哪些运算必须留数字"的半数答案。第二，同为 MAC 的各投影并非同质负载——FFN up/gate 是 decode 中最大的纯权重流（FFN 占 2/3 参数），权重驻留 NAND 阵列所免除的搬运收益最大，因而是 CIM 的首选负载；而 O-Proj/FFN-Down 在数字端已是 execution-bound，搬到 CIM 的性能增量有限，其映射决策应主要由敏感度而非性能驱动。第三，敏感度列显示没有任何一行可凭"位置"一刀切：同一算子类型在不同深度的敏感度可相差两个数量级——注意力输出投影的困惑度（perplexity, PPL）变化 ΔPPL 从 33.1 到不足 0.22——这直接引出 3.2 节对"前数字、后模拟"启发式的检验。

### 3.2 层敏感度证据与混合精度映射

#### 3.2.1 边界层（embedding/第一层/LM head）敏感、中间 MLP 耐噪的多文献证据

跨模型族、跨扰动类型的多源证据支持一个稳健结论：边界层敏感、中间层（尤其中间块的 MLP）耐噪。工程惯例上，后训练量化（post-training quantization, PTQ）研究普遍将 embedding、LM head 与注意力计算保持在高精度 [^541^]；ViT 量化研究中首层（patch embedding）与末层（分类头）被固定为 8-bit，理由是二者"相比中间层对扰动更敏感" [^514^]；CNN 混合精度惯例同样将第一层保持不量化或分配大位宽 [^513^]。剪枝文献从"删除"而非"加噪"的角度给出同向证据：LLM-pruner 识别出首末层对模型性能影响深远，Shortened LLaMA 保留前 4 块与末 2 块不参与剪枝 [^517^]。键值缓存（key-value cache, KV cache）量化侧，早期层（第 0–3 或 0–7 层）普遍最敏感，且 Key 缓存对量化误差的敏感度比 Value 高 10–20 倍 [^539^]。工业实测（Qwen3，厂商博客口径、置信度中低）量化了这一梯度：第 0 层 KV 敏感度是中位层的 56 倍、lm_head 权重为 8 倍，结论是"最敏感的层总是在边界：首/末 Transformer 块、lm_head 与 embedding；中间 MLP 层始终稳健" [^547^]。

敏感度差异的微观来源是激活 outlier。LLM.int8() 发现大幅值特征（large magnitude features）在 6B 到 6.7B 参数之间突然出现并蔓延至全部层（受影响层比例从 65% 升至 100%），其解法是 vector-wise INT8 加 outlier 维度 FP16 的混合精度分解，99.9% 以上的数值仍以 8-bit 相乘 [^509^]。最强 outlier 通常出现在 FFN 输出；对足够大的模型，每个线性层（含 QKV 投影）之后都开始出现 [^511^]。对模拟 CIM 而言，outlier 拉大的是 ADC 的输入动态范围——而大规模硬件感知研究表明，I/O 侧非理想性（ADC/DAC 分辨率、加性输出噪声、ADC 的 S 形非线性）对精度的杀伤大于权重侧噪声 [^521^]，因此"中间 MLP 耐噪"的结论映射到模拟域时须附加 outlier 处理（如 FP16 旁路）这一前提。

#### 3.2.2 "前几层数字、后几层模拟 MAC"启发式的反证：LionHeart 行为不可预测、GPT-2 AIMC 逐投影画像

"首末层放数字"（first-last scheme）确实是当前最广泛使用的映射启发式 [^520^]，但两类直接实测证据表明它不可作为规则使用。

其一，LionHeart 在多个 CNN 与 Transformer 负载上对比 first-last 映射策略（FLMS）基线后发现："FLMS 配置的行为不可预测……62% 的配置中末层全连接层被保留在模拟域，但只有 18% 的配置保留第一层；这意味着第一层通常最敏感，且中间层被观察到比末层更敏感" [^525^]。即该启发式中只有"第一层保数字"这一条成立率高；"后几层放模拟"经常碰巧正确（末层 62% 可留模拟），但原因是末层本身耐噪而非"位置靠后"，且中间层敏感度可能反超末层——按位置单调排序不成立。

其二，首个针对 decoder-only LLM 的模拟存内计算（analog in-memory computing, AIMC）逐投影敏感度画像（GPT-2-small，2026 年）给出了更细粒度的反证：49 个投影中仅 4 个主导敏感度——第 0 块的注意力输出投影 c_proj（注入噪声后 ΔPPL=33.1，比绝大多数层高一个数量级，机理是"残差流首次聚合注意力加权表示的位置，此处注入的噪声会穿过所有后续块"）、第 1/2 块的 FFN 上投影（ΔPPL=14.0/11.8）与第 0 块的 FFN 下投影（ΔPPL=12.8）；LM head（ΔPPL=6.4）与第 11 块注意力输出（ΔPPL=7.3）仅属中等敏感；49 个投影中的 40 个（约 82%）ΔPPL<3，可安全放入模拟域；第 2–10 块的注意力输出投影是最耐噪的部分（ΔPPL<0.22），QKV 投影全程中等敏感（ΔPPL≈1–3）[^520^]。两点直接背离"前后排序"叙事：全模型最敏感处不是"前几层整体"而是首块内部的一个特定投影；中间块的注意力输出投影反而比末块更耐噪。量化侧也有旁证：FastEWQ 发现后段语义整合层"表现出意外的量化容忍度"，主动将末几块压到 4-bit [^519^]；vLLM 社区则观察到 Llama-3 中间层对 e4m3 精度损失更敏感（低置信度，issue 陈述）[^542^]。

此外，敏感度度量本身尚未收敛：HAWQ 系用 Hessian 二阶信息排序层敏感度 [^512^]；LLM-MQ 指出 LLM 约 15% 层的 Hessian 矩阵非半正定、二阶信号失真，改用一阶梯度加整数规划分配位宽 [^515^]；CMPQ 又反指收敛 LLM 的梯度近似为零，一阶信号同样无法区分层敏感度 [^516^]。不同度量得到的层排序可能不同，这进一步削弱了任何静态规则的可靠性。

#### 3.2.3 正确做法：离线 perturbation 剖析 + projection 级映射

方法学层面，九种主流异构映射方法已被统一为四阶段工作流：硬件刻画（tile 配置、ADC/DAC、互连代理模型）→ 精度敏感度剖析（逐投影扰动实验、Hessian 或激活显著性）→ 架构感知映射（启发式/解析式/学习型）→ 系统级评估（DNN+NeuroSim、ALPINE 等）[^520^]。粒度上，逐层映射过粗（GPT-2 案例证明同层内不同投影的敏感度可差一个数量级），逐权重映射的互连开销过大，对 Transformer 的推荐折中是 projection 级 [^520^]。工程闭环为：离线对目标模型做 O(L) 次前向的 perturbation 剖析，生成"投影×器件"映射表，以模拟 MAC 占比（analog MAC ratio）与数字端权重足迹为代理指标做系统级筛选；必要时以硬件感知（hardware-aware, HWA）训练打底、再选择性提升少数敏感层到数字域——IBM 的大规模研究表明，仅豁免少数最敏感层即可让 ResNet-50/18 与 DenseNet-121 达到 99% iso-accuracy，BERT 可达 iso-accuracy [^521^]。

落实到 NAND CIM：必留数字/高精度的是 embedding（查表而非 MAC，更适合利用 NAND 的高密度存储而非其计算能力，移动端实践已将其以 bfloat16 存放于 Flash [^550^]）、第一层（尤其首块注意力输出投影）、LM head 与全部 softmax/LN/residual；优先放 NAND 模拟 MAC 的是 decode 阶段的 FFN up/gate（最大权重流）、中间块注意力输出投影（实测最耐噪）与中间层 QKV（中等耐噪，需校准）。

### 3.3 CIM 与 GPU/NPU 之间的软件调度

#### 3.3.1 主流分工：flash 做 decode 权重 GEMV、NPU 做 prefill 与非线性（Cambricon-LLM/KVNAND/NASiC）

2024–2026 年的 NAND CIM 系统已形成清晰的分工共识。Cambricon-LLM（MICRO 2024）采用 chiplet 形式的 NPU 加 NAND die：NPU 与 flash 芯片协作完成矩阵运算，并承担超出 flash 片上处理能力的特殊函数计算（softmax/LN 等），通过 hardware-tiling 策略最小化 NPU 与 NAND flash 之间的数据搬运；70B 模型达 3.44 token/s、7B 模型达 36.34 token/s，比既有 flash-offloading 方案快 22–45 倍 [^530^]。KVNAND 等工作归纳的 IFC-NPU（in-flash computing 加 NPU）范式把分工表述得更彻底："IFC 子系统加速 decode 阶段涉及模型权重的 memory-bound 操作；NPU 处理 prefill 阶段与非线性计算……flash 仅用于存储权重，KV cache 保留在 DRAM" [^531^]。NASiC（2026）进一步把混合专家（mixture-of-experts, MoE）的专家选择经 CAM 掩码与 CIM 计算融合到单周期，配合温度计编码的原位多比特输入扩展与多比特单元，报告较 SOTA 提升 4–114.8 倍性能与 3.9–70 倍能效 [^532^]。

运行时层面的代表性机制是 NeuPIMs：针对朴素 NPU+PIM 的"阻塞模式"（任一时刻仅一方能工作）与 GEMM-GEMV 数据依赖，以双行缓冲（dual row buffer）实现 PIM 计算与常规访存并发、子批交错（sub-batch interleaving）让两个子批的 GEMM 与 GEMV 互相填充，配合内存控制器交错调度 PIM/访存命令，相对 NPU-only 与朴素 NPU+PIM 分别提升吞吐 2.3 倍与 1.6 倍 [^533^]。

#### 3.3.2 编译器子图划分与跨设备搬运开销：PCIe vs HBM 13× 带宽差、ADC 约占 ISAAC 一半功耗

编译期的层-器件划分可直接借用通用深度学习编译器的子图划分框架：ONNX Runtime 对各执行提供方（execution provider, EP）查询能力（GetCapability），贪心分配"其可执行的最大连续子图"，CPU EP 兜底 [^536^]。但边缘部署经验表明，不支持的算子会把子图打断成"回退孤岛"（fallback islands），每个边界引入张量重格式化、精度转换、内存拷贝与同步，"这些开销可超过加速所节省的计算时间" [^537^]；BYOC 同样批评逐算子（op-by-op）执行引入不必要的数据搬运 [^535^]。对 CIM 混合系统的直接推论是：若按"数字-模拟-数字-模拟"逐层交替映射，每层边界都要支付一次 DAC/ADC 转换加格式转换加同步，很可能吃光 CIM 收益；划分的目标函数必须包含跨设备搬运项，并尽量将模拟段聚合成连续块。

搬运代价的量级有明确数字。GPU 侧 attention 卸载案例（AQPIM）显示，消除卸载惩罚带来 11.39 倍收益，恰与 GPU 显存带宽（HBM 3.35 TB/s）和 PCIe 带宽（256 GB/s）之间约 13 倍的差距吻合 [^540^]——跨设备链路带宽决定卸载边界划在哪里才划算；同一研究还指出 attention 被卸载后，未加速的操作（如 FFN）重新主导 decode 延迟 [^540^]，即 Amdahl 定律约束卸载范围。模拟域的接口税同样可观：ISAAC 的 ADC 约占芯片功耗一半 [^522^]。数据流层面，TransPIM 以 token-based 数据流替代 layer-based 数据流，避免层间激活回搬，仅数据流优化即达 4.6 倍 [^534^]。这些约束共同解释了 3.3.1 的分工为何成为当前 NAND CIM 的主流：decode 权重 GEMV 留在 flash 侧可完全免除权重跨设备搬运，非线性与 prefill 集中在 NPU 侧使跨设备边界最小化。

### 3.4 专家验证：问题 4 引述文献的判定

#### 3.4.1 结论：方向大体正确但不可作固定规则；层映射须 per-model 剖析

对引述文献"适合 MAC 的场景，前几层高精度数字运算、后几层模拟 MAC 则精度较高"的说法，本报告判定为 **部分成立（需修正）**，对应交叉验证冲突区 C3。

成立的部分：第一层/边界层对噪声最敏感确为 CNN/ViT/LLM 三域共识（LionHeart 仅 18% 的配置将首层留在模拟域 [^525^]），末几层也经常可以留在模拟域（62% 的配置 [^525^]；FastEWQ 末块耐 4-bit [^519^]）。作为零成本的初始猜测，"前数字、后模拟"优于均匀映射。

需修正的部分有三：其一，它不成立为规则——LionHeart 实测 FLMS 行为"不可预测"，中间层可能比末层更敏感 [^525^]；其二，粒度错误——最敏感的位置往往不是"前几层"整体而是特定的内部投影（GPT-2 首块 c_proj 的 ΔPPL=33.1 为全模型之最，而中间块的同类投影 ΔPPL<0.22），敏感度是"投影类型×深度"的二维函数，不存在沿深度的单调排序 [^520^]；其三，结论随模型与噪声模型而变——不同敏感度度量给出不同排序 [^512^][^515^][^516^]，且权重通路与 KV 通路的敏感层排序并不一致（详见第 4 章）。因此正确做法是以离线 perturbation 剖析加 projection 级映射表替代静态规则，运行时按表调度；对 NAND CIM 落地而言，模型适配工具链（剖析器加映射编译器）是比阵列本身更长的短板。

对用户问题 4 前半部分"软件层面如何调度"的直接回答可归纳为三点：编译期按器件能力划分子图并把模拟段聚合成连续块（避免逐层交替产生的 DAC/ADC 与格式转换开销 [^535^][^537^]）；以剖析生成的 projection 级映射表决定层-器件归属（而非套用 first-last 启发式 [^520^][^525^]）；运行期以子批交错等机制让 CIM 与 GPU/NPU 并发（NeuPIMs 相对 NPU-only 2.3 倍 [^533^]）。当前 NAND CIM 的落地形态是"flash 承担 decode 权重 GEMV、NPU 承担 prefill 与全部非线性"的 IFC-NPU 分工 [^530^][^531^]。
