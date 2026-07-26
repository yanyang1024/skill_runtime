"""会话工作目录：data/apps/{app_id}/workspace/{session_id}/"""
import shutil

from .. import config


def provision_session_workspace(app_id: str, session_id: str) -> str:
    path = config.APPS_DIR / app_id / "workspace" / session_id
    path.mkdir(parents=True, exist_ok=True)
    return str(path)


def remove_session_workspace(app_id: str, session_id: str) -> None:
    path = config.APPS_DIR / app_id / "workspace" / session_id
    shutil.rmtree(path, ignore_errors=True)
