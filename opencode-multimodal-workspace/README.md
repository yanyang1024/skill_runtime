# OpenCode 多模态工作区

基于「分类路由 + 专家管线」架构的 OpenCode 项目级多模态配置：
**MinerU 负责文档解析，Qwen3.6（vLLM 自部署）负责图像理解**，
primary agent 只做路由，重活在上下文隔离的 subagent 里执行。

## 目录结构

```
.opencode/
├── agents/
│   ├── doc-router.md         # primary：分类路由，不亲自解析
│   ├── doc-parser.md         # subagent：MinerU 解析管线执行器
│   ├── vision-analyst.md     # subagent：Qwen3.6 视觉理解执行器
│   └── parse-verifier.md     # subagent：解析结果质检员
├── skills/
│   ├── mineru-parsing/       # SKILL.md + scripts/parse_doc.py + 输出契约
│   ├── vision-query/         # SKILL.md + scripts/vl_query.py
│   └── doc-routing/          # 分流规则知识库
├── commands/
│   ├── parse-doc.md          # /parse-doc <文件>
│   └── describe-image.md     # /describe-image <图片>
├── opencode.json             # provider(vllm/qwen3.6) + 权限配置
└── runs/                     # 任务产物目录（自动创建）
AGENTS.md                     # 项目级四条铁律与上下文纪律
```

## 使用前提

1. **MinerU**（文档解析）：

   ```bash
   pip install -U 'mineru[core]'
   ```

2. **Qwen3.6 多模态服务**（图像理解）：

   ```bash
   vllm serve <Qwen3.6-27B 模型路径> \
     --reasoning-parser qwen3 \
     --enable-auto-tool-choice \
     --tool-call-parser qwen3_coder
   ```

   服务地址 / 模型名可用环境变量覆盖：`VL_BASE_URL`、`VL_MODEL`。

3. 将 `.opencode/` 目录与 `AGENTS.md` 复制到你的项目根目录。

## 验证

```bash
# 1. 脚本自检（无需真实文档，验证 CLI 可用性）
python .opencode/skills/mineru-parsing/scripts/parse_doc.py --help
python .opencode/skills/vision-query/scripts/vl_query.py --help

# 2. 真实解析
python .opencode/skills/mineru-parsing/scripts/parse_doc.py \
  测试文档.pdf --out .opencode/runs/test-001 --backend auto

# 3. 图像理解
python .opencode/skills/vision-query/scripts/vl_query.py \
  截图.png --prompt "描述这张图的内容" --json

# 4. 在 opencode 中
opencode
/parse-doc ./测试文档.pdf
/describe-image ./截图.png 提取其中的表格数据
```

## 设计要点

- **上下文隔离**：解析与视觉理解都在 subagent 独立上下文中执行，
  几百行中间产物不进主会话，只回传结构化 JSON 摘要。
- **契约驱动**：跨 agent 交接只认 manifest.json / 质检 JSON；
  每次任务产物写入独立的 `.opencode/runs/<task-id>/`。
- **能力下沉**：确定性逻辑（缓存、归一化、自检）全部在 Python 脚本里，
  skill 只承载 SOP，agent 只做判断与路由。
- **防假成功**：脚本以 exit code + manifest 判定成败；
  mineru 退出码为 0 但无产出时按失败处理。

## 可选扩展

- 如需 agent 动态调用 MinerU 细粒度 API，可在 `opencode.json` 的 `mcp`
  字段注册 MinerU MCP Server（注意 opencode 使用 `mcp` 键 +
  `"type": "local"` + `command` 数组格式）。
- 纯文本模型环境：可将 doc-router 的 model 换成便宜模型，
  视觉判断全部下放 vision-analyst。
