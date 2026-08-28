"""日志哨兵：扫描日志中的致命标记。

原则：returncode==0 且 sentinel.clean 才算真正成功（gate 判定在 contracts.py）。
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class SentinelReport:
    """扫描结果：clean=True 表示未命中任何标记。"""

    clean: bool
    fatal_hits: list[tuple[int, str]]  # (行号, 命中行)


class Sentinel:
    """按行扫描日志，命中默认/自定义 marker 且未被 ignore 抵消即为脏。"""

    DEFAULT_MARKERS = ["FAILED", "fatal", "terminate called", "std::out_of_range",
                       "Segmentation fault", "not found"]

    def __init__(self, markers: list[str] | None = None, ignore: list[str] = []):
        # markers 为 None 时使用默认标记；传入列表则完全替换默认
        self.markers = list(self.DEFAULT_MARKERS if markers is None else markers)
        self.ignore = list(ignore)

    def scan(self, text: str) -> SentinelReport:
        hits: list[tuple[int, str]] = []
        for lineno, line in enumerate(text.splitlines(), start=1):
            if any(ig in line for ig in self.ignore):
                continue  # 该行被 ignore 抵消
            if any(m in line for m in self.markers):
                hits.append((lineno, line))
        return SentinelReport(clean=not hits, fatal_hits=hits)
