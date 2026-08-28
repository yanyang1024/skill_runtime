#!/usr/bin/env bash
# 依赖体检脚本：检测 python 版本 / bwrap / verilator / iverilog / yosys，打印能力矩阵。
set -u

echo "== agentic-sandbox 依赖体检 =="

# Python 版本（要求 >= 3.9）
if command -v python3 >/dev/null 2>&1; then
    py_ver=$(python3 -c 'import sys; print("%d.%d.%d" % sys.version_info[:3])')
    if python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)'; then
        py_status="OK (>=3.9)"
    else
        py_status="版本过低，需要 >= 3.9"
    fi
else
    py_ver="未找到"
    py_status="缺失"
fi

check() {  # $1=命令名
    if command -v "$1" >/dev/null 2>&1; then echo "可用"; else echo "缺失"; fi
}

bwrap_s=$(check bwrap)
verilator_s=$(check verilator)
iverilog_s=$(check iverilog)
vvp_s=$(check vvp)
yosys_s=$(check yosys)

if [ "$bwrap_s" = "可用" ]; then mode="bwrap"; else mode="bare（降级裸跑，无隔离）"; fi

cat <<EOF
能力矩阵:
  python3   : $py_ver  $py_status
  bwrap     : $bwrap_s
  verilator : $verilator_s
  iverilog  : $iverilog_s
  vvp       : $vvp_s
  yosys     : $yosys_s
sandbox_mode: $mode
EOF
