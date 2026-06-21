# Rehearse 阶段 bwrap 隔离配置（第一版开发阶段可暂不启用）
# 目标：只读绑定项目根目录，读写隔离 experiments/<skill>/rehearse-XXXX/

--unshare-all
--die-with-parent
--ro-bind /home/yy/skill_runtime /home/yy/skill_runtime
--bind {{WORKSPACE_DIR}} {{WORKSPACE_DIR}}
--tmpfs /tmp
--proc /proc
--dev /dev
