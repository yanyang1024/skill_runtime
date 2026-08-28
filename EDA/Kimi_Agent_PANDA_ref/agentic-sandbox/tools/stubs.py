"""工具缺失时的显式 stub：绝不伪造成功。

返回 StageResult(status="tool_unavailable", ok=False)，由 pipeline 原样上报。
"""

from __future__ import annotations

from pathlib import Path

from sandbox.contracts import StageResult
from sandbox.runner import SandboxRunner

from .base import ToolAdapter


class StubAdapter(ToolAdapter):
    """显式 stub：available() 恒为 False，run() 直接报 tool_unavailable。"""

    def __init__(self, name: str):
        self.name = name

    def available(self) -> bool:
        return False

    def run(self, runner: SandboxRunner, inputs: dict[str, str],
            workdir: Path) -> StageResult:
        return StageResult(stage_id="", ok=False, status="tool_unavailable")


def unavailable_result(stage_id: str, tool_name: str) -> StageResult:
    """pipeline 便捷入口：生成显式 tool_unavailable 结果。"""
    return StageResult(stage_id=stage_id, ok=False, status="tool_unavailable")
