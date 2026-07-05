## 外部依赖全景分析

### 按工具分类

| 工具 | 外部依赖 | 依赖类型 |
|------|---------|---------|
| `feishu_auto_collector.py` | `https://open.feishu.cn/open-apis` + 飞书 App ID/Secret | 网络 API + 凭证 |
| `dingtalk_auto_collector.py` | `https://api.dingtalk.com` + `https://im.dingtalk.com` + AppKey/Secret | 网络 API + 浏览器 |
| `feishu_browser.py` | `https://www.feishu.cn` + 本机 Chrome + Playwright | 网络 + 本地浏览器 |
| `feishu_mcp_client.py` | 飞书 API + `npx feishu-mcp`（Node.js） | 网络 API + Node.js |
| `feishu_parser.py` | **无** | 纯本地文件处理 |
| `email_parser.py` | **无** | 纯本地文件处理 |
| `skill_writer.py` | `pypinyin`（可选，有 fallback） | 可选 Python 包 |
| `version_manager.py` | **无** | 纯本地文件处理 |

**具体依赖来源：**

- `feishu_auto_collector.py` 硬编码了 `BASE_URL = "https://open.feishu.cn/open-apis"` 并通过 `requests` 调用飞书 REST API [1](#0-0) 
- `dingtalk_auto_collector.py` 调用 `https://api.dingtalk.com`，消息采集部分还依赖 `playwright` 打开 `https://im.dingtalk.com` [2](#0-1) 
- `feishu_mcp_client.py` 通过 `subprocess.run(["npx", "-y", "feishu-mcp", "--stdio"])` 调用 Node.js 包 [3](#0-2) 
- `feishu_parser.py` 和 `email_parser.py` 只用 Python 标准库，完全离线 [4](#0-3) 
- `skill_writer.py` 中 `pypinyin` 是可选依赖，有 fallback 逻辑 [5](#0-4) 

---

## 离线部署只需要的部分

离线部署的核心思路是：**跳过自动采集，改用手动导入本地文件**（对应 SKILL.md 中的方式 D/E）。 [6](#0-5) 

### 必须保留的文件

```
SKILL.md                        # 主入口，所有流程逻辑
prompts/
  intake.md
  work_analyzer.md
  persona_analyzer.md
  work_builder.md
  persona_builder.md
  merger.md
  correction_handler.md
tools/
  feishu_parser.py              # 解析本地导出的飞书 JSON/TXT
  email_parser.py               # 解析本地 .eml/.mbox 邮件
  skill_writer.py               # 写入 Skill 文件（纯本地）
  version_manager.py            # 版本管理（纯本地）
```

### 可以完全去掉的文件

```
tools/feishu_auto_collector.py  # 需要飞书 API
tools/dingtalk_auto_collector.py # 需要钉钉 API + 浏览器
tools/feishu_browser.py         # 需要 Chrome + Playwright + 飞书网络
tools/feishu_mcp_client.py      # 需要 Node.js + 飞书 API
```

### 离线时的数据输入方式

1. **直接粘贴文本**：无需任何工具，Claude 直接分析
2. **上传本地文件**：PDF、图片、Markdown 由 Claude 的 `Read` 工具原生处理
3. **飞书导出 JSON**：用 `feishu_parser.py` 解析（纯本地） [7](#0-6) 
4. **邮件文件**：用 `email_parser.py` 解析（纯本地） [8](#0-7) 

### Python 包依赖（离线最小集）

```bash
pip install requests   # 仅 feishu_auto_collector 需要，离线可不装
# pypinyin 可选，不装也能运行（skill_writer.py 有 fallback）
```

离线部署实际上**零 pip 依赖**，所有保留的工具只用 Python 标准库。 [9](#0-8)

### Citations

**File:** tools/feishu_auto_collector.py (L39-39)
```python
BASE_URL = "https://open.feishu.cn/open-apis"
```

**File:** tools/dingtalk_auto_collector.py (L46-46)
```python
API_BASE = "https://api.dingtalk.com"
```

**File:** tools/feishu_mcp_client.py (L115-117)
```python
        result = subprocess.run(
            ["npx", "-y", "feishu-mcp", "--stdio"],
            input=payload,
```

**File:** tools/feishu_parser.py (L14-20)
```python
import json
import re
import sys
import argparse
from pathlib import Path
from datetime import datetime

```

**File:** tools/feishu_parser.py (L22-42)
```python
def parse_feishu_json(file_path: str, target_name: str) -> list[dict]:
    """解析飞书官方导出的 JSON 格式消息"""
    with open(file_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    messages = []

    # 兼容多种 JSON 结构
    if isinstance(data, list):
        raw_messages = data
    elif isinstance(data, dict):
        # 可能在 data.messages 或 data.records 等字段下
        raw_messages = (
            data.get("messages")
            or data.get("records")
            or data.get("data")
            or []
        )
    else:
        return []

```

**File:** tools/skill_writer.py (L73-90)
```python
    # 尝试用 pypinyin 转拼音
    try:
        from pypinyin import lazy_pinyin
        parts = lazy_pinyin(name)
        slug = "_".join(parts)
    except ImportError:
        # fallback：保留 ASCII 字母数字，中文直接去掉
        import unicodedata
        result = []
        for char in name.lower():
            cat = unicodedata.category(char)
            if char.isascii() and (char.isalnum() or char in ("-", "_")):
                result.append(char)
            elif char == " ":
                result.append("_")
            # 中文字符跳过（无 pypinyin 时无法转换）
        slug = "".join(result)

```

**File:** SKILL.md (L163-176)
```markdown
#### 方式 C：上传文件

- **PDF / 图片**：`Read` 工具直接读取
- **飞书消息 JSON 导出**：
  ```bash
  python3 ${CLAUDE_SKILL_DIR}/tools/feishu_parser.py --file {path} --target "{name}" --output /tmp/feishu_out.txt
  ```
  然后 `Read /tmp/feishu_out.txt`
- **邮件文件 .eml / .mbox**：
  ```bash
  python3 ${CLAUDE_SKILL_DIR}/tools/email_parser.py --file {path} --target "{name}" --output /tmp/email_out.txt
  ```
  然后 `Read /tmp/email_out.txt`
- **Markdown / TXT**：`Read` 工具直接读取
```

**File:** tools/email_parser.py (L126-147)
```python
def parse_eml_file(file_path: str, target: str) -> list[dict]:
    """解析单个 .eml 文件"""
    with open(file_path, "rb") as f:
        msg = email.message_from_binary_file(f, policy=email.policy.default)

    from_field = str(msg.get("From", ""))
    if not is_from_target(from_field, target):
        return []

    subject = decode_mime_str(str(msg.get("Subject", "")))
    date = str(msg.get("Date", ""))
    body = extract_email_body(msg)

    if not body:
        return []

    return [{
        "from": decode_mime_str(from_field),
        "subject": subject,
        "date": date,
        "body": body,
    }]
```

**File:** tools/version_manager.py (L14-20)
```python
import json
import shutil
import argparse
import sys
from pathlib import Path
from datetime import datetime, timezone

```
