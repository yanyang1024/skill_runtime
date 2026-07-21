"""会话 workspace 的创建、回收与路径安全解析。"""
import shutil
from datetime import datetime
from pathlib import Path

from app.config import settings

SUBDIRS = ("files", "output", "notes", ".opencode")

# 注入到每个会话 workspace 根目录的 AGENTS.md。
# OpenCode 会自动把项目根（即 x-opencode-directory 指向的 workspace）下的
# AGENTS.md 读入系统提示，用来约束模型的读写路径行为。
WORKSPACE_AGENTS_MD = """# 工作区规则

你是运行在受控工作区里的编程助手，当前工作区根目录就是你的工作目录（cwd）。

## 目录约定

- `files/`：用户上传的参考资料，只读。
- `output/`：你生成的所有产物（报告、代码、文件）默认写到这里。
- `notes/`：用户的笔记，可读；仅当用户明确要求时才写入。
- `.opencode/`：工作区级配置，不要改动。

## 路径规则（必须遵守）

1. **一律使用相对路径**（例如 `files/xxx.md`、`output/result.md`），禁止使用以 `/` 开头的绝对路径。
2. 禁止读取或写入工作区之外的任何路径；越界写入会被权限系统和沙箱直接拒绝。
3. 写文件时直接用 write 工具写目标相对路径，父目录会自动创建。
4. 用户说「保存到 output」「写入结果」等，均指本工作区下的 `output/` 目录。
5. 不确定文件位置时，先用 list/glob 在工作区内查找，不要猜测绝对路径。
"""

_GUIDANCE_FILENAME = "AGENTS.md"


def provision_workspace(conversation_id: str) -> tuple[Path, str]:
    """创建会话 workspace，返回 (宿主机绝对路径, 沙箱内路径)。"""
    host = settings.workspaces_dir / conversation_id
    for sub in SUBDIRS:
        (host / sub).mkdir(parents=True, exist_ok=True)
    write_workspace_guidance(host)
    # 沙箱内路径与宿主路径一致：bwrap 把 workspaces 根目录绑定到相同绝对路径，
    # 因此 x-opencode-directory 直接传宿主机路径即可
    return host, str(host)


def write_workspace_guidance(host: Path) -> None:
    """在 workspace 根写入 AGENTS.md 路径规则（已存在则不覆盖，避免覆盖用户修改）。"""
    target = host / _GUIDANCE_FILENAME
    if not target.exists():
        target.write_text(WORKSPACE_AGENTS_MD, encoding="utf-8")


def backfill_workspace_guidance() -> int:
    """为所有未删除会话的 workspace 补齐 AGENTS.md（老会话升级用），返回补齐数量。"""
    from app.database import query_all  # 延迟导入，避免循环依赖

    count = 0
    for row in query_all("SELECT host_workspace_path FROM conversations WHERE is_deleted=0"):
        host = Path(row["host_workspace_path"])
        if host.is_dir() and not (host / _GUIDANCE_FILENAME).exists():
            write_workspace_guidance(host)
            count += 1
    return count


def trash_workspace(conversation_id: str, host_path: Path) -> Path | None:
    """把 workspace 移动到 data/.trash/（不立即永久删除）。"""
    if not host_path.exists():
        return None
    settings.trash_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d%H%M%S")
    dest = settings.trash_dir / f"{conversation_id}-{ts}"
    shutil.move(str(host_path), str(dest))
    return dest


def resolve_inside_workspace(workspace: Path, relative_path: str) -> Path:
    """把相对路径解析为 workspace 内的绝对路径，拒绝越界。

    拒绝：空路径、绝对路径、.. 越界、符号链接越界（resolve 后校验）。
    """
    if not relative_path:
        raise ValueError("路径不能为空")
    path = Path(relative_path)
    if path.is_absolute():
        raise ValueError("不允许使用绝对路径")
    root = workspace.resolve()
    target = (root / path).resolve()
    try:
        target.relative_to(root)
    except ValueError:
        raise ValueError("路径越界：不允许访问 workspace 之外的文件") from None
    return target
