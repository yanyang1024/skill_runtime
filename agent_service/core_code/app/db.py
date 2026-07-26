"""stdlib sqlite3 轻封装：app_sessions 表（session 懒绑定映射）。"""
import sqlite3
import threading
import time

from . import config

_lock = threading.Lock()

SCHEMA = """
CREATE TABLE IF NOT EXISTS app_sessions (
  session_id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  opencode_session_id TEXT,
  workspace_path TEXT NOT NULL,
  agent TEXT NOT NULL DEFAULT 'build',
  created_at REAL NOT NULL,
  updated_at REAL NOT NULL
);
"""


def _connect() -> sqlite3.Connection:
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(config.DB_PATH), timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db() -> None:
    with _lock, _connect() as conn:
        conn.executescript(SCHEMA)


def get_session(session_id: str) -> dict | None:
    with _lock, _connect() as conn:
        row = conn.execute(
            "SELECT * FROM app_sessions WHERE session_id = ?", (session_id,)
        ).fetchone()
        return dict(row) if row else None


def create_session(
    session_id: str, app_id: str, workspace_path: str, agent: str
) -> dict:
    now = time.time()
    with _lock, _connect() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO app_sessions"
            " (session_id, app_id, opencode_session_id, workspace_path, agent,"
            "  created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
            (session_id, app_id, None, workspace_path, agent, now, now),
        )
    return get_session(session_id)


def bind_opencode_session(session_id: str, opencode_session_id: str) -> None:
    with _lock, _connect() as conn:
        conn.execute(
            "UPDATE app_sessions SET opencode_session_id = ?, updated_at = ?"
            " WHERE session_id = ?",
            (opencode_session_id, time.time(), session_id),
        )


def list_sessions(app_id: str) -> list[dict]:
    with _lock, _connect() as conn:
        rows = conn.execute(
            "SELECT * FROM app_sessions WHERE app_id = ? ORDER BY updated_at DESC",
            (app_id,),
        ).fetchall()
        return [dict(r) for r in rows]


def delete_session(session_id: str) -> None:
    with _lock, _connect() as conn:
        conn.execute(
            "DELETE FROM app_sessions WHERE session_id = ?", (session_id,)
        )
