"""会话文件区路由。"""
import logging
import shutil
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.api.conversations import get_conversation_or_404
from app.services import file_service
from app.services.workspace import resolve_inside_workspace

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/conversations/{conversation_id}/files", tags=["files"])

# 顶层目录不允许删除
_PROTECTED_DIRS = {"files", "output", "notes", ".opencode"}


@router.get("")
async def list_files(conversation_id: str):
    conv = get_conversation_or_404(conversation_id)
    return {"files": file_service.list_files(Path(conv["host_workspace_path"]))}


@router.post("/upload")
async def upload_file(conversation_id: str, file: UploadFile = File(...), dir: str = Form("files")):
    conv = get_conversation_or_404(conversation_id)
    try:
        rel = await file_service.save_upload(Path(conv["host_workspace_path"]), dir, file)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    logger.info("文件上传: 会话=%s 路径=%s", conversation_id, rel)
    return {"path": rel}


@router.get("/download")
async def download_file(conversation_id: str, path: str):
    conv = get_conversation_or_404(conversation_id)
    try:
        target = resolve_inside_workspace(Path(conv["host_workspace_path"]), path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not target.is_file():
        raise HTTPException(status_code=404, detail="文件不存在")
    return FileResponse(str(target), filename=target.name)


@router.delete("")
async def delete_file(conversation_id: str, path: str):
    conv = get_conversation_or_404(conversation_id)
    workspace = Path(conv["host_workspace_path"])
    try:
        target = resolve_inside_workspace(workspace, path)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    root = workspace.resolve()
    if target == root or (target.parent == root and target.name in _PROTECTED_DIRS):
        raise HTTPException(status_code=400, detail="不允许删除 workspace 根目录或顶层目录")
    if not target.exists():
        raise HTTPException(status_code=404, detail="文件不存在")
    if target.is_dir():
        shutil.rmtree(target)
    else:
        target.unlink()
    logger.info("文件删除: 会话=%s 路径=%s", conversation_id, path)
    return {"ok": True}
