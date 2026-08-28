"""yosys 综合适配器：跑 stat 并解析 cell 数进 artifacts。"""

from __future__ import annotations

import re
from pathlib import Path

from sandbox.contracts import StageResult
from sandbox.runner import SandboxRunner

from .base import ToolAdapter


class YosysSynthAdapter(ToolAdapter):
    """`yosys -p "read_verilog <rtl>; synth; stat"`，解析 stat 的 cell 数。"""

    name = "yosys_synth"
    fatal_markers = ["ERROR"]

    def available(self) -> bool:
        return self._which("yosys")

    @staticmethod
    def _parse_cells(text: str) -> int | None:
        """从 yosys stat 输出解析 cell 总数。"""
        # 形如 "   Number of cells:              42"
        m = re.search(r"Number of cells:\s*(\d+)", text)
        if m:
            return int(m.group(1))
        return None

    def run(self, runner: SandboxRunner, inputs: dict[str, str],
            workdir: Path) -> StageResult:
        rtl = inputs.get("rtl")
        if not rtl:
            return StageResult(stage_id="", ok=False, status="contract_error")
        argv = ["yosys", "-p", f"read_verilog {rtl}; synth; stat"]
        result = runner.run(argv)
        artifacts: dict[str, str] = {}
        cells = self._parse_cells(result.stdout + "\n" + result.stderr)
        if cells is not None:
            artifacts["cell_count"] = str(cells)
        return StageResult(stage_id="", ok=result.returncode == 0,
                           status="ok", run=result, artifacts=artifacts)
