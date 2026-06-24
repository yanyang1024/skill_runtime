# Stage Runtime bwrap 隔离配置（v0.3 默认启用，可通过 STAGE_USE_BWRAP=0 关闭）
# 目标：只读绑定项目根目录与预配置域，读写隔离当前 stage workspace

--unshare-all
--die-with-parent
--tmpfs /tmp
--proc /proc
--dev /dev
