#!/usr/bin/env bash
# start-opencode.sh — 用 bwrap 启动个人版 opencode serve（沙箱隔离）
# 策略：全盘只读 + mask 敏感路径 + 沙箱 home/workspace 绑定到与宿主相同的路径
# 注意：不要加 --unshare-net，否则 opencode 无法访问本地模型推理端点
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

APP_DATA="${SGS_DATA_ROOT:-${REPO_ROOT}/data}"
WORKSPACES="${APP_DATA}/workspaces"
SANDBOX_HOME="${APP_DATA}/opencode-home"
TMP_DIR="${APP_DATA}/tmp"

OPENCODE_BIN="${OPENCODE_BIN:-$(command -v opencode || true)}"
# systemd 等最小 PATH 环境下 command -v 可能找不到，按常见安装位置兜底
if [[ -z "${OPENCODE_BIN}" ]]; then
  for cand in "${HOME}/.npm-global/bin/opencode" "${HOME}/.local/bin/opencode" /usr/local/bin/opencode /usr/bin/opencode; do
    [[ -x "${cand}" ]] && OPENCODE_BIN="${cand}" && break
  done
fi
PORT="${OPENCODE_PORT:-4199}"

if [[ -z "${OPENCODE_BIN}" ]]; then
  echo "[error] 未找到 opencode 可执行文件，请先安装或设置 OPENCODE_BIN" >&2
  exit 1
fi

# opencode 通常是符号链接，解析出自包含 ELF 二进制的真实路径
OPENCODE_REAL="$(readlink -f "${OPENCODE_BIN}")"

mkdir -p \
  "${WORKSPACES}" \
  "${TMP_DIR}" \
  "${SANDBOX_HOME}/.config/opencode" \
  "${SANDBOX_HOME}/.local/share/opencode" \
  "${SANDBOX_HOME}/.local/state/opencode" \
  "${SANDBOX_HOME}/.cache/opencode" \
  "${SANDBOX_HOME}/.config/opencode/skills" \
  "${SANDBOX_HOME}/.npm-global" \
  "${SANDBOX_HOME}/.cache/npm" \
  "${SANDBOX_HOME}/.cache/pip"

# Python venv：供沙箱内 Agent 运行 python/pip。
# 以与宿主一致的绝对路径挂载，venv 里写死绝对路径的 shebang 才能生效。
PYENV="${APP_DATA}/python-env"
if [[ ! -x "${PYENV}/bin/python" ]]; then
  echo "[init] 创建沙箱 Python venv: ${PYENV}"
  # 系统缺 ensurepip 时退化为无 pip venv（pip 由下方单独自举）
  python3 -m venv "${PYENV}" 2>/dev/null || python3 -m venv --without-pip "${PYENV}"
fi

# pip 自举：venv 里缺 pip 时，从 pypi 下载 pip wheel 自举
# （zip 形式的 wheel 可直接作为 sys.path 项执行其中的 pip 包，无需 ensurepip）
if ! "${PYENV}/bin/python" -m pip --version &>/dev/null; then
  echo "[init] 自举 pip 到 ${PYENV}"
  PIP_JSON="$(curl -fsSL --max-time 15 "https://pypi.org/pypi/pip/json" 2>/dev/null || true)"
  PIP_WHL_NAME="$(printf '%s' "${PIP_JSON}" | python3 -c "import json,sys; d=json.load(sys.stdin); print([u['filename'] for u in d['urls'] if u['filename'].endswith('.whl')][0])" 2>/dev/null || true)"
  PIP_WHL_URL="$(printf '%s' "${PIP_JSON}" | python3 -c "import json,sys; d=json.load(sys.stdin); print([u['url'] for u in d['urls'] if u['filename'].endswith('.whl')][0])" 2>/dev/null || true)"
  if [[ -n "${PIP_WHL_NAME}" && -n "${PIP_WHL_URL}" ]] \
    && curl -fsSL --max-time 90 "${PIP_WHL_URL}" -o "${TMP_DIR}/${PIP_WHL_NAME}" 2>/dev/null; then
    "${PYENV}/bin/python" "${TMP_DIR}/${PIP_WHL_NAME}/pip" install --no-index "${TMP_DIR}/${PIP_WHL_NAME}" 2>/dev/null \
      || echo "[warn] pip 安装失败，沙箱内 pip 不可用（python 标准库仍可用）" >&2
    rm -f "${TMP_DIR}/${PIP_WHL_NAME}"
  else
    echo "[warn] pip wheel 下载失败，沙箱内 pip 不可用（python 标准库仍可用）" >&2
  fi
fi

# 首次启动：拷贝 opencode 配置模板，提示用户按本地模型修改
OPENCODE_CONF="${SANDBOX_HOME}/.config/opencode/opencode.json"
if [[ ! -f "${OPENCODE_CONF}" ]]; then
  cp "${SCRIPT_DIR}/opencode.json" "${OPENCODE_CONF}"
  echo "[init] 已生成 ${OPENCODE_CONF}"
  echo "[init] 请根据本地模型服务修改其中的 model / small_model / provider baseURL" >&2
fi

# opencode 二进制在沙箱内的挂载位置：放在沙箱 home 的 .bin 下（与宿主同路径挂载）
SANDBOX_BIN_DIR="${SANDBOX_HOME}/.bin"
mkdir -p "${SANDBOX_BIN_DIR}"

BWRAP_ARGS=(
  # 1. 全盘只读
  --ro-bind / /

  # 2. mask 敏感路径
  --ro-bind /dev/null /etc/shadow
  --ro-bind /dev/null /etc/gshadow
)

# /etc/ssh 存在则用 tmpfs 遮蔽
[[ -d /etc/ssh ]] && BWRAP_ARGS+=(--tmpfs /etc/ssh)

BWRAP_ARGS+=(
  # 3. 遮蔽真实 /home，再把沙箱 home 绑到与宿主一致的绝对路径上
  #    （tmpfs /home 是临时的可写层，bwrap 会在其中创建挂载点父目录；
  #      沙箱内 HOME 路径 == 宿主的 ${SANDBOX_HOME} 路径，内容只有沙箱目录）
  --tmpfs /home
  --bind "${SANDBOX_HOME}" "${SANDBOX_HOME}"

  # 4. 所有会话 workspace：绑定到与宿主一致的路径
  #    （沙箱内 x-opencode-directory == 宿主机路径，路径映射为零）
  --bind "${WORKSPACES}" "${WORKSPACES}"

  # 4b. Python venv：绑定到与宿主一致的路径（venv 内含绝对路径 shebang）
  --bind "${PYENV}" "${PYENV}"

  # 5. 独立临时目录
  --bind "${TMP_DIR}" /tmp

  # 6. opencode 二进制本体（自包含 ELF，无需 node）
  --ro-bind "${OPENCODE_REAL}" "${SANDBOX_HOME}/.bin/opencode"

  # 7. 系统挂载 + 进程/IPC 隔离
  --proc /proc
  --dev /dev
  --chdir "${WORKSPACES}"
  --unshare-pid
  --unshare-ipc
  --die-with-parent
  --new-session

  # 8. 环境变量
  --setenv HOME "${SANDBOX_HOME}"
  --setenv TMPDIR /tmp
  # PATH：venv 与 npm 全局 bin 优先，opencode 自身 .bin 其次，系统路径兜底
  --setenv PATH "${PYENV}/bin:${SANDBOX_HOME}/.npm-global/bin:${SANDBOX_HOME}/.bin:/usr/local/bin:/usr/bin:/bin"
  # locale / 时区（TZ 可用宿主环境覆盖）
  --setenv LANG C.UTF-8
  --setenv LC_ALL C.UTF-8
  --setenv TZ "${TZ:-Asia/Shanghai}"
  # XDG 目录全部固定在沙箱 home 内（RUNTIME_DIR 指到可写 /tmp，避免泄漏宿主只读的 /run/user）
  --setenv XDG_CONFIG_HOME "${SANDBOX_HOME}/.config"
  --setenv XDG_DATA_HOME "${SANDBOX_HOME}/.local/share"
  --setenv XDG_STATE_HOME "${SANDBOX_HOME}/.local/state"
  --setenv XDG_CACHE_HOME "${SANDBOX_HOME}/.cache"
  --setenv XDG_RUNTIME_DIR /tmp
  # Python venv（PATH 已指向 venv，显式 VIRTUAL_ENV 让工具链识别）
  --setenv VIRTUAL_ENV "${PYENV}"
  --setenv PIP_CACHE_DIR "${SANDBOX_HOME}/.cache/pip"
  # npm：全局安装与缓存落在沙箱 home 内（node/npm 本体来自宿主机只读挂载）
  --setenv NPM_CONFIG_PREFIX "${SANDBOX_HOME}/.npm-global"
  --setenv NPM_CONFIG_CACHE "${SANDBOX_HOME}/.cache/npm"
  --setenv OPENCODE_SERVER_USERNAME "${OPENCODE_SERVER_USERNAME:-opencode}"
  --setenv OPENCODE_SERVER_PASSWORD "${OPENCODE_SERVER_PASSWORD:-local-password}"
)

# 沙箱自检模式：SGS_SANDBOX_SHELL=1 时不启动 opencode，而在沙箱内执行命令
# 例：SGS_SANDBOX_SHELL=1 SGS_SANDBOX_CMD='python3 --version; node --version' ./start-opencode.sh
if [[ "${SGS_SANDBOX_SHELL:-0}" == "1" ]]; then
  echo "[debug] 沙箱自检: ${SGS_SANDBOX_CMD:-env | sort}" >&2
  exec bwrap "${BWRAP_ARGS[@]}" -- bash -c "${SGS_SANDBOX_CMD:-env | sort}"
fi

echo "[info] 启动 opencode serve: 127.0.0.1:${PORT}（数据目录 ${APP_DATA}）"
exec bwrap "${BWRAP_ARGS[@]}" -- "${SANDBOX_HOME}/.bin/opencode" serve --port "${PORT}" --hostname 127.0.0.1
