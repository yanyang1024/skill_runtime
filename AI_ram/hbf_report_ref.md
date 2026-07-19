# 参考文献

<!-- 全局编号规则：hbf_dim01 [^n^]→[^n^]（1–99）；hbf_dim02→n+100；hbf_dim03→n+200；hbf_dim04→n+300；hbf_dim05→n+400；hbf_dim06→n+500；hbf_dim07→n+600；hbf_dim08→n+700；hbf_dim09→n+800；hbf_dim10→n+900。
     条目已略去原维度报告中的"摘录"与"置信度"字段，保留来源标题、出处、日期与 URL；条目内原中文说明予以保留，条目间交叉引用编号已同步换算为全局编号。 -->

[^1^]: Mooncake 生产与实验数据 — https://www.usenix.org/conference/fast25/presentation/qin — 2025-02（FAST'25）
[^2^]: Mooncake 概述 — https://github.com/kvcache-ai/Mooncake（镜像 https://gitcode.com/openFuyao/mooncake）— 2024-06 起
[^3^]: LMCache 论文（机制+数据） — 消息大小表 — https://arxiv.org/html/2510.09665v2 — 2025-10（v2）
[^4^]: Mooncake 论文技术报告 — https://arxiv.org/html/2407.00079v2 — 2024-06/2025-02
[^5^]: Mooncake Store 部署/驱逐 — https://kvcache-ai.github.io/Mooncake/deployment/mooncake-store-deployment-guide.html ; https://deepwiki.com/kvcache-ai/Mooncake — 2025-2026
[^6^]: Mooncake SSD/3FS 驱逐 RFC — https://github.com/kvcache-ai/Mooncake/issues/952 — 2025-10-23
[^7^]: vLLM KVConnector/CPU Offload — https://ceph.io/en/news/blog/2025/vllm-kv-caching/ ; https://docs.vllm.ai/projects/ascend/en/latest/user_guide/feature_guide/kv_cache_cpu_offload.html — 2025
[^8^]: SGLang HiCache 设计与实测 — （蚂蚁）；（Novita）；预取三策略、page_first_direct、L3 驱逐局限 — https://www.lmsys.org/blog/2025-09-10-sglang-hicache/ ; https://docs.sglang.ai/advanced_features/hicache_design.html ; https://zhuanlan.zhihu.com/p/1959366095443064318 — 2025-09/2026-07
[^9^]: Dynamo KVBM 四层与频率驱逐 — https://arxiv.org/html/2606.17081v1 — 2026-06
[^10^]: KVBM 层级配置 — https://docs.vultr.com/how-to-manage-kv-cache-in-nvidia-dynamo（转述 NVIDIA Dynamo 文档）— 2026-03
[^11^]: KVBM 实测 — https://github.com/NVIDIA/Dynamo docs/design-docs/architecture.md — 2026-03
[^12^]: AIBrix — https://aibrix.github.io/posts/2025-05-21-v0.3.0-release/ ; https://arxiv.org/html/2504.03648v1 — 2025-05/2025-04
[^13^]: H2O/SnapKV/PyramidKV 综述性描述 — https://arxiv.org/html/2606.31145v1 — 2026-06
[^14^]: attention 驱逐族谱 — https://arxiv.org/html/2605.18053v1 — 2026-05
[^15^]: 不可逆性局限 — https://github.com/quantumaikr/quant.cpp/blob/main/docs/blog/kv-cache-landscape.md — 2026-03
[^16^]: Tutti（反方核心证据+方案） — https://arxiv.org/abs/2605.03375 — 2026-05-05
[^17^]: FlexGen — https://arxiv.org/abs/2303.06865 — 2023-03（ICML'23）
[^18^]: 介质数量级（HBM/DRAM/NVMe） — https://www.cloudidr.com/blog/ai-memory-architecture — 2026-05
[^19^]: NIXL 分层时延表 — https://www.spheron.network/blog/nvidia-nixl-disaggregated-inference-guide/ — 2026-04
[^20^]: NIXL/GDS 机制 — https://ai-infrastructure.net/kv-cache-transfer-nixl/ — 2026-06
[^21^]: NetApp 三层实测 — https://community.netapp.com/t5/Tech-ONTAP-Blogs/KV-cache-offloading-with-vLLM-LMCache-and-StorageGRID/m-p/467946 — 2026-07-01
[^22^]: 容量测算与 HBF 预判 — https://www.thirdbridge.com/en-us/about-us/media/perspectives/explainer-why-storage-and-memory-are-the-new-ai-database-for-agi — 2025-11-11
[^23^]: HBF 官方口径 — （SanDisk/SK hynix MOU 新闻稿）；（TAB 新闻稿，David Patterson/Raja Koduri 加入顾问委员会） — https://investor.sandisk.com/news-releases/news-release-details/sandisk-collaborate-sk-hynix-drive-standardization-high ; https://investor.sandisk.com/news-releases/news-release-details/sandisk-forms-hbftm-technical-advisory-board-guide-development — 2025-08-06 / 2025-07-24
[^24^]: HBF 规格细节与风险 — https://getnestdaily.xyz/blog/sandisk-vs-micron-ai-memory-war/ ; https://www.buysellram.com/blog/inside-the-gpu-memory-hierarchy-how-ai-servers-move-data-from-ssd-to-hbm/ — 2026-05/2026-07
[^25^]: HiCache+Mooncake 基准 — https://kvcache-ai.github.io/Mooncake/performance/sglang-hicache-benchmark-results-v1.html — 2025
[^26^]: FlexKV — https://github.com/taco-project/FlexKV — 2025-07
[^27^]: 预测式驱逐（争议数据点） — https://arxiv.org/html/2604.26968v1 — 2026-04
[^28^]: LMCache 层wise 实现 — https://docs.lmcache.ai/kv_cache_optimizations/layerwise.html — 2025-2026
[^29^]: CachedAttention 层wise 预载 — https://arxiv.org/pdf/2403.19708 — 2024-03（USENIX ATC'24）
[^30^]: TRT-LLM 层wise 传输 — https://github.com/NVIDIA/TensorRT-LLM/issues/9212 — 2025-11
[^31^]: 每 token KV 体积 — https://ceph.io/en/news/blog/2025/vllm-kv-caching/ — 2025
[^32^]: 多层缓存局限（反方） — https://arxiv.org/html/2602.13692v3 — 2026-06
[^33^]: 高命中率负载与带宽论点 — https://netpreme.com/blog/accelerating-sglang-hicache-with-netpreme-xmem-mpu — 2026-07-08
[^101^]: arXiv《The Landscape of GPU-Centric Communication》表3. https://arxiv.org/html/2409.09874v4 （访问 2026-04）；Glenn Klockwood NVLink 笔记. https://www.glennklockwood.com/garden/nvlink （2026-04-03）
[^102^]: IntuitionLabs. https://intuitionlabs.ai/articles/nvidia-nvlink-gpu-interconnect （2025-10-22）；Glenn Klockwood 同[^101^]
[^103^]: EEWorld 电子头条. https://en.eeworld.com.cn/mp/EEWorld/a406852.jspx （2025-08-29）；Introl 同表. https://introl.com/blog/ualink-cxl-4-gpu-interconnect-memory-pooling-guide-2025 （2026-02-06）
[^104^]: NAND Research. https://nand-research.com/research-note-ualink-consortium-releases-ualink-1-0/ （2025-04-17）；Spheron. https://www.spheron.network/blog/ualink-vs-nvlink-open-gpu-interconnect-2026/ （2026-06-24）
[^105^]: Logic Fruit. https://www.logic-fruit.com/blog/pcie/pcie-gen-4-vs-gen-5-vs-gen-6/ （2026-02-10）
[^106^]: Atoms.dev 综述：CXL 代际表（CXL 2.0=PCIe5/32GT/s/63GB/s、CXL 3.0/3.1/3.2=PCIe6/64GT/s/~256GB/s）及. https://atoms.dev/insights/a-comprehensive-review-of-memory-management-from-fundamentals-to-future-trends/ （2025-12-15）
[^108^]: Introl《InfiniBand vs Ethernet》. https://introl.com/blog/infiniband-vs-ethernet-gpu-clusters-800g-architecture （2026-03-27）；FiberMall. https://www.fibermall.com/blog/nvidia-infiniband-switches.htm （2026-06-25）；CloudSwit.ch 400G 交换机. https://cloudswit.ch/product/32-port-400g-qsfp-dd-data-center-switch-enterprise-sonic-teralynx/ （2025-12-09）
[^109^]: Wevolver CPO 综述. https://www.wevolver.com/article/what-is-co-packaged-optics-architecture-benefits-challenges-and-performance （2026-04-24）；Introl. https://introl.com/blog/fiber-optics-data-center-state-of-art-optical-interconnect-2025 （2026-04-08）
[^111^]: Mooncake 论文（arXiv 2407.00079）. https://arxiv.org/html/2407.00079v2 （2024-07 起）
[^112^]: FAST'25 论文集 Mooncake 章节. https://www.usenix.org/system/files/fast25_full_proceedings.pdf （2025-02）
[^116^]: AI-Infrastructure 笔记 NIXL 章. https://ai-infrastructure.net/kv-cache-transfer-nixl/ （2026-06-29）；WEKA. https://www.weka.io/article/weka-accelerates-ai-inference-with-nvidia-dynamo-and-nvidia-nixl （2026-05-27）
[^119^]: Spheron NIXL 指南. https://www.spheron.network/blog/nvidia-nixl-disaggregated-inference-guide/ （2026-04-03）；vLLM-Omni RFC. https://github.com/vllm-project/vllm-omni/issues/1940 （2026-03-17）
[^120^]: arXiv 2606.03910. https://arxiv.org/html/2606.03910v1 （2026-06-02）
[^122^]: arXiv 2512.16056. https://arxiv.org/html/2512.16056v2 （2026-05-13）
[^123^]: arXiv 2512.11920 (CXL-SpecKV)；TraCT（arXiv 2512.18194）
[^126^]: 微信公众号《华为CloudMatrix384超节点网络架构设计》. http://mp.weixin.qq.com/s?__biz=MzAxNzU3NjcxOA==&mid=2650760660&idx=1&sn=565fb25a055b6fc1e990f36f8f89fbe7 （2025-07-25，转述华为 CloudMatrix 论文）
[^127^]: FiberMall 转 SemiAnalysis. https://www.fibermall.com/blog/semianalysis-of-huawei-cloudmatrix-910c.htm （2025-09-03）
[^128^]: 东方财富/腾讯新闻《华为谈开源开放》. https://finance.eastmoney.com/a/202602043641367894.html （2026-02-04）
[^132^]: 快科技. https://news.mydrivers.com/1/1136/1136081.htm （2026-07-13）；新浪 MWC26. https://finance.sina.com.cn/roll/2026-03-11/doc-inhqqyvn5587853.shtml （2026-03-11）；华为官网 MWC26 新闻稿（2026-02-28）https://www.huawei.com/cn/news/2026/3/mwc-superpod-computing ；徐直军 HC2025 演讲. https://www.sina.cn/news/detail/5213461430930994.html （2025-09-21）
[^133^]: 徐直军华为全联接大会2025演讲（多家媒体转述），参见新浪科技《对话徐直军》. https://finance.sina.com.cn/cj/2025-09-21/doc-infrhauf5592723.shtml （2025-09-21）；行业数据表（东兴证券，源自华为全联接大会+SemiAnalysis）. https://www.hangyan.co/charts/3844348196042048946 （2026-03-03）；搜狐《华为韬定律》. https://m.sohu.com/a/1027866740_348129/ （2026-05-27）
[^135^]: 阿里云磐久 AL128 详解. http://www.hansenfluid.com/news/AI-Infra-AL-128.htm （访问 2026-06）；新浪《阿里解读：磐久128超节点和UPN512》. https://finance.sina.com.cn/roll/2025-10-29/doc-infvpcsy9057385.shtml （2025-10-29）
[^136^]: SIGCOMM'24 Alibaba HPN 论文. https://ennanzhai.github.io/pub/sigcomm24-hpn.pdf （2024-08）；Introl. https://introl.com/blog/ualink-cxl-4-gpu-interconnect-memory-pooling-guide-2025 （2026-02-06）
[^137^]: 与非网《死磕AI大模型网络，鹅厂出招了》. https://www.eefocus.com/article/1556272.html （2023-06-27）；IT之家（2023-04-14）同口径
[^139^]: 中兴通讯技术杂志《Scale-Up互联技术》. https://www.zte.com.cn/content/zte-site/www-zte-com-cn/china/about/magazine/zte-technologies/2026/3/3/8.html （2026-03-27）；ODCC《ETH-X Scale Up 协议测试报告》摘要（发现报告，2025-09-12）；华商韬略/与非网. https://www.eefocus.com/article/1834221.html （2025-05-20）；光纤在线：ETH-X 成员名单与 2025 秋原型计划. http://www.c-fol.net/news/22_202507/20250731134023.html （2025-07-31）
[^140^]: 腾讯云开发者社区《博通一统以太网江湖阳谋：SUE一超多强（字节Ethlink、NVLink与UALink）？》：SUE. https://cloud.tencent.com/developer/article/2606045 （2025-12-22）
[^141^]: C114《中兴通讯余方宏》. https://m.c114.com.cn/w127-1274707.html （2024-09-29）；网易/新浪《不拼GPU！中兴扔出AI超节点》. https://finance.sina.com.cn/wm/2026-03-27/doc-inhsmxri9354448.shtml （2026-03-27）；雪球. https://xueqiu.com/4194931536/331726205 （2025-04-15）
[^142^]: 中国移动官网《OISA 2.0协议重磅发布》. https://www.10086.cn/aboutus/news/groupnews/index_detail_53443.html （2025-08-23）；中兴通讯《智算网络发展综述》PDF. https://www.zte.com.cn/content/dam/zte-site/res-www-zte-com-cn/mediares/magazine/publication/com_cn/article/202502/8.pdf
[^143^]: IT之家《中国移动发布GSE全套标准及全球首套商用设备》. https://ithome.com/0/799/636.htm （2024-09-30）；C114《智算琢光》. https://www.c114.com.cn/news/118/a1278128.html （2024-11-19）
[^146^]: 东方财富/腾讯新闻. http://finance.eastmoney.com/a/202509013501124564.html （2025-09-02）；雪球 CXL 生态盘点. https://xueqiu.com/8646098286/385158172 （2026-04-22）
[^147^]: 华为企业业务官网《OceanDisk 1800智能盘框》. https://e.huawei.com/cn/news/2026/solutions/storage/oceandisk1800-smart-disk-enclosure （2026-06-09）；华为博客. https://e.huawei.com/cn/blogs/2026/solutions/storage/agentic-ai （2026-06-10）；腾讯新闻. https://news.qq.com/rain/a/20251106A02PSW00 （2025-11-06）；财联社：UCM 2025-09 开源. https://www.cls.cn/detail/2113330 （2025-08-12）
[^148^]: DeepSeek 硬件论文（arXiv 2505.09343）. https://arxiv.org/html/2505.09343v2 （2025-05）；新浪财经研报. https://stock.finance.sina.com.cn/stock/go.php/vReport_Show/kind/search/rptid/828908049898/index.phtml （2026-05-06）
[^149^]: 腾讯新闻《国产超节点扎堆发布背后》（经观）. https://view.inews.qq.com/a/20251114A075OB00 （2025-11-14）
[^152^]: vLLM GitHub issue #34054. https://github.com/vllm-project/vllm/issues/34054 （2026-02-07）
[^201^]: Tutti: Making SSD-Backed KV Cache Practical for Long-Context LLM Serving. https://arxiv.org/abs/2605.03375 （v1: 2026-05-05）
[^202^]: Tutti PDF §1/§2. https://arxiv.org/pdf/2605.03375 （2026-05-05）
[^203^]: AttentionStore §3.2. https://arxiv.org/html/2403.19708v1 （2024-03）
[^204^]: HCache (EuroSys'25). https://arxiv.org/abs/2410.05004 （2024-10）
[^205^]: Efficient LLM Serving with 3D-Parallel KV Cache Restoration. https://arxiv.org/html/2604.25080v1 （2026-04-28）
[^206^]: KVCache Cache in the Wild (USENIX ATC'25, SJTU+Alibaba). https://arxiv.org/abs/2506.02634 （v1 2025-06-03; ATC'25）
[^207^]: AttentionStore (CachedAttention, ATC'24). https://arxiv.org/abs/2403.19708 （2024-03）
[^208^]: DualPath: Breaking the Storage Bandwidth Bottleneck in Agentic LLM Inference. https://arxiv.org/abs/2602.21548 （2026-02-25）
[^209^]: AttentionStore §4.3.3/§4.3.8. https://arxiv.org/html/2403.19708v1 （2024-03）
[^210^]: Marconi: Prefix Caching for the Era of Hybrid LLMs. https://arxiv.org/abs/2411.19379 （2024-11-28）
[^211^]: PBKV: Prediction-based KV-Cache Management. https://arxiv.org/abs/2605.06472 （2026-05-07）
[^213^]: Predictive Multi-Tier Memory Management for KV Cache in Large-Scale GPU Inference. https://arxiv.org/abs/2604.26968 （2026-04-19）
[^214^]: SGLang HiCache Best Practices. https://docs.sglang.ai/advanced_features/hicache_best_practices.html （检索 2026-07）
[^215^]: RTP-LLM (Alibaba). https://arxiv.org/abs/2605.29639 （2025-11）
[^216^]: Backend.AI 工程综述（引 LMCache/VAST 基准）. https://www.backend.ai/blog/2026-04-how-to-save-gpu-memory-in-llm-serving-kv-cache-offloading （2026-06-16）
[^217^]: KVServe. https://arxiv.org/html/2605.13734v1 （2026-01-29）
[^218^]: Ren et al., An I/O Characterizing Study of Offloading LLM Models and KV Caches to NVMe SSD (CHEOPS'25). https://atlarge-research.com/pdfs/2025-cheops-llm.pdf （2025-03）
[^219^]: Chipstrat, High Bandwidth Flash: The Full Report. https://www.chipstrat.com/p/high-bandwidth-flash-the-full-report （2026-07-07）
[^220^]: Ma & Patterson, Challenges and Research Directions for LLM Inference Hardware (IEEE Computer 2026; arXiv 2601.05047). Table 3; https://arxiv.org/pdf/2601.05047 （2026-01）
[^221^]: FlashAccel: Leveraging High-Bandwidth Flash for High-Throughput LLM Inference. https://arxiv.org/abs/2607.10186 （2026-07-11）
[^222^]: SK hynix H³（经 semiwiki 报道）. https://semiwiki.com/forum/threads/sk-hynix-proposes-hbm-and-hbf-hybrid-for-llm-inference.24754/ （2026-03-17）
[^223^]: Semiconductor Engineering. （Yun）. https://semiengineering.com/flash-getting-stacked-high-bandwidth-version/ （2026-06-29）
[^224^]: iTWire（SanDisk HBF 规格）. https://itwire.com/business-it-news/storage/sandisks-high-bandwidth-flash-takes-aim-at-the-ai-memory-wall （2026-07-01）
[^226^]: Mooncake (FAST'25 最佳论文). https://www.cs.tsinghua.edu.cn/csen/info/1084/4580.htm + arXiv:2407.00079 （2025-02）
[^227^]: NVIDIA ICMS（经 arXiv 2603.21576 引用）. https://arxiv.org/pdf/2603.21576 （2026-03，转引 NVIDIA 2025 公告）
[^229^]: Strata: Hierarchical Context Caching. delay-hit 现象. https://arxiv.org/abs/2508.18572 （2025-08-26）
[^301^]: Cao et al., "MoE-Lightning: High-Throughput MoE Inference on Memory-constrained GPUs," arXiv:2411.11217, 2024-11-18. https://arxiv.org/abs/2411.11217
[^302^]: Alizadeh et al. (Apple), "LLM in a flash: Efficient Large Language Model Inference with Limited Memory," arXiv:2312.11514, 2023-12-12. https://arxiv.org/abs/2312.11514
[^303^]: "A Survey on Inference Optimization Techniques for Mixture of Experts Models," arXiv:2412.14219. https://arxiv.org/html/2412.14219
[^306^]: Fang et al., "Fate: Fast Edge Inference of Mixture-of-Experts Models via Cross-Layer Gate," arXiv:2502.12224, 2025-02-17. https://arxiv.org/html/2502.12224v1
[^307^]: He et al., "ExpertFlow: Efficient MoE Inference via Predictive Expert Caching and Token Scheduling," arXiv:2410.17954. https://arxiv.org/html/2410.17954v2
[^309^]: Liang et al. (引述 Jiang 2024 / Eliseev&Mazur 2023), arXiv:2505.16056. https://arxiv.org/html/2505.16056v2
[^310^]: Liang et al., "Not All Models Suit Expert Offloading: On Local Routing Consistency of Mixture-of-Expert Models," arXiv:2505.16056, 2025-05-21. https://arxiv.org/abs/2505.16056
[^311^]: Zhang et al., "DAOP: Data-Aware Offloading and Predictive Pre-Calculation for Efficient MoE Inference," arXiv:2501.10375, 2025-01 (DATE 2025). https://arxiv.org/pdf/2501.10375
[^313^]: DeepSeek 3FS 开源（GitHub deepseek-ai/3FS）及发布报道, 2025-02-28. https://github.com/deepseek-ai/3FS ; 报道 https://www.c114.net.cn/ai/150191.html
[^314^]: DeepSeek Context Caching 说明（社区整理）, 2025-07. http://xinfinite.net/t/topic/13344
[^315^]: DeepSeek-AI, "DeepSeek-V3 Technical Report," arXiv:2412.19437, 2024-12. https://arxiv.org/pdf/2412.19437
[^316^]: "Insights into DeepSeek-V3: Scaling Challenges and Reflections on Hardware for AI Architectures," arXiv:2505.09343. https://arxiv.org/html/2505.09343v2
[^317^]: "Scalable Training of Mixture-of-Experts Models with Megatron Core," arXiv:2603.07685, 2026-03-10. https://arxiv.org/html/2603.07685v2
[^319^]: SK hynix, "Presents Next-Generation NAND Storage Product Strategy at OCP 2025," 2025-10-26. https://news.skhynix.com/sk-hynix-presents-next-generation-nand-storage-product-strategy-at-ocp-2025/
[^320^]: LoveChip, "HBM VS HBF VS HBS," 2026-01-29. https://www.lovechip.com/blog/hbm-vs-hbf-vs-hbs
[^321^]: Futunn（转述 KAIST Kim Joungho）, "'Father of HBM': The commercialization of HBF…," 2026-01-17. https://news.futunn.com/en/post/67535813
[^323^]: Semiconductor Engineering, "Flash Getting Stacked High-Bandwidth Version," 2026-06-29. https://semiengineering.com/flash-getting-stacked-high-bandwidth-version/
[^324^]: HyperAccel, "Memory in the AI Era, Part 1: Understanding HBF," 2026-04-23. https://hyper-accel.github.io/en/posts/what-is-hbf/
[^325^]: ComputeLeap, "iPhone 17 Pro Ran a 400B LLM. Here's How," 2026-03-23. https://www.computeleap.com/blog/iphone-17-pro-400b-llm-on-device-ai-2026/
[^330^]: Tang et al., "HOBBIT: A Mixed Precision Expert Offloading System for Fast MoE Inference," arXiv:2411.01433, 2024-11-03. https://arxiv.org/html/2411.01433v1
[^331^]: "Efficient MoE Inference via Expert…"（引述 HOBBIT 命中率）, arXiv:2511.10676. https://arxiv.org/html/2511.10676v1
[^332^]: Hwang et al., "Pre-gated MoE: An Algorithm-System Co-Design for Fast and Scalable MoE Inference," ISCA 2024. 经 [^303^][^330^]
[^333^]: Du et al., "SiDA-MoE: Sparsity-Inspired Data-Aware Serving for MoE," 2024. 经 [^304^]
[^334^]: Zhang et al., "DuoServe-MoE," 2025. 经 arXiv:2511.10676 转述. https://arxiv.org/html/2511.10676v1
[^335^]: "FlashMoE: Reducing SSD I/O Bottlenecks via ML-Based Cache Replacement for MoE Inference on Edge Devices," arXiv:2601.17063, 2026-01. https://arxiv.org/html/2601.17063v1
[^336^]: "MoE-Beyond: Learning-Based Expert-Activation Predictor," arXiv:2508.17137, 2025-08. https://arxiv.org/pdf/2508.17137
[^345^]: kandiga（Qwen3.5-35B-A3B 路由实证）, GitHub, 2026-04-04. https://github.com/kantheon/kandiga
[^346^]: "Serving Large Language Models on Huawei CloudMatrix384," arXiv:2506.12708, 2025-05-25. https://arxiv.org/html/2506.12708v2 另见 arXiv:2601.14053
[^347^]: DeepEP 库说明（GitHub/neuralmagic 镜像）, 2025-09-26. https://github.com/neuralmagic/DeepEP-test
[^350^]: SK hynix OCP 2025 / 产业分层（"HBM 热层 + HBF 冷/温层"）. 见 [^319^][^320^]
[^401^]: iTWire, "Sandisk's High Bandwidth Flash takes aim at the AI memory wall", 2026-07-01. https://itwire.com/business-it-news/storage/sandisks-high-bandwidth-flash-takes-aim-at-the-ai-memory-wall
[^402^]: IndexBox/SemiEngineering, "High-Bandwidth Flash (HBF): Sandisk's New Memory Standard", 2026-05-15. https://www.indexbox.io/blog/high-bandwidth-flash-hbf-sandisks-new-memory-standard-for-ai-inference/
[^403^]: Chipstrat, "High Bandwidth Flash: The Full Report", 2026-07-07. https://www.chipstrat.com/p/high-bandwidth-flash-the-full-report
[^405^]: Sandisk Investor Relations, "Sandisk Forms HBF Technical Advisory Board", 2025-07-24. （TAB 成员含 David Patterson、Raja Koduri） https://investor.sandisk.com/news-releases/news-release-details/sandisk-forms-hbftm-technical-advisory-board-guide-development
[^406^]: Sandisk Newsroom, "Sandisk to Collaborate with SK hynix to Drive Standardization of HBF", 2025-08-06. https://www.sandisk.com/tr-tr/company/newsroom/press-releases/2025/2025-08-06-sandisk-to-collaborate-with-sk-hynix-to-drive-standardization-of-high-bandwidth-flash-memory-technology
[^408^]: eeNews Europe, "Sandisk proposes HBF to replace HBM, enable AI at the edge", 2025-04-22. https://www.eenewseurope.com/en/sandisk-proposes-hbf-to-replace-hbm-enable-ai-at-the-edge/
[^409^]: OSCOO, "SK Hynix and SanDisk Unveil High Bandwidth Flash for AI Inference", 2026-02-28. https://www.oscoo.com/news/sk-hynix-and-sandisk-unveil-high-bandwidth-flash-for-ai-inference/
[^410^]: LeCompute, "The KV cache is no longer a side effect: it is the center of LLM serving in 2026", 2026-07-03. https://lecompute.fr/en/runtimes/kv-cache-objet-central-serving/
[^411^]: NVIDIA Developer Blog, "Inside the NVIDIA Vera Rubin Platform: Six New Chips, One AI Supercomputer", 2026-04-21. https://developer.nvidia.com/blog/inside-the-nvidia-rubin-platform-six-new-chips-one-ai-supercomputer/
[^412^]: SemiAnalysis, "GTC 2026 – The Inference Kingdom Expands", 2026-03-24. （另见 2026-02-28 Vera Rubin 篇：） https://newsletter.semianalysis.com/p/nvidia-the-inference-kingdom-expands ; https://newsletter.semianalysis.com/p/vera-rubin-extreme-co-design-an-evolution
[^413^]: 同 [^412^]（SemiAnalysis Vera Rubin 篇, 2026-02-28）
[^414^]: Wang et al. (ICT, CAS), "FlashAccel: Leveraging High-Bandwidth Flash for High-Throughput LLM Inference", arXiv:2607.10186, 2026. https://arxiv.org/html/2607.10186v1
[^415^]: arXiv:2605.11999, "The Illusion of Power Capping in LLM Decode", 2026-05-12. https://arxiv.org/html/2605.11999v1
[^416^]: arXiv:2607.13068, "The Economics of AI Decoding Chips", 2026-06-01. https://arxiv.org/html/2607.13068v1
[^416b^]: arXiv:2605.03109, "Gated Subspace Inference for Transformer Acceleration", 2026-05-04. https://arxiv.org/html/2605.03109v1
[^417^]: InferenceEngineering.tech, "GPU Inference: H100 vs A100 vs L4", 2026-06-01. https://inferenceengineering.tech/learn/gpu-inference/
[^419^]: Spheron, "Cerebras vs NVIDIA H100: Wafer-Scale vs GPU for LLM Inference", 2026-04-28. https://www.spheron.network/blog/cerebras-vs-nvidia-h100-inference-2026/
[^420^]: D. Lewis, "Evaluating Llama-3.3-70B Inference on NVIDIA H100 and A100 GPUs", 2025-04-17. https://dlewis.io/evaluating-llama-33-70b-inference-h100-a100/
[^421^]: arXiv:2606.17104, "Prefill/Decode-Aware Evaluation of LLM Inference on Emerging AI Accelerators" (HPAI4S'26/IPDPS), 2026-06-14. https://arxiv.org/html/2606.17104v1
[^422^]: Zhong et al., "DistServe: Disaggregating Prefill and Decoding for Goodput-optimized LLM Serving", OSDI 2024. https://www.usenix.org/system/files/osdi24-zhong-yinmin.pdf
[^422b^]: B. Su, "LLM Serving from Scratch", 2026-02-06. https://briansu.co/articles/optimization/llm-serving
[^423^]: Agrawal et al., "Taming Throughput-Latency Tradeoff in LLM Inference with Sarathi-Serve", OSDI 2024 (arXiv:2403.02310). https://arxiv.org/abs/2403.02310
[^424^]: arXiv:2605.17613, "VeriCache: Turning Lossy KV Cache into Lossless LLM Inference", 2026-05-17. https://arxiv.org/html/2605.17613v1
[^425^]: 掘金, "【大模型基础设施工程】11：推理引擎基础", 2026-04-28. https://juejin.cn/post/7633658714650574889
[^426^]: arXiv:2604.26968, "Predictive Multi-Tier Memory Management for KV Cache in Large-Scale GPU Inference", 2026-04-19. https://arxiv.org/html/2604.26968v1
[^427^]: TensorEconomics, "DeepSeek Sparse Attention from First Principles", 2026-04-15. https://www.tensoreconomics.com/p/deepseek-sparse-attention-from-first
[^428^]: Spheron, "KV Cache Optimization Guide", 2026-03-28. https://www.spheron.network/blog/kv-cache-optimization-guide/
[^428b^]: Spheron, "Multi-Head Latent Attention (MLA) on GPU Cloud", 2026-06-25. https://www.spheron.network/blog/multi-head-latent-attention-mla-gpu-cloud/
[^429^]: DeepSeek-AI, "DeepSeek-V3 Technical Report", arXiv:2412.19437, 2024-12. https://arxiv.org/abs/2412.19437
[^430^]: Kimi Team, "Kimi K2: Open Agentic Intelligence", arXiv:2507.20534, 2025. https://arxiv.org/abs/2507.20534
[^431b^]: vLLM Recipes, "DeepSeek-V3.2-Exp", 2026-06-16. https://recipes.vllm.ai/deepseek-ai/DeepSeek-V3.2-Exp
[^433^]: arXiv:2411.08982 (Lynx/PROWL), 2024-11. https://arxiv.org/html/2411.08982v2
[^435^]: CSDN（LDZKKJ）, "英伟达 Vera Rubin HBM4 三家齐过", 2026-07-12. https://blog.csdn.net/LDZKKJ/article/details/162797140
[^436^]: Spheron GPU Catalog, "NVIDIA Rubin R100", 无日期（2026 抓取）; 另 WCCFTech 2026-03-19 引 NVIDIA 官方表. https://www.spheron.network/gpu-rental/r100/ ; https://wccftech.com/nvidia-vera-rubin-achieves-40-million-times-more-compute-in-10-years/
[^443^]: Microsoft Research, "Vidur" (MLSys'24, arXiv:2405.05465) + GitHub. https://github.com/microsoft/vidur ; https://pyshine.com/Vidur-Microsoft-LLM-Inference-System-Simulator/
[^444^]: arXiv:2602.23036, "A Unified Simulator for Heterogeneous and Disaggregated LLM Serving Infrastructure" (LLMServingSim 2.0), 2025-12-15. https://arxiv.org/html/2602.23036v1
[^446^]: arXiv:2605.19775, "Understanding Inference Scaling for LLMs", 2025-12-12. https://arxiv.org/html/2605.19775v1
[^448^]: Spheron, "NVMe KV Cache Offloading for LLM Inference", 2026-03-31. https://www.spheron.network/blog/nvme-kv-cache-offloading-llm-inference/
[^501^]: MxGLUT (arXiv:2607.01607, 2026-07-02)。https://arxiv.org/html/2607.01607v1
[^502^]: HPIM (arXiv:2509.12993, 2025-09)。https://arxiv.org/html/2509.12993v3
[^503^]: FP8 LLM Inference TCO (arXiv:2502.01070, 2025-07-24)。https://arxiv.org/html/2502.01070v4
[^504^]: A Systematic Characterization of LLM Inference on GPUs (arXiv:2512.01644, 2025-12)。https://arxiv.org/html/2512.01644v1
[^505^]: PALUTE (arXiv:2606.08891, 2026-06-08)。https://arxiv.org/html/2606.08891v1
[^506^]: ByteTransformer (arXiv:2210.03052, 2022-10)。https://ar5iv.labs.arxiv.org/html/2210.03052
[^507^]: TurboTransformers (arXiv:2010.05680, 2020-10)。https://ar5iv.labs.arxiv.org/html/2010.05680
[^508^]: Geva et al., FFN Are Key-Value Memories (arXiv:2012.14913, 2020-12-29)。https://arxiv.org/abs/2012.14913
[^509^]: Dettmers et al., LLM.int8() (arXiv:2208.07339, 2022-08-15)。https://arxiv.org/abs/2208.07339
[^511^]: Bondarenko et al., Quantizable Transformers (arXiv:2306.12929, 2023-06)。https://arxiv.org/html/2306.12929v1
[^512^]: Gholami et al., Survey of Quantization Methods (arXiv:2103.13630, 2021-03)。https://arxiv.org/pdf/2103.13630v3.pdf
[^513^]: ISQuant (arXiv:2407.11037, 2024-07)。https://arxiv.org/html/2407.11037v1
[^514^]: Quantization Variation (arXiv:2307.00331, 2023-07)。https://arxiv.org/html/2307.00331v2
[^515^]: Li et al., LLM-MQ (NeurIPS 2023 ENLSP Workshop)。另保留 0.5% outlier FP16。https://nicsefc.ee.tsinghua.edu.cn/%2Fnics_file%2Fpdf%2F5c805adc-b555-499f-9882-5ca35ce674b5.pdf
[^516^]: CMPQ (arXiv:2410.13056, 2024-10)。https://arxiv.org/html/2410.13056v2
[^517^]: Extreme Pruning Mixed Sparsity (arXiv:2503.11164, 2025-03)。https://arxiv.org/html/2503.11164v1
[^519^]: FastEWQ / Universality of Layer-Level EWQ (arXiv:2503.04704, 2025-03)。并引述。https://arxiv.org/html/2503.04704v2
[^520^]: Lammie, Heterogeneous Mapping for AIMC: A Unified Workflow (arXiv:2606.02672, 2026-06-01, IEEE)。https://arxiv.org/html/2606.02672v1
[^521^]: Rasch et al., HWA Training (Nature Communications 14, 2023-08-30)。BERT 可达 iso-accuracy。https://www.nature.com/articles/s41467-023-40770-4
[^522^]: Shafiee et al., ISAAC (ISCA 2016)。https://users.cs.utah.edu/~rajeev/pubs/isca16.pdf
[^525^]: Lammie et al., LionHeart (arXiv:2401.09420, 2024-01-17; IEEE TETC 2025)。runtime/能效收益 >6×。https://arxiv.org/html/2401.09420v1
[^530^]: Yu et al., Cambricon-LLM (arXiv:2409.15654, 2024-09-24; MICRO 2024)。https://arxiv.org/abs/2409.15654
[^531^]: KVNAND (arXiv:2512.03608, 2025-12)。https://arxiv.org/html/2512.03608v1
[^532^]: Xu et al., NASiC (arXiv:2605.23294, 2026-05-22)。https://arxiv.org/html/2605.23294v1
[^533^]: Heo et al., NeuPIMs (arXiv:2403.00579, 2024-03-01; ASPLOS 2024)。https://arxiv.org/abs/2403.00579
[^534^]: Zhou et al., TransPIM (HPCA 2022; NSF PAR 10345536)。PIM-only 时 reduction 占 23-32% 时间。https://par.nsf.gov/servlets/purl/10345536
[^535^]: BYOC (arXiv:2105.03215, 2021-05)。https://ar5iv.labs.arxiv.org/html/2105.03215
[^536^]: ONNX Runtime 架构分析（Uplatz 博客, 2025-11-29）。https://uplatz.com/blog/onnx-runtime-a-comprehensive-analysis-of-architecture-performance-and-deployment-for-production-ai/
[^537^]: Edge AI 课程（Cursa）。https://cursa.app/en/page/hardware-aware-optimization-and-accelerator-utilization
[^538^]: Trilinear CIM (arXiv:2604.07628, 2026-04-08)。https://arxiv.org/html/2604.07628v1
[^539^]: TurboAngle/MixedKV (arXiv:2603.27467, 2026-03)。存在。https://arxiv.org/pdf/2603.27467
[^540^]: AQPIM (arXiv:2604.18137, 2025-04-10)。https://arxiv.org/html/2604.18137v1
[^541^]: Four Over Six / NVFP4 (arXiv:2512.02010, 2026-05-07)。https://arxiv.org/html/2512.02010v4
[^542^]: vLLM GitHub Issue #22195（混合精度 KV 提案, 2025-08-04）。https://github.com/vllm-project/vllm/issues/22195
[^544^]: HW-SW Co-design of Softmax and LayerNorm (arXiv:2510.17189, 2025-10)。https://arxiv.org/html/2510.17189v1
[^547^]: mlx-optiq 工程博客（Apple Silicon 混合精度实测, 2026-03-20）。https://mlx-optiq.com/blog/not-all-layers-are-equal
[^550^]: MNN-LLM (arXiv:2506.10443, 2025-06)。https://arxiv.org/html/2506.10443v1
[^601^]: Frantar et al., "GPTQ: Accurate Post-Training Quantization for Generative Pre-trained Transformers", arXiv:2210.17323 (ICLR 2023), 2022-10-31. https://arxiv.org/abs/2210.17323
[^602^]: Lin et al., "AWQ: Activation-aware Weight Quantization for LLM Compression and Acceleration", arXiv:2306.00978 (MLSys 2024), 2023-06. https://arxiv.org/pdf/2306.00978
[^604^]: Xiao et al., "SmoothQuant: Accurate and Efficient Post-Training Quantization for Large Language Models", arXiv:2211.10438 (ICML 2023), 2022-11. https://arxiv.org/pdf/2211.10438
[^605^]: (a) "Outliers and Calibration Sets have Diminishing Effect on Quantization of Modern LLMs", arXiv:2405.20835, 2024-05; (b) Dettmers & Zettlemoyer, "The case for 4-bit precision: k-bit inference scaling laws", ICML 2023. https://arxiv.org/html/2405.20835v2
[^606^]: Dettmers et al., "LLM.int8(): 8-bit Matrix Multiplication for Transformers at Scale", arXiv:2208.07339 (NeurIPS 2022). https://proceedings.neurips.cc/paper_files/paper/2022/file/c3ba4962c05c49636d4c6206a97e9c8a-Paper-Conference.pdf
[^608^]: Hooper et al., "KVQuant: Towards 10 Million Context Length LLM Inference with KV Cache Quantization", arXiv:2401.18079 (MLSys 2024), 2024-01. https://arxiv.org/html/2401.18079v5
[^609^]: Ashkboos et al., "QuaRot: Outlier-Free 4-Bit Inference in Rotated LLMs", arXiv:2404.00456, 2024-04. https://web3.arxiv.org/pdf/2404.00456
[^610^]: Hariri et al., "More for Keys, Less for Values: Adaptive KV Cache Quantization", arXiv:2502.15075, 2025-02-20. https://arxiv.org/abs/2502.15075v1
[^611^]: "Quantization Hurts Reasoning? An Empirical Study on Quantized Reasoning Models", arXiv:2504.04823, 2025-04. https://arxiv.org/html/2504.04823v1
[^612^]: "Quantized Reasoning Models Think They Need to Think Longer, but They Do Not", arXiv:2606.00206, 2026-05-29. https://arxiv.org/html/2606.00206v1
[^613^]: "Model Hemorrhage and the Robustness Limits of Large Language Models", arXiv:2503.23924, 2025. https://arxiv.org/pdf/2503.23924v1.pdf
[^614^]: "The Uniqueness of LLaMA3-70B Series with Per-Channel Quantization", arXiv:2408.15301, 2024-08. https://arxiv.org/html/2408.15301
[^616^]: Hoffmann et al., "Training Compute-Optimal Large Language Models" (Chinchilla), arXiv:2203.15556, 2022；转引自 "Introduction to AI Safety, Ethics, and Society", arXiv:2411.01042, 2024. https://arxiv.org/pdf/2411.01042
[^617^]: Ouyang et al., "Low-Bit Quantization Favors Undertrained LLMs: Scaling Laws for Quantized LLMs with 100T Training Tokens", arXiv:2411.17691, 2024-11-26. https://arxiv.org/abs/2411.17691
[^618^]: Kumar et al., "Scaling Laws for Precision", arXiv:2411.04330, 2024-11-07. https://arxiv.org/abs/2411.04330
[^619^]: Spring et al., "Overtrained Language Models Are Harder to Fine-Tune", arXiv:2503.19206, 2025. https://arxiv.org/html/2503.19206v2
[^621^]: Rasch et al., "Hardware-aware training for large-scale and diverse deep learning inference workloads using in-memory computing-based accelerators", Nature Communications 14:5282, 2023 (arXiv:2302.08469). https://arxiv.org/pdf/2302.08469
[^622^]: Springer Nature Research Communities 博客（IBM Analog AI 团队）, 2025-09-02. https://communities.springernature.com/posts/analog-ai-training-larger-scale-dnns-for-deployment-on-future-analog-in-memory-computing-hardware-without-accuracy-loss
[^623^]: Joshi et al., "Accurate deep neural network inference using computational phase-change memory", Nature Communications 11:2473, 2020. https://www.nature.com/articles/s41467-020-16108-9.pdf
[^624^]: Li et al., "Efficient transformer adaptation for analog in-memory computing via low-rank adapters (AHWA-LoRA)", arXiv:2411.17367, 2024-11（2025 修订）. https://arxiv.org/html/2411.17367v3
[^625^]: "Variance-Aware Noisy Training: Hardening DNNs against Unstable Analog Computations", arXiv:2503.16183 (ECML-PKDD 2025). https://arxiv.org/html/2503.16183v1
[^626^]: Emergent Mind 专题页（转引 Hamzaoui et al. 2024 等）, 2026-03-17. https://www.emergentmind.com/topics/analog-in-memory-computing-aimc
[^627^]: Park et al., "Outlier-Safe Pre-Training for Robust 4-Bit Quantization of Large Language Models", arXiv:2506.19697 (ACL 2025), 2025-06-24. https://arxiv.org/abs/2506.19697
[^628^]: Jaiswal et al., "Compressing LLMs: The Truth is Rarely Pure and Never Simple (LLM-KICK)", arXiv:2310.01382 (ICLR 2024). https://www.x-mol.com/paper/1709319353768103936
[^629^]: "ACBench: Agentic Compression Benchmark" (ICML 2025), GitHub README, 2024-12-09. https://github.com/pprp/ACBench
[^630^]: 曝光偏差综述：Emergent Mind "Exposure Bias in Machine Learning", 2025-11-24；原始文献 Bengio et al. 2015 (scheduled sampling)、Ranzato et al. 2016. https://www.emergentmind.com/topics/exposure-bias
[^631^]: "Dance Revolution: Long-Term Dance Generation with Music via Curriculum Learning", arXiv:2006.06119, 2020（离散 NLG vs 连续域误差累积对比）. https://arxiv.org/pdf/2006.06119v3
[^632^]: Liu et al., "KIVI: A Tuning-Free Asymmetric 2bit Quantization for KV Cache", arXiv:2402.02750 (ICML 2024), 2024-02. https://arxiv.org/html/2402.02750v2
[^633^]: Hao et al., "NVLLM: A 3D NAND-Centric Architecture Enabling Edge on-Device LLM Inference", arXiv:2604.25699, 2026-04-28. https://arxiv.org/html/2604.25699
[^634^]: W. Shim, "Impact of 3D NAND Current Variation on Inference Accuracy for In-memory Computing", J. Semiconductor Technology and Science 22(5):341–345, 2022. 全文 PDF. http://journal.auric.kr/AURIC_OPEN_temp/RDOC/ieie02/ieiejsts_202210_005.pdf ；摘要页. https://www.kci.go.kr/kciportal/ci/sereArticleSearch/ciSereArtiView.kci?sereArticleSearchBean.artiId=ART002888604
[^636^]: W. Shim, H. Jiang, X. Peng, S. Yu, "Architectural design of 3D NAND flash based compute-in-memory for inference engine", MEMSYS 2020, pp.77–85；及后续 System-Technology Co-Design（IEEE TCAD 2021）摘要. https://www.researchgate.net/publication/350279159
[^637^]: "Deep Neural Network Weight-bit Inversion for State Error Reduction (WISE/WISER)", DATE 2021. https://past.date-conference.com/proceedings-archive/2021/pdf/1567.pdf
[^637b^]: Cai, Luo, Ghose, Mutlu et al., "Read Disturb Errors in MLC NAND Flash Memory", DSN 2015. https://people.inf.ethz.ch/omutlu/pub/flash-read-disturb-errors_dsn15_shortlist.pdf
[^639^]: "基于 3D NAND 闪存的存算一体大模型推理系统（产品级芯片行为级仿真）", Acta Physica Sinica（物理学报）74, 2025, DOI:10.7498/aps.74.20250891. https://wulixb.iphy.ac.cn/pdf-content/10.7498/aps.74.20250891.pdf
[^701^]: **Etalon: Holistic Performance Evaluation Framework for LLM Inference Systems**（arXiv:2407.07000，2024-07）。 https://arxiv.org/pdf/2407.07000
[^702^]: **AI Inference Latency Explained: TTFT, TPS, and How to Optimize Them**（General Compute，2026-06-12）。 https://www.generalcompute.com/blog/ai-inference-latency-explained-ttft-tps-and-how-to-optimize-them
[^703^]: **NVIDIA aiperf: Benchmark LLM Inference (TTFT, ITL, Throughput)**（Luca Berton blog，2026-04-22）。 https://lucaberton.com/blog/nvidia-aiperf-llm-inference-benchmarking-guide/
[^704^]: **Fastest LLM Inference APIs in 2026: A Developer's Guide to TTFT and Throughput**（Inworld AI，2026-05-28）。 https://inworld.ai/resources/fastest-llm-inference-api
[^705^]: **DistServe: Disaggregating Prefill and Decoding for Goodput-optimized LLM Serving**（arXiv:2401.09670，2024-01，OSDI 2024）。 https://arxiv.org/pdf/2401.09670v2
[^706^]: **DOPD: A Dynamic PD-Disaggregation Architecture for Maximizing Goodput in LLM Inference Serving**（arXiv:2511.20982，2025-11）。 https://arxiv.org/html/2511.20982v1
[^707^]: **MuxWise: Towards High-Goodput LLM Serving with Prefill-decode Multiplexing**（arXiv:2504.14489v3，2025-04）。 https://arxiv.org/html/2504.14489v3
[^708^]: **SLO Metrics 综述段落**（arXiv:2601.10729，2026-01）。 https://arxiv.org/pdf/2601.10729
[^709^]: **Revisiting SLO and Goodput Metrics in LLM Serving**（arXiv:2410.14257，2024-10）。 https://arxiv.org/html/2410.14257v1
[^710^]: **MFU 多来源**：Lambda《MFU》白皮书（无日期） https://lambda.ai/hubfs/4.%20Resources/White%20Papers/Lambda%20MFU.pdf ；ZeroEntropy MFU 概念页（无日期） https://zeroentropy.dev/concepts/mfu/ ；arXiv:2602.20164（2026）；TechnoLynx（2026-05-10） https://www.technolynx.com/post/model-flops-utilization-training-efficiency
[^711^]: **Cloud and AI Infrastructure Cost Optimization: A Comprehensive Review**（arXiv:2307.12479v2，2026-01-26）。 https://arxiv.org/html/2307.12479v2
[^712^]: **A Concurrency-Awareness Methodology for LLM Infrastructure Cost Estimation**（arXiv:2606.11690，2026-06-09）。 https://arxiv.org/html/2606.11690v1
[^715^]: **LLM Benchmarks: Definition, Examples & FutureAGI Guide**（FutureAGI，2026-05-07）。饱和替换表. https://futureagi.com/glossary/llm-benchmarks/
[^716^]: **LLM Benchmarks Compared: MMLU, HumanEval, GSM8K and More (2026)**（LXT，2026-05-19）。15 基准表. https://www.lxt.ai/blog/llm-benchmarks/
[^717^]: **GPQA: A Graduate-Level Google-Proof Q&A Benchmark**（arXiv:2311.12022，2023-11；经 Gabor Melli 知识库转述，2026-07-13 更新）。 http://www.gabormelli.com/RKB/Graduate-Level_Google-Proof_Q%26A_(GPQA)_Benchmark
[^718^]: **MMLU-Pro（TIGER-Lab，NeurIPS 2024，arXiv:2406.01574）**，经 Benchgen（2026-06-19）与 id8.co.in（2026-06-23）转述. https://benchgen.com/benchmarks/tiger-ai-lab-university-of-waterloo/mmlu-pro
[^719^]: **RULER: What's the Real Context Size of Your Long-Context Language Models?**（arXiv:2404.06654，2024-04）。 https://arxiv.org/pdf/2404.06654v1
[^720^]: **LongBench: A Bilingual, Multitask Benchmark for Long Context Understanding**（arXiv:2308.14508，2023-08（v2 2024-06））。 https://arxiv.org/abs/2308.14508
[^721^]: **The $1.7B Benchmark: How LMArena's 6 Million Human Votes Are Reshaping AI Model Rankings**（AgentMarketCap，2026-04-06）。；AiCE-Lab（2026-05-16）. https://agentmarketcap.ai/blog/2026/04/06/lmarena-17b-valuation-benchmark-arbiter-human-preference-ranking ; https://www.aice-lab.org/posts/llm-benchmarks-complete-guide-2026/
[^722^]: **Does style matter? Disentangling style and substance in Chatbot Arena**（LMSYS 官方博客，2024-08-28）。（长度系数 0.249–0.267）https://www.lmsys.org/blog/2024-08-28-style-control/
[^723^]: **Chatbot Arena: Elo Ratings, Methodology, Caveats**（BenchmarkingAgents，2026-04-21）。 https://benchmarkingagents.com/chatbot-arena/
[^724^]: **HalluLens: LLM Hallucination Benchmark**（arXiv:2504.17550，2025-04）。 https://arxiv.org/html/2504.17550v1
[^725^]: **SimpleQA Verified: A Reliable Factuality Benchmark to Measure Parametric Knowledge**（arXiv:2509.07968，2025-09）。 https://arxiv.org/html/2509.07968v2
[^726^]: **Safety Eval Suites 2026: HarmBench, JailbreakBench, AILuminate Compared**（BenchmarkingAgents，2026-04-21）。 https://benchmarkingagents.com/harm-safety-evals/
[^727^]: **M-IFEval: Multilingual Instruction-Following Evaluation**（arXiv:2502.04688，2025-02-07）。 https://arxiv.org/abs/2502.04688
[^728^]: **AI Agent Framework Scorecard 2026**（RapidClaw，2026-04-30）。 https://rapidclaw.dev/blog/ai-agent-benchmarks-2026
[^729^]: **AI Agent Benchmarks 对比页**（BenchmarkingAgents，2026-04-21）。τ-bench；比较表：SWE-bench Verified 500 任务泄漏风险、WebArena 812 任务 Low、OSWorld 369 Low。https://benchmarkingagents.com/agent-benchmarks/
[^730^]: **HELM 多维框架**，ai-training-playbook（GitHub，2026-03-25）与 Awesome-AI-Evaluation-Guide（2025-12-02）。 https://github.com/nikhil-thomas-a/ai-training-playbook/blob/main/02-evaluation-metrics.md
[^731^]: **LiveBench: A Challenging, Contamination-Limited LLM Benchmark**（arXiv:2406.19314，2024-06（v2 2025-04））。；VentureBeat（2025-12-22）. https://arxiv.org/abs/2406.19314 ; https://venturebeat.com/ai/livebench-open-ai-model-benchmark-contamination-free-test-data/
[^733^]: **Evaluation data contamination in LLMs: how do we measure it and (when) does it matter? (ConTAM)**（arXiv:2411.03923，2024-11）。 https://arxiv.org/html/2411.03923
[^735^]: **Phi-4 Technical Report**（arXiv:2412.08905，2024-12-12）。 https://arxiv.org/html/2412.08905v1
[^736^]: **The Leaderboard Illusion（Singh et al., 2025）**，经 Collinear AI（2025-05-15）与 tianpan.co（2026-04-14）转述. https://blog.collinear.ai/p/gaming-the-system-goodharts-law-exemplified-in-ai-leaderboard-controversy ; https://tianpan.co/blog/2026-04-14-goodharts-law-in-your-llm-eval-suite
[^737^]: **Improving Your Model Ranking on Chatbot Arena by Vote Rigging**（arXiv:2501.17858，2025-01）。论文系统性证明可通过投票操纵提升 Arena 排名（Omni rigging 等策略）。https://arxiv.org/html/2501.17858v1
[^739^]: **Goodhart/刷榜多来源**：FourWeekMBA（2025-09-05） https://fourweekmba.com/the-goodharts-law-trap-when-ai-metrics-become-useless/ ；Brenndoerfer（2026-01-07） https://mbrenndoerfer.com/writing/benchmark-design-construction-annotation-validity-nlp ；AI Agent Engineer Handbook（GitHub，2026-05-02） https://github.com/harrisliangsu/ai-agent-engineer-handbook/blob/main/interview-prep/interview-questions.md
[^741^]: **Artificial Analysis 官方 Methodology 页**（访问于 2026-07）。 https://artificialanalysis.ai/methodology
[^742^]: **Artificial Analysis Intelligence Index 构成**，NBER Working Paper w34608 附录表（2025）。（AA-LCR：100 题、最长 100k token 的长上下文推理）；Theseus 论文附录另列 Terminal-Bench Hard 与 τ²-Bench Telecom 各 1/10 权重。https://www.nber.org/system/files/working_papers/w34608/w34608.pdf ; https://www.theseus.fi/bitstream/10024/905597/2/Lahti_Matti.pdf
[^743^]: **OpenRouter Rankings 官方页**（访问于 2026-07）。 https://openrouter.ai/rankings ；佐证研究 **Demand for LLMs**（arXiv:2504.15440，2025-04）. https://arxiv.org/pdf/2504.15440
[^744^]: **vLLM vs SGLang 2026: RadixAttention vs PagedAttention Benchmarks**（Spheron，2026-06-22）。 https://www.spheron.network/blog/vllm-vs-sglang-2026/
[^745^]: **SGLang Production Deployment Guide**（Spheron，2026-03-30）。 https://www.spheron.network/blog/sglang-production-deployment-guide/
[^746^]: **SGLang: Efficient Execution of Structured Language Model Programs**（NeurIPS 2024）。 https://proceedings.neurips.cc/paper_files/paper/2024/file/724be4472168f31ba1c9ac630f15dec8-Paper-Conference.pdf
[^747^]: **Advanced KV Cache: RadixAttention, LMCache, and Context Parallelism**（CalibreOS，无日期）。 https://www.calibreos.com/learn/genai-kv-cache-management
[^748^]: **LLM Model Comparison 2026: Cost, Quality, Speed**（Tokonomics，2026-06-02）。 https://tokonomics.ca/blog/llm-model-comparison-guide-2026
[^749^]: **AI Model Leaderboard: LMArena ELO and Benchmark Scores**（Lambda Finance，2026-04-21）。校准规则. https://www.lambdafin.com/articles/ai-model-leaderboard
[^750^]: **LMSys Arena Elo April 2026: How To Actually Read It**（SmartChunks，2026-04-21）。 https://smartchunks.com/lmsys-arena-elo-leaderboard-explained-2026/
[^751^]: **AI for Mathematical Reasoning 综述**（arXiv:2606.08728，2026-06-07）。 https://arxiv.org/html/2606.08728
[^752^]: **LLM 推理指标定义综述**（arXiv:2507.09019，2025-07）。 https://arxiv.org/pdf/2507.09019
[^755^]: **Hierarchical Contamination Detection for Synthetic Training Data**（arXiv:2511.17602，2025-11）。四级污染场景，对照 13-gram、Min-K% Prob、embedding、LLM Decontaminator、CDD 五类检测基线。https://arxiv.org/html/2511.17602v1
[^801^]: Spheron, "GPU Memory Requirements for LLMs" — https://www.spheron.network/blog/gpu-memory-requirements-llm/ （2026-05-15，厂商博客）
[^802^]: VMware, "LLM Inference Sizing and Performance Guidance" — 含分 GPU TTFT/TPOT/吞吐计算器表。 https://blogs.vmware.com/cloud-foundation/2024/09/25/llm-inference-sizing-and-performance-guidance/ （2024-09-25，页面更新 2026-02，企业技术博客）
[^803^]: tutorialq, "KV Cache Sizing" — https://tutorialq.com/ai/dl-infrastructure/kv-cache-sizing （2026-03-27，教程站）
[^804^]: M. Brenndoerfer, "KV Cache Memory: Calculating GPU Requirements" — https://mbrenndoerfer.com/writing/kv-cache-memory-calculation-llm-inference-gpu （2026-01-07，个人技术站含代码）
[^805^]: 掘金《大模型基础设施工程 11：推理引擎基础》— "A100 SXM4 peak: FP16 312 TFLOPS, HBM 2.0 TB/s, 拐点 I≈156 FLOPs/byte… 算术强度几乎就是 batch size… Decode…memory-bound，瓶颈在读权重和读 KV"。 https://juejin.cn/post/7633658714650574889 （2026-04-28，中文技术社区）
[^806^]: arXiv 2606.29986, "HBM Is Not All You Need" — https://arxiv.org/html/2606.29986v1 （2026-06-29，arXiv 预印本）
[^807^]: arXiv 2606.06256 (RedKnot) — "For a 70B-class model at 128K context length, the KV cache alone can exceed 40 GB… balance point ∼156 FLOP/Byte on A100 and ∼295 FLOP/Byte on H100 SXM"。 https://arxiv.org/html/2606.06256v2 （2026-06-26，arXiv）
[^808^]: OSDI'24 / arXiv 2401.09670, DistServe — "DistServe can serve 7.4× more requests or 12.6× tighter SLO… staying within latency constraints for >90% of requests"；单 A100 1.6 rps vs 拆分后 10 rps。 https://www.usenix.org/conference/osdi24/presentation/zhong-yinmin ; https://arxiv.org/html/2401.09670v2 （2024-03/OSDI'24，顶会）
[^809^]: wentao.site DistServe 解读 — "transfer < 0.1% even on 175B with 25 Gb links"；prefill M/D/1 排队模型；局限。 https://wentao.site/disaggregated_inference_summary/ （2026-07-04，个人笔记）
[^810^]: HyperAccel, "Understanding HBF" — 层级表。 https://hyper-accel.github.io/en/posts/what-is-hbf/ （2026-04-23，HBF 厂商博客）
[^811^]: Introl, "CXL 4.0 Infrastructure Planning Guide" — https://introl.com/blog/cxl-4-0-infrastructure-planning-guide-ai-memory-pooling-2025 （2026-04-27，集成商博客）
[^812^]: memorysupercycle.xyz — "HBM3E ≈ $300 / 36 GB stack (~$8–13/GB)… peaked at ~$17–20/GB in H1 2025… DDR5 ≈ $12/GB currently"；声明所有数字为分析师三角估计、无公开价格指数。 https://memorysupercycle.xyz/ （未知日期/2026 滚动，聚合仪表盘）
[^813^]: Metrum AI (Solidigm KV offload) — "H200 $30,000-40,000 for 141 GB → $213-$284/GB（整卡口径）；Solidigm D7-PS1010 15.36TB $3,250 → ~$0.21/GB，seq read 14,500 MB/s"。 https://www.metrum.ai/blog/solidigm-kv-cache-offload-ai-inference （2026 年，厂商合作博客）
[^814^]: Spheron, "NVIDIA H200 Specs" — https://www.spheron.network/blog/nvidia-h200-specs/ （2026-05-20，云厂商，规格与官方一致）
[^815^]: JarvisLabs, "NVIDIA B200 Specs" — https://jarvislabs.ai/ai-faqs/nvidia-b200-specs （2026 年，云厂商 FAQ）
[^816^]: arXiv 2303.06865, FlexGen — "aggregates memory from the GPU, CPU, and disk… running OPT-175B on NVIDIA T4 (16GB)… reaching a generation throughput of 1 token/s for the first time with an effective batch size of 144"。 https://arxiv.org/abs/2303.06865 （2023-03-13，ICML'23）
[^817^]: FlexGen GitHub — 吞吐表 "FlexGen with Compression OPT-175B 1.12 tok/s (144 on CPU)… With the same latency of 5000 seconds, FlexGen… more than 40× higher throughput than DeepSpeed Zero-Inference"。 https://github.com/FMInference/FlexGen （2023，官方仓库）
[^818^]: arXiv 2606.11690, "Beyond Per-Token Pricing" — https://arxiv.org/abs/2606.11690 （2026-06-10，arXiv）
[^819^]: arXiv 2606.22902 (Agent-as-a-Router) — "H100 $6.88/GPU-hour… sustained 35,094 tokens/s… $0.054 per 1M tokens"。 https://arxiv.org/html/2606.22902v1 （2026-06-24，arXiv 附录方法）
[^820^]: firecrawl AI-research-SKILLs, TRT-LLM serving reference — "Batch size 1: $3/M tokens；Batch size 64: $0.60/M — 5× cost reduction；Target batch 32-128"；分硬件 $/M tokens 表。 https://github.com/firecrawl/ai-research-skills/blob/main/12-inference-serving/tensorrt-llm/references/serving.md （2026-02-06，工程资料）
[^821^]: kubernetes-sigs/inference-perf paper — 标准指标含 "Price per million output/input tokens, Throughput per dollar"。 https://github.com/kubernetes-sigs/inference-perf/blob/main/paper/paper.md （2025-01-14，K8s 社区）
[^822^]: arXiv 2603.08739, Kareto（阿里+浙大）— "Simply expanding storage does not always yield performance gains; beyond a certain point, storage cost can outweigh computation savings"；仿真器。 https://arxiv.org/abs/2603.08739 （2026-02-25，arXiv）
[^823^]: SGLang HiCache 文档 — "a larger HiCache size leads to higher cache hit rate… However, the relationship is not linear. Once most reusable KV data is cached, further increases yield marginal gains"；L1 GPU/L2 host/L3 storage 参数族。 https://docs.sglang.io/advanced_features/hicache.html （2026-03-04，官方文档）
[^824^]: arXiv 2605.11333, MLCommons Chakra — "Chakra execution trace (ET)… represent key operations, such as compute, memory, and communication, data and control dependencies, timing, and resource constraints… adopted by MLCommons… NVIDIA, AMD, Meta, Keysight, HPE"。 https://arxiv.org/abs/2605.11333 （2026-05-11，MLCommons）
[^825^]: vLLM 官方 Profiling 文档 — "nsys profile --trace-fork-before-exec=true --cuda-graph-trace=node vllm bench latency…"；`vllm bench serve --profile` 动态抓取。 https://docs.vllm.ai/en/stable/contributing/profiling/ （2025-03-05 起多版本，官方文档）
[^826^]: Red Hat Developer, "Profiling vLLM Inference Server" — 三段式流程：PyTorch profiler（VLLM_TORCH_PROFILER_DIR + /start_profile）→ Nsight Systems；trace 用 Perfetto 打开。 https://developers.redhat.com/articles/2025/10/16/profiling-vllm-inference-server-gpu-acceleration-rhel （2025-10-16，企业技术博客）
[^827^]: Spheron, "GPU Profiling for AI Workloads" — https://www.spheron.network/blog/gpu-profiling-ai-workloads-nsight-compute-pytorch-profiler-guide/ （2026-05-09，云厂商）
[^828^]: PyShine, "Vidur: Microsoft's LLM Inference System Simulator" — （论文 arXiv 2405.05465） https://pyshine.com/Vidur-Microsoft-LLM-Inference-System-Simulator/ （2026-04-28，解读+官方论文）
[^829^]: Aalto 大学论文, "Characterizing LLM inference workload patterns" — 基于 Azure LLM inference trace 与 BurstGPT。 https://aaltodoc.aalto.fi/items/5607c667-f6fe-4d48-98d2-c5018dfbbf06 （2025-12-29，学位论文）
[^830^]: kvcache-ai/Mooncake — "Mooncake can achieve up to a 525% increase in throughput… enables Kimi to handle 75% more requests"。 https://github.com/kvcache-ai/Mooncake （FAST'25 最佳论文，2026-04 更新）
[^831^]: IBM Redbooks MD260021 — "TTFT remains nearly flat… 56x speedup with an input sequence length of 130k tokens… throughput… 0.19 RPS to 4.26 RPS, a 22x improvement… noisy-neighbor… 18x"；用 NVIDIA AIPerf 基准。 https://www.redbooks.ibm.com/docs/MD260021/MD260021.html （2026-06-05，厂商验证架构）
[^832^]: Yobitel, "NVIDIA H100 Tensor Core GPU" — 生产告警清单。 https://yobitel.com/knowledge-base/nvidia-h100 （2026-07-04，运维知识库）
[^833^]: NVIDIA Run:ai 文档, "GPU Profiling Metrics" — DCGM 字段全表。 https://run-ai-docs.nvidia.com/self-hosted/2.24/platform-management/monitor-performance/gpu-profiling-metrics （2026-05-26，官方文档）
[^834^]: Spheron, "AI's Memory Wall Problem" — 决策树。 https://www.spheron.network/blog/ai-memory-wall-inference-latency-guide-2026/ （2026-04-10，云厂商）
[^835^]: 知乎《vLLM 里面的 Prefix cache hit rate 是什么意思》— "Prefix cache hit rate 指标从 vLLM 0.3.0（2024-01）正式引入… 细化为分别报告 GPU 和 CPU 的缓存命中率"。 https://zhuanlan.zhihu.com/p/31951576481 （2025-04-21，中文社区）
[^836^]: cnblogs《开源大模型本地部署硬件选型深度指南》— 监控清单："vllm:gpu_cache_usage_perc KV 占用 >95% 触发 preemption；num_requests_waiting 持续>0 即容量不足…"。 https://www.cnblogs.com/skyseraph/p/21109151 （2026-07-04，中文技术博客）
[^837^]: SGLang issue #28047 — "TTFT cannot be decomposed… HiCache tier performance is invisible — L2 DMA time, L3 prefetch I/O time, and per-tier hit/miss counts are not available per-request"，提出 L1/L2/L3_hit 与 queue/schedule/forward 分解 JSON。 https://github.com/sgl-project/sglang/issues/28047 （2026-06-12，特性提案）
[^838^]: LMCache 文档 — "Production-level KV cache observability… token-level prefix cache hits, lifecycle, request-level KV cache performance"；后端含 CPU RAM/local disk/Redis/Mooncake/S3/NIXL/GDS。 https://docs.lmcache.ai/ （2026-06-23，官方文档）
[^839^]: arXiv 2605.03375, Tutti — "restoring KV cache from SSDs… causing GPU bubbles to exceed 70% of total inference latency… SSD-LW… around 80%"；实测双 SSD 聚合读 29 GB/s/写 12 GB/s、DRAM-HBM 50 GB/s。 https://arxiv.org/html/2605.03375 （2026-05-05，arXiv）
[^840^]: arXiv 2602.21548, "Breaking the Storage Bandwidth Bottleneck in Agentic LLM Inference" — https://arxiv.org/html/2602.21548v1 （2026-02-25，arXiv）
[^841^]: Netpreme / lmsys blog, "Accelerating SGLang HiCache with X-Mem MPU" — https://www.lmsys.org/blog/2026-06-27-netpreme-xmem/ （2026-07-08，厂商合作博客）
[^844^]: arXiv 2606.14779, "Unified KV Pooling" — 测试台 DDR4 21.3 GB/s vs 双 NVMe 63 GB/s。 https://arxiv.org/html/2606.14779 （2026-03-02，arXiv）
[^847^]: Spheron, "NVMe KV Cache Offloading" — 三级层级 GPU HBM/CPU DRAM/NVMe。 https://www.spheron.network/blog/nvme-kv-cache-offloading-llm-inference/ （2026-03-31，云厂商）
[^848^]: Guru3D, "AMD MI355X Breaks 1M Tokens/s in MLPerf" — https://www.guru3d.com/story/amd-instinct-mi355x-breaks-1m-tokens-per-second-in-mlperf/ （2026-04-02，媒体报道 MLPerf 提交）
[^905^]: *Reducing SSD Read Latency by Optimizing Read-Retry (arXiv:2104.09611)* — 无日期（2021）— https://arxiv.org/pdf/2104.09611
[^906^]: *Flash Program Memory — ScienceDirect Topics* — 无日期 — https://www.sciencedirect.com/topics/computer-science/flash-program-memory
[^907^]: *SkyHigh 8Gb SLC NAND Datasheet (002-00484)* — 无日期 — http://www.skyhighmemory.com/download/dataSheet/002-00484.pdf
[^908^]: *Samsung, "A 512Gb 3b/Cell 7th-Generation 3D-NAND…" (ISSCC, via ResearchGate)* — 2025-09-09（收录）— https://www.researchgate.net/publication/350172038
[^909^]: *SAFARI/ETH, "Understanding and Designing Modern NAND Flash-Based SSDs" (Mutlu 课程)* — 2021 — https://safari.ethz.ch/projects_and_seminars/fall2021/lib/exe/fetch.php?media=pns_modern_ssds_hs2021_3rd_after_meeting.pdf
[^910^]: *ComputerBase, "ISSCC 2021: Die neuen 3D-NAND-Generationen im Vergleich"* — 2021-02-25 — https://www.computerbase.de/news/storage/isscc-2021-3d-nand-vergleich-eckdaten.75624/
[^911^]: *SAFARI/ETH, Modern SSDs (Spring 2021)* — 2021 — https://safari.ethz.ch/projects_and_seminars/spring2021/lib/exe/fetch.php?media=pns_modern_ssds_ss2021_7th_aftermeeting.pdf
[^912^]: *"A Case for Melded Pages" (HotStorage'20)* — 2020 — https://www.usenix.org/system/files/hotstorage20_paper_k.pdf
[^913^]: *OCOWFC: Open-Channel Open-Way Flash Controller (FPL'21 / GitHub)* — 2021-07-28 — https://github.com/FDU-ME-ARC/OCOWFC
[^914^]: *NANDFlashSim (ACM TACO, 10.1145/2700310)* — 无日期 — https://dl.acm.org/doi/pdf/10.1145/2700310
[^915^]: *"DIR: Dynamic Request Interleaving…" (JCST 2024)* — 2024 — https://jcst.ict.ac.cn/fileup/1000-9000/PDF/JCST-2024-1-6-1601-82.pdf
[^916^]: *"An Evaluation of Different Page Allocation Strategies…" (HotStorage'12)* — 2012 — https://www.usenix.org/system/files/conference/hotstorage12/hotstorage12-final55.pdf
[^917^]: *JSC/Suntsu NAND Datasheet (JS27HPxG08SFDA)* — 无日期 — https://suntsu.com/wp-content/uploads/2024/12/JS27HPxG08SFDA-45_4G.pdf
[^918^]: *SanDisk Press Release: "Sandisk and SK hynix Begin Global Standardization of…HBF"* — 2026-02-26 — https://www.sandisk.com/company/newsroom/press-releases/2026/2026-02-25-sandisk-and-sk-hynix-begin-global-standardization-of-next-generation-memory-solution-high-bandwidth-flash-hbf
[^920^]: *OSCOO, "SK Hynix and SanDisk Unveil HBF for AI Inference"* — 2026-02-28 — https://www.oscoo.com/news/sk-hynix-and-sandisk-unveil-high-bandwidth-flash-for-ai-inference/
[^922^]: *Hardwareluxx, "High Bandwidth Flash: SanDisk, SK Hynix und OCP…"* — 2026-02-26 — https://www.hardwareluxx.de/index.php/news/hardware/arbeitsspeicher/68368-high-bandwidth-flash-sandisk,-sk-hynix-und-ocp-wollen-hbf-zum-standard-machen.html
[^923^]: *Semiconductor Engineering, "Flash Getting Stacked High-Bandwidth Version"* — 2026-06-29 — https://semiengineering.com/flash-getting-stacked-high-bandwidth-version/
[^925^]: *Chipstrat (Austin Lyons), "High Bandwidth Flash: The Full Report"* — 2026-07-07 — https://www.chipstrat.com/p/high-bandwidth-flash-the-full-report
[^926^]: *SDxCentral, "Beyond HBM: the flash memory technology…"* — 2026-05-11 — https://www.sdxcentral.com/analysis/beyond-hbm-the-flash-memory-technology-that-could-reshape-ai-infrastructure/
[^928^]: *Chipstrat, "HBF: The Full Report"（带宽/预取论点）* — 2026-07-07 — https://www.chipstrat.com/p/high-bandwidth-flash-the-full-report
[^929^]: *FlashAccel (arXiv:2607.10186)* — 2026-04-15 — https://arxiv.org/html/2607.10186v1
[^930^]: *Xiaoyu Ma & David Patterson (Google), "Challenges and Research Directions for LLM Inference Hardware" (arXiv:2601.05047; IEEE Computer 2026)* — 2026 — （Table 3 数值经 Chipstrat 转引：HBF 读延迟 ~1–10 µs、读粒度 4096 B、<80 W）https://www.arxiv.org/pdf/2601.05047v2
[^931^]: *EEWorld, "Samsung's HBM-PIM chip is now available"* — 2021-02-18 — https://en.eeworld.com.cn/news/qrs/eic526516.html
[^934^]: *ComPASS (MICRO'25, 10.1145/3725843.3756017)* — 2025-10-17 — https://dl.acm.org/doi/full/10.1145/3725843.3756017
[^935^]: *All About Circuits, "Samsung Breaks PIM Into AI Applications"* — 2021-08-30 — https://www.allaboutcircuits.com/news/beyond-high-bandwidth-memory-samsung-breaks-processing-in-memory-into-AI-applications/
[^937^]: *HillInfer (arXiv:2602.18750)* — 2026-03-25 — https://arxiv.org/html/2602.18750v2
[^938^]: *WIO (arXiv:2604.02442)* — 2024-01-15（版本）— https://arxiv.org/html/2604.02442v1
[^939^]: *TechPowerUp SSD Specs: PNY XLR8 CS3040 (Toshiba BiCS4 96L QLC)* — 2025-12-02 — https://www.techpowerup.com/ssd-specs/pny-xlr8-cs3040-4-tb.d742
[^940^]: *Micron NAND "Interleaved Die Operations" (studfile 镜像)* — 2016-02-12 — https://studfile.net/preview/5208611/page:10/
[^941^]: *FMMU (arXiv:1704.03168)* — 2017 — https://arxiv.org/pdf/1704.03168
[^942^]: *"Achieving page-mapping FTL performance at block-mapping FTL cost by hiding address translation (HAT)" (MSST'10)* — 2010 — https://dl.acm.org/doi/10.1109/MSST.2010.5496970
[^943^]: *"A Demand-Based FTL Scheme Using Dualistic Approach…" (RTCSA'11)* — 2011 — https://discovery.researcher.life/article/compact-modeling-of-trapassisted-tunneling-current-in-3d-nand-flash-memory/a9cbee4305b636478c7c4d76e7d1ed80
[^944^]: *"Exploiting Internal Parallelism for Address Translation in SSDs" (ACM, 10.1145/3239564)* — 无日期 — https://dl.acm.org/doi/pdf/10.1145/3239564
[^945^]: *ScienceDirect Topics, "Flash Translation Layer / DFTL"* — 无日期 — https://www.sciencedirect.com/topics/computer-science/flash-translation-layer
[^946^]: *"Prefetching Mapping Table Entries to Speed Up Address Translation in DRAM-Less SSDs" (ACM TOS, 10.1145/3789202)* — 2026-04-08 — https://dl.acm.org/doi/10.1145/3789202
[^947^]: *"[DFTL] FEMU DFTL 구현" (Tistory blog)* — 2024-02-12 — https://happy-master-student.tistory.com/1
[^948^]: *"DFTL: A Flash Translation Layer Employing Demand-based Selective Caching"（论文综述，ASPLOS'09）* — 2026-03-09（综述日期）— https://wifiaircat.tistory.com/31
[^949^]: *Tutti (arXiv:2605.03375)* — 2026-05-05 — https://arxiv.org/html/2605.03375
[^950^]: *Tutti（背景，GDS 气泡）* — 2026-05-05 — https://arxiv.org/html/2605.03375
[^951^]: *HCache (EuroSys'25 / arXiv:2410.05004)* — 2024-10-07 — https://arxiv.org/html/2410.05004v1
[^952^]: *FlexGen (ICML'23, PMLR v202)* — 2023 — https://proceedings.mlr.press/v202/sheng23a/sheng23a.pdf
[^955^]: *Samsung, "Scaling AI Inference with KV Cache Offloading"（白皮书）* — 无日期 — https://download.semiconductor.samsung.com/resources/white-paper/scaling_ai_inference_with_kv_cache_offloading.pdf
[^956^]: *"An I/O Characterizing Study of Offloading LLM Models…" (atlarge/Cheops)* — 无日期 — https://atlarge-research.com/pdfs/2025-cheops-llm.pdf
[^957^]: *SolidAttention (FAST'26 slides)* — 2026 — https://www.usenix.org/system/files/fast26_slides_zheng.pdf

---

## 未解析引用

无。正文章节（sec00–sec08）中出现的全部 366 个引用编号均已在对应维度调研报告（hbf_dim01–hbf_dim10）的参考文献列表中找到原始定义。
