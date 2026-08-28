"""隔离 run 目录管理 + artifact hydration。

纪律：
- 每次 rerun 必须 new_attempt（try1/try2/... 单调递增，绝不覆盖）；
- hydrate 从当前 try_dir 向历史 try*（新到旧）查找 <name>.json，先找到的生效。
"""

from __future__ import annotations

import json
import re
from pathlib import Path


class RunStore:
    """管理 <root>/tryN 目录序列。"""

    def __init__(self, root: Path):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def _list_tries(self) -> list[Path]:
        """按编号升序列出已有 tryN 目录。"""
        tries = []
        for p in self.root.iterdir():
            m = re.fullmatch(r"try(\d+)", p.name)
            if p.is_dir() and m:
                tries.append((int(m.group(1)), p))
        return [p for _, p in sorted(tries)]

    def new_attempt(self) -> Path:
        """创建下一个 tryN 目录，绝不覆盖历史。"""
        tries = self._list_tries()
        nxt = int(tries[-1].name[3:]) + 1 if tries else 1
        d = self.root / f"try{nxt}"
        d.mkdir(parents=True, exist_ok=False)
        return d

    def hydrate(self, try_dir: Path, names: list[str]) -> dict:
        """按 try_dir -> 历史 try*（新到旧）顺序加载 <name>.json。

        每个 name 先找到的生效，返回 {name: payload}；找不到则不含该 key。
        """
        try_dir = Path(try_dir)
        tries = self._list_tries()
        # 从新到旧：仅考虑编号 <= 当前 try 的目录
        try:
            cur_no = int(try_dir.name[3:])
            candidates = [t for t in reversed(tries) if int(t.name[3:]) <= cur_no]
        except (ValueError, IndexError):
            candidates = list(reversed(tries))
        if try_dir not in candidates:
            candidates.insert(0, try_dir)

        result: dict = {}
        for name in names:
            for t in candidates:
                f = t / f"{name}.json"
                if f.is_file():
                    try:
                        result[name] = json.loads(f.read_text(encoding="utf-8"))
                    except (OSError, json.JSONDecodeError):
                        continue  # 损坏文件跳过，继续向更早历史查找
                    break
        return result
