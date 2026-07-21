"""SQLite 数据访问（标准库 sqlite3，不用 ORM）。

单连接 + check_same_thread=False + 写锁，个人 MVP 足够；
数据库操作都很快，异步路由中直接同步调用即可。
"""
import sqlite3
import threading

from app.config import settings
from app.models import CREATE_TABLES_SQL, migrate_db

_lock = threading.RLock()
_conn: sqlite3.Connection | None = None


def get_conn() -> sqlite3.Connection:
    global _conn
    if _conn is None:
        settings.db_path.parent.mkdir(parents=True, exist_ok=True)
        _conn = sqlite3.connect(str(settings.db_path), check_same_thread=False)
        _conn.row_factory = sqlite3.Row
        _conn.execute("PRAGMA journal_mode=WAL")
    return _conn


def init_db() -> None:
    """建表（幂等）+ 轻量迁移。"""
    with _lock:
        conn = get_conn()
        conn.executescript(CREATE_TABLES_SQL)
        conn.commit()
        migrate_db(conn)


def execute(sql: str, params: tuple = ()) -> None:
    """写操作（自动提交）。"""
    with _lock:
        conn = get_conn()
        conn.execute(sql, params)
        conn.commit()


def query_one(sql: str, params: tuple = ()) -> sqlite3.Row | None:
    with _lock:
        return get_conn().execute(sql, params).fetchone()


def query_all(sql: str, params: tuple = ()) -> list[sqlite3.Row]:
    with _lock:
        return get_conn().execute(sql, params).fetchall()
