# HBF × AI 推理调研 — 交叉验证结果（Phase 4-5）

验证范围：hbf_dim01.md ~ hbf_dim10.md（10 份维度报告，合计约 470 条带原文摘录/URL/日期/置信度的引用）。
验证日期：2026-07-17。

## 一、High Confidence（≥2 个独立维度/来源相互印证）

1. **KV cache 分层卸载已产品化，层级为 HBM→DRAM→SSD/对象存储**：Mooncake（FAST'25）、LMCache、vLLM KVConnector、SGLang HiCache、NVIDIA Dynamo KVBM/NIXL、AIBrix/InfiniStore（dim01、dim09 一致；36kr、Dynamo 官方文档佐证）。
2. **热路径跨节点 KV 搬运的事实标准是 GPUDirect RDMA（每 GPU 400Gbps 级）；国内跨厂商最大公约数为 RoCEv2**（dim01、dim02 一致）。
3. **HBF 规格目标值多源一致**：SanDisk/Kioxia 提出，16-high 堆叠、单堆 512GB、带宽约 1.6TB/s（目标 1.6–3.2TB/s）、容量为 HBM 的 8–16×，2026-02 在 OCP 启动标准化（SanDisk + SK hynix），2026H2 出样、2027–2028 进 GPU 产品（dim01、dim04、dim05、dim10 四路印证；官方新闻稿 + "HBM 之父" Kim Joungho 访谈）。
4. **Decode 阶段 memory-bound**：batch=1 算术强度 1–2 FLOP/B，H100 拐点约 295 FLOP/B；增大 batch 是吞吐杠杆（H100 实测 batch1→64：550→12,000 tok/s）（dim05、dim09 一致）。
5. **"读不如重算"存在带宽拐点**：SSD 层有效带宽 24–37GB/s（或 10–80Gbps）以下时取回 KV 慢于重算；SSD CPU-centric I/O 导致 70–80% GPU stall（Tutti，dim01、dim03、dim09 三处独立引用）。
6. **KV 访问读多写少**：生产 trace 显示读:写≈186:1；80% 的 KV 复用发生在 10 分钟内（dim03，ATC'25 生产 trace + DualPath 98.7% 命中率，dim01 佐证）。
7. **MoE 与慢速/大容量介质互补**：expert offloading 是成熟技术线（MoE-Lightning 10.3×、LLM-in-a-Flash 20–25×）；瓶颈是"取得不够快"而非"放不下"（dim04，多系统一致）。
8. **LLM 计算 99.8% FLOPs 为 MAC**：FFN 占 2/3 参数；softmax/LN/residual FLOPs<0.2% 但占约 39% 运行时、必须数字单元承担（dim06）。
9. **KV cache 比权重对误差更敏感**：2-bit Key 即崩溃；Key 比 Value 敏感、首末层敏感；朴素 W8A8 使 OPT-175B 从 71.6%→32.3%（dim07，KIVI/KVQuant/LLM.int8() 多源）。
10. **NAND tR 分层数值一致**：SLC≈25–30µs、TLC≈40–100µs、QLC≈85–170µs（dim10；与 dim03 假设量级一致）。
11. **FTL 页级映射表容量**：1TB SSD 约需 1GB DRAM；buffer 不足引发映射换入换出，性能悬崖最高 57%（PrefetchFTL，dim10）。
12. **预取粒度共识**：中粒度块（约 100KB–数 MB / 64–256 token）+ 至少提前一层（Tutti slack-aware TTFT−78.3%、HCache 64-token chunk、FlexGen 层预取）（dim03、dim10 一致）。
13. **长上下文下 KV 流量反超权重流量**：128K GQA 约 0.84TB/s/请求 vs MLA 0.18TB/s（dim05；与 dim09 "瓶颈从计算转向 KV 搬运"一致）。

## 二、Medium Confidence（单一权威来源）

- 华为灵衢 UB：CM384 每 NPU 392GB/s UB + 400G RDMA 双平面；Atlas 950 灵衢2.0 单卡 2TB/s、8192 卡（dim02，华为官方口径，缺第三方验证）。
- 预测驱动 KV 放置比 LRU 提升命中率 8–24%（dim03，贝叶斯预测 arXiv 2604.26968）。
- KV 写耐久预算：100K P/E 下高频写 5 年超 TBW；retention 折短后 1M P/E 有 7.6× 余量（dim03 推算）。
- IBM Nature Comm. 2023：BERT/LSTM 达 99% iso-accuracy 而 CNN 掉 3.6%（dim07）。
- SmartSSD 热节流性能掉 50–60%；HBM-PIM bank 阻塞 13µs（dim10）。

## 三、Conflict Zone（矛盾点，报告需显式呈现）

| # | 冲突 | 双方来源 | 处理 |
|---|------|---------|------|
| C1 | **HBF 读延迟**：dim04 记 ~10µs（≈HBM 100×，Kioxia/分析师口径）；dim05 记 OCP 送审规格 tR≈4µs；dim10 记底层 TLC tR 40–100µs | Kim Joungho 访谈 vs OCP 规格 vs NAND 器件文献 | 三者测的是不同层：HBF 通过并行 sub-array/双缓冲把有效访问延迟压到个位数 µs（目标值），裸 NAND tR 不变。报告按"裸 tR 不变、有效延迟为厂商目标值"呈现并标注 |
| C2 | **SSD 层是否应入列 KV 层级**：dim01/dim09 引 Tutti "70–80% GPU stall、取回慢于重算"；dim01 另载 LMCache/HyperPod L2 实测 ITL 改善 1.67×、VAST TTFT 11s→1.5s | Tutti (arXiv 2605.03375) vs LMCache/VAST 厂商数据 | 条件性结论：GPU-centric 直接 I/O + 粗粒度对象化是关键分水岭；呈现两种相反实测并给出条件 |
| C3 | **层敏感度"前几层高精度、后几层模拟 MAC"启发式**：dim06 显示证据部分支持"边界层敏感、中间耐噪"，但 GPT-2 首个 AIMC 逐投影画像显示最敏感在 block0 内部投影、LionHeart 实测 first-last 映射行为不可预测 | 用户清单 Q4 引述文献 vs dim06 多文献 | 判定用户假设"方向大体对、但不可作规则用"；推荐 perturbation 剖析 + projection 级映射 |
| C4 | **LLM vs 图像分类误差容忍度**：dim07 结论"分裂"——权重通路容忍度不低于甚至高于 CNN，激活/KV 通路显著更脆弱；且自回归长链推理比 PPL 先崩 | 用户 Q5 预设（LLM 容忍度更高）vs dim07 证据 | 显式推翻笼统结论，分通路回答 |
| C5 | **UALink/灵衢带宽口径混乱**，"阿里 MNNVL"系术语误用（dim02） | 各厂商口径 | 标注不确定，以第三方可验证数据为准 |
| C6 | **HBF 逻辑 die 是否含通用计算核**：用户 Q2 预设"逻辑 die 上有计算核"；dim10 查公开资料未见通用 AI 算力，CBA 逻辑 die 负责并行 sub-array 调度与缓冲 | 用户预设 vs SanDisk/Kioxia 公开资料 | 显式标注：截至 2026-07 无公开证据支持逻辑 die 含通用计算核 |

## 四、Low Confidence / 需声明的边界

- 所有 HBF 性能数字（带宽、延迟、容量、出样时间）2026–2027 年前均为**厂商目标值**，无第三方实测（dim01、dim04、dim10 共同声明）。
- MoE 专家预测命中率区间极大（17%→99%），强模型相关（dim04）。
- 评测基准污染与 Arena 刷榜使单一榜单不可信（dim08）。

## 五、Phase 5 结论

C1–C6 已通过维度内多源证据就地化解或显式标注为领域性分歧，无需追加验证代理；冲突将在最终报告中以"冲突区"形式呈现而非抹平。
