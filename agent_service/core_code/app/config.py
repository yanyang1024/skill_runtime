"""集中配置：路径、端口、超时、凭据。"""
import os
from pathlib import Path

SERVICE_ROOT = Path("/home/yy/agent_service")
DATA_DIR = SERVICE_ROOT / "data"
APPS_DIR = DATA_DIR / "apps"
DB_PATH = DATA_DIR / "agent_service.db"

# 端口分配：45000 + (md5(app_id) % 20536)，与 scripts/start_agent.sh 同一公式
PORT_BASE = 45000
PORT_RANGE = 20536

# OpenCode 实例的 HTTP Basic Auth（与 systemd 单元 Environment 一致）
OPENCODE_SERVER_USERNAME = os.environ.get("OPENCODE_SERVER_USERNAME", "agent")
OPENCODE_SERVER_PASSWORD = os.environ.get("OPENCODE_SERVER_PASSWORD", "agent")

HEALTH_TIMEOUT = 30.0        # 实例启动后等待健康检查通过的秒数
IDLE_CHECK_INTERVAL = float(os.environ.get("IDLE_CHECK_INTERVAL", "300"))  # 空闲扫描周期
IDLE_TIMEOUT = float(os.environ.get("IDLE_TIMEOUT", "1800"))  # 空闲多久后回收实例

DEFAULT_AGENT = "build"      # opencode 内置 agent，model 字段缺省时使用

# 本服务自身监听地址
SERVICE_HOST = os.environ.get("AGENT_SERVICE_HOST", "127.0.0.1")
SERVICE_PORT = int(os.environ.get("AGENT_SERVICE_PORT", "8000"))
