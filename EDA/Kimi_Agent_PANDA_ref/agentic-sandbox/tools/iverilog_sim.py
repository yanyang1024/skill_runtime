"""iverilog + vvp 仿真适配器：先编译再运行，两段都算。"""

from __future__ import annotations

from pathlib import Path

from sandbox.contracts import StageResult
from sandbox.runner import SandboxRunner

from .base import ToolAdapter


class IverilogSimAdapter(ToolAdapter):
    """`iverilog -g2012 -o <out> <rtl> <tb>` 之后 `vvp <out>`。"""

    name = "iverilog_sim"
    fatal_markers = ["ERROR", "MISMATCH"]

    def available(self) -> bool:
        return self._which("iverilog") and self._which("vvp")

    def run(self, runner: SandboxRunner, inputs: dict[str, str],
            workdir: Path) -> StageResult:
        rtl, tb = inputs.get("rtl"), inputs.get("tb")
        if not rtl or not tb:
            return StageResult(stage_id="", ok=False, status="contract_error")
        out_rel = "sim.out"
        # 第一段：编译
        compile_res = runner.run(["iverilog", "-g2012", "-o", out_rel, rtl, tb])
        if compile_res.returncode != 0:
            return StageResult(stage_id="", ok=False, status="ok",
                               run=compile_res,
                               artifacts={"binary": out_rel})
        # 第二段：运行仿真
        sim_res = runner.run(["vvp", out_rel])
        return StageResult(stage_id="", ok=sim_res.returncode == 0, status="ok",
                           run=sim_res, artifacts={"binary": out_rel})
