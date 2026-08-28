"""任务契约 schema + 校验 + 失败策略（StageGate）。

失败策略写死在 gate 逻辑里，工具适配器无权放行：
- returncode 不在 allow_rc → tool_failed
- sentinel 命中 → sentinel_hit（即使 rc==0）
- 工具二进制不存在 → tool_unavailable（显式状态，绝不 mock 成功）
- 超时（rc==124）→ timeout
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

from .runner import RunResult
from .sentinel import Sentinel, SentinelReport

# stage 合法状态集合
STATUSES = {"ok", "tool_failed", "sentinel_hit", "tool_unavailable",
            "timeout", "contract_error"}
# on_fail 合法策略
ON_FAIL_POLICIES = {"stop", "continue"}


@dataclass
class StageResult:
    """单个 stage 的执行结果。"""

    stage_id: str
    ok: bool
    status: str  # 见 STATUSES
    run: RunResult | None = None
    report: SentinelReport | None = None
    artifacts: dict[str, str] = field(default_factory=dict)


@dataclass
class Stage:
    """契约中的一个 stage。"""

    id: str
    tool: str
    inputs: dict[str, str]
    gate: dict
    on_fail: str = "stop"


class Contract:
    """流水线契约：JSON 加载 + 结构校验。"""

    def __init__(self, name: str, stages: list[Stage], raw: dict | None = None):
        self.name = name
        self.stages = stages
        self.raw = raw or {}

    @staticmethod
    def load(path: Path) -> "Contract":
        """从 JSON 文件加载契约（结构错误会抛 ValueError）。"""
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            raise ValueError("契约顶层必须是 JSON 对象")
        stages = []
        for i, s in enumerate(data.get("stages", []) or []):
            stages.append(Stage(
                id=str(s.get("id", f"stage{i}")),
                tool=str(s.get("tool", "")),
                inputs=dict(s.get("inputs", {}) or {}),
                gate=dict(s.get("gate", {}) or {}),
                on_fail=str(s.get("on_fail", "stop")),
            ))
        return Contract(name=str(data.get("name", "")), stages=stages, raw=data)

    def validate(self) -> list[str]:
        """返回问题列表，空列表表示合法。"""
        problems: list[str] = []
        if not self.name:
            problems.append("缺少 name")
        if not self.stages:
            problems.append("stages 为空")
        seen: set[str] = set()
        for i, s in enumerate(self.stages):
            prefix = f"stages[{i}]({s.id})"
            if not s.id:
                problems.append(f"{prefix}: 缺少 id")
            elif s.id in seen:
                problems.append(f"{prefix}: id 重复")
            seen.add(s.id)
            if not s.tool:
                problems.append(f"{prefix}: 缺少 tool")
            if not isinstance(s.inputs, dict):
                problems.append(f"{prefix}: inputs 必须是对象")
            if s.on_fail not in ON_FAIL_POLICIES:
                problems.append(f"{prefix}: on_fail 必须是 {sorted(ON_FAIL_POLICIES)}")
            allow_rc = s.gate.get("allow_rc", [0])
            if not isinstance(allow_rc, list) or not all(
                    isinstance(x, int) for x in allow_rc):
                problems.append(f"{prefix}: gate.allow_rc 必须是 int 列表")
        return problems


def gate_stage(stage: Stage, result: StageResult,
               sentinel: Sentinel | None = None) -> StageResult:
    """统一 gate 判定：根据 rc + sentinel 修正 status/ok。适配器无权放行。"""
    run = result.run
    # 工具不可用 / 契约错误等显式状态直接保留（适配器已标注，gate 不覆盖）
    if result.status in ("tool_unavailable", "contract_error"):
        result.ok = False
        return result
    if run is None:
        result.ok = False
        result.status = "contract_error"
        return result

    allow_rc = stage.gate.get("allow_rc", [0])
    if run.returncode == 124:
        result.status = "timeout"
        result.ok = False
        return result
    if run.returncode not in allow_rc:
        result.status = "tool_failed"
        result.ok = False
    else:
        result.status = "ok"
        result.ok = True

    # sentinel 判定：rc==0 也可能被判 sentinel_hit
    if stage.gate.get("sentinel", False):
        extra = stage.gate.get("sentinel_extra_markers", [])
        sent = sentinel or Sentinel()
        if extra:
            sent = Sentinel(markers=sent.markers + list(extra), ignore=sent.ignore)
        report = sent.scan(run.stdout + "\n" + run.stderr)
        result.report = report
        if not report.clean:
            result.status = "sentinel_hit"
            result.ok = False
    return result
