# 维度02：KV Cache 分层卸载的互联底座技术调研（2024–2026，重点中国方案）

> 调研范围：NVLink5/NVSwitch、RDMA（IB/RoCEv2）、CXL 2.0/3.x、PCIe Gen5/6、UALink、光互联/CPO；Mooncake / llm-d / Dynamo 的实际 KV 搬运路径；华为灵衢 UB、阿里 ALS/HPN、腾讯 ETH-X/星脉、字节 EthLink、中兴 OLink、中国移动 OISA/GSE、曙光/浪潮整机柜、国内 CXL 生态与标准。
> 方法：15+ 组独立中英文搜索（60+ 查询），覆盖 arXiv/USENIX/SIGCOMM 论文、厂商官方发布、行业媒体与券商研报。每条关键论断附 [^n^] 引用（含原文摘录、URL、日期、置信度）。
> 完成日期：2026-07（以检索到的最新公开信息为准）。

---

## Key Findings

1. **KV 卸载对互联的要求是"分层"的，不存在单一互联答案。** PD 分离的 KV 搬运（热路径，卡在 TTFT 上）需要每 GPU 数十至数百 GB/s、单向时延微秒级的 RDMA/NVLink 级互联；而分层卸载到 DRAM/SSD/远端池（温/冷路径）可用 PCIe/CXL/RDMA/以太网逐级降级，带宽需求从 ~64 GB/s（PCIe Gen5 x16）降至 ~50 GB/s/卡（400G NIC）、~几 GB/s（NVMe SSD）。128K 上下文的 Llama-3-70B 单请求 KV 约 40GB（TP=4 时每 GPU 对 ~10GB），在 25Gbps 链路上传输需 ~3.2s，直接吃掉整个 TTFT 预算[^20^]；在 10–50Gbps 普通云网络下 KV 通信占作业完成时间 16–60%[^21^]；64k token 前缀命中时，从主机内存取回 KV 可占 TTFT 的 70%[^22^]。

2. **当前生产系统 KV 搬运的事实标准是 RDMA（RoCEv2/IB）+ GPUDirect，节点内走 NVLink/PCIe P2P。** Mooncake（月之暗面 Kimi 生产系统，日处理 100B+ token）用 GPUDirect RDMA 的 Messenger/Transfer Engine 在 CPU/DRAM/SSD/GPU 间搬 KV，生产机型每 A800 GPU 配 100/200Gbps NIC、每 H800 配 200/400Gbps NIC[^11^][^12^]；NVIDIA Dynamo 用 NIXL（UCX + GPUDirect Storage 后端），抽象覆盖 NVLink/NVSwitch/InfiniBand/Spectrum-X/RoCE，为单边 RDMA 写[^16^]；llm-d（Red Hat/IBM/Google）为 K8s 原生、KV 感知路由，连接器可选 NIXL/Mooncake 等，生产 P2P 仍主要走 RDMA 与同机 NVLink/NCCL[^18^][^19^]。**即："跨节点 RDMA、节点内 NVLink/PCIe、下沉存储 NVMe-oF/GDS"是 2024–2026 实际部署形态；CXL/光互联直连搬 KV 尚处论文与样机阶段。**

3. **全球互联性能梯队（每加速器端口带宽）：** NVLink5（Blackwell）1.8 TB/s 双向/18 链路[^1^] > AMD Helios UALink 拓扑 ~3.6 TB/s（多 lane 聚合，CES 2026 披露）[^4^] ≈ NVLink6（Rubin）3.6 TB/s[^2^] > 华为灵衢 2.0 单卡 2 TB/s[^32^] > UALink 1.0 单端口（x4）800 Gb/s（=100 GB/s/方向，可多端口聚合）[^4^] ≈ PCIe Gen6 x16 双向 256 GB/s[^5^] ≈ CXL 3.x x16（基于 PCIe 6.0 PHY）[^6^] > RoCEv2/IB 800G（100 GB/s/方向）[^8^]。时延梯队：UALink 端口跳 100–150ns[^4^] < NVLink/CXL（亚微秒，CXL.mem 额外 100–200ns[^6^]）< 以太交换单跳 200–500ns[^8^] < IB 端口到端口 ~0.6µs[^8^] < RoCEv2 端到端 ~1–2µs（拥塞时劣化）[^8^] < SSD 随机写 <7µs（华为 AI SSD）[^47^]。

4. **UALink 1.0（2025-04-08 发布）是开放阵营对标 NVLink 的旗舰**：200 GT/s/lane、x1/x2/x4、单域最多 1024 加速器、10-bit ID 路由、线缆 <4m、64B/640B 载荷往返 <1µs、93% 有效带宽、680B flit、以太网 PHY（802.3dj）[^3^][^4^]；但**量产硅片 2026 底–2027 才到**[^3^]。阿里云 2025 年 1 月以董事会级别加入 UALink 联盟[^36^]，澜起、联想、盛科等为中国贡献成员[^3^]。

5. **华为灵衢 UB 是中国唯一已规模商用的 NVLink 级私有总线，且已转向"开源开放"。** CloudMatrix 384（灵衢 1.0）用 UB 平面全对等互联 384×910C+192×鲲鹏，每 NPU 提供 >392 GB/s 单向 UB 带宽（14×400G 以太 SerDes 接口折算；SemiAnalysis 实测口径为 2800 Gbit/s=350 GB/s 单向，见争议节），节点间时延增量 <1µs，跨节点带宽衰减 <3%[^26^][^27^]；Atlas 950 SuperPoD（灵衢 2.0，2026Q4 上市）8192 卡、总互联 16.3 PB/s、单卡 2 TB/s、跨柜卡间 <2.1µs、光互联 >200m、百纳秒级光路保护[^32^]。华为 2025-09 宣布开放灵衢 2.0 规范（基础协议 600+ 页，对比"NVLink 30 页"），已下载 2.4 万份并成立灵衢社区；UB-Mesh 论文（arXiv 2503.20377）与 Hot Chips 2025 均承诺免费许可、目标以单一总线取代 PCIe/CXL/NVLink/TCP-IP[^28^][^29^][^30^]。

6. **灵衢 UB 对标 NVLink 的真实差距在"单链路速率与生态成熟度"，不在拓扑理念。** UB 物理层复用 400G 以太 SerDes（112G/lane），靠端口数量堆带宽（每 910C 14×400G）；NVLink5 单链路即 400G+400G（224G SerDes）[^1^]。UB 的差异化是：对等架构（CPU/NPU/内存/SSD/NIC 六类组件全对等、Load/Store 内存语义、统一编址）+ 全光跨柜（>200m）+ 协议全开放；代价是 6912 个 400G 光模块/Pod 的功耗与可靠性挑战（SemiAnalysis 批评点；华为称光互联可靠性提升 100 倍）[^27^][^32^]。**对 KV 卸载的含义：CM384 把"活动 KV"放在 RDMA 平面（每 NPU 400Gbps RoCE）做 P→D 传输，把 UB 平面用于池化内存（跨 CPU/NPU 内存的 KV/权重池）点对点访问[^26^]——即华为方案的 KV 热路径仍是 RDMA，UB 用于温层池化。**

7. **中国开放 Scale-up 标准呈"三轨并行"，尚未收敛：** ① 专用总线：华为灵衢 UB（已开放规范）、海光 HSL[^48^]；② 以太优化：腾讯/信通院 ETH-X（ODCC 1.0 规范已发布，PAXI 传输层支持 256 卡全互联、PRI 12B 头，2025-04 首台原型机点亮，实测跨卡访存时延较 RoCEv2 降 12.7 倍）[^39^]、字节跳动 EthLink（深度魔改以太，其思路后被博通 SUE 吸收；SUE 目标单跳 RTT <2µs、单域 1024 XPU、12×800G 聚合 9.6Tb/s）[^40^]、中兴 OLink（开放总线、兼容 RDMA、宣称 800GB/s、机柜 128 卡/理论 1024）[^41^]；③ 运营商开放架构：中国移动 OISA 2.0（1024 卡、TB/s、数百 ns）+ GSE（Scale-out，全套标准 2024-09 发布、哈尔滨万卡商用、训练通信时间占比降 20%+、自研"智算琢光"DPU）[^42^][^43^]。此外工信部牵头 **CLink** 试图制定全国统一算力互联标准[^41^]，中兴杂志预判"或统一为 CLink、或由 OCP ESUN 归一化整合、或长期多元竞逐"[^39^]。

8. **阿里路线 = UALink 阵营 + 自研系统**：磐久 AL128 超节点（2025 云栖大会）单柜 128–144 GPU，ALink 互联支持 UALink 标准也兼容 NVLink/xLink/UB/xCN 等原生内存语义协议；ALS-D（数据面，内存语义+在网计算）/ALS-M（管控面），绑定 CIPU 2.0，带宽 Pb/s 级、时延百 ns 级；GPU 兼容海光/沐曦/燧原/天数/摩尔线程；Scale-out 侧为 HPN（SIGCOMM'24：51.2T 单芯片、每 GPU 专属 400Gbps RDMA、单 Pod 15K GPU、训练吞吐 +14.9%）与规划中的 UPN512 单层光互联域[^35^][^36^]。**注意：任务书中"阿里云 MNNVL"应为概念混淆——MNNVL 是 NVIDIA Multi-Node NVLink 的缩写；阿里 Scale-up 方案正确名称是 ALS/ALink（基于 UALink），Scale-out 是 HPN/UPN，未发现阿里使用"MNNVL"命名的公开资料（见争议节）。**

9. **国内 CXL 生态"器件强、系统弱"，尚未用于 GPU 直连搬 KV：** 澜起科技全球首发 CXL 3.1 MXC（M88MX6852，PCIe 6.2 PHY、64 GT/s x8、双通道 DDR5-8000，2025-09 送样），也是全球首家进入 CXL 联盟合规清单的 MXC 厂商（2023-08）；海光 C86-5G CPU 集成 CXL 2.0、华为有适配昇腾的 CXL 控制器、国数集联做 CXL 多级交换、佰维/江波龙做 CXL 模组、浪潮 NF5280G7 与阿里 PolarDB（CXL 2.0 Switch）已落地[^46^]。但 CXL 3.x 的实际角色是 CPU 侧内存扩展/池化；GPU↔CXL 内存池搬 KV 仅见学术原型（TraCT、CXL-SpecKV：CXL 64GB/s 带宽、<400ns 时延 vs PCIe 16GB/s、3–5µs）[^23^]。

10. **KV 下沉到"存储级互联"的中国特色方案**：华为 UCM（2025-08 发布、9 月开源）做 HBM-DRAM-SSD 分级，宣称 TTFT 最高降 90%、长序列 TPS 提升 2–22 倍[^47^]；OceanDisk 1800 智能盘框用 DPU 硬化 KV 语义，NPU/GPU—DPU—SSD 三跳直通旁路 CPU/DRAM，单框 4 DPU+24 NVMe SSD、160 GB/s、1600 万 IOPS，可组 PB 级共享 KV 池，TTFT 再降 80%，KV Connector 对接 vLLM/SGLang/Mooncake[^47^]——这是"以存强算"路线：用 DPU+NVMe-oF 把 KV 冷层做成共享池，绕开对 RDMA 带宽的部分需求。

11. **光互联是中美共同方向但切入点不同**：NVIDIA Quantum-X Photonics（CPO，2025 底）从 Scale-out 交换机切入，CPO 规模用于 Scale-up 预计 2028–2030[^9^]；华为直接用 400G 光模块做 Scale-up（CM384 每 Pod 6912 个光模块）[^27^]，代价/可靠性争议大；铜的有效距离仅 ~1m（高速铜互联），UALink 优化至 <4m，这决定了 NVL72/UALink 单机柜域 vs 灵衢/UPN512 跨柜域的拓扑分野[^3^][^49^]。

12. **DeepSeek 的硬件反思论文（arXiv 2505.09343）代表了中国模型方对互联的诉求**：明确建议 Scale-up 与 Scale-out 融合（统一框架、NVLink 与 IB 域间硬件转发、专用协处理器），并点名 UEC、UALink 与华为 UB 为值得关注的新兴协议[^48^]——模型厂商在倒逼互联收敛，这对 KV 卸载意味着未来 P→D 传输可能不再区分"总线"与"网络"。

---

## 互联技术对比表

### 表1：Scale-up/Scale-out 互联关键指标（2024–2026 公开规格）

| 技术 | 单端口/链路带宽 | 每加速器聚合带宽 | 时延 | 拓扑/域规模 | 传输距离 | 开放性 | KV 卸载适配 |
|---|---|---|---|---|---|---|---|
| **NVLink 5 + NVSwitch**（Blackwell，量产） | 400G+400G/链路，18 链路 | 1.8 TB/s 双向；机架 130 TB/s | 亚微秒（节点内 ~1µs 量级）[^17^] | NVSwitch 全互联，最大 576 GPU（商用 NVL72） | 铜缆 ~1m 级（柜内） | 私有（NVLink Fusion 授权第三方 chiplet） | PD 分离同域 KV 直传（NIXL/NCCL P2P）[^1^][^16^][^49^] |
| **NVLink 6**（Rubin，2026H2 起） | 800G+800G/链路（400G SerDes） | 3.6 TB/s 双向；NVSwitch6 28.8 TB/s | 同上 | NVL144，576 端口演进 | 铜（柜内）+光子路线图 | 私有 | 同上[^2^] |
| **UALink 1.0**（2025-04 规范，2026 底–2027 硅片） | 200 GT/s/lane；x4 端口 800 Gb/s（双向） | 单端口 100 GB/s/方向；可多端口聚合（AMD Helios 宣称 ~3.6 TB/s/卡） | 端口跳 100–150ns；RTT <1µs（64B/640B） | 交换式单域 ≤1024 加速器 | 铜 <4m | 开放（联盟免授权费；阿里、澜起、联想、盛科参与） | 设计即内存语义 load/store，适合 GPU 直读远端 KV[^3^][^4^][^36^] |
| **PCIe Gen5 x16**（量产） | 32 GT/s/lane | 64 GB/s/方向（128 双向） | ~1µs 级（含 RC） | 树形，单主机域 | <0.5m 板级/retimer 延长 | 开放（PCI-SIG） | HBM↔DRAM 卸载主通道；KV CPU 卸载瓶颈层[^5^][^22^] |
| **PCIe Gen6 x16**（2024–26 上量） | 64 GT/s/lane（PAM4+FEC） | 128 GB/s/方向（256 双向） | FEC 增加 ~百 ns | 树形 | 更短，依赖 retimer | 开放 | 同上；CXL 3.x 物理载体[^5^] |
| **CXL 2.0**（基于 PCIe5 PHY） | 32 GT/s | ~63 GB/s x16 双向 | CXL.mem 较本地 DRAM +100–200ns | 单层交换、内存池 | 机箱/机柜内 | 开放（CXL 联盟；澜起 MXC 合规） | CPU 侧 KV 池化（DRAM 扩展）[^6^][^46^] |
| **CXL 3.0/3.1/3.2**（基于 PCIe6 PHY） | 64 GT/s | ~256 GB/s x16 双向（理论） | 同上量级；多级交换再加时延 | 多级交换、内存共享（3.1）、PBR 路由 | 机柜内 | 开放；澜起 3.1 MXC 2025-09 送样 | GPU-CXL DMA 搬 KV 仅论文原型（TraCT/CXL-SpecKV）[^6^][^23^][^46^] |
| **CXL 4.0**（2025-11-18 发布） | 128 GT/s（PCIe7 PHY） | ~500 GB/s x16（预估） | — | 首次支持跨机柜内存池（bundled ports） | 跨机柜（2027 目标） | 开放 | 远期 KV 池候选[^7^] |
| **RoCEv2 400G**（量产主流） | 400 Gb/s 端口（50 GB/s/方向） | 每 GPU 一张 400G NIC（阿里 HPN/腾讯星脉 3.2T/8 卡节点） | 端到端 ~1–2µs；交换单跳 200–500ns；拥塞劣化至数十 µs | Clos/rail 优化，万卡级 | 机房级（光模块 500m–2km） | 开放（IBTA/IEEE），生态最成熟 | **当前 KV 跨节点搬运事实标准**（Mooncake/NIXL）[^8^][^11^][^36^][^37^] |
| **RoCEv2 800G / IB XDR 800G**（2025–26 上量） | 800 Gb/s（100 GB/s/方向） | ConnectX-8 级 SuperNIC | IB 端口到端口 <600ns；亚微秒交换 | Quantum-X800 144×800G | 同上 | IB 私有（NVIDIA）；以太开放 | 下一代 KV 热路径[^8^] |
| **SUE / ESUN（以太 Scale-up）**（2025 规范） | 800G 基础单元 | 12×800G 聚合至 9.6 Tb/s（规范示例） | 单跳 RTT <2µs 目标 | 单域 ≤1024 XPU，单跳 pod | 机柜级 | 开放（Broadcom/OCP；字节 EthLink 为其前身之一） | 内存语义 over 以太，KV 适用[^40^][^39^] |
| **光互联/CPO** | 1.6T/光引擎（微环 200G/λ） | Quantum-X Photonics 115.2 Tb/s/交换机 | 省去 DSP/retimer 时延 | Scale-out 2025–26；Scale-up 2028–30E | 百米–公里级 | 标准化进行中（OIF/CPO Collaboration） | 解决跨柜/跨机房 KV 池带宽功耗墙[^9^] |
| **NVMe-oF / GDS（存储层）** | 单盘 14.7 GB/s 读（华为 LC 560）；盘框 160 GB/s | 每节点数十–252 GB/s（WEKA 宣称） | 随机写 <7µs（AI SSD）；文件存储数十–百 µs | 存储网络 | 机房级 | 开放 | KV 冷层（SSD 池）搬运通道[^47^] |

### 表2：KV 分层卸载 × 互联层级映射（综合各来源的工程量级）

| 层级 | 介质 | 典型互联 | 有效带宽（每 GPU/每节点） | 时延量级 | 代表系统 |
|---|---|---|---|---|---|
| L0 热层 | GPU HBM | 片内 HBM | 3.35–8 TB/s（H100→B200） | ~ns | vLLM PagedAttention |
| L1 节点内 | 邻卡 HBM | NVLink4/5 P2P 或 NCCL | ~300 GB/s（H100 实测 NCCL P2P/方向）–1.8 TB/s | ~1µs | NCCLConnector、NIXL 同机[^17^][^19^] |
| L2 跨节点热路径（PD 分离） | 远端 HBM | RDMA（IB/RoCEv2 400–800G）+ GPUDirect | 25–50 GB/s/NIC；聚合 200–400 GB/s/节点（8 NIC） | ~10µs 级（NIXL 实测 47 token <5ms 含软件） | Mooncake Messenger、NIXL/UCX[^11^][^16^] |
| L3 本机温层 | CPU DRAM | PCIe Gen5/6（未来 CXL 3.x） | 25–60 GB/s | 1–5µs | LMCache、Dynamo KVBM G2[^22^][^16^] |
| L4 集群温层 | 远端 DRAM 池 | RDMA/以太网 | 依 NIC 聚合 | 十–数十 µs | Mooncake Store（Conductor 调度）[^11^] |
| L5 冷层 | NVMe SSD / SSD 池 | PCIe / NVMe-oF / DPU 直通 | 几–14.7 GB/s/盘；160 GB/s/盘框 | 7µs–亚 ms | Mooncake SSD 层、华为 UCM+OceanDisk、Dynamo G3/G4[^47^][^16^] |

**带宽需求的经验锚点**：要让 P→D KV 传输不进 TTFT 关键路径，工程上需要"KV 字节数 ÷ 可接受传输时间"反推——例：10GB/pair ÷ 100ms ≈ 100 GB/s/pair，即至少 2×400G NIC 聚合或 NVLink 域内传输[^20^]；这也是阿里/腾讯为每 GPU 配 400Gbps、华为 CM384 为每 NPU 配 400Gbps RDMA 平面的原因[^26^][^36^][^37^]。

---

## 中国方案

### 3.1 华为：灵衢 UB（UnifiedBus）+ CloudMatrix/Atlas 超节点 + UCM 存储卸载

**协议定位与细节**
- 灵衢 UB 始于 2021 年华为公司级战略项目（与鸿蒙并列），2021 APNet 首次公开架构，目标是替代 PCIe/以太网，统一 Scale-up 与 Scale-out[^28^][^29^]。UB 采用**对等架构**：CPU/NPU/SSU/内存/DPU 等设备地位平等，任意设备可通过 Load/Store 内存语义直接访问其他设备，实现资源全池化、统一编址[^31^]。
- 华为全联接大会 2025（2025-09-18）：徐直军宣布**开放灵衢 2.0 技术规范**，邀请产业链基于该协议研发产品；官方表述"灵衢不止是一个替代，是 AI 算力互联标准的重塑"[^30^]。2026-02 华为披露：灵衢基础协议 600+ 页（"相较于英伟达 NVLink 的 30 页协议"），累计下载 2.4 万份，已成立灵衢社区社区化运营[^28^]。Hot Chips 2025 上海思首席科学家廖恒宣布 UB-Mesh 协议将向所有人免费开放许可[^30^]。
- 灵衢社区宣传资料口径：UB 带宽可达 TB/s 级、点对点时延可达 200ns[^31^]。灵衢 2.0 关键工程指标：单跳通信时延从 2µs 降至 200ns（降 10 倍）、通信带宽较传统互联提升 15 倍、全光无损互联 >200m、光路百纳秒级故障检测与保护切换、可靠性提升 100 倍[^32^]。

**CloudMatrix 384（灵衢 1.0，2025-04 发布，已售 300+ 套/20+ 客户）**[^33^]
- 三平面架构[^26^]：**UB 平面**（Scale-up，无阻塞全对全连接 384 NPU+192 CPU；每 910C 贡献 >392 GB/s 单向带宽，底层 14×400G 以太接口；UB 交换芯片单芯片 19.2 Tbps=48×400G，每计算节点 7 颗板载 L1 + 机架级 L2；节点间时延增量 <1µs）；**RDMA 平面**（Scale-out，RoCE，每 NPU 400Gbps 单向，**官方明确其作用①就是"推理期间预填充和解码 NPU 之间活动 KV 缓存数据的高速传输"**）；**VPC 平面**（400Gbps 以太，管理/存储/控制，可选 UBoE 增强）。
- UB 平面对 KV 的意义：支持 TP/EP 细粒度并行跨节点边界 + **跨 CPU/NPU 内存的池化内存快速点对点访问，"对高效缓存模型权重和 KV 缓存至关重要"**（论文口径）[^26^]。
- 光实现：每 Pod 6912 个 400G 光模块（5376 用于 Scale-up）；SemiAnalysis 口径每 910C 用 7×400G 光模块堆出 2800 Gbit/s 单向，单层扁平拓扑、cell spraying[^27^]。系统指标：BF16 300 PFLOPS、49.2TB 内存、1229 TB/s 内存带宽、跨节点带宽衰减 <3%[^33^]。

**Atlas 950/960 SuperPoD（灵衢 2.0）**[^32^][^33^]
- Atlas 950（2026Q4 上市）：单柜 64 卡为基本单元、64 卡步长扩展至 **8192×Ascend 950DT 无收敛全互联**；UB-Mesh 递归直连拓扑；单卡互联带宽 **2 TB/s**（较 910C 提升 ~2.5 倍）；总互联带宽 **16.3 PB/s**；跨柜卡间时延 <2.1µs；1152TB 统一编址内存；128 计算柜+32 互联柜、全液冷、全光。Atlas 960（2027Q4）：15488 卡、34 PB/s。
- 配套集群：Atlas 950 SuperCluster（64 超节点、FP8 524 EFLOPS）。

**UCM + OceanDisk（KV 卸载到存储的中国特色路径）**[^47^]
- UCM（推理记忆数据管理器，2025-08-12 发布、2025-09 开源）：稀疏注意力+前缀缓存+预填充卸载+异构 PD 解耦，HBM/DRAM/SSD 按热度分级流动；宣称 TTFT 最高降 90%、长序列 TPS 提升 2–22 倍、上下文窗口 10 倍扩展；已在中国银联试点。
- OceanDisk 1800 智能盘框（2026-06）：DPU（NP 核）硬化卸载原生 KV 语义，**"NPU/GPU—DPU—SSD"三跳直通、彻底旁路 CPU 与 DRAM**；单框 4×DPU+24×NVMe SSD，160 GB/s、1600 万 IOPS；PB 级共享 KV 池；单 xPU 可用 KV 容量 GB→TB 级；宣称 TTFT 再降 80%、单位 Token 成本降 30%；KV Connector 对接 vLLM/SGLang/Mooncake。AI SSD 本体：SP 560 随机写 600K IOPS/<7µs，EX 560 1500K IOPS，LC 560 单盘 245TB/读 14.7 GB/s。

### 3.2 阿里巴巴：UALink 阵营的 ALS/ALink + HPN/UPN + 磐久超节点

- **磐久 AI Infra 2.0 AL128 超节点**（2025-09 云栖大会）：整柜 128–144 GPU、350kW 供电；GPU 节点与 ALink SW 节点**正交无背板互联**（112G/224G SerDes），单级交换；协议上"支持 UALink 国际开放标准，也可支持 NVLink、xLink、UB、xCN 等行业主流 GPU 原生内存语义协议"[^35^]。
- **ALS（ALink System）分层**：ALS-D 数据面用 UALink，支持 GPU load/store 内存语义 + 交换芯片内置张量计算单元的在网 AllReduce；ALS-M 管控面统一接入阿里 PPU 及海光、沐曦、燧原、天数智芯、摩尔线程等国产 GPU；ALink Switch 与 CIPU 2.0 深度绑定，目标带宽 Pb/s 级、时延百 ns 级[^35^]。阿里 2025-01 以董事会级别加入 UALink 联盟[^36^]。
- **Scale-out：HPN**（SIGCOMM 2024，生产部署 8 个月+）：51.2T 单芯片交换、非堆叠双 ToR、rail 优化+双平面；每主机 9×(2×200G) NIC，**每 GPU 专属 400Gbps RDMA**（吃满 PCIe Gen5 x16）；单 Segment 1K GPU、单 Pod 15K GPU、训练吞吐 +14.9%[^36^]。规划中的 **UPN512**：单层 CLOS 直连 512 XPU（受交换芯片 Radix 512 限制，下一代 1024+），NPO/CPO 光互联、扩展计算头解耦协议与在网计算[^35^]。
- **"MNNVL"澄清**：未检索到阿里以"MNNVL"命名的互联技术；MNNVL 为 NVIDIA Multi-Node NVLink 缩写（NVL72 域间扩展）。阿里对应物是 ALS（Scale-up）与 HPN/UPN（Scale-out）。阿里云在 Scale-up 上明确站队 UALink 而非自研私有协议（见争议节 C5）[^35^][^36^]。

### 3.3 腾讯：星脉（Scale-out）+ ETH-X（Scale-up 开放标准牵头方）

- **星脉高性能网络**（2023 起，持续演进）：每计算节点（8 GPU）3.2T RDMA 带宽 = 8×400G RoCE 网卡；Block=256 GPU、Pod 最大 1.6 万 GPU、Cluster 理论 26 万卡；3.2T 较 1.6T 集群算力 +20%[^37^]。星脉是国内最早把"每 GPU 一张 400G RDMA 卡"做成标配的云厂商方案之一，直接服务 PD 分离与 KV 池化的带宽底座。
- **ETH-X（信通院+腾讯牵头，ODCC 立项）**：2024-09 发布《ETH-X 超节点 AI 整机柜设计规范》；**《ETH-X ScaleUp 互联协议规范》1.0 已发布**，分层含 Scale-Up 访存协议（GPU-GPU、GPU-内存池事务）、互通协议（GPU-Switch 可靠传输）、D2D 互联；传输层 PAXI（合见工软 IP，支持 256 卡全互联、通用以太交换机组网）、PRI 统一转发头 12B（2B Network DeviceID+10B 设备地址，替代 DMAC/SMAC）；2025-04-08 首台原型机在华勤东莞点亮；官方测试以 RoCEv2 为基线验证 DirectAccess/DirectCopy/MoE 通信[^39^]。第三方报道：实测跨卡数据访问时延降低 12.7 倍、适用 8–512 卡[^39^]。30+ 成员含快手、京东、燧原、英特尔、博通、锐捷、新华三、联想、中兴、云豹、盛科、立讯、光迅等[^39^]。
- 腾讯还在软件侧与 NVIDIA 合作 FlexKV（分布式 KV 存储，已支持 Mooncake Transfer Engine）[^50^]。

### 3.4 字节跳动：EthLink（SUE 前身之一）+ MegaScale 网络

- **EthLink**：字节自研 Scale-up 协议，走"单点破局"路线——深度魔改标准以太网实现无损低时延内存语义，未公开商用[^40^]。博通 2025 年推出 SUE（Scale-Up Ethernet）白皮书时系统性吸收了 EthLink 已验证的技术点（报文头压缩、LLR/CBFC 等）并将其标准化，SUE 目标：单跳端到端 RTT <2µs、800G 基础单元、12×800G 聚合 9.6 Tb/s、单域 1024 XPU[^40^]。字节训练侧 Scale-out 为三层 rail 优化网络（MegaScale，万卡级）[^36^]。

### 3.5 中兴通讯：OLink + 全标准参与

- **OLink**（2024-09 起）："以太+总线融合"的 GPU 卡间高速互联，机内机间统一交换式架构，突破单机 8 卡 Full Mesh 限制、支持 16 卡以上，宣称**开放总线协议、兼容 RDMA 标准、带宽高达 800 GB/s**[^41^]；正交整机柜方案单柜 128 卡、理论可扩 1024 卡[^41^]。
- 中兴是**唯一同时参与 ETH-X、ALS、OISA 并与中国移动联合研发 GSE 交换芯片（51.2T）的交换芯片厂商**[^41^]；同时参与工信部牵头的全国统一标准 **CLink** 制定；2025-06 在 ODCC 立项《基于正交架构的超节点硬件系统》；Nebula Matrix 集群超节点支持跨机柜、跨品牌 GPU 混布[^41^]。

### 3.6 中国移动：OISA（Scale-up）+ GSE（Scale-out）+ PHYSec

- **OISA（全向智感互联）**：原创协议体系，定义物理层/数据层/事务层；Gen1.1 支持 128 GPU、点对点 800 Gbit/s；**OISA 2.0（2025-08 中国算力大会发布）支持 1024 张 AI 芯片、带宽 TB/s 级、互联时延数百 ns**，具备统一报文格式双模式、事务层选择性重传+数据层点对点重传、CBFC/PFC 流控、集合通信卸载到交换芯片等特性[^42^]。
- **GSE（全调度以太网）**：对标 UEC 的中国 Scale-out 体系（"全球范围内两大具有影响力的技术体系之一"）。2023-05 白皮书→2024-09 全套技术标准（GSE1.0 算网协同/GSE2.0 端网协同/网络侧优化）→2024-11 首颗 GSE DPU"智算琢光"（200G 端口、报文容器喷洒、DGSQ 拥塞控制）。GSE1.0 已在移动哈尔滨智算中心**超万卡集群商用，训练通信时间占比缩 20%+**；GSE-N2N 中试较传统 RoCE 提升 50%+[^43^]。

### 3.7 整机柜阵营：曙光 / 浪潮 / 新华三 / 超聚变 / 百度

- **中科曙光 scaleX640**（2025-11-06，全球首个单机柜 640 卡）：一拖二高密架构、**全电互联两层 Scale-up**（初期 IB，后适配自研 scaleFabric）；单柜 600+ PFLOPS、双柜 1280 卡；MoE 万亿模型训推 +30–40%；scaleFabric 为自研 400G 无损 RDMA 网络（112G SerDes IP、交换芯片 64 Tbps 双向、**网卡端到端时延 <1µs**）；16×scaleX640 组成万卡超集群，已落地国家超算互联网郑州节点[^44^]。
- **浪潮元脑 SD200**（2025-08）：多主机低时延**内存语义**通信架构、开放总线交换，单机 64 路国产 GPU；远端 GPU 虚拟映射突破多主机统一编址，显存地址空间扩 8 倍（4TB 显存+64TB 内存）；**百纳秒级链路**；**开放 PD 分离框架支持异步 KV Cache 高效传输**；信通院《超节点测试大纲》国内首个通过产品（TPOT 8.73ms，DeepSeek R1 推理 64 卡 3.7× 超线性）[^44^]。
- 其他：新华三 UniPoD S80000（32–1024 卡，统一全互联 256 卡通信带宽 ×4）；超聚变 FusionPoD；百度天池 256/512（昆仑芯）[^44^]。

### 3.8 国内 CXL 生态现状

- **芯片/器件**：澜起科技 MXC 全球领先——2022-05 全球首款 CXL 2.0 MXC、2023-08 全球首家 CXL 合规供应商、2025-09 CXL 3.1 MXC（M88MX6852：PCIe 6.2 PHY、64 GT/s x8、可拆 2×x4、双通道 DDR5-8000、E3.S/AIC 形态）送样；PCIe 5.0 Retimer 中国大陆唯一量产供应商[^46^]。国数集联自研 CXL 多级交换机（CMNS，24 端口）；数渡信息 PCIe 5.0/6.0 Switch。
- **系统**：海光 C86-5G 集成 CXL 2.0 控制器；华为有适配昇腾集群的 CXL 方案（内存池化+热插拔）；阿里 PolarDB 全球首款 CXL 2.0 Switch 数据库服务器；浪潮 NF5280G7 CXL 内存扩展；佰维 CXL 2.0 DRAM 模组、江波龙 CXL 内存模组[^46^]。
- **判断**：国内 CXL 生态已覆盖"控制器-交换-模组-系统"全链，但定位是 CPU 侧内存扩展；**GPU 直挂 CXL 内存池做 KV 卸载，国内外都还是研究原型**（TraCT：以 CXL Type-3 共享内存替代 RDMA 网络做 PD 间 KV 传输；CXL-SpecKV：FPGA+CXL 投机式 KV，吞吐 2.1–3.2×）[^23^]。

### 3.9 标准组织与测试体系

- **ODCC（开放数据中心委员会）**：ETH-X 超节点系列（技术规范 1.0、整机柜设计规范、Scale Up 协议测试报告、运维规范）+ 中兴《基于正交架构的超节点硬件系统》立项[^39^][^41^]。
- **中国信通院**：与腾讯共同牵头 ETH-X；发布《超节点测试大纲》并完成首批评测（浪潮 SD200 首家通过）[^44^]。
- **CCSA**：GSE 行业标准立项[^43^]。
- **工信部 CLink**：统一算力互联标准制定中（中兴等参与）[^41^]。
- **灵衢社区**：华为主导的 UB 生态运营实体；另有华为 unifiedbus.com 官方站点[^28^][^29^]。
- **UEC 对照**：美国主导的 Ultra Ethernet Consortium 为中国各以太路线共同对标对象；DeepSeek 论文同时点名 UEC/UALink/UB 值得关注[^48^]。

---

## 争议与冲突

**C1. UALink 带宽口径混乱（Gb vs GB、单端口 vs 聚合）。** NAND Research（2025-04-17）明确"Max 800 **Gb**/s per port (x4)"[^4^]；而 Introl 等多篇二手文章写"800 **GB**/s (x4 config)"[^3^]，二者差 8 倍。Towards AI 按 800 GT/s 折算"~0.4 TB/s effective"[^51^]，Spheron 则称 AMD MI455X 在 72 卡 Helios 机架靠密集 lane 拓扑做到 ~3.6 TB/s/加速器[^4^]。**采信口径：UALink 1.0 单端口（x4）双向 800 Gb/s（≈100 GB/s/方向），每加速器可靠多端口堆叠；"UALink 单连接只有 NVLink5 的 1/3"与"UALink 超越 NVLink"两种说法分别对应单端口与整机架聚合两种口径。** 置信度：高（以一手的 UALink 联盟发布与 NAND Research 为准）。

**C2. 华为 910C 的 UB 单卡带宽：392 GB/s vs 350 GB/s（2800 Gbit/s）。** 华为 CloudMatrix 论文/架构解读口径为"每 910C >392 GB/s 单向（14×400G 接口）"[^26^]；SemiAnalysis 按 7×400G 光模块实测折算为 2800 Gbit/s=350 GB/s 单向[^27^]；另有国内媒体误写为"双向 392 Gbps"（单位错误，差 8 倍）[^34^]。可能解释：14×400G 为双向计数（7×400G/方向=350 GB/s），392 GB/s 或为含编码前线路速率折算或不同代际口径。**采信：350–392 GB/s 单向区间，标注双口径。** 置信度：中。

**C3. 灵衢时延宣传口径不一（200ns / 2.1µs / 3µs / <1µs）。** 官方不同场合分别给出："点对点时延可达 200ns"（灵衢社区资料）[^31^]、"单跳时延 2µs→200ns"（灵衢 2.0 vs 传统协议对比）[^32^]、"跨柜卡间时延 <2.1µs"（Atlas 950）[^32^]、"RTT 7µs→3µs"（MWC26 口径）[^32^]、"单柜内卡间往返 3µs"（券商调研）[^32^]、"CM384 节点间时延增量 <1µs"（论文口径）[^26^]。**这些数字分别对应：单跳交换时延 / 端到端 RTT / 跨柜光链路 / 不同代际（灵衢 1.0 vs 2.0），不可横向拼接对比。与 NVLink 对比时应使用同口径（端到端 RTT 或单跳）。** 置信度：高（对"口径混杂"这一事实本身）。

**C4. 光互联 Scale-up 的可靠性之争。** SemiAnalysis 批评 CM384 单 Pod 6912 个光模块带来功耗、成本、可靠性（"5000 个光模块可能导致可靠性问题，需要高质量容错训练软件"）[^27^]；华为则宣称通过光器件/光模块/互联芯片重新设计+百纳秒级光路保护，"光互联可靠性提升 100 倍、距离超 200 米，实现电的可靠和光的距离"[^32^]。NVIDIA/博通阵营认为柜内应坚持铜（有效距离 ~1m、可靠且便宜），CPO 上 Scale-up 要等 2028–2030[^9^][^49^]。**本质是对"光模块失效率×数量"的不同工程赌注；暂无第三方长期运行数据裁决。** 置信度：中（双方立场均如实呈现）。

**C5. "阿里云 MNNVL"命名问题。** 以"阿里 MNNVL / Alibaba MNNVL / 阿里云 multi-node NVLink"等组合检索均无结果；MNNVL 是 NVIDIA 多节点 NVLink 术语。阿里公开技术栈为：Scale-up=ALS/ALink（UALink 标准）+ 磐久 AL128；Scale-out=HPN（SIGCOMM'24）/UPN512/Stellar RDMA（SIGCOMM'25）[^35^][^36^]。**结论：任务背景中的"阿里云 MNNVL"大概率为术语混淆，报告中已按 ALS+HPN 纠正。** 置信度：中高（基于检索无果+阿里官方资料）。

**C6. 中兴 OLink "800 GB/s" 与 OISA/ETH-X 指标缺乏第三方验证。** OLink 的"800GB/s"出自 2024-09 C114 对中兴高管的采访稿[^41^]，未说明是单端口/单向/聚合口径，也无公开测试报告；OISA 2.0（TB/s、数百 ns）[^42^]、ETH-X"跨卡时延降 12.7 倍"[^39^]均来自牵头方自述，缺独立复测。**国内开放 Scale-up 标准整体处于"规范发布+原型机"阶段，与 NVLink/灵衢的量产差距主要在生态与验证数据。** 置信度：中。

**C7. Mooncake/NIXL 传输性能数字的场景依赖。** vLLM×Mooncake"TTFT 降 25%"来自其 README 的特定基准（未注明模型/负载全参数）[^13^]；NIXL"RDMA ~10µs、200 Gbps"与"NVLink ~1µs、600 Gbps"出自社区教程而非 NVIDIA 官方[^17^]；vLLM issue 实测同机 NixlConnector 未走 NVLink 时吞吐仅 ~1.8 GB/s，说明**软件栈默认值对实际 KV 传输性能影响远大于链路理论带宽**[^52^]。引用此类数字须绑定场景。置信度：高（对"场景敏感"的判断）。

**C8. Scale-up 时延目标与 KV 卸载真实需求错配。** 超节点宣传普遍强调"百纳秒"（对标 TP/EP 集合通信），但 KV 分层卸载的温/冷层（DRAM/SSD 池）实际容忍十 µs–亚 ms 级[^11^][^47^]；华为自己也认为"AI 负载主要是带宽密集型而非延迟敏感型，微小延迟开销影响可忽略"（有评论者对此存疑，指出 P/D 节点、稀疏/稠密模型对时延敏感度不同）[^26^]。**启示：评估 KV 卸载互联底座时应分热/温/冷三层分别定带宽与时延 SLO，而非套用训练 Scale-up 的百 ns 指标。** 置信度：高。

**C9. CXL 在 GPU KV 卸载中的角色被部分文献高估。** CXL-SpecKV 等论文宣称 CXL 64GB/s、<400ns 相对 CPU offload（16GB/s、3–5µs）优势显著[^23^]，但其 64GB/s 实为 PCIe5 x16/CXL 2.0 量级而非 CXL 3.x 独有；且 GPU 直挂 CXL Type-3 池无商用产品，国内外 CXL 落地均为 CPU 内存扩展[^46^]。**CXL 3.x/4.0 用于 KV 池化是 2027 后期权项，不是 2024–2026 可交付底座。** 置信度：高。

**C10. 中国标准"收敛 vs 多元"前景不明。** 中兴技术杂志列举三种可能："国内统一为 CLink 通用标准 / 网络层由 ESUN 归一化整合 / 技术利益分歧下长期多元竞逐"[^39^]。当前 ETH-X、ALS(UALink)、OLink、OISA、灵衢 UB 五套并存且互联互通性有限（OLink/OISA/ETH-X 偏以太可兼容、ALS 靠近 UALink、UB 独立）[^38^][^41^]。**对 KV 卸载互联选型的含义：2026 年内中国侧不存在唯一"国家队"标准，跨厂商 KV 池化短期仍需落到 RoCEv2/RDMA 这一最大公约数。** 置信度：中高。

---

## 附：关键引用清单（编号对应正文 [^n^]）

[^1^] arXiv《The Landscape of GPU-Centric Communication》表3："Fifth|18|50|1800 … Fifth-generation NVLink on NVIDIA Blackwell delivers 1.8TB/s bidirectional throughput per GPU … up to 576 GPUs"，https://arxiv.org/html/2409.09874v4 （访问 2026-04）；Glenn Klockwood NVLink 笔记："NVLink 5 provides 400G+400G per link … switches have 72x400G ports … One B200 GPU has up to 1.8 TB/s"，https://www.glennklockwood.com/garden/nvlink （2026-04-03）。置信度：高。
[^2^] IntuitionLabs："Rubin platform with NVLink 6.0 … doubles per-GPU bandwidth again to 3,600 GB/s"，https://intuitionlabs.ai/articles/nvidia-nvlink-gpu-interconnect （2025-10-22）；Glenn Klockwood 同[^1^]。置信度：中高（发布前规格）。
[^3^] EEWorld 电子头条："UALink 1.0 … a maximum bidirectional data rate of 200 GT/s per lane … x1, x2, or x4 … up to 1024 accelerators … cable lengths are optimized for less than 4 meters, achieving a round-trip latency of less than 1μs with 64B/640B payloads … Chinese companies such as Centec, Lenovo, Montage Technology … joined as contributing members"，https://en.eeworld.com.cn/mp/EEWorld/a406852.jspx （2025-08-29）；Introl 同表，https://introl.com/blog/ualink-cxl-4-gpu-interconnect-memory-pooling-guide-2025 （2026-02-06）。置信度：高。
[^4^] NAND Research："Lane Speed: 212.5 GT/sec signal rate delivering 200 Gb/sec effective bandwidth per lane … Maximum Port Bandwidth: 800 Gb/sec per port (using 4 lanes) … 1,024 accelerators in a single-level fabric … 93% effective peak bandwidth utilization … port-to-port hop latencies between 100-150 nanoseconds"，https://nand-research.com/research-note-ualink-consortium-releases-ualink-1-0/ （2025-04-17）；Spheron："MI455X delivers ~3.6 TB/s scale-up bandwidth per accelerator in the 72-GPU Helios rack"，https://www.spheron.network/blog/ualink-vs-nvlink-open-gpu-interconnect-2026/ （2026-06-24）。置信度：高/中。
[^5^] Logic Fruit："PCIe Gen 6 … 64 GT/s per lane, 128 GB/s (x16, unidirectional), 256 GB/s (x16, bidirectional)"，https://www.logic-fruit.com/blog/pcie/pcie-gen-4-vs-gen-5-vs-gen-6/ （2026-02-10）。置信度：高。
[^6^] Atoms.dev 综述：CXL 代际表（CXL 2.0=PCIe5/32GT/s/63GB/s、CXL 3.0/3.1/3.2=PCIe6/64GT/s/~256GB/s）及"CXL memory controllers typically add about 200 nanoseconds … A CXL.mem access incurs 100-200 ns of additional delay compared to local DRAM"，https://atoms.dev/insights/a-comprehensive-review-of-memory-management-from-fundamentals-to-future-trends/ （2025-12-15）。置信度：中高。
[^7^] Introl："the CXL Consortium released CXL 4.0 on November 18, 2025, doubling bandwidth to 128 GT/s and enabling multi-rack memory pooling"，https://introl.com/blog/ualink-cxl-4-gpu-interconnect-memory-pooling-guide-2025 （2026-02-06）。置信度：高。
[^8^] Introl《InfiniBand vs Ethernet》："InfiniBand HDR achieves 0.6 microsecond port-to-port latency … Ethernet at 100Gbps shows 1.2 microsecond baseline latency that degrades to 50+ microseconds under congestion … RoCE v2 reaches 92% [bandwidth efficiency]"，https://introl.com/blog/infiniband-vs-ethernet-gpu-clusters-800g-architecture （2026-03-27）；FiberMall："Quantum-2 … 64 ports of 400G … 51.2 terabits per second … Sub-microsecond"，https://www.fibermall.com/blog/nvidia-infiniband-switches.htm （2026-06-25）；CloudSwit.ch 400G 交换机："Latency ~500ns"，https://cloudswit.ch/product/32-port-400g-qsfp-dd-data-center-switch-enterprise-sonic-teralynx/ （2025-12-09）。置信度：中（厂商/集成商数据）。
[^9^] Wevolver CPO 综述："a 30 W pluggable transceiver can be replaced by a 9 W CPO link … Broad adoption of CPO in scale-up GPU interconnects … expected between 2028 and 2030"，https://www.wevolver.com/article/what-is-co-packaged-optics-architecture-benefits-challenges-and-performance （2026-04-24）；Introl："Quantum-X photonic switch delivers 115.2 terabits per second … CPO reduces power consumption by 50% and increases bandwidth density by a factor of three"，https://introl.com/blog/fiber-optics-data-center-state-of-art-optical-interconnect-2025 （2026-04-08）。置信度：中。
[^11^] Mooncake 论文（arXiv 2407.00079）："The transfer of these KVCache blocks across CPUs and GPUs is handled by a separate (GPUDirect) RDMA-based component called Messenger … groups the CPU, DRAM, SSD, and RDMA resources of the GPU cluster to implement a disaggregated KVCache"，https://arxiv.org/html/2407.00079v2 （2024-07 起）。置信度：高（FAST'25 最佳论文）。
[^12^] FAST'25 论文集 Mooncake 章节："each A800 GPU is paired with a 100/200Gbps NIC, and each H800 GPU is paired with a 200/400Gbps NIC … the network utilizes RoCEv2 tuned by cloud providers … topology-aware path selection"，https://www.usenix.org/system/files/fast25_full_proceedings.pdf （2025-02）。置信度：高。
[^13^] Mooncake 代码库 README："By supporting Topology Aware Path Selection and multi-card bandwidth aggregation, Mean TTFT of vLLM with Transfer Engine is up to 25% lower than traditional TCP-based transports"，https://gitcode.com/openFuyao/mooncake （访问 2026-06）；协议清单："TCP/IP、RDMA (InfiniBand/RoCEv2/eRDMA)、NVIDIA GPUDirect RDMA、CXL/Shared-Memory、NVMe over Fabric、Ascend NPU Direct"（Mooncake 4+1 架构分析，知乎，2026-01-29）。置信度：中高。
[^16^] AI-Infrastructure 笔记 NIXL 章："NIXL abstracts transport for GPU-to-GPU data movement over NVLink and RDMA NICs … one-sided RDMA … UCX and NVIDIA Magnum IO GPUDirect Storage (GDS)"，https://ai-infrastructure.net/kv-cache-transfer-nixl/ （2026-06-29）；WEKA："It supports communication over NVIDIA NVLink, NVLink Switch, NVIDIA Quantum InfiniBand, and NVIDIA Spectrum-X Ethernet"，https://www.weka.io/article/weka-accelerates-ai-inference-with-nvidia-dynamo-and-nvidia-nixl （2026-05-27）。置信度：中高。
[^17^] 推理 Cookbook（社区）："|TCP|GPU→CPU→NIC→CPU→GPU|~1ms|~10 Gbps| |RDMA|GPU→NIC→GPU|~10μs|~200 Gbps| |NVLink|GPU→GPU (同节点)|~1μs|~600 Gbps|"，https://inference.cookbook.lei6393.com/dynamo/05-distributed-communication/05-nixl-data-transfer/ （2026-01-30）。置信度：低中（社区整理，量级可参考）。
[^18^] GoAIGuru："Red Hat's llm-d … Kubernetes-native … KV-aware routing, disaggregated prefill and decode … cache hit rates above 87 percent … Moonshot AI's Mooncake … operational across thousands of nodes processing over 100 billion tokens per day"，https://goaiguru.com/insights/disaggregated-inference-explained （2026-06-23）。置信度：中。
[^19^] Spheron NIXL 指南："Production systems like Mooncake, llm-d, and DistServe all rely on this kind of KV transfer … five backends: RDMA/InfiniBand, RoCE via UCX, TCP fallback, NVMe-oF, and S3 … Sub-5ms for a 47-token prompt on InfiniBand HDR is expected"，https://www.spheron.network/blog/nvidia-nixl-disaggregated-inference-guide/ （2026-04-03）；vLLM-Omni RFC："On NVLink-connected nodes, intra-node NCCL P2P reaches ~300 GB/s (H100 NVLink 4.0) per direction, vs. ~64 GB/s over PCIe"，https://github.com/vllm-project/vllm-omni/issues/1940 （2026-03-17）。置信度：中/高。
[^20^] arXiv 2606.03910："For a 128K-context Llama-3-70B request, the aggregate KV cache is approximately 40 GB and, under tensor-parallel (TP) sharding with TP=4, this corresponds to roughly 10 GB of data crossing each prefill-to-decode GPU pair … On a 25 Gbps RDMA link, that per-pair transfer takes about 3.2 s, easily dominating the TTFT budget"，https://arxiv.org/html/2606.03910v1 （2026-06-02）。置信度：高。
[^21^] arXiv 2605.13734 (KVServe)："At 10–50 Gbps, communication accounts for 16%–60% of JCT … Under 5–15Gbps links in typical cloud servers, KV communication accounts for up to 66% of end-to-end time"，https://arxiv.org/html/2605.13734v1 （2026-01-29）。置信度：高。
[^22^] arXiv 2512.16056："Fetching cached KV pages from host memory accounts for up to 70% of TTFT … for a 64 k-token cache hit on Qwen-7B-Chat"，https://arxiv.org/html/2512.16056v2 （2026-05-13）。置信度：高。
[^23^] arXiv 2512.11920 (CXL-SpecKV)："The higher CXL bandwidth (64GB/s vs. 16GB/s PCIe) and lower latency (<400ns vs. 3-5μs) enable much more aggressive disaggregation"；TraCT（arXiv 2512.18194）："TraCT replaces the network fabric with a CXL Type-3 shared-memory device and performs KV transfer via direct GPU-CXL DMA"。置信度：中（学术原型）。
[^26^] 微信公众号《华为CloudMatrix384超节点网络架构设计》："每个昇腾 910C 贡献超过 392 GB/s 的单向带宽（即：底层通过14*400Gbps以太接口互联）… 节点间延迟增加不到 1µs … 每个 NPU 贡献高达 400 Gbps 的单向 RDMA 带宽 … (1）推理期间预填充和解码 NPUs 之间的活动 KV 缓存数据的高速传输"，http://mp.weixin.qq.com/s?__biz=MzAxNzU3NjcxOA==&mid=2650760660&idx=1&sn=565fb25a055b6fc1e990f36f8f89fbe7 （2025-07-25，转述华为 CloudMatrix 论文）。置信度：高（与论文一致）。
[^27^] FiberMall 转 SemiAnalysis："Each Huawei Ascend 910C GPU offers a unidirectional vertical expansion bandwidth of 2,800 Gbit/s … deploying seven 400G optical transceivers per GPU … Each CloudMatrix 384 Pod is equipped with a total of 6,912 400G optical modules … 5,000 optical modules for vertical expansion may lead to reliability issues"，https://www.fibermall.com/blog/semianalysis-of-huawei-cloudmatrix-910c.htm （2025-09-03）。置信度：高（第三方拆解）。
[^28^] 东方财富/腾讯新闻《华为谈开源开放》："灵衢互联协议完全开源 … 相较于英伟达NVLink的30页协议，灵衢互联基础协议有600多页 … 自2025HC大会发布以来，灵衢协议已累计下载 24000份，华为还成立了灵衢社区"，https://finance.eastmoney.com/a/202602043641367894.html （2026-02-04）。置信度：高。
[^29^] UB-Mesh 论文（arXiv 2503.20377）："UB-Mesh-Pod … 4D-FullMesh topology … Unified Bus(UB) technique, which enables flexible IO bandwidth allocation and hardware resource pooling … 2.0x [higher] cost-efficiency, 7.2% higher network availability … and 95% linearity in various LLM training tasks"，https://arxiv.org/pdf/2503.20377v1 （2025-03-26）。置信度：高。
[^30^] 微信公众号转 Hot Chips 2025 报道："华为推出了UB-Mesh技术 … 将在下个月的活动中宣布向所有用户免费开放该协议 … 旨在用单一协议取代PCIe、CXL、NVLink和TCP/IP协议"，http://mp.weixin.qq.com/s?__biz=Mzg2NDgzNTQ4MA==&mid=2247793530&idx=3&sn=0874ee98898fae1d84e853680d8f0211 （2025-08-28）；新浪《对话徐直军》："2021年，华为规划了三个公司级别的战略项目，其中之一是鸿蒙操作系统，另一个就是灵衢"，https://finance.sina.com.cn/cj/2025-09-21/doc-infrhauf5592723.shtml （2025-09-21）。置信度：中高。
[^31^] 知乎《怎么让程序更高效地连起来?》："UB 采用了对等架构 … 任何设备都可以通过 Load/Store 内存语义直接访问其他设备的数据 … 据灵衢社区的宣传资料显示，UB 的带宽可达 TB/s 级，点对点时延可达 200ns"，https://zhuanlan.zhihu.com/p/1963511651748806753 （2025-10-20）。置信度：中（社区宣传资料口径）。
[^32^] 快科技："灵衢2.0通信带宽提升15倍，单跳通信时延从2微秒降至200纳秒 … 单卡互联带宽2TB/s … 互联带宽高达16.3PB/s"，https://news.mydrivers.com/1/1136/1136081.htm （2026-07-13）；新浪 MWC26："灵衢协议将RTT通信时延从7微秒降至3微[秒]"，https://finance.sina.com.cn/roll/2026-03-11/doc-inhqqyvn5587853.shtml （2026-03-11）；华为官网 MWC26 新闻稿（2026-02-28）https://www.huawei.com/cn/news/2026/3/mwc-superpod-computing ；徐直军 HC2025 演讲转述："光互联可靠性提升100倍，互联距离超200米 … TB级超大带宽，2.1微秒超低时延"，https://www.sina.cn/news/detail/5213461430930994.html （2025-09-21）。置信度：高（官方口径，注意不同场合口径差异见 C3）。
[^33^] 徐直军华为全联接大会2025演讲（多家媒体转述）："CloudMatrix 384超节点已累计部署300余套、服务20余家客户"，参见新浪科技《对话徐直军》，https://finance.sina.com.cn/cj/2025-09-21/doc-infrhauf5592723.shtml （2025-09-21）；行业数据表（东兴证券，源自华为全联接大会+SemiAnalysis）："Atlas 900 SuperPod 总互联带宽 269TB/s … 内存49.2TB、内存带宽1229TB/s"，https://www.hangyan.co/charts/3844348196042048946 （2026-03-03）；搜狐《华为韬定律》："CloudMatrix384，在灵衢互连下能把跨节点延迟增量压在 1 微秒以内、带宽衰减压在 3% 以内"，https://m.sohu.com/a/1027866740_348129/ （2026-05-27）。置信度：中高。
[^34^] 与非网《超节点三国杀》："华为的CloudMatrix 384 … 每个昇腾910C芯片集成七个高速收发器，每个收发器工作速率为224Gbps，单向带宽达196G[b]ps，双向带宽为392G[b]ps"，https://m.eefocus.com/article/1878962.html （2025-08-20）。置信度：低（单位与主流口径冲突，仅作冲突证据存档）。
[^35^] 阿里云磐久 AL128 详解："系统互连采用单级互连架构，采用非以太ALink协议：支持UALink国际开放标准协议，也可支持行业主流GPU芯片的原生内存语义互连协议，如：NVLink、xLink、UB、xCN等"，http://www.hansenfluid.com/news/AI-Infra-AL-128.htm （访问 2026-06）；新浪《阿里解读：磐久128超节点和UPN512》："数据面：负责GPU间高速数据传输，用的是UALink，支持内存语义访问、在网计算 … 带宽堆到Pb/s级别，延迟压到百纳秒级 … 单层网络 … 交换芯片Radix 512"，https://finance.sina.com.cn/roll/2025-10-29/doc-infvpcsy9057385.shtml （2025-10-29）。置信度：中高。
[^36^] SIGCOMM'24 Alibaba HPN 论文："each GPU has a dedicated 400Gbps of RDMA network throughput … 15K GPUs in one Pod … LLM training throughput with HPN is 14.9% higher"，https://ennanzhai.github.io/pub/sigcomm24-hpn.pdf （2024-08）；Introl："By January 2025, Alibaba Cloud, Apple, and Synopsys joined at board level"，https://introl.com/blog/ualink-cxl-4-gpu-interconnect-memory-pooling-guide-2025 （2026-02-06）。置信度：高。
[^37^] 与非网《死磕AI大模型网络，鹅厂出招了》："腾讯星脉网络为每个计算节点提供了3.2T的超高通信带宽 … 每个服务器有8块RoCE网卡。每块网卡的接口速率是400Gbps … Block是最小单元，包括256个GPU"，https://www.eefocus.com/article/1556272.html （2023-06-27）；IT之家（2023-04-14）同口径。置信度：高（2023 数据，星脉后续版本未获公开更新）。
[^38^] 雪球《浅谈Scale-up互联及超节点服务器》："Scale-up带宽一般是至少单向400GB/s，即双向800GB/s … 私有协议（如Nv的NvLink,菊花的UB）和开放协议（如UALink, 腾讯主导的ETH-X, 阿里主导的ALS, 移动主导的OISA，中兴主导的Olink）"，http://xueqiu.com/4194931536/344291667 （2025-07-26）。置信度：中（行业观察，口径经验性）。
[^39^] 中兴通讯技术杂志《Scale-Up互联技术》："ETH-X由中国信通院与腾讯牵头，在ODCC立项推进 … 1.0版本规范已经在ODCC发布 … PRI统一转发头，替代传统以太网的DMAC和SMAC域，共12字节 … 或许国内统一为CLink通用技术标准，或许网络层将由ESUN实现归一化整合，亦或是…长期维持多元竞逐的格局"，https://www.zte.com.cn/content/zte-site/www-zte-com-cn/china/about/magazine/zte-technologies/2026/3/3/8.html （2026-03-27）；ODCC《ETH-X Scale Up 协议测试报告》摘要（发现报告，2025-09-12）；华商韬略/与非网："实测跨卡数据访问时延降低12.7倍，可适用于8~512卡超节点"，https://www.eefocus.com/article/1834221.html （2025-05-20）；光纤在线：ETH-X 成员名单与 2025 秋原型计划，http://www.c-fol.net/news/22_202507/20250731134023.html （2025-07-31）。置信度：中高。
[^40^] 腾讯云开发者社区《博通一统以太网江湖阳谋：SUE一超多强（字节Ethlink、NVLink与UALink）？》：SUE"目标实现单跳交换下的端到端往返延迟(RTT) 低于 2 微秒 … 单个SUE实例支持800G带宽作为基础单元，通过多实例聚合(如规范示例中的12x 800G)，一对XPU间的带宽潜力可高达9.6 Tbps … 支持在单个计算域内连接多达 1024个XPU … 字节EthLink'单点破局'，以一家之力深度魔改"，https://cloud.tencent.com/developer/article/2606045 （2025-12-22）。置信度：中。
[^41^] C114《中兴通讯余方宏》："OLink采用开放的总线协议，兼容RDMA标准，能够提供高达800GB/s的带宽"，https://m.c114.com.cn/w127-1274707.html （2024-09-29）；网易/新浪《不拼GPU！中兴扔出AI超节点》："积极参与工信部牵头的CLink协议制定 … 自研的OLink协议采用开放标准设计 … 2025年6月在ODCC网络工作组成功立项《基于正交架构的超节点硬件系统》"，https://finance.sina.com.cn/wm/2026-03-27/doc-inhsmxri9354448.shtml （2026-03-27）；雪球："中兴的正交整机柜方案最多也可以一柜128卡，理论最高可以扩展到1024卡 … 中兴是唯一一家全部参与了这几家大厂的scale-up项目的交换芯片厂商"，https://xueqiu.com/4194931536/331726205 （2025-04-15）。置信度：中（厂商自述）。
[^42^] 中国移动官网《OISA 2.0协议重磅发布》："OISA 2.0将支持的AI芯片数量提升至1024张，带宽突破TB/s级别，AI芯片互联时延缩短至数百纳秒"，https://www.10086.cn/aboutus/news/groupnews/index_detail_53443.html （2025-08-23）；中兴通讯《智算网络发展综述》PDF："OISA可支持128张GPU互联，点对点带宽达到800Gbit/s … GSE…OISA的组网性能比传统RoCEv2交换机提升50%以上"，https://www.zte.com.cn/content/dam/zte-site/res-www-zte-com-cn/mediares/magazine/publication/com_cn/article/202502/8.pdf 。置信度：高（官方）/中（性能对比自述）。
[^43^] IT之家《中国移动发布GSE全套标准及全球首套商用设备》："GSE1.0 … 目前已在中国移动智算中心（哈尔滨）超万卡集群实现首次商用，将训练过程中通信时间占比缩20%以上"，https://ithome.com/0/799/636.htm （2024-09-30）；C114《智算琢光》："首颗全量支持GSE标准的DPU芯片，支持200G端口速率 … 基于该芯片搭建的GSE网络性能可比传统RoCE网络提升30%以上 … 与美国公司主导的超级以太网联盟（UEC）成为全球范围内两个具有影响力的技术体系"，https://www.c114.com.cn/news/118/a1278128.html （2024-11-19）。置信度：高。
[^44^] SegmentFault《算力效率的战争》："浪潮信息元脑SD200超节点推理超线性扩展TPOT 8.73ms … 中科曙光scaleX640 … 网卡端到端时延低于1微秒 … 16个scaleX640超节点通过scaleFabric高速网络互连组成scaleX万卡超集群"，https://segmentfault.com/a/1190000047950946 （2026-07-01）；中国日报网《浪潮信息发布"元脑SD200"超节点》："基于自主研发的开放总线交换技术首创多主机三维网格系统架构，实现64路本土GPU芯片高速互连 … 依托百纳秒级超低延迟链路 … 依托开放的PD分离框架，支持异步KV Cache高效传输"，https://tech.chinadaily.com.cn/a/202508/08/WS6895a7c6a310ebef36291057.html （2025-08-08）；东方证券研报（2025-11-08，曙光全电互联两层 Scale-up）。置信度：中高。
[^46^] 东方财富/腾讯新闻："澜起科技宣布，推出基于CXL 3.1 Type 3标准设计的内存扩展控制器(MXC)芯片M88MX6852 … 采用PCIe 6.2物理层接口，支持最高64 GT/s的传输速率(x8通道) … 双通道DDR5内存控制器，支持速率高达8000 MT/s"，http://finance.eastmoney.com/a/202509013501124564.html （2025-09-02）；雪球 CXL 生态盘点："澜起科技 CXL MXC（CXL 2.0/3.1）、PCIe 6.x/CXL 3.x Retimer全球首发 CXL 3.1 MXC，入选 CXL 联盟合规清单 … 海光C86-5G处理器集成CXL 2.0 … 阿里云基于CXL 2.0 Switch的PolarDB服务器全球首款"，https://xueqiu.com/8646098286/385158172 （2026-04-22）。置信度：高/中。
[^47^] 华为企业业务官网《OceanDisk 1800智能盘框》："借助DPU中的NP核硬化卸载原生KV语义，实现KV Cache数据从推理服务器xPU直接访问存储，彻底旁路CPU、DRAM … 单xPU的可用KV Cache容量从GB级跃升至TB级 … TTFT可进一步降低80% … 可扩展为PB级共享KV Cache池"，https://e.huawei.com/cn/news/2026/solutions/storage/oceandisk1800-smart-disk-enclosure （2026-06-09）；华为博客："单框配置4颗DPU与24块NVMe SSD，提供160GB/s带宽与1600万IOPS … KV Connector … 为vLLM/SGLang/Mooncake等推理框架提供API接口"，https://e.huawei.com/cn/blogs/2026/solutions/storage/agentic-ai （2026-06-10）；腾讯新闻："UCM … 可实现首Token时延最高降低90%，系统吞吐最大提升22倍"，https://news.qq.com/rain/a/20251106A02PSW00 （2025-11-06）；财联社：UCM 2025-09 开源，https://www.cls.cn/detail/2113330 （2025-08-12）。置信度：高（官方）/中（性能自述）。
[^48^] DeepSeek 硬件论文（arXiv 2505.09343）："we strongly recommend that future hardware should integrate intra-node (scale-up) and inter-node (scale-out) communication into a unified framework … We also recognize emerging interconnect protocols such as the Ultra Ethernet Consortium (UEC), Ultra Accelerator Link (UALink) … Unified Bus (UB) has introduced a novel approach to scale-up and scale-out convergence"，https://arxiv.org/html/2505.09343v2 （2025-05）；新浪财经研报："国内层面 … 三条技术路线：自主可控专用系统总线（华为灵衢、海光HSL）、以太网优化（字节跳动EthLink、腾讯Eth-X）与开放基础设施架构（中国移动OISA）"，https://stock.finance.sina.com.cn/stock/go.php/vReport_Show/kind/search/rptid/828908049898/index.phtml （2026-05-06）。置信度：高。
[^49^] 腾讯新闻《国产超节点扎堆发布背后》（经观）："Scale-Out网络的通信时延通常在10微秒左右，而Scale-Up网络（如英伟达的NVLink）的目标是要做到百纳秒级别 … 高速铜互联的有效距离仅在1米左右"，https://view.inews.qq.com/a/20251114A075OB00 （2025-11-14）。置信度：中高。
[^50^] Mooncake 官网更新日志："Mooncake Joins PyTorch Ecosystem … FlexKV, a distributed KV store and cache system from Tencent and NVIDIA … supports distributed KVCache reuse with the Mooncake Transfer Engine … Mooncake Transfer Engine has been integrated into TensorRT LLM / vLLM v1 as a KV Connector"，https://kvcache-ai.github.io/Mooncake/ （访问 2026-04-29）。置信度：高。
[^51^] Towards AI《NVLink Fusion》："The x4 lane configuration delivers 800 GT/s per accelerator — roughly 0.4 TB/s of effective bandwidth after encoding overhead … approximately a 9× bandwidth gap [vs NVLink 6 3.6 TB/s]"，https://pub.towardsai.net/nvlink-fusion-how-nvidia-turned-its-interconnect-into-a-platform-353c57ef0f50 （2026-04-15）。置信度：中（折算口径供参考）。
[^52^] vLLM GitHub issue #34054："pd disaggregation on the same host with nixl connector can not use nvlink to transfer kv cache … Throughput (MB/s)=1800.983"，https://github.com/vllm-project/vllm/issues/34054 （2026-02-07）。置信度：高（实测 issue）。

---

### 检索覆盖声明
本报告基于 15 组、60+ 条独立中英文检索（覆盖 NVLink/UALink/PCIe/CXL/RoCE/IB/CPO 规格，Mooncake/NIXL/llm-d 实现，灵衢 UB/CloudMatrix/Atlas，阿里 ALS/HPN/磐久，腾讯星脉/ETH-X，字节 EthLink/SUE，中兴 OLink/CLink，移动 OISA/GSE，曙光/浪潮整机柜，澜起 CXL，华为 UCM/OceanDisk，KV 卸载带宽需求量化文献，ESUN/UEC 对标）。ESUN（OCP Ethernet Scale-Up Networking）公开细节检索多次无返回，仅经 Synopsys 综述[^见争议C10相关]与中兴杂志间接确认其存在，置信度低，未展开。
