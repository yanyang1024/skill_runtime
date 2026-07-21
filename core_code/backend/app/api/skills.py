"""Skill 区路由。"""
import logging
import zipfile

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.services import skill_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/skills", tags=["skills"])

MAX_ZIP_BYTES = 100 * 1024 * 1024  # Skill ZIP 上限 100MB


@router.get("")
async def list_skills():
    return {"skills": skill_service.list_skills()}


@router.post("/upload")
async def upload_skill(file: UploadFile = File(...)):
    # 分块读取并实时限额，避免超限文件先占满内存
    chunks: list[bytes] = []
    size = 0
    while chunk := await file.read(1024 * 1024):
        size += len(chunk)
        if size > MAX_ZIP_BYTES:
            raise HTTPException(status_code=400, detail="ZIP 文件超过 100MB 上限")
        chunks.append(chunk)
    data = b"".join(chunks)
    try:
        name = skill_service.save_skill_zip(data)
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="无效的 ZIP 文件")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    logger.info("Skill 上传: name=%s 大小=%dKB", name, len(data) // 1024)
    return {"name": name}


@router.get("/{name}")
async def get_skill(name: str):
    try:
        return skill_service.get_skill(name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Skill 不存在")


@router.delete("/{name}")
async def delete_skill(name: str):
    try:
        skill_service.delete_skill(name)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Skill 不存在")
    logger.info("Skill 已归档: name=%s", name)
    return {"ok": True}
