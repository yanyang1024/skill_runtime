from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
import json
import sqlite3
import uuid


def now():
    return datetime.now(timezone.utc).isoformat()


def identifier():
    return uuid.uuid4().hex


class Conflict(Exception):
    pass


class Store:
    JSON_FIELDS = {"draft", "clarification", "error", "conversation", "selection"}
    FIELDS = {"status", "run_id", "artifact_version", "artifact_text"} | JSON_FIELDS

    def __init__(self, path):
        self.path = str(path)
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with self.connection() as db:
            db.executescript("""
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS tasks (
                    id TEXT PRIMARY KEY, owner TEXT NOT NULL, goal TEXT NOT NULL,
                    status TEXT NOT NULL, run_id TEXT NOT NULL DEFAULT '',
                    artifact_version INTEGER NOT NULL DEFAULT 0, artifact_text TEXT NOT NULL DEFAULT '',
                    draft_json TEXT, clarification_json TEXT, error_json TEXT,
                    conversation_json TEXT NOT NULL DEFAULT '[]', selection_json TEXT,
                    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS tasks_owner ON tasks(owner, created_at);
                CREATE TABLE IF NOT EXISTS events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL,
                    run_id TEXT NOT NULL, type TEXT NOT NULL, message TEXT NOT NULL,
                    payload_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS events_task ON events(task_id, id);
            """)

    @contextmanager
    def connection(self):
        db = sqlite3.connect(self.path, timeout=5)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def decode(self, row):
        if not row:
            return None
        task = dict(row)
        for field in self.JSON_FIELDS:
            raw = task.pop(field + "_json")
            task[field] = json.loads(raw) if raw is not None else None
        return task

    def create(self, owner, goal):
        task_id, timestamp = identifier(), now()
        with self.connection() as db:
            db.execute("INSERT INTO tasks(id,owner,goal,status,created_at,updated_at) VALUES(?,?,?,'pending',?,?)",
                       (task_id, owner, goal, timestamp, timestamp))
        return self.get(task_id)

    def get(self, task_id, owner=None):
        with self.connection() as db:
            row = db.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
        task = self.decode(row)
        return task if task and (owner is None or task["owner"] == owner) else None

    def list(self, owner):
        with self.connection() as db:
            rows = db.execute("SELECT id,goal,status,artifact_version,updated_at FROM tasks WHERE owner=? ORDER BY created_at DESC LIMIT 30", (owner,)).fetchall()
        return [dict(row) for row in rows]

    def update(self, task_id, *, only_run=None, only_status=None, **values):
        if not values or not set(values) <= self.FIELDS:
            raise ValueError("Unsupported task fields")
        columns, parameters = [], []
        for field, value in values.items():
            column = field + "_json" if field in self.JSON_FIELDS else field
            columns.append(column + "=?")
            parameters.append(json.dumps(value, ensure_ascii=False) if field in self.JSON_FIELDS and value is not None else value)
        columns.append("updated_at=?")
        parameters.extend([now(), task_id])
        condition = "id=?"
        if only_run is not None:
            condition += " AND run_id=?"
            parameters.append(only_run)
        if only_status is not None:
            condition += " AND status=?"
            parameters.append(only_status)
        with self.connection() as db:
            result = db.execute(f"UPDATE tasks SET {','.join(columns)} WHERE {condition}", parameters)
            return result.rowcount == 1

    def event(self, task_id, run_id, kind, message, payload=None):
        with self.connection() as db:
            db.execute("INSERT INTO events(task_id,run_id,type,message,payload_json,created_at) VALUES(?,?,?,?,?,?)",
                       (task_id, run_id, kind, message, json.dumps(payload or {}, ensure_ascii=False), now()))

    def events(self, task_id):
        with self.connection() as db:
            rows = db.execute("SELECT * FROM events WHERE task_id=? ORDER BY id DESC LIMIT 150", (task_id,)).fetchall()
        result = []
        for row in reversed(rows):
            item = dict(row)
            item["payload"] = json.loads(item.pop("payload_json"))
            result.append(item)
        return result

    def save_artifact(self, task_id, text, expected_version):
        with self.connection() as db:
            result = db.execute("UPDATE tasks SET artifact_text=?,artifact_version=artifact_version+1,updated_at=? WHERE id=? AND artifact_version=?",
                                (text, now(), task_id, expected_version))
            if result.rowcount != 1:
                raise Conflict("报告已被修改。请读取新版本后再保存。")
        return self.get(task_id)

    def accept(self, task_id, draft_id):
        with self.connection() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
            task = self.decode(row)
            draft = task["draft"] if task else None
            if not draft or draft["id"] != draft_id or task["status"] != "awaiting_review":
                raise Conflict("这份草稿已不再可采纳，请刷新任务。")
            if draft["base_version"] != task["artifact_version"]:
                raise Conflict("草稿基于旧版本。请保留当前报告，并要求 Agent 重新提案。")
            result = db.execute("UPDATE tasks SET artifact_text=?,artifact_version=artifact_version+1,draft_json=NULL,status='completed',updated_at=? WHERE id=? AND artifact_version=? AND run_id=? AND status='awaiting_review'",
                                (draft["text"], now(), task_id, draft["base_version"], draft["run_id"]))
            if result.rowcount != 1:
                raise Conflict("任务状态已变化，请刷新后再操作。")
        return self.get(task_id)

    def recover(self):
        with self.connection() as db:
            rows = db.execute("SELECT id,run_id FROM tasks WHERE status IN ('pending','running')").fetchall()
            db.execute("UPDATE tasks SET status='interrupted',updated_at=? WHERE status IN ('pending','running')", (now(),))
        for row in rows:
            self.event(row["id"], row["run_id"], "interrupted", "服务重启，本轮执行已中断。可继续任务。")

    def public(self, task):
        return {key: task[key] for key in ("id", "goal", "status", "run_id", "artifact_version", "artifact_text",
                                         "draft", "clarification", "error", "selection", "created_at", "updated_at")} | {"events": self.events(task["id"])}
