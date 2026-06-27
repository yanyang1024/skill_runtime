# Stage Runtime bwrap 隔离配置（v0.3 默认启用，可通过 STAGE_USE_BWRAP=0 关闭）
# 目标：PID/IPC/UTS 隔离 + 文件系统可见性通过 mounts.yaml 精确控制
# 不使用 --unshare-all（会清空 mount namespace 导致 opencode 二进制不可见）

--unshare-pid
--unshare-ipc
--unshare-uts
--die-with-parent
--tmpfs /tmp
--proc /proc
--dev /dev
