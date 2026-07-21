"""建表 SQL 与行 -> dict 转换辅助。"""
import json
import sqlite3
from datetime import datetime, timezone

# 注意："primary" 是 SQL 关键字，所有用到该列的语句都必须加双引号
CREATE_TABLES_SQL = """
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '',
    opencode_session_id TEXT,
    host_workspace_path TEXT NOT NULL,
    runtime_workspace_path TEXT NOT NULL,
    selected_stage TEXT,
    stage_mode TEXT NOT NULL DEFAULT 'auto',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS prompt_recommendations (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    source_message_id TEXT,
    inferred_stage TEXT NOT NULL DEFAULT '',
    confidence REAL NOT NULL DEFAULT 0,
    stage_reason TEXT NOT NULL DEFAULT '',
    "primary" TEXT NOT NULL DEFAULT '',
    alternatives_json TEXT NOT NULL DEFAULT '[]',
    rationale TEXT NOT NULL DEFAULT '',
    risk_hint TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_recommendations_conv
    ON prompt_recommendations (conversation_id, created_at);
"""


def utcnow_iso() -> str:
    """当前时间的 UTC ISO 字符串。"""
    return datetime.now(timezone.utc).isoformat()


def row_to_conversation(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "opencode_session_id": row["opencode_session_id"],
        "host_workspace_path": row["host_workspace_path"],
        "runtime_workspace_path": row["runtime_workspace_path"],
        "selected_stage": row["selected_stage"],
        "stage_mode": row["stage_mode"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "is_deleted": row["is_deleted"],
        "total_tokens": row["total_tokens"] if "total_tokens" in row.keys() else 0,
    }


def migrate_db(conn: sqlite3.Connection) -> None:
    """轻量迁移：老库补列（CREATE TABLE IF NOT EXISTS 不会修改已有表）。"""
    cols = {r[1] for r in conn.execute("PRAGMA table_info(conversations)")}
    if "total_tokens" not in cols:
        conn.execute("ALTER TABLE conversations ADD COLUMN total_tokens INTEGER NOT NULL DEFAULT 0")
        conn.commit()


def row_to_recommendation(row: sqlite3.Row) -> dict:
    """转为 API 输出形状（字段名与前端契约一致）。"""
    try:
        alternatives = json.loads(row["alternatives_json"] or "[]")
        if not isinstance(alternatives, list):
            alternatives = []
    except (json.JSONDecodeError, TypeError):
        alternatives = []
    return {
        "id": row["id"],
        "inferred_stage": row["inferred_stage"],
        "confidence": row["confidence"],
        "stage_reason": row["stage_reason"],
        "primary": row["primary"],
        "alternatives": alternatives,
        "rationale": row["rationale"],
        "risk_hint": row["risk_hint"],
        "created_at": row["created_at"],
    }
