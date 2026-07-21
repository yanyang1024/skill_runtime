"""应用配置：从环境变量（可选 backend/.env）读取。"""
import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = Path(__file__).resolve().parents[2]

# 加载 backend/.env（不覆盖已存在的环境变量）
load_dotenv(BACKEND_DIR / ".env", override=False)


def _env(key: str, default: str = "") -> str:
    return os.environ.get(key, default)


class Settings:
    def __init__(self) -> None:
        self.repo_root = REPO_ROOT
        self.data_root = Path(_env("SGS_DATA_ROOT", str(REPO_ROOT / "data"))).expanduser().resolve()
        self.opencode_base_url = _env("OPENCODE_BASE_URL", "http://127.0.0.1:4199").rstrip("/")
        self.opencode_username = _env("OPENCODE_SERVER_USERNAME", "opencode")
        self.opencode_password = _env("OPENCODE_SERVER_PASSWORD", "local-password")
        # 推荐模型（OpenAI 兼容端点），未配置则推荐功能自动降级跳过
        self.recommender_base_url = _env("RECOMMENDER_BASE_URL", "").rstrip("/")
        self.recommender_model = _env("RECOMMENDER_MODEL", "")
        self.recommender_api_key = _env("RECOMMENDER_API_KEY", "local")
        # 后端 API 认证：非空则除 /api/health 外所有接口要求 Bearer token
        self.simple_token = _env("SIMPLE_TOKEN", "")
        # 空闲自动关闭 OpenCode：分钟数（0 = 关闭该功能），以及检查间隔（秒）
        self.idle_timeout_minutes = float(_env("IDLE_TIMEOUT_MINUTES", "30") or 0)
        self.idle_check_interval_seconds = int(_env("IDLE_CHECK_INTERVAL_SECONDS", "300") or 300)

        # 派生路径
        self.workspaces_dir = self.data_root / "workspaces"
        self.opencode_home = self.data_root / "opencode-home"  # 沙箱内 HOME
        self.tmp_dir = self.data_root / "tmp"
        self.trash_dir = self.data_root / ".trash"
        self.skills_dir = self.opencode_home / ".config" / "opencode" / "skills"  # Skill 全局目录
        self.archive_dir = self.opencode_home / ".archive"
        self.db_path = self.data_root / "app.db"
        self.prompt_library_dir = Path(__file__).resolve().parent / "prompt_library"


settings = Settings()


def ensure_dirs() -> None:
    """启动时确保数据目录存在。"""
    for d in (
        settings.data_root,
        settings.workspaces_dir,
        settings.opencode_home,
        settings.tmp_dir,
        settings.trash_dir,
        settings.skills_dir,
        settings.archive_dir,
    ):
        d.mkdir(parents=True, exist_ok=True)
