# AI 模型与存储技术调研计划

## 任务概述
从专家角度验证并深化"AI 模型与存储技术调研问题清单"的两大部分（AI 模型 8 问 + AI 硬件 6 问），核心围绕 HBF（High Bandwidth Flash）与 NAND CIM 两大应用目标，输出结构化调研报告（Markdown + DOCX）。

## Stage 1 — 深度调研（加载 deep-research-swarm）
并行部署 6 个研究子代理（explore/general），每个负责一个问题簇，要求交叉验证、附可核验引用来源：

- **Agent R1 — KV Cache 分层卸载与互联**（模型 Q1、Q3）
  KV cache 冷热分层、分层卸载机制（Mooncake、LMCache、vLLM、NVIDIA Dynamo、HiCache 等）、卸载介质（DRAM/SSD/对象存储）、国内互联技术（NVLink/UB/灵衢、RoCE、CXL、PCIe、光互联）；KV 卸载至 HBF 的判定标准（访问频率、时延、带宽、容量、耐久度）。
- **Agent R2 — HBF 与 MoE / 系统架构**（模型 Q2、硬件 Q5、Q6）
  MoE 专家 offload 到 Flash 的可行性（DeepSeek 3FS、MoE expert offloading 文献）、HBF 引入后系统架构变化（HBM+HBF 分层）、batch size 系统级优势、带宽/容量需求量化。
- **Agent R3 — NAND CIM 与层调度**（模型 Q4）
  大模型分层计算特性（MAC vs 数字运算）、混合精度/模拟 MAC 调度（CIM 文献：前几层高精度、后几层模拟 MAC）、NAND CIM 研究现状（Samsung/SK hynix/Kioxia/SanDisk HBF 与 CIM）、层-器件映射与 GPU/NPU 调度。
- **Agent R4 — 推理鲁棒性与评价体系**（模型 Q5、Q6）
  影响 LLM 推理能力的最大因素（权重精度、KV cache 精度、激活量化）、LLM vs 图像分类对误差的容忍度（量化/噪声敏感性文献）、NAND 噪声/量化误差对精度影响；大模型评测维度（MMLU 等基准、TTFT/TPOT/吞吐、成本、用户关心指标）。
- **Agent R5 — AI 系统搭建 Trade-off 与瓶颈识别**（模型 Q7、Q8）
  软硬件指标权衡（算力/存力/带宽/容量/功耗/成本）、存力 trade-off 方法；快照回放识别瓶颈（recon/snapshot replay、Chakra/execution trace、vLLM profiling）、存力监测指标（HBM 带宽利用率、KV cache 命中率、卸载流量、stall 时间）。
- **Agent R6 — NAND/HBF 硬件机制**（硬件 Q1–Q4）
  NAND 读延时（tR）系统影响与 pipeline 掩盖（prefetch、plane interleaving、multi-plane、cache read）；HBF 逻辑 die 计算核（SanDisk HBF 架构）承载力；FTL 地址映射表 + SRAM buffer 容量权衡；NAND 读延迟触发时机（readahead 粒度、KV block 粒度）。

每个 Agent 输出：结构化研究简报（含事实、数据、来源链接、可信度标注、开放问题的专家推理）。

## Stage 2 — 交叉验证与写作（加载 report-writing）
- 主代理汇总 6 份简报，标注 AI 原假设中正确/存疑/错误之处（专家验证视角）。
- 按问题清单结构撰写完整报告 `.agent.final.md`，每问给出：现状机制 → 代表工作/数据 → 对 HBF / NAND CIM 的判断 → 开放问题分析。

## Stage 3 — 格式交付（加载 docx）
- 将 final.md 转换为 .docx，同时保留 .md，输出到 /mnt/agents/output/。

## 文件传递
- R1–R6 简报路径 → 写作阶段上下文
- final.md → docx 转换阶段
