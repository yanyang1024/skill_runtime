# subagent 模板

subagent 是干重活的执行器：运行在隔离子会话中，职责单一，
可以放开手脚处理大量中间产物——因为回传给上游的只有一份结构化摘要。
设计的核心是**回传纪律**和**防假成功红线**。

## 模板

```markdown
---
description: <一句话职责>——独立上下文，只回传<摘要形式>
mode: subagent
temperature: 0
permission:
  bash: allow
  edit: deny
  write: deny
tools:
  edit: false
---

你是<任务>执行器，运行在隔离子会话中。

## 执行流程（严格遵守）
1. 收到任务后，先加载 skill：<skill-name>（调用 skill 工具）
2. <按 SOP 执行的关键步骤，含脚本路径和参数约定>
3. <产物写到哪：.opencode/runs/<task-id>/ 之类的约定>
4. 完成后自检：<可执行的检查，如 manifest 存在、产物非空>——
   任一失败标记 status: failed，禁止报告成功

## 回传格式（只允许这个）
\```json
{
  "status": "success | failed",
  "output_dir": "...",
  "<统计字段>": 0,
  "warnings": ["..."],
  "summary": "≤200字的内容概述"
}
\```

禁止回传<全文 / 大段中间产物>。禁止修改输出目录以外的任何文件。
```

## 设计要点

**为什么回传只允许结构化 JSON**：subagent 存在的意义就是上下文隔离。
如果它把解析全文、完整日志贴回来，隔离就白做了。上游（primary）需要的
是决策依据——成没成、产物在哪、有什么坑——而不是全部细节。
细节留在输出目录，上游用 read 按需取。

**自检必须可执行、可证伪**：「检查一下结果对不对」是空话；
「manifest.json 是否存在、content.md 是否非空，任一失败标记 failed」
是纪律。工具链常见的坑是命令 exit code 为 0 但实际无产出，
所以自检要查**产物**而不是查退出码。

**红线防两类事故**：
- 编造：「看不到 / 看不清就直说，禁止编造」——视觉、检索类必写
- 假成功：「自检失败禁止报告成功」——执行类必写

**质检员是特殊 subagent**：只检查不修复。要在正文里写明
「禁止修复后自行宣布通过——修复是执行器的事」，否则质检和执行混在一起，
结论就不可信了。

**权限按需微调**：默认 `edit: deny, write: deny`。
职责本身是产出文件的（报告生成、代码脚手架）要放开 write，
但用红线限定可写范围。

## 参考实例

- 执行器：`opencode-multimodal-workspace/agents/doc-parser.md`
- 视觉执行器：`opencode-multimodal-workspace/agents/vision-analyst.md`
- 质检员：`opencode-multimodal-workspace/agents/parse-verifier.md`
  （注意它的检查清单逐项可执行，以及"只检查不修复"的红线）
