"""Recommender：旁路元认知 LLM，统一生产"下一步建议"。

第一性原理：OpenCode 负责执行，Recommender 负责思考"下一步该做什么"。
它对 OpenCode 只读（读 session 历史 + workspace 文件快照），独立调用
OpenAI 兼容 LLM（默认 deepseek），输出结构化 JSON：
  {"intent": str, "suggestions": [1-3 条可直接发送的语句],
   "stop_decision": {"action": CONTINUE|PAUSE_INPUT|TERMINATE_SUCCEEDED|TERMINATE_STALLED,
                     "reason": str}}

凭据来源（优先级）：环境变量 RECOMMENDER_API_KEY >
沙箱 HOME 的 opencode auth.json 里的 deepseek key。
"""
import json
import logging
import os
import re
from pathlib import Path

import httpx

from . import config

log = logging.getLogger("recommender")

RECOMMENDER_MODEL = os.environ.get("RECOMMENDER_MODEL", "deepseek-chat")
RECOMMENDER_BASE_URL = os.environ.get("RECOMMENDER_BASE_URL", "https://api.deepseek.com")
RECOMMENDER_API_KEY = os.environ.get("RECOMMENDER_API_KEY", "")

ACTIONS = ("CONTINUE", "PAUSE_INPUT", "TERMINATE_SUCCEEDED", "TERMINATE_STALLED")

SYSTEM_PROMPT = """你是一个"下一轮对话建议生成器"。
你的任务不是回答用户的问题，也不是执行文件修改，
而是根据当前对话上下文，推断用户正在进行的任务，
并生成 1-3 条用户可以直接发送给 Agent 的下一轮语句。

同时你要判断任务循环是否应该停止：
- CONTINUE：任务仍在推进，值得继续
- PAUSE_INPUT：需要用户做决策或提供信息才能继续
- TERMINATE_SUCCEEDED：用户的目标已经达成，没有有意义的下一步
- TERMINATE_STALLED：停滞——连续多轮没有实质进展（无文件变更、建议重复、助手说"已完成"但状态未变）

只输出严格 JSON，不要输出其他任何内容：
{"intent": "任务类型一句话", "suggestions": ["...", "..."],
 "stop_decision": {"action": "CONTINUE", "reason": "一句话原因"}}"""


def _load_api_key() -> str:
    if RECOMMENDER_API_KEY:
        return RECOMMENDER_API_KEY
    auth_path = config.DATA_ROOT / "home" / ".local" / "share" / "opencode" / "auth.json"
    try:
        data = json.loads(auth_path.read_text())
        return (data.get("deepseek") or {}).get("key", "")
    except Exception:
        return ""


def available() -> bool:
    return bool(_load_api_key())


def _message_text(m: dict) -> str:
    return "\n".join(
        p.get("text", "")
        for p in (m.get("parts") or [])
        if p.get("type") == "text" and p.get("text")
    )


def _summarize(text: str, limit: int = 300) -> str:
    text = text.strip()
    return text if len(text) <= limit else text[:limit] + "…"


def build_file_manifest(workspace_path: str, max_files: int = 15) -> list[dict]:
    """workspace 文件清单（跳过隐藏目录/node_modules），按修改时间倒序。"""
    root = Path(workspace_path)
    files = []
    try:
        for p in root.rglob("*"):
            if not p.is_file():
                continue
            rel = str(p.relative_to(root))
            if any(part.startswith(".") or part == "node_modules" for part in Path(rel).parts):
                continue
            try:
                st = p.stat()
            except OSError:
                continue
            files.append({"path": rel, "size": st.st_size, "mtime": st.st_mtime})
    except OSError:
        pass
    files.sort(key=lambda f: -f["mtime"])
    return files[:max_files]


def snapshot_files(workspace_path: str) -> dict:
    """文件快照 {path: (mtime, size)}，用于轮次间变更检测。"""
    root = Path(workspace_path)
    snap = {}
    try:
        for p in root.rglob("*"):
            if not p.is_file():
                continue
            rel = str(p.relative_to(root))
            if any(part.startswith(".") or part == "node_modules" for part in Path(rel).parts):
                continue
            try:
                st = p.stat()
                snap[rel] = (st.st_mtime, st.st_size)
            except OSError:
                continue
    except OSError:
        pass
    return snap


def diff_snapshots(before: dict, after: dict) -> dict:
    added = [p for p in after if p not in before]
    removed = [p for p in before if p not in after]
    modified = [p for p in after if p in before and after[p] != before[p]]
    return {"added": added[:10], "removed": removed[:10], "modified": modified[:10]}


async def generate_recommendation(
    messages: list[dict],
    workspace_path: str,
    file_changes: dict | None = None,
    resources: dict | None = None,
    round_no: int = 1,
    no_change_rounds: int = 0,
    goal: str = "",
) -> dict:
    """调用 LLM 生成建议。失败时返回保守的 CONTINUE + 通用建议。"""
    users, assistants = [], []
    for m in messages:
        info = m.get("info") or {}
        text = _message_text(m)
        if not text:
            continue
        if info.get("role") == "user":
            users.append(text)
        elif info.get("role") == "assistant":
            assistants.append(_summarize(text))

    manifest = build_file_manifest(workspace_path)
    ctx = {
        "goal": goal or "（未显式给出，从对话推断）",
        "round": round_no,
        "no_change_rounds": no_change_rounds,
        "recent_user_messages": users[-4:],
        "recent_assistant_summaries": assistants[-4:],
        "workspace_files": [{"path": f["path"], "size": f["size"]} for f in manifest],
        "file_changes_last_round": file_changes or {},
        "available_resources": resources or {},
    }

    key = _load_api_key()
    if not key:
        log.warning("recommender 无 API key，使用兜底建议")
        return _fallback("缺少 RECOMMENDER_API_KEY")

    payload = {
        "model": RECOMMENDER_MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps(ctx, ensure_ascii=False)},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.3,
        "max_tokens": 800,
    }
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(30.0)) as client:
            r = await client.post(
                f"{RECOMMENDER_BASE_URL}/chat/completions",
                json=payload,
                headers={"Authorization": f"Bearer {key}"},
            )
            r.raise_for_status()
            content = r.json()["choices"][0]["message"]["content"]
        return _parse(content)
    except Exception as e:
        log.exception("recommender LLM 调用失败")
        return _fallback(str(e))


def _parse(content: str) -> dict:
    try:
        m = re.search(r"\{.*\}", content, re.DOTALL)
        data = json.loads(m.group(0) if m else content)
        suggestions = [str(s) for s in (data.get("suggestions") or []) if str(s).strip()][:3]
        sd = data.get("stop_decision") or {}
        action = str(sd.get("action", "CONTINUE")).upper()
        if action not in ACTIONS:
            action = "CONTINUE"
        return {
            "intent": str(data.get("intent", "")),
            "suggestions": suggestions or ["继续"],
            "stop_decision": {"action": action, "reason": str(sd.get("reason", ""))},
        }
    except Exception:
        return _fallback("建议解析失败")


def _fallback(reason: str) -> dict:
    return {
        "intent": "",
        "suggestions": ["继续推进当前任务", "总结目前的工作", "检查工作区里的文件"],
        "stop_decision": {"action": "CONTINUE", "reason": f"recommender 不可用（{reason}），保守继续"},
    }
