# AI 平台会话价值分析脚本包 · 使用说明

两个脚本配套使用，全部在公司内网本地运行，数据不出网。

## 文件清单

| 文件 | 依赖 | 用途 |
|---|---|---|
| `session_value_report.py` | 无（纯标准库） | 描述统计 + 交互价值特征 + Markdown 文字报告 |
| `session_value_charts.py` | pandas、matplotlib | 趋势图、价值象限散点、部门切片、业务线归因 |
| `token_trend_attribution.py` | pandas | token 增长归因：量 × 强度 × 模型结构分解，回应"成本上升"质疑 |
| `asset_reuse_backfill.py` | pandas | 全量扫描补全文件引用关系，给出可信复用率 + 资产存活 + 复用 TOP 榜 |
| `retention_cohorts.py` | pandas、matplotlib | 用户周留存 cohort 矩阵，回击"渗透率虚高"质疑 |
| `case_miner.py` | 无 | 增量挖掘 good/bad/review 案例 → 版本化案例库 cases/vN |
| `training_data_builder.py` | 无 | 案例库 → SFT / DPO 偏好对 / 意图弱标签训练数据 |
| `bench_manager.py` | 无 | 内部 bench：build/run/score/compare 四子命令，评新模型 |
| `业界做法参考.md` | — | 调研整合：业界做法 × 你的平台实际 + 闭环流程 |
| `mapping_template.csv` | — | 用户身份映射表模板（配合进阶版使用） |

## 闭环流水线（周例行）

```bash
# 1. 每周：增量挖掘新案例（挂 crontab）
python case_miner.py /path/to/sessions/ --cases-dir ./cases/

# 2. 人工复核 review 档，把确认过的案例 label_source 改为 human_v1

# 3. 每月：导出训练数据（SFT 默认只收人工确认过的）
python training_data_builder.py ./cases/ --out ./training_data/

# 4. 新模型准入：出题 → 跑基线模型 → 跑新模型 → 评分 → 对比
python bench_manager.py build ./cases/ --bench-dir ./bench/ --n 50
python bench_manager.py run ./bench/ --model 当前模型 --api-base http://内网网关/v1
python bench_manager.py run ./bench/ --model 新模型  --api-base http://内网网关/v1
python bench_manager.py score ./bench/ --model 新模型   # 生成人工评分表，填完再 compare
python bench_manager.py compare ./bench/ --base 当前模型 --candidate 新模型
```

## 三个专项脚本对应的风险项

- **token 上升归因**：`python token_trend_attribution.py /path/to/sessions/ -o attribution.md`
  输出增长分解表 + 模型结构月表 + 复杂度结构月表 + 结论模板（按表填空即可成稿）
- **复用率可信化**：`python asset_reuse_backfill.py /path/to/sessions/ -o reuse.md`
  不依赖 file_trace.json，从全文路径痕迹重建引用关系；同时产出明细 CSV
- **真留存**：`python retention_cohorts.py /path/to/sessions/ --out-dir ./charts/`
  需要会话里带 start_ms 或 created_at 时间戳；输出留存矩阵 CSV + 热力图

## 快速开始

```bash
# 1. 基础版：任何 Python 3.8+ 直接跑
python session_value_report.py /path/to/sessions/ -o report.md

# 2. 进阶版：先装依赖（内网镜像）
pip install pandas matplotlib -i <内网镜像地址>

# 3. 进阶版：出图表
python session_value_charts.py /path/to/sessions/ \
    --map mapping.csv --out-dir ./charts/
```

## 数据准备

- 会话文件支持 `.md` / `.json` / `.jsonl`，脚本自动识别格式，混放没问题
- **按人分目录存放效果最佳**（如 `sessions/zhangsan/xxx.md`），进阶版默认取第一级子目录名作为用户标识；如果身份在文件名里，用 `--owner-from name`
- 复制 `mapping_template.csv` 为 `mapping.csv`，按实际情况填写 owner、dept、project 三列

## 必做的调优（重要）

1. **信号词表**：打开 `session_value_report.py` 顶部的配置区，
   `CORRECTION_WORDS` / `COMPLETION_WORDS` / `ABANDON_WORDS` 三个词表
   是按通用语境预设的，跑完第一份报告后，抽 10 个会话人工核对，
   把误判的词改掉、漏掉的口语表达补进去，再重跑。
2. **业务线归因规则**：进阶版图 4 默认取 `/project/xxx/` 下的项目目录名。
   如果公司项目目录结构不同，改 `session_value_charts.py` 中
   `biz = ...` 那一行的取段逻辑即可。

## 口径与免责（写进汇报材料里）

- token 数为字符数 ÷ 2 的粗略估计，仅用于相对比较与趋势观察，不可对外报绝对值
- 完成/放弃/纠正信号基于词表匹配，存在误判率，建议汇报时以区间和趋势呈现
- 象限分类是相对比较（按全体会话中位数划分），用于发现结构与异常，不是绝对价值判定
- 所有指标为**交互价值代理指标**，业务价值结论需结合人工复核的典型案例

## 向上汇报时的建议用法

- 报告第六节的「TOP 清单」是连接数据与业务叙事的桥梁：
  从 5.1 挑 3-5 个高产出会话，写成脱敏案例（谁、什么任务、原本要多久、实际多久）
- 5.2 高摩擦清单不要藏——主动放进汇报并附改进计划，是建立可信度的关键
- 每周/每月固定跑一次，汇报用**趋势**说话：完成率上升、单任务 token 下降、
  攻坚型会话占比上升，都是平台成熟的证据
