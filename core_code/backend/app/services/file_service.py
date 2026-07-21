"""会话文件区：递归列表、上传保存。"""
import os
from datetime import datetime, timezone
from pathlib import Path

from fastapi import UploadFile

from app.services.workspace import resolve_inside_workspace

MAX_UPLOAD_BYTES = 100 * 1024 * 1024  # 单文件 100MB
MAX_FILENAME_LEN = 128
TOP_DIRS = ("files", "output", "notes")


def list_files(workspace: Path) -> list[dict]:
    """递归列出 workspace 下 files/output/notes 的内容，按路径排序。"""
    workspace = workspace.resolve()
    items: list[dict] = []
    for top in TOP_DIRS:
        root = workspace / top
        if not root.is_dir():
            continue
        for p in sorted(root.rglob("*")):
            if p.is_symlink():
                continue  # 不跟随符号链接
            try:
                st = p.stat()
            except OSError:
                continue
            items.append(
                {
                    "path": p.relative_to(workspace).as_posix(),
                    "size": 0 if p.is_dir() else st.st_size,
                    "is_dir": p.is_dir(),
                    "modified_at": datetime.fromtimestamp(st.st_mtime, tz=timezone.utc).isoformat(),
                }
            )
    items.sort(key=lambda x: x["path"])
    return items


def sanitize_filename(name: str) -> str:
    """清洗文件名：去路径分隔符、限长 128 字符。"""
    name = (name or "").replace("\\", "/").split("/")[-1].strip()
    if not name:
        name = "unnamed"
    if len(name) > MAX_FILENAME_LEN:
        stem, ext = os.path.splitext(name)
        keep = MAX_FILENAME_LEN - len(ext)
        name = (stem[:keep] + ext) if keep > 0 else name[:MAX_FILENAME_LEN]
    return name


async def save_upload(workspace: Path, directory: str, upload: UploadFile) -> str:
    """保存上传文件到 <workspace>/<directory>/，返回相对 workspace 的 posix 路径。"""
    workspace = workspace.resolve()
    directory = (directory or "").strip() or "files"
    target_dir = resolve_inside_workspace(workspace, directory)
    target_dir.mkdir(parents=True, exist_ok=True)

    filename = sanitize_filename(upload.filename)
    target = target_dir / filename
    # 防 symlink 逃逸：workspace 可被 agent 写入，其中可能埋有指向外部的符号链接；
    # 最终落点必须 resolve 后仍在 workspace 内，且落点本身不能是符号链接
    resolved = target.resolve()
    try:
        resolved.relative_to(workspace)
    except ValueError:
        raise ValueError("目标路径越界（疑似符号链接），已拒绝") from None
    if target.is_symlink():
        raise ValueError("目标路径是符号链接，已拒绝")
    if target.exists():
        # 同名文件加时间戳后缀，避免覆盖
        stem, ext = os.path.splitext(filename)
        ts = datetime.now().strftime("%Y%m%d%H%M%S")
        filename = f"{stem}-{ts}{ext}"
        target = target_dir / filename

    size = 0
    try:
        with open(target, "wb") as f:
            while chunk := await upload.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise ValueError("文件超过 100MB 上限")
                f.write(chunk)
    except Exception:
        target.unlink(missing_ok=True)  # 失败时清理半成品
        raise
    return target.relative_to(workspace).as_posix()
