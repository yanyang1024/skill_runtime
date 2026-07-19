# AI 模型与存储技术调研报告：HBF 与 NAND CIM 视角的专家验证

## 摘要与 AI 假设验证总表
### 调研背景与方法
#### 基于 10 维度并行深潜调研（470+ 条引用）与四档置信度交叉验证
### AI 假设验证总表
#### 14 个问题逐一判定：成立 / 部分成立 / 需修正 / 不成立（表格）

## 1. KV Cache 分层卸载机制与互联底座（对应模型问题 1）（~4000 字，2 表）
### 1.1 KV 冷热划分与分层卸载机制现状
#### 1.1.1 冷热 KV 的划分依据：调用频率、reuse 距离与 attention 重要性
#### 1.1.2 分层卸载四大机制：placement、eviction、prefetch、逐层流水
#### 1.1.3 产品化现状：Mooncake/LMCache/vLLM KVConnector/SGLang HiCache/Dynamo KVBM+NIXL/AIBrix
### 1.2 卸载介质层级与实测性能
#### 1.2.1 HBM→DRAM→SSD→对象存储的时延/带宽/容量阶梯（对比表）
#### 1.2.2 代表系统实测：命中率 80–98% 负载下 TTFT 降 56–84%、吞吐最高 15×
#### 1.2.3 SSD 层争议：CPU-centric I/O 致 70–80% GPU stall 与"读不如重算"拐点
### 1.3 跨设备互联技术与国内方案
#### 1.3.1 互联技术对比：NVLink/PCIe/CXL/RoCE/UALink/光（对比表）
#### 1.3.2 KV 搬运事实标准 GPUDirect RDMA；国内多轨格局：灵衢 UB、UALink、ETH-X、OISA 与 RoCEv2 兜底
### 1.4 专家验证：冷热 KV 卸载至 HBF 的判定标准
#### 1.4.1 五条判定标准：带宽拐点、prefetch 可掩盖条件、块粒度、reuse 可预测性、写耐久预算
#### 1.4.2 验证结论：读多写少的历史/共享 KV 适配 HBF；活跃逐 token KV 禁入

## 2. HBF 引入后的系统架构演化（对应模型问题 2、3；硬件问题 5、6）（~4500 字，2 表）
### 2.1 HBF 存储 KV 对命中率与命中时间的影响
#### 2.1.1 KV reuse 时间分布：80% 复用在 10 分钟内、读:写≈186:1
#### 2.1.2 命中率与命中时间对 TTFT/ITL/吞吐的定量传导
#### 2.1.3 HBF 有效延迟口径冲突区（C1）：~10µs 厂商口径 vs OCP tR≈4µs 目标 vs 裸 NAND tR 40–100µs
### 2.2 HBF 引入后 MoE 架构的适用性
#### 2.2.1 MoE expert offloading 技术线：预测命中率 17%→99%、MoE-Lightning 10.3×
#### 2.2.2 专家局部性的脆弱性与负载均衡张力；HBF 带宽补上后"预取失效"被治本
#### 2.2.3 架构推演：HBM 算 + HBF 存全量专家按需流式读 + SSD/3FS 存 KV/数据
### 2.3 Batch size 的系统级优势与带宽容量量化
#### 2.3.1 Decode memory-bound：算术强度 1–2 FLOP/B，batch 为吞吐杠杆（550→12,000 tok/s）
#### 2.3.2 KV 容量公式：Llama-3-70B 320KB/token、128K≈40GiB/请求；MLA 70KB/token
#### 2.3.3 长上下文 KV 流量反超权重流量：0.84TB/s(GQA) vs 0.18TB/s(MLA)/请求@128K
#### 2.3.4 三级架构分工：HBM 热层 + HBF 封装内容量层（可入 decode 回路）+ ICMS 网络 G3.5
### 2.4 仿真工具适配 HBF 需考虑的模型因素
#### 2.4.1 注意力变体（MHA/GQA/MLA）、层数/隐藏维、上下文分布、并发与 SLO、I/O 路径建模
### 2.5 专家验证：开放问题的条件性结论
#### 2.5.1 冲突区 C2：SSD 层入列的相反实测及分水岭条件（GPU-centric I/O + 粗粒度对象）

## 3. 大模型分层计算特性与 NAND CIM 调度（对应模型问题 4）（~3500 字，1 表）
### 3.1 各层/算子的计算类型分解
#### 3.1.1 99.8% FLOPs 为 MAC：FFN 占 2/3 参数、decode 权重 GEMV 占 73.8% 执行时间
#### 3.1.2 softmax/LN/residual：FLOPs<0.2% 但占约 39% 运行时，必须数字单元
### 3.2 层敏感度证据与混合精度映射
#### 3.2.1 边界层（embedding/第一层/LM head）敏感、中间 MLP 耐噪的多文献证据
#### 3.2.2 "前几层数字、后几层模拟 MAC"启发式的反证：LionHeart 行为不可预测、GPT-2 AIMC 逐投影画像
#### 3.2.3 正确做法：离线 perturbation 剖析 + projection 级映射
### 3.3 CIM 与 GPU/NPU 之间的软件调度
#### 3.3.1 主流分工：flash 做 decode 权重 GEMV、NPU 做 prefill 与非线性（Cambricon-LLM/KVNAND/NASiC）
#### 3.3.2 编译器子图划分与跨设备搬运开销：PCIe vs HBM 13× 带宽差、ADC 约占 ISAAC 一半功耗
### 3.4 专家验证：问题 4 引述文献的判定
#### 3.4.1 结论：方向大体正确但不可作固定规则；层映射须 per-model 剖析

## 4. 推理能力影响因素与误差容忍度（对应模型问题 5）（~3500 字，1 表）
### 4.1 影响 LLM 推理能力的因素排序
#### 4.1.1 权重 vs 激活 vs KV cache 的敏感度排序；激活 outlier 是第一约束
### 4.2 LLM 相对图像分类的误差容忍度
#### 4.2.1 通路分裂结论：权重通路容忍度≥CNN（GPTQ 175B@4bit 损 ≤0.25 PPL；IBM Nature Comm. 2023）
#### 4.2.2 激活/KV 通路显著更脆弱：朴素 W8A8 使 OPT-175B 71.6%→32.3%；2-bit Key 即崩溃
#### 4.2.3 自回归长链推理比 PPL 先崩；仅用 PPL 评估会系统性低估噪声损伤
### 4.3 NAND 硬件噪声证据与缓解手段
#### 4.3.1 Shim 2022：开态电流 2–3.5nA 波动使 CIFAR-10 掉约 5pt；产品级要求 σ<2.5nA
#### 4.3.2 缓解组合：噪声感知训练/LoRA 补偿 + outlier FP16 冗余 + ECC/温补
### 4.4 专家验证：问题 5 预设的判定
#### 4.4.1 结论："LLM 容忍度更高"笼统说法不成立，须分通路回答

## 5. 大模型打分评价体系与用户关心指标（对应模型问题 6）（~3000 字，1 表）
### 5.1 质量维度
#### 5.1.1 学术基准快速换代：MMLU→MMLU-Pro/HLE、HumanEval→SWE-bench、NIAH→RULER
#### 5.1.2 幻觉/安全/指令遵循/Agent/偏好：SimpleQA、HarmBench、IFEval、τ-bench、Arena
### 5.2 服务性能维度
#### 5.2.1 八件套：TTFT/ITL/E2E/吞吐/goodput/SLO 达成率/每 token 成本/MFU（指标定义表）
#### 5.2.2 典型 SLO：TTFT<0.5–2s、TBT 50–100ms；长上下文另看 KV/prefix 命中率
### 5.3 用户角色分野与选型框架
#### 5.3.1 终端用户/运营/开发者指标差异；Artificial Analysis 指数 + 真实用量交叉选型
### 5.4 评测方法论争议
#### 5.4.1 基准污染、Arena 刷榜（虚增可达 112%）、Goodhart 效应

## 6. AI 系统搭建 Trade-off 与快照回放瓶颈识别（对应模型问题 7、8）（~3500 字，1 表）
### 6.1 从需求反推系统配置
#### 6.1.1 权重+KV 公式与 roofline 分相：prefill compute-bound、decode memory-bound
#### 6.1.2 存力阶梯：HBM $8–25/GB·TB/s 级 → DRAM → NVMe $0.1–0.2/GB·GB/s 级
### 6.2 存力 Trade-off 的核心权衡
#### 6.2.1 容量换 batch/命中率 vs 时延恶化；扩容边际收益递减（Kareto：超拐点存储成本反超算力节省）
### 6.3 快照回放识别瓶颈
#### 6.3.1 方法栈：Chakra ET、vLLM/SGLang+nsys、Vidur/DistServe trace 仿真
#### 6.3.2 瓶颈判定决策树：MBU/SM 利用率区分 compute/memory/IO/network-bound
### 6.4 存力监测指标清单
#### 6.4.1 HBM 带宽利用率、KV 命中率/占用率、offload 流量与时延、GPU 气泡、SSD IOPS/带宽（指标表）

## 7. NAND/HBF 硬件机制四问（对应硬件问题 1–4）（~4000 字，2 表）
### 7.1 NAND 读延时的系统影响与 pipeline 掩盖
#### 7.1.1 tR 分层：SLC≈25–30µs、TLC≈40–100µs、QLC≈85–170µs（对比表）
#### 7.1.2 掩盖机制：cache read/multi-plane/die 交织/通道并行；实测读并行收益仅约 10.9%（瓶颈在 I/O 总线）
### 7.2 HBF 逻辑 die 计算核的承载能力
#### 7.2.1 SanDisk/Kioxia HBF 架构：16-die TSV 堆叠 + CBA 逻辑 die（并行 sub-array 调度与缓冲）
#### 7.2.2 验证：截至 2026-07 公开资料未见逻辑 die 含通用 AI 算力；敏感点在 SRAM/功耗
#### 7.2.3 对照研究：HBM-PIM bank 阻塞 13µs、SmartSSD 热节流掉 50–60%
### 7.3 地址映射表与 SRAM Buffer 容量
#### 7.3.1 1TB SSD 页级映射约需 1GB DRAM；buffer 不足触发换入换出，性能悬崖最高 57%
#### 7.3.2 按需映射（DFTL）与 PrefetchFTL（+39.4% 命中）；HBF 双缓冲 SRAM 按 >2×带宽×读延迟配置
### 7.4 NAND 读延迟的触发时机
#### 7.4.1 预取粒度共识：中粒度块（约 100KB–数 MB / 64–256 token）+ 至少提前一层
#### 7.4.2 与 LLM 逐层 KV 顺序消费节奏的匹配：Tutti slack-aware TTFT−78.3%、HCache 64-token chunk
### 7.5 专家验证：硬件四问判定汇总
#### 7.5.1 问题 2 预设"逻辑 die 有计算核"暂无公开证据支持；问题 1/3/4 判定成立（附条件）

## 8. 综合洞察与验证结论（~3000 字）
### 8.1 七条跨维度洞察
#### 8.1.1 HBF 的革命性：把卸载判定从"预测命中"降级为"延迟掩盖"
#### 8.1.2 瓶颈迁移路径：容量墙→延迟墙→调度墙
#### 8.1.3 MoE 与 KV 对 HBF 是"一体两面"：稀疏读 + 顺序读互补
#### 8.1.4 NAND CIM 的正确定位：权重 CIM 可行、激活/KV 留数字域
#### 8.1.5 层映射无固定规则，工具链是比阵列更长的短板
#### 8.1.6 快照回放可裁决 SSD 层入列争议；仿真关键在 I/O 路径建模
#### 8.1.7 国内互联多轨格局下 HBF 接口应以 RoCEv2 兼容为一等需求
### 8.2 冲突区呈现
#### 8.2.1 C1 HBF 延迟口径 / C2 SSD 层入列 / C3 层映射启发式 / C4 容忍度 / C5 互联口径 / C6 逻辑 die 算力
### 8.3 对 14 个问题的最终验证判定与行动建议
#### 8.3.1 模型 8 问判定表
#### 8.3.2 硬件 6 问判定表
#### 8.3.3 风险提示：HBF 全部性能数字 2026–2027 年前为厂商目标值

# References
## hbf_report_sec01.md ~ hbf_report_sec08.md
- **Type**: 章节文件
- **Path**: /mnt/agents/output/
## research/hbf_dim01.md ~ hbf_dim10.md
- **Type**: 维度调研报告（470+ 引用）
- **Path**: /mnt/agents/output/research/
## research/hbf_cross_verification.md / hbf_insight.md
- **Type**: 交叉验证与洞察
- **Path**: /mnt/agents/output/research/
