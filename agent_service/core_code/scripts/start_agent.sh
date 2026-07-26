#!/bin/bash
# start_agent.sh — 在 bwrap 沙箱中启动单个 app 的 OpenCode 实例
# 策略：全盘只读 + mask 敏感路径 + tmpfs /home + 应用专属可写目录
set -e

APP_ID="$1"
if [ -z "$APP_ID" ]; then
    echo "Usage: $0 <APP_ID>" >&2
    exit 1
fi

# ── 端口：与 Python 侧 instance_manager.port_for() 同一公式 ──
PORT=$(python3 -c "
import hashlib, sys
print(45000 + (int(hashlib.md5(sys.argv[1].encode()).hexdigest(), 16) % 20536))
" "$APP_ID")

# ── 路径常量 ──
SERVICE_ROOT="/home/yy/agent_service"
APP_DIR="${SERVICE_ROOT}/data/apps/${APP_ID}"
APP_HOME="${APP_DIR}/home"
SYSTEM_USER="yy"
OPENCODE_BIN="/home/yy/.npm-global/lib/node_modules/opencode-ai/bin/opencode.exe"
# 独立的 opencode 配置模板（与宿主机 ~/.config/opencode 解耦）
OPENCODE_CONFIG="${SERVICE_ROOT}/config/opencode"
AUTH_JSON="${SERVICE_ROOT}/config/auth.json"

# ── 初始化应用目录 ──
mkdir -p "${APP_HOME}/.local/share/opencode"
mkdir -p "${APP_HOME}/.local/state/opencode"
mkdir -p "${APP_HOME}/.cache/opencode"
mkdir -p "${APP_DIR}/tmp"
mkdir -p "${APP_DIR}/workspace"

# 每次启动把配置模板同步为 per-app 可写副本（opencode 会在配置目录写 .gitignore 等
# 运行时文件，ro-bind 会 EROFS；模板保持干净，实例间互不污染）
APP_CONFIG="${APP_DIR}/opencode-config"
mkdir -p "${APP_CONFIG}"
cp -a "${OPENCODE_CONFIG}/." "${APP_CONFIG}/"

# ── 构建 bwrap 参数 ──
BWRAP_ARGS=(
  # 1. 全盘只读
  --ro-bind / /

  # 2. Mask 敏感路径
  --ro-bind /dev/null /etc/shadow
  --ro-bind /dev/null /etc/gshadow
)

[ -d /etc/ssh ] && BWRAP_ARGS+=(--tmpfs /etc/ssh)

BWRAP_ARGS+=(
  # 3. 整体 mask /home（宿主机其他目录不可见）
  --tmpfs /home

  # 4. 应用专属 home（opencode db/state/cache、git config 等）
  --bind "${APP_HOME}" "/home/${SYSTEM_USER}"

  # 5. 注入 opencode 配置（per-app 可写副本）与 LLM 凭据（只读）
  --bind "${APP_CONFIG}" "/home/${SYSTEM_USER}/.config/opencode"
  --ro-bind "${AUTH_JSON}" "/home/${SYSTEM_USER}/.local/share/opencode/auth.json"

  # 6. 恢复 opencode 运行时二进制（/home 被 tmpfs mask 后需显式恢复）
  --ro-bind "/home/${SYSTEM_USER}/.npm-global" "/home/${SYSTEM_USER}/.npm-global"

  # 7. 应用专属可写目录
  --bind "${APP_DIR}/tmp" /tmp
  --bind "${APP_DIR}/workspace" "${APP_DIR}/workspace"
  --bind "${APP_DIR}" "${APP_DIR}"

  # 7. 系统挂载 + 命名空间隔离
  --dev /dev
  --proc /proc
  --chdir "${APP_DIR}"
  --unshare-pid
  --unshare-ipc
  --die-with-parent
  --new-session

  # 8. 环境变量
  --setenv HOME "/home/${SYSTEM_USER}"
  --setenv TMPDIR /tmp
  --setenv PATH "/usr/local/bin:/usr/bin:/bin"
  --setenv OPENCODE_SERVER_USERNAME "${OPENCODE_SERVER_USERNAME:-agent}"
  --setenv OPENCODE_SERVER_PASSWORD "${OPENCODE_SERVER_PASSWORD:-agent}"
)

# ── 启动 opencode ──
echo "[start_agent] app=${APP_ID} port=${PORT}" >&2
exec bwrap "${BWRAP_ARGS[@]}" -- "${OPENCODE_BIN}" serve --port "${PORT}" --hostname 127.0.0.1
