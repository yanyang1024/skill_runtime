"""下一轮语句推荐：读取上下文，调用本地 OpenAI 兼容模型，保存推荐结果。"""
import json
import logging
import uuid
from pathlib import Path

import httpx

from app.config import settings
from app.database import execute, query_one
from app.models import utcnow_iso
from app.services import file_service, skill_service
from app.services.opencode_client import opencode_client

logger = logging.getLogger(__name__)

STAGES = [
    "observe-log-review",
    "observe-api-scan",
    "grow-plan",
    "grow-build",
    "grow-quality-review",
    "rehearse-preview",
    "rehearse-iteration",
    "stabilize-release",
]

# 推荐模型 system prompt（ref_suggestion.txt 第 17 节）
SYSTEM_PROMPT = """你是一个“下一轮对话语句推荐器”。
你的任务不是回答用户的问题，也不是执行文件修改，而是根据当前会话、文件环境、Skill 环境和阶段语句库，推荐用户下一轮可以发送给 Agent 的语句。
要求：
1. 先判断当前最可能处于哪个阶段。
2. 推荐语句必须能推动任务进入下一步。
3. 不要提出不必要的选择题。
4. 不要让推荐语句过度结构化。
5. 优先生成一条完整、自然、可直接发送的中文语句。
6. 若当前信息不足，推荐“完整检查和梳理”，而不是让用户重复提供已有信息。
7. 规划、观察、审查、发布阶段不得要求直接修改文件。
8. build 和 iteration 阶段可以要求修改文件。
9. 推荐语句控制在 80～300 个汉字。
10. 只输出符合指定 JSON Schema 的内容，不要输出任何其他文字。

输出 JSON Schema：
{
  "inferred_stage": "8 个阶段 id 之一",
  "confidence": 0 到 1 的数字,
  "stage_reason": "判断为该阶段的理由（中文）",
  "primary": "主推荐语句（80~300 个汉字，可直接发送）",
  "alternatives": ["备选语句 1", "备选语句 2"],
  "rationale": "推荐理由（中文）",
  "risk_hint": "风险提示（中文，无风险可为空字符串）"
}"""

_TEXT_EXTS = {
    ".md", ".txt", ".json", ".yaml", ".yml", ".py", ".js", ".ts",
    ".csv", ".log", ".toml", ".ini", ".cfg", ".xml", ".html", ".sh",
}
_TYPE_MAP = {
    ".md": "markdown", ".txt": "text", ".json": "json", ".yaml": "yaml",
    ".yml": "yaml", ".py": "python", ".js": "javascript", ".ts": "typescript",
    ".csv": "csv", ".log": "log", ".sh": "shell",
}


def _load_prompt(filename: str) -> str:
    try:
        return (settings.prompt_library_dir / filename).read_text(encoding="utf-8")
    except OSError:
        return ""


def _message_text(msg: dict) -> str:
    """拼接一条消息的全部文本 part。"""
    texts = [p.get("text", "") for p in msg.get("parts") or [] if p.get("type") == "text"]
    return "\n".join(t for t in texts if t)


def _build_file_manifest(workspace: Path) -> list[dict]:
    """文件清单：path/size/type/modified_at，小文本文件（<8KB）附开头 300 字摘要。"""
    manifest: list[dict] = []
    for item in file_service.list_files(workspace):
        if item["is_dir"]:
            continue
        ext = Path(item["path"]).suffix.lower()
        entry = {
            "path": item["path"],
            "size": item["size"],
            "type": _TYPE_MAP.get(ext, ext.lstrip(".") or "unknown"),
            "modified_at": item["modified_at"],
        }
        if ext in _TEXT_EXTS and item["size"] < 8 * 1024:
            try:
                entry["excerpt"] = (workspace / item["path"]).read_text(
                    encoding="utf-8", errors="replace"
                )[:300]
            except OSError:
                pass
        manifest.append(entry)
    return manifest


def _parse_json_loose(content: str) -> dict | None:
    """从模型输出中健壮截取 JSON（第一个 { 到最后一个 }）。"""
    start = content.find("{")
    end = content.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    try:
        data = json.loads(content[start : end + 1])
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


async def generate(conversation_id: str) -> dict | None:
    """生成并保存一条推荐；未配置推荐模型或上下文不足时返回 None。"""
    if not settings.recommender_base_url or not settings.recommender_model:
        return None
    row = query_one("SELECT * FROM conversations WHERE id=? AND is_deleted=0", (conversation_id,))
    if not row or not row["opencode_session_id"]:
        return None

    messages = await opencode_client.get_messages(row["opencode_session_id"], row["runtime_workspace_path"])
    users: list[str] = []
    assistants: list[str] = []
    last_assistant_id = None
    for m in messages:
        info = m.get("info") or {}
        role = info.get("role")
        text = _message_text(m)
        if role == "user" and text:
            users.append(text)
        elif role == "assistant":
            if text:
                assistants.append(text[:500])  # 每条摘要截断约 500 字
            last_assistant_id = info.get("id")

    payload = {
        "recent_user_messages": users[-4:],
        "recent_assistant_summaries": assistants[-4:],
        "file_manifest": _build_file_manifest(Path(row["host_workspace_path"])),
        "skill_manifest": [
            {"name": s["name"], "description": s["description"]}
            for s in skill_service.list_skills()
        ],
        "selected_stage": row["selected_stage"],
        "stage_index": _load_prompt("stage-index.md"),
        "stage_prompt_library": {s: _load_prompt(f"{s}.md") for s in STAGES},
    }
    logger.info(
        "推荐生成开始: 会话=%s 用户消息=%d 助手摘要=%d 文件=%d 技能=%d",
        conversation_id, len(payload["recent_user_messages"]),
        len(payload["recent_assistant_summaries"]), len(payload["file_manifest"]),
        len(payload["skill_manifest"]),
    )

    body = {
        "model": settings.recommender_model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
        ],
        "temperature": 0.4,
    }
    headers = {"Authorization": f"Bearer {settings.recommender_api_key}"}
    async with httpx.AsyncClient(timeout=httpx.Timeout(120.0)) as client:
        r = await client.post(
            f"{settings.recommender_base_url}/chat/completions",
            json=body,
            headers=headers,
        )
        r.raise_for_status()
        data = r.json()

    content = ((data.get("choices") or [{}])[0].get("message") or {}).get("content") or ""
    parsed = _parse_json_loose(content)
    if parsed is None:
        logger.warning("推荐模型输出无法解析为 JSON: %s", content[:200])
        return None

    alternatives = parsed.get("alternatives")
    if not isinstance(alternatives, list):
        alternatives = [alternatives] if alternatives else []
    alternatives = [str(a) for a in alternatives]
    try:
        confidence = float(parsed.get("confidence") or 0)
    except (TypeError, ValueError):
        confidence = 0.0
    confidence = max(0.0, min(1.0, confidence))

    # 主推荐语句为空视为无效输出（模型异常/假端点时不落库）
    primary = str(parsed.get("primary") or "").strip()
    if not primary:
        logger.warning("推荐模型输出缺少 primary 语句，丢弃本次推荐")
        return None

    result = {
        "id": uuid.uuid4().hex,
        "inferred_stage": str(parsed.get("inferred_stage") or ""),
        "confidence": confidence,
        "stage_reason": str(parsed.get("stage_reason") or ""),
        "primary": primary,
        "alternatives": alternatives,
        "rationale": str(parsed.get("rationale") or ""),
        "risk_hint": str(parsed.get("risk_hint")) if parsed.get("risk_hint") else None,
        "created_at": utcnow_iso(),
    }
    execute(
        'INSERT INTO prompt_recommendations '
        '(id, conversation_id, source_message_id, inferred_stage, confidence, stage_reason, '
        '"primary", alternatives_json, rationale, risk_hint, created_at) '
        'VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        (
            result["id"],
            conversation_id,
            last_assistant_id,
            result["inferred_stage"],
            result["confidence"],
            result["stage_reason"],
            result["primary"],
            json.dumps(result["alternatives"], ensure_ascii=False),
            result["rationale"],
            result["risk_hint"],
            result["created_at"],
        ),
    )
    return result
