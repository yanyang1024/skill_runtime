#!/bin/bash
# install.sh — 安装 agent_service 的 systemd user 单元并启动 API 服务
set -e

SERVICE_ROOT="/home/yy/agent_service"
UNIT_DIR="${HOME}/.config/systemd/user"

chmod +x "${SERVICE_ROOT}/scripts/start_agent.sh"

mkdir -p "${UNIT_DIR}"
cp "${SERVICE_ROOT}/systemd/opencode-app@.service" "${UNIT_DIR}/"
cp "${SERVICE_ROOT}/systemd/agent-service.service" "${UNIT_DIR}/"

systemctl --user daemon-reload
systemctl --user enable --now agent-service.service

echo "[install] 完成。agent_service 监听 127.0.0.1:8000"
echo "[install] OpenCode 实例按需启动：systemctl --user start opencode-app@<app_id>"
echo "[install] 如需注销后仍运行：loginctl enable-linger \$USER"
