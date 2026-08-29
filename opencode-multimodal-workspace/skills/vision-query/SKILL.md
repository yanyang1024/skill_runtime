---
name: vision-query
description: 通过本地 vLLM 部署的 Qwen3.6 多模态模型理解图片。当需要分析截图、图表、UI 界面、机理图或任何图片内容时使用。含服务配置、调用规范与失败处理。
license: MIT
compatibility: opencode
metadata:
  audience: vision-analyst
  workflow: vision-understanding
---

# 视觉理解管线（Qwen3.6 via vLLM）

## 前提

本地 vLLM 已启动多模态服务：

```bash
vllm serve <Qwen3.6-27B 模型路径> \
  --reasoning-parser qwen3 \
  --enable-auto-tool-choice \
  --tool-call-parser qwen3_coder
```

## 执行

统一入口（禁止手写 HTTP 请求）：

```bash
python .opencode/skills/vision-query/scripts/vl_query.py \
  <图片路径...> --prompt "<具体问题>"
```

环境变量：
- `VL_BASE_URL`：默认 `http://localhost:8000/v1`
- `VL_MODEL`：默认 `qwen3.6-27b`
- `VL_API_KEY`：默认 `EMPTY`（本地 vLLM 无需鉴权）

## 调用要点

- prompt 要具体：「提取表格所有数值并按行列输出」优于「看看这个」
- 多图对比：一次传入全部路径，prompt 中写明对比维度
- `--json` 获取结构化结果（含耗时、usage），便于日志哨兵记录
- 超大图先缩放再传入，避免超时

## 失败处理

- 连接拒绝 → 报告「vLLM 服务未启动」并附启动命令，禁止假装成功
- 超时（默认 120s，`--timeout` 可调）→ 建议缩小图片或拆分问题
- 模型输出明显与图片无关 → 上报低置信，禁止编造
