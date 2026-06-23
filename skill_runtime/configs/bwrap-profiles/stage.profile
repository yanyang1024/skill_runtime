# Stage Runtime bwrap 隔离配置（开发阶段默认不启用，通过 STAGE_USE_BWRAP=1 开启）
# 目标：只读绑定项目根目录，读写隔离当前 stage workspace

--unshare-all
--die-with-parent
--ro-bind /home/yy/skill_runtime /home/yy/skill_runtime
--bind {{WORKSPACE_DIR}} {{WORKSPACE_DIR}}
--tmpfs /tmp
--proc /proc
--dev /dev
