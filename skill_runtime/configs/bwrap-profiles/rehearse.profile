# Rehearse 阶段 bwrap 隔离配置（第一版开发阶段可暂不启用）
# 目标：PID/IPC/UTS 隔离 + 文件系统可见性通过 mounts.yaml 精确控制

--unshare-pid
--unshare-ipc
--unshare-uts
--die-with-parent
--ro-bind /home/yy/skill_runtime /home/yy/skill_runtime
--bind {{WORKSPACE_DIR}} {{WORKSPACE_DIR}}
--tmpfs /tmp
--proc /proc
--dev /dev
