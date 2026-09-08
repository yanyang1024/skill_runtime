# 会话精读 → 人工参考 → 裁判校准：轻量参考包

Python 3.9+ 标准库；无 Docker、无数据库服务。接上一版导出的 `evidence/cases.jsonl` 或标准化 session JSONL。先阅读 [guide.md](guide.md)。本包独立增补，不替换平台价值包或它的训练/评测分集记录。

| 文件 | 用途 |
|---|---|
| `sample_review.py` | 随机会话抽样、冻结证据、精读卡、空白人工标签、同源分组 |
| `rubric.json` | 四个枚举维度与判定边界；先 pilot 再固定 |
| `judge_prompt.md` | 简短理由、证据定位、unknown、提出检查但不擅自执行 |
| `judge_eval.py` | 内网接口适配参考；逐维 κ、混淆矩阵、覆盖率、分歧队列 |
| `demo.py` | 虚构输入和人工/裁判夹具，只演示文件格式与计算 |

```sh
# 不联网的演示；每次使用新的输出目录
python3 demo.py demo_run

# 真实取数沿用你现有脚本，先选定窗口、租户和有权审阅的样本框
python3 sample_review.py /path/to/evidence/cases.jsonl --n 400 --out review_v1
```

手动复制并编辑 `review_v1/human_template.jsonl`，填 reviewer_id、标签、证据、理由；核对后改 `review_status=verified`。看过 AI 建议则写 `review_mode=assisted`；正式 audit 只接受独立盲标 `independent`。每行 unknown 初始值是待填模板，不是已经作出的人工判断。

先在 pilot 上稳定规则；改 rubric 后以相同输入/seed 生成新目录，重新核对人工标签。不要只改旧记录的 rubric_hash 冒充复核。

以下命令仅供你在公司获准的网关内执行；`--endpoint` 是完整兼容接口地址，不是本包可用的公网服务。密钥从环境变量读取，不写入文件：

```sh
python3 judge_eval.py judge --packets review_v1/packets.jsonl --rubric review_v1/rubric.json \
  --split calibration --endpoint "$INTERNAL_JUDGE_ENDPOINT" --model "$INTERNAL_JUDGE_MODEL" \
  --out judge_calibration_v1.jsonl

python3 judge_eval.py compare --packets review_v1/packets.jsonl --rubric review_v1/rubric.json \
  --human human_verified.jsonl --predictions judge_calibration_v1.jsonl \
  --split calibration --out agreement_calibration_v1
```

确定提示版本后，对 audit 单独运行一次 judge/compare；不要边看 audit 分歧边调同一次考试。网关不是该 JSON 协议时，只改 `judge_eval.py` 的请求/响应适配。超长、超时和坏 JSON 记错误，不自动截断、不重试成成功。

当前实现不执行 Agent 工具，不解析任意附件、不做员工能力分级、不自动审批金标准、不训练模型。已有 skill 的注册元数据、测试结果和产物内容要由你现有导出补进证据；ID 引用检查不能代替内容核验。
