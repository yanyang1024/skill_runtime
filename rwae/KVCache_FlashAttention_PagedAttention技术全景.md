# KV Cache / FlashAttention / PagedAttention 技术全景

> 原理 → 近期发展 → 衍生技术 → 实际使用体验（资料截至 2026 年中）

---

## 一、一句话总览

这三者是大模型推理优化的三大基石，但解决的问题层次不同：

| 技术 | 一句话解释 | 解决的问题 | 核心思路 |
|---|---|---|---|
| **KV Cache** | 推理时把历史 token 的 Key/Value 缓存下来复用 | 自回归生成的 O(n²) 重复计算 | 以显存换算力，复杂度降为 O(n) |
| **FlashAttention** | 不改数学定义、只改计算顺序与内存访问的"精确"注意力 kernel | Attention 的 HBM IO 瓶颈与 O(n²) 显存占用 | Tiling 分块 + Online Softmax，在 SRAM 内完成计算 |
| **PagedAttention** | 像操作系统管理虚拟内存一样管理 KV Cache | 服务化场景下的显存碎片、利用率低 | 固定大小 block 分页 + block table，按需分配 |

三者关系：**KV Cache 是"要不要存"的问题，PagedAttention 是"怎么存"的问题，FlashAttention 是"怎么算"的问题**。现代推理引擎（vLLM、SGLang、TensorRT-LLM）把三者全部内置，叠加使用。

---

## 二、KV Cache：推理加速的第一性优化

### 2.1 含义与原理

Transformer 自回归生成时，每生成一个新 token 都要与全部历史 token 计算注意力。若不缓存，每步都要重算所有历史 token 的 K/V，计算复杂度 O(n²)。KV Cache 的核心洞察是：**已处理 token 的 K/V 向量在后续步骤中不会改变**，因此可以缓存复用：

- **Prefill 阶段**：并行计算整个 prompt 的 Q/K/V，把 K/V 存入缓存（决定首 token 延迟 TTFT）
- **Decode 阶段**：每步只算新 token 的 Q/K/V，与缓存的历史 K/V 做注意力，再把新 K/V 追加进缓存（决定每 token 延迟 TPOT）

复杂度从 O(n²) 降为 O(n)，推理速度提升 3-10 倍不等（模型越大提升越明显）。代价是显存占用：

```
KV Cache 显存 = 2 × 层数 × KV头数 × head_dim × 序列长度 × 每元素字节数
```

参考量级：Llama-2-7B 生成 2048 token 约 536MB（FP16）；70B 模型 FP16、32K 上下文，KV Cache 可超 10GB，成为推理时的首要内存瓶颈。高并发 + 长上下文（4K→256K）+ 多轮持久化 + RAG 注入叠加后，Agent 时代的 KV Cache 内存压力相比早期增长 8-16 倍，"内存墙"已成为行业共识的核心矛盾。

### 2.2 衍生技术体系

#### 2.2.1 架构层：让 KV Cache 从源头变小

| 演进 | 年份 | 思路 | 效果 |
|---|---|---|---|
| MHA | 2017 | 标准多头注意力 | KV Cache 最大 |
| MQA | 2019 | 所有头共享一份 K/V | Cache 减约 96%，但质量损失大，已被淘汰 |
| **GQA** | 2023 | 分组共享 K/V | 减 4-8×，质量几乎无损；Llama-3/Qwen2.5/Mistral 标配，生态最成熟 |
| **MLA** | 2024 | 低秩联合压缩（DeepSeek-V2/V3/R1） | Cache 压缩约 87% 且保持 MHA 级质量，当前最优解 |
| TransMLA | 2025 | 将现有 GQA 模型迁移到 MLA 结构 | NeurIPS 2025 |
| SWA 滑窗 | — | 只保留最近窗口的 KV | 稀疏注意力方向，常与全局层混合 |

#### 2.2.2 量化压缩

- **FP8 KV Cache**：H100/B200 上显存节省约 50%，是生产部署的主流手段
- **DeepSeek UE8M0 FP8**（2025-08）：专为国产芯片设计的 FP8 变体，128K 上下文下 KV Cache 显存降约 50%（约 40-50GB），推理提速至少 20%，数学/编程/推理任务精度损失控制在 1% 以内；让单卡容纳整个任务的 KV Cache 成为可能，也利好 PD 分离与 KV Cache 外置
- **KVTC**（2026-01）：借鉴视频压缩的变换编码思想，把 KV Cache 当作多帧"图像"做有损压缩，2:1 压缩比下几乎无精度损失

#### 2.2.3 稀疏注意力（2025 年最热的方向）

核心思想：不是每个 token 都值得被注意，只读一小部分缓存就能保持质量。

- **NSA（Native Sparse Attention，DeepSeek，2025-02）**：三分支结构——块级压缩（全局粗读）+ 重要块选择（细读）+ 滑窗（局部）；可端到端训练、kernel 硬件对齐
- **MoBA（Kimi/月之暗面，与 NSA 同日发布）**：借 MoE 路由思想，每个 query 动态路由到相关 KV 块，可在稀疏/全注意力间切换
- **DSA（DeepSeek Sparse Attention）**：已落地 DeepSeek-V3.2 与 GLM-5，用轻量 "lightning indexer" 给历史 token 打分、细粒度 top-k 选择，标志学习型稀疏注意力从研究走入生产基础设施
- **免训练路线**：MInference（离线给每个 head 归类注意力模式）、Quest（query 感知的页级选择）、H2O / StreamingLLM（KV 驱逐）、EvolKV（演化算法跨层自适应分配 KV 预算，ACL 2025）

#### 2.2.4 前缀缓存复用

| 维度 | vLLM APC（自动前缀缓存） | SGLang RadixAttention |
|---|---|---|
| 数据结构 | 哈希表，block 级匹配（16/32 token） | Radix Tree，token 级匹配 |
| 前缀粒度 | 需 block 对齐，语义边界可能被截断 | 任意长度，单 token 级 |
| 典型收益 | 固定 system prompt 场景 TTFT 降 5-10× | 多轮对话/RAG/Agent 场景缓存命中率更高，16K RAG 场景吞吐比 vLLM 高约 40% |
| 注意点 | vLLM V1 起默认开启、零开销 | 前缀完全不重叠时树本身有少量开销，优势消失 |

一个 2026 年的新坑：vLLM APC 的复用是**前缀敏感**的——RAG 场景若两次检索命中文档相同但顺序不同，前缀立即分叉、复用失效。CacheWeaver（2026）提出按缓存感知重排文档顺序来对齐前缀。

#### 2.2.5 分层存储与卸载（Offloading）

```
GPU HBM（~80GB，~3.35 TB/s）
  ↕ NVLink/PCIe
CPU DRAM（~512GB，~200 GB/s）
  ↕ PCIe
NVMe SSD（~8TB，~7 GB/s）
  ↕ 网络
远程分布式存储
```

- **FlexGen**（ICML 2023）：首个 GPU/CPU/磁盘三级存储跑 OPT-175B 的框架
- **LMCache**：vLLM 插件，CPU/SSD/远程多级缓存，TTFT 降 3-10×
- **FlexKV**（腾讯 TACO）：分布式 KV 存储池，多实例共享
- **IMPRESS**（2026-03）：面向超长文档 RAG 的多级重要性感知前缀 KV 存储系统
- 分层卸载的延迟可通过"上一层计算时预取下一层缓存"来隐藏

#### 2.2.6 KV Cache 管理的五个时代（Modular 总结）

1. **连续预分配**（早期）：按 max_seq_len 预分配，碎片率 60-80%
2. **PagedAttention**（2023）：分页按需分配，碎片 <4%
3. **异构 KV Cache**（2024）：MLA/SWA/量化并存，缓存形状各异
4. **分布式 KV Cache**（2025+）：PD 分离、KV 感知负载均衡、层级化溢出
5. **统一混合内存**（演进中）：GPU/CPU/SSD 统一编址、业务感知调度（GTC 2026 共识：热数据驻留 HBM、温数据到 Host DRAM、冷数据持久化到远端存储，淘汰策略从 LRU 升级为任务类别感知）

---

## 三、FlashAttention：IO 感知的精确注意力

### 3.1 原理

标准 Attention 会把 N×N 的注意力矩阵显式写入 HBM 再读回——序列变长后，GPU 大量时间不在计算而在搬数据。FlashAttention 的三个关键设计：

1. **Tiling 分块**：Q/K/V 切成小块载入片上 SRAM，分块完成计算，从不物化完整 N×N 矩阵
2. **Online Softmax**：每处理一块就动态更新最大值 m 与归一化分母 l，保证分块结果与全量 Softmax 严格等价
3. **反向重计算**：训练反向传播时不保存中间注意力矩阵，按块重算（计算换显存，计算比 IO 快所以整体仍更快）

**它是精确算法，不是近似**——输出与标准 Attention 数学等价。显存复杂度从 O(n²) 降到 O(n)。

### 3.2 版本演进

| 版本 | 年份 | 目标硬件 | 关键改进 |
|---|---|---|---|
| FA1 | 2022 | Ampere（A100） | IO-aware tiling、online softmax、反向重计算 |
| FA2 | 2023 | Ampere + Ada | 优化 warp/thread block 划分、减少非矩阵乘 FLOP、支持 MQA/GQA；A100 上达 50-73% 峰值 FLOPs |
| FA3 | 2024 | Hopper（H100/H200） | warp specialization + 异步流水线 + FP8；H100 上 FP16 达 740 TFLOPs（75% 利用率），FP8 近 1.2 PFLOPs，数值误差比基线 FP8 低 2.6× |
| **FA4** | 2025 | Blackwell（B200/B300，SM100） | TMA tile 执行、warp 特化 5 级流水线、CUDA core 上的 software exp2、自适应 online softmax 重缩放；**目前仅支持前向，backward/varlen/GQA 尚缺** |

### 3.3 衍生与生态

- **FlashMLA**（DeepSeek 开源）与 **FlashInfer**：MLA + 稀疏注意力的专用 kernel，已成为 DeepSeek 系/GLM 模型部署的两大主流实现
- **FireQ**（2025）：在 FA3 基础上扩展为三级流水线，支持 INT4×FP8 混合精度 GEMM
- **框架自动适配**：vLLM v0.6+ 与 SGLang v0.4+ 会按 GPU 架构自动选择 kernel（H100/H200 → FA3，B200/B300 → FA4，A100/L40S → FA2），无需手动配置
- **真实踩坑**：DGX Spark（GB10，SM12x 架构）虽然是"Blackwell"，但 FlashMLA 需要 SM100 的 tcgen05/TMEM 或 SM90 的 WGMMA，FA4 也只支持 SM100——SM12x 三者皆无，直接报"FlashAttention only supports Ampere GPUs or newer"。数据中心 Blackwell ≠ 桌面 Blackwell，kernel 支持不能只看架构名

---

## 四、PagedAttention：KV Cache 的操作系统式管理

### 4.1 原理

vLLM 团队（UC Berkeley，SOSP'23）借鉴 OS 虚拟内存分页思想：

- 传统方案为每个请求**预分配 max_seq_len 的连续显存**，产生三类碎片：内部碎片（实际生成长度远小于预留）、外部碎片（请求间隙无法复用）、共享前缀无法去重
- PagedAttention 把 KV Cache 切成固定大小 block（默认 16 token），按需分配；每个序列维护一张 **block table**（逻辑块 → 物理块映射），与 OS 页表完全同构

论文数据：显存利用率从约 20% 提升到 >96%，碎片率从 60-80% 降到 4% 以下；吞吐比 FasterTransformer/Orca 提升 2-4×（相对早期 HF 方案最高 24×）；同一块显存上并发请求数从 8-12 个提升到 40-60 个（70B FP8 on H100，4K 上下文场景）。它还顺带打开了前缀共享的大门：多个请求/采样的相同前缀可指向同一组物理 block（写时复制）。

代价：注意力 kernel 需处理非连续内存访问，block 大小需要调优。

### 4.2 衍生技术

#### 调度层（与 PagedAttention 协同）

- **Continuous Batching**：请求完成立刻补位，不等齐 batch（Orca 提出）
- **Chunked Prefill**（Sarathi-Serve 起源）：长 prompt 分块与 decode 混合组批，避免长 prefill 阻塞 decode；vLLM V1（2025）起默认开启
- **vLLM V1 架构**（2025-01 alpha，0.8.0 起默认）：统一调度器把调度决策简化为 `{request_id: num_tokens}`，chunked prefill、prefix caching、投机解码在同一框架表达；prefix caching 默认开启且零开销重写

#### 架构层：PD 分离（Prefill/Decode Disaggregation）

核心观察：prefill 是 compute-bound，decode 是 memory-bound（Byte-per-FLOP 需求相差约 100×），放在同一 GPU 互相踩踏。2024-2025 年最大的架构演进：

| 方案 | 出品方 | 特点 |
|---|---|---|
| DistServe | 北大（OSDI'24） | 最早系统提出 PD 分离，goodput 4.48× / SLO 收紧 10.2× |
| SplitWise | 微软 | PD 分离提升 GPU 利用率 |
| **Mooncake** | 月之暗面（Kimi 生产平台） | **FAST 2025 最佳论文**；KVCache-centric 调度器，利用集群闲置 CPU/DRAM/SSD 构建分布式 KV Cache 池；模拟长上下文场景吞吐最高 +525%，真实负载下让 Kimi 多承载 75% 请求 |
| **NVIDIA Dynamo** | NVIDIA（GTC 2025） | 数据中心级分布式推理框架：PD 分离 + KV 感知路由 + NIXL（RDMA 零拷贝 GPU 间 KV 传输）+ 分层 KV Block Manager；推理模型吞吐宣称最高 30×；引擎无关（vLLM/SGLang/TRT-LLM 均可接入），1.0 已 production-ready |
| SGLang PD | SGLang | 原生内置，`--disaggregation-mode prefill\|decode` |
| vLLM disagg | vLLM 0.7+ | `KVConnector` 抽象，可接 NIXL / Mooncake Transfer Engine（0.8+） |

代价：KV 传输开销（无 NVLink/IB 时严重）、最低 GPU 数翻倍、静态 P:D 比例在负载波动时利用率下降。多模态场景进一步演进为 EPD 三段分离（Encode/Prefill/Decode）。

---

## 五、使用体验与选型建议

### 5.1 推理引擎横向对比（2026 年视角）

| 场景 | 推荐 | 原因 |
|---|---|---|
| 前缀重度复用的 RAG | **SGLang** | RadixAttention 复用文档上下文 KV，TTFT 低 20-40% |
| 多轮对话 Agent | **SGLang** | 每轮复用历史前缀，缓存命中率随前缀长度上升（2K 前缀可达 ~92%） |
| 结构化 JSON 输出 | SGLang（略优） | 双方都默认 xgrammar，SGLang 的 grammar 缓存复用更激进 |
| 独立短 prompt 高吞吐 | 打平 | H100 上各并发级别差距 <5% |
| 模型支持广度/上手简单 | **vLLM** | 架构覆盖最广、pip 即装、文档社区最完整 |
| Blackwell（B200/GB200）原生 | **vLLM** | v0.17+ 集成 FA4 后端，SGLang 在追赶 |
| 投机解码（Eagle3） | **vLLM** | 集成成熟，SGLang 仍实验性 |
| NVIDIA 硬件极限性能 | **TensorRT-LLM** | 深度硬件优化，但有编译开销与冷启动成本 |
| 多节点 70B+ 高负载 | **Dynamo + 任一引擎** | 专为跨节点 PD 分离设计；单节点部署则属过度设计 |
| TGI | 谨慎 | v1.0+ 改 HFOIL license 限制云托管，最后 Apache 2.0 版本为 0.9.4 |

经验法则：**请求前缀重叠率 >60% 先测 SGLang；跑 Blackwell 或要 Eagle3 先上 vLLM；不确定就 vLLM**（安全默认项）。注意 SGLang 底层同样实现了 PagedAttention，RadixAttention 是其上的进一步抽象，两者不互斥。

### 5.2 生产环境常见坑速查

| 症状 | 根因 | 修复 |
|---|---|---|
| 长 prompt 高并发 OOM | KV 按 max-len 预留、碎片严重 | vLLM ≥0.6 + chunked prefill + 调低 max-model-len |
| 同一 system prompt 多请求吞吐不涨 | 前缀 KV 未共享，重复 prefill | 开 `--enable-prefix-caching`（V1 已默认），或迁 SGLang；监控 `vllm:cache_hit_rate` |
| 长 prefill 阻塞 decode，TTFT 飙升 | P/D 同卡互相干扰 | 开 chunked prefill；高负载走 PD 分离 |
| P99 延迟抖动大 | 调度抢占频繁 | vLLM 0.7+ 多步调度，扩显存或降并发 |
| DGX Spark 上 FlashMLA/FA4 不能用 | SM12x 不在支持列表 | 等待 SM12x 适配或换 kernel 后端 |
| 安全漏洞 | vLLM <0.10.2 有 CVE-2025-62164；TRT-LLM <0.18.2 有 CVE-2025-23254 | 升级到最新 patch 版本 |

### 5.3 2025-2026 年值得关注的动向

1. **稀疏注意力进入生产**：DSA 已随 DeepSeek-V3.2、GLM-5 上线，"learned sparse attention 已从研究变为生产基础设施"
2. **KV Cache 成为独立基础设施层**：Mooncake 式 KVCache-centric 架构、Dynamo/llm-d/AIBrix 等 K8s 原生方案涌现；但分布式推理仍很难——NIXL 等库尚年轻、IB/RoCE 组网复杂、投机解码/VLM 与分布式架构兼容性差
3. **KV 压缩算法快速迭代**：KVTC（变换编码）、IMPRESS（分层 RAG 前缀）、EvolKV（跨层预算分配）
4. **FA4 跟进 Blackwell**：目前仅前向，生态（vLLM 已集成后端）先行，等待完整功能
5. **国产算力适配**：UE8M0 FP8 让沐曦/海光/寒武纪单卡容纳长上下文 KV Cache，降低 PD 分离与外置缓存的落地门槛
6. **GTC 2026 行业共识**：面向 Agent 与 1M 长上下文，KV Cache 管理的方向是"智能分层 + 业务感知调度"——类似 OS 虚拟内存的多级架构 + 按任务类别区分冷热的淘汰策略

---

## 参考链接

[^1^]: https://arxiv.org/html/2607.08032v1 （NSA/MoBA/DSA 技术综述）
[^2^]: https://blog.csdn.net/fox0329/article/details/160254100 （MHA→MQA→GQA→MLA 演进）
[^4^]: https://www.cnblogs.com/SCCQ/p/19837955 （KV Cache 优化体系与 2026 新动向：KVTC/IMPRESS/EvolKV）
[^5^]: https://www.infoq.cn/article/MQ9xMgqr7XrSbD8yu6Tw （GTC 解读：Agent 时代的 KV Cache）
[^6^]: https://www.36kr.com/p/3660169702924932 （NSA 与 MoBA 发布背景）
[^7^]: https://adg.csdn.net/696f445b437a6b403369cf10.html （KV Cache 原理与显存估算）
[^13^]: https://arxiv.org/html/2603.28458v1 （块稀疏 vs token 级稀疏注意力）
[^14^]: http://mp.weixin.qq.com/s?__biz=MzkzNTM4OTc4NA==&mid=2247484992&idx=1&sn=223a0077702df6c384cdd823f9e369b9 （DeepSeek UE8M0 FP8 解读）
[^16^]: https://arxiv.org/pdf/2505.20839 （FireQ：FA3 三级流水线扩展）
[^17^]: https://www.arxiv.org/pdf/2508.01506 （FA3 性能数据：740 TFLOPs/1.2 PFLOPs）
[^18^]: https://juejin.cn/post/7649934594186084392 （vLLM/SGLang/TRT-LLM/TGI 深度对比）
[^19^]: https://blog.csdn.net/weixin_39992480/article/details/161740837 （PagedAttention vs RadixAttention）
[^20^]: https://www.spheron.network/blog/vllm-vs-sglang-2026/ （2026 选型决策与缓存命中率数据）
[^21^]: https://blog.csdn.net/sweet_ran/article/details/161839971 （RadixAttention 基数树机制）
[^23^]: https://github.com/harrisliangsu/ai-agent-engineer-handbook/blob/main/interview-prep/interview-questions.md （PagedAttention 三类碎片与 24× 吞吐）
[^27^]: https://blog.51cto.com/deephub/14501416 （KV Cache 管理架构演进）
[^34^]: https://www.cnblogs.com/SCCQ/p/19837994 （KV Cache 卸载与多级存储：FlexGen/LMCache/FlexKV）
[^39^]: https://blog.csdn.net/w776341482/article/details/162718932 （PD 分离方案版本矩阵）
[^42^]: https://www.resumemakeroffer.com/blog/post/107739 （FlashAttention tiling/online softmax/重计算）
[^43^]: https://arai.dev/AI/LLMs （FA4 技术细节与现状）
[^45^]: https://www.cnblogs.com/SCCQ/p/19964642 （Continuous Batching 与 vLLM 版本演进）
[^46^]: https://openeuler.csdn.net/6a4db1e6662f9a54cb8acd88.html （PagedAttention 错误速查卡）
[^47^]: https://blog.csdn.net/yaohaishen/article/details/160630449 （FlashAttention IO 感知原理）
[^48^]: https://www.backend.ai/blog/2026-02-is-dgx-spark-actually-a-blackwell （DGX Spark kernel 兼容性踩坑）
[^49^]: https://www.spheron.network/blog/inference-engineering-guide-2026/ （2026 推理栈选型）
[^51^]: https://kvcache-ai.github.io/Mooncake/ （Mooncake 官方文档）
[^52^]: https://github.com/kserve/kserve/issues/5293 （NVIDIA Dynamo 架构要点）
[^56^]: https://arxiv.org/html/2606.19667v1 （CacheWeaver：RAG 前缀对齐）
[^57^]: https://blog.mckayzhao.com/ai/56/ （vLLM V1 架构解析）
[^58^]: https://www.modular.com/blog/the-five-eras-of-kvcache （KV Cache 五个时代）
[^59^]: https://www.spheron.network/blog/flashattention-2-vs-flashattention-3-h100-h200-guide/ （FA 版本时间线与框架自动选择）
