"""Skill 管理：扫描、ZIP 上传校验、归档。

Skill 全局目录：data/opencode-home/.config/opencode/skills/<name>/SKILL.md
删除/覆盖前统一移动到 data/opencode-home/.archive/<name>-<ts>/。
"""
import io
import re
import shutil
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

import yaml

from app.config import settings

# OpenCode 要求 name 为小写字母、数字与单连字符
SKILL_NAME_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")


def _ts() -> str:
    return datetime.now().strftime("%Y%m%d%H%M%S")


def _parse_frontmatter(content: str) -> dict:
    """解析 SKILL.md 的 YAML frontmatter（--- 包裹的部分）。"""
    text = content.lstrip("\ufeff")
    if not text.startswith("---"):
        return {}
    lines = text.splitlines()
    end = None
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            end = i
            break
    if end is None:
        return {}
    try:
        data = yaml.safe_load("\n".join(lines[1:end]))
    except yaml.YAMLError as e:
        raise ValueError(f"SKILL.md 的 YAML frontmatter 解析失败: {e}")
    return data if isinstance(data, dict) else {}


def _skill_files(skill_dir: Path) -> list[str]:
    """Skill 目录下所有文件的相对路径（不跟随符号链接）。"""
    files = []
    for p in sorted(skill_dir.rglob("*")):
        if p.is_symlink():
            continue
        if p.is_file():
            files.append(p.relative_to(skill_dir).as_posix())
    return files


def list_skills() -> list[dict]:
    """扫描 skills 目录，读取每个 SKILL.md 的 frontmatter。"""
    result: list[dict] = []
    if not settings.skills_dir.exists():
        return result
    for d in sorted(settings.skills_dir.iterdir()):
        if not d.is_dir() or d.is_symlink():
            continue
        md = d / "SKILL.md"
        if not md.is_file():
            continue
        try:
            meta = _parse_frontmatter(md.read_text(encoding="utf-8", errors="replace"))
        except ValueError:
            meta = {}
        result.append(
            {
                "name": str(meta.get("name") or d.name),
                "description": str(meta.get("description") or ""),
                "source": "user",
                "updated_at": datetime.fromtimestamp(md.stat().st_mtime, tz=timezone.utc).isoformat(),
                "files": _skill_files(d),
            }
        )
    return result


def _resolve_skill_dir(name: str) -> Path:
    """校验名称并定位 Skill 目录；非法名称 ValueError，不存在 FileNotFoundError。"""
    if not SKILL_NAME_RE.match(name or ""):
        raise ValueError("非法的 Skill 名称")
    base = settings.skills_dir.resolve()
    d = (base / name).resolve()
    try:
        d.relative_to(base)
    except ValueError:
        raise ValueError("非法的 Skill 路径") from None
    if not d.is_dir() or not (d / "SKILL.md").is_file():
        raise FileNotFoundError(name)
    return d


def get_skill(name: str) -> dict:
    d = _resolve_skill_dir(name)
    content = (d / "SKILL.md").read_text(encoding="utf-8", errors="replace")
    try:
        meta = _parse_frontmatter(content)
    except ValueError:
        meta = {}
    return {
        "name": str(meta.get("name") or d.name),
        "description": str(meta.get("description") or ""),
        "skill_md": content,
        "files": _skill_files(d),
    }


def _validate_member(info: zipfile.ZipInfo) -> None:
    """拒绝 ZIP 中的绝对路径、路径穿越与符号链接。"""
    name = info.filename
    p = PurePosixPath(name)
    if p.is_absolute() or name.startswith("/"):
        raise ValueError("ZIP 包含绝对路径，已拒绝")
    if ".." in p.parts:
        raise ValueError("ZIP 包含路径穿越（..），已拒绝")
    mode = (info.external_attr >> 16) & 0o170000
    if mode == 0o120000:  # symlink
        raise ValueError("ZIP 包含符号链接，已拒绝")


MAX_ZIP_ENTRIES = 2000  # ZIP 条目数上限
MAX_UNZIPPED_BYTES = 500 * 1024 * 1024  # 解压后总体积上限 500MB（防 ZIP 炸弹）


def _extract_zip(zip_bytes: bytes, dest: Path) -> None:
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        infos = zf.infolist()
        if len(infos) > MAX_ZIP_ENTRIES:
            raise ValueError(f"ZIP 条目数超过 {MAX_ZIP_ENTRIES} 上限")
        total = 0
        for info in infos:
            _validate_member(info)
            # 防 ZIP 炸弹：按声明大小先粗筛，再按实际写出字节数精确拦截
            total += info.file_size
            if total > MAX_UNZIPPED_BYTES:
                raise ValueError("ZIP 解压后体积超过 500MB 上限，已拒绝")
            target = (dest / info.filename).resolve()
            try:
                target.relative_to(dest.resolve())
            except ValueError:
                raise ValueError("ZIP 包含越界路径，已拒绝") from None
            if info.is_dir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                written = 0
                with zf.open(info) as src, open(target, "wb") as out:
                    while True:
                        chunk = src.read(1024 * 1024)
                        if not chunk:
                            break
                        written += len(chunk)
                        if written > MAX_UNZIPPED_BYTES:
                            raise ValueError("ZIP 解压后体积超过 500MB 上限，已拒绝")
                        out.write(chunk)


def _find_skill_root(extract_dir: Path) -> Path | None:
    """找根目录 SKILL.md；若 zip 里有一层同名目录包裹则下探一层。"""
    if (extract_dir / "SKILL.md").is_file():
        return extract_dir
    entries = list(extract_dir.iterdir())
    dirs = [e for e in entries if e.is_dir()]
    if len(entries) == 1 and len(dirs) == 1 and (dirs[0] / "SKILL.md").is_file():
        return dirs[0]
    return None


def save_skill_zip(zip_bytes: bytes) -> str:
    """校验并安装 Skill ZIP，返回 Skill 名称。同名 Skill 先移入 .archive。"""
    settings.tmp_dir.mkdir(parents=True, exist_ok=True)
    tmp = Path(tempfile.mkdtemp(prefix="skill-", dir=settings.tmp_dir))
    try:
        _extract_zip(zip_bytes, tmp)
        skill_root = _find_skill_root(tmp)
        if skill_root is None:
            raise ValueError("ZIP 中未找到根目录 SKILL.md")
        content = (skill_root / "SKILL.md").read_text(encoding="utf-8", errors="replace")
        meta = _parse_frontmatter(content)
        name = str(meta.get("name") or "").strip()
        if not SKILL_NAME_RE.match(name):
            raise ValueError("SKILL.md 的 name 不合法（需为小写字母、数字与单连字符）")
        if not str(meta.get("description") or "").strip():
            raise ValueError("SKILL.md 缺少 description 字段")
        settings.skills_dir.mkdir(parents=True, exist_ok=True)
        dest = settings.skills_dir / name
        if dest.exists():
            settings.archive_dir.mkdir(parents=True, exist_ok=True)
            shutil.move(str(dest), str(settings.archive_dir / f"{name}-{_ts()}"))
        shutil.move(str(skill_root), str(dest))
        return name
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def delete_skill(name: str) -> None:
    """删除 Skill：移动到 .archive/<name>-<ts>/，不立即永久删除。"""
    d = _resolve_skill_dir(name)
    settings.archive_dir.mkdir(parents=True, exist_ok=True)
    shutil.move(str(d), str(settings.archive_dir / f"{name}-{_ts()}"))
