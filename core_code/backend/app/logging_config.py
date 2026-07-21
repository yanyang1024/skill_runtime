"""日志配置：控制台 + 滚动文件双通道。

- 日志文件：``$SGS_DATA_ROOT/logs/backend.log``（默认 5MB × 3 个备份滚动）
- 日志级别：环境变量 ``SGS_LOG_LEVEL``（默认 INFO）
- 降噪：httpx/httpcore/uvicorn.access 提到 WARNING，请求级日志由 main.py 中间件统一输出
"""
import logging
import os
from logging.handlers import RotatingFileHandler

from app.config import settings

_FMT = "%(asctime)s %(levelname)s [%(name)s] %(message)s"


def setup_logging() -> None:
    level = os.environ.get("SGS_LOG_LEVEL", "INFO").upper()

    log_dir = settings.data_root / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)

    formatter = logging.Formatter(_FMT)

    console = logging.StreamHandler()
    console.setFormatter(formatter)

    file_handler = RotatingFileHandler(
        log_dir / "backend.log", maxBytes=5 * 1024 * 1024, backupCount=3, encoding="utf-8"
    )
    file_handler.setFormatter(formatter)

    root = logging.getLogger()
    root.setLevel(level)
    # 避免 uvicorn 预置 handler 与本配置叠加导致重复输出
    root.handlers.clear()
    root.addHandler(console)
    root.addHandler(file_handler)

    # 降噪：第三方库的啰嗦日志（业务请求日志由中间件统一记录）
    for noisy in ("httpx", "httpcore", "uvicorn.access", "watchfiles"):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    logging.getLogger(__name__).info(
        "日志系统就绪：level=%s file=%s", level, log_dir / "backend.log"
    )
