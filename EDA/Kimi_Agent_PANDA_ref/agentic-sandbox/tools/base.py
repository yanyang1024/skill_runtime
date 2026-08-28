"""ToolAdapter 基类：EDA 工具适配器统一接口。

适配器只负责组装 argv / 收集 artifact；gate 判定统一由 pipeline（cli.run_flow）做。
"""

from __future__ import annotations

import shutil
from abc import ABC, abstractmethod
from pathlib import Path

from sandbox.contracts import StageResult
from sandbox.runner import SandboxRunner


class ToolAdapter(ABC):
    """工具适配器基类。"""

    name: str = ""
    #: 该工具日志中的额外致命标记（并入 sentinel）
    fatal_markers: list[str] = []

    @abstractmethod
    def available(self) -> bool:
        """工具二进制是否可用。"""
        ...

    @abstractmethod
    def run(self, runner: SandboxRunner, inputs: dict[str, str],
            workdir: Path) -> StageResult:
        """执行工具并返回 StageResult（status 由 pipeline 的 gate 最终判定）。"""
        ...

    @staticmethod
    def _which(binary: str) -> bool:
        return shutil.which(binary) is not None
