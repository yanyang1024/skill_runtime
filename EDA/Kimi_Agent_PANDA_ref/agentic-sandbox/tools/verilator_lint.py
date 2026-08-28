"""verilator --lint-only 适配器。"""

from __future__ import annotations

from pathlib import Path

from sandbox.contracts import StageResult
from sandbox.runner import SandboxRunner

from .base import ToolAdapter


class VerilatorLintAdapter(ToolAdapter):
    """运行 `verilator --lint-only -Wall <rtl>`。"""

    name = "verilator_lint"
    fatal_markers = ["%Error", "%Warning-"]

    def available(self) -> bool:
        return self._which("verilator")

    def run(self, runner: SandboxRunner, inputs: dict[str, str],
            workdir: Path) -> StageResult:
        rtl = inputs.get("rtl")
        if not rtl:
            return StageResult(stage_id="", ok=False, status="contract_error")
        argv = ["verilator", "--lint-only", "-Wall", rtl]
        result = runner.run(argv)
        return StageResult(stage_id="", ok=result.returncode == 0,
                           status="ok", run=result)
