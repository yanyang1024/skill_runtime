"""smoke 测试：纯标准库，`python tests/smoke.py` 直接可跑。

覆盖：
1. runner bare/bwrap 两种模式跑 echo 成功，timeout 路径返回 124
2. sentinel 对 "rc=0 但日志含 FAILED" 判 dirty
3. RunStore 单调递增 + hydrate 优先级
4. flow.rtl-basic.json validate() 无问题（文件缺失则 SKIP）
5. 工具缺失时 stage 状态为 tool_unavailable 且流水线按 on_fail=stop 停止
6. 端到端：有 iverilog 则 examples/counter 全绿；rtl_bad.v lint 必失败（有 verilator 时）
全部 PASS 打印 "SMOKE OK"，否则非零退出；SKIP 不算 FAIL。
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

# 仓库根目录入 sys.path，保证能 import sandbox / tools
REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT))

from sandbox import SandboxRunner, Sentinel, RunStore, Contract  # noqa: E402
from sandbox.contracts import Stage, StageResult, gate_stage  # noqa: E402
from tools.stubs import StubAdapter  # noqa: E402

RESULTS: list[tuple[str, str]] = []  # (用例名, PASS/FAIL/SKIP)


def check(name: str, cond: bool, detail: str = "") -> bool:
    status = "PASS" if cond else "FAIL"
    RESULTS.append((name, status))
    print(f"[{status}] {name}" + (f" -- {detail}" if detail else ""))
    return cond


def skip(name: str, reason: str) -> None:
    RESULTS.append((name, "SKIP"))
    print(f"[SKIP] {name} -- {reason}")


def test_runner(tmp: Path) -> None:
    runner = SandboxRunner(tmp, timeout_sec=5)
    mode = runner.run(["echo", "hello"]).sandbox_mode
    check("runner echo 成功", runner.run(["echo", "hello"]).returncode == 0
          and runner.run(["echo", "hello"]).stdout.strip() == "hello",
          f"mode={mode}")
    check("runner sandbox_mode 标注", mode in ("bwrap", "bare"), mode)
    r = runner.run(["sleep", "10"])
    check("runner timeout rc=124", r.returncode == 124, f"rc={r.returncode}")


def test_sentinel() -> None:
    s = Sentinel()
    rep = s.scan("编译完成\nrc=0\n但这里 FAILED 了\n")
    check("sentinel: rc=0 但含 FAILED 判 dirty", not rep.clean
          and rep.fatal_hits[0][0] == 3)
    rep2 = s.scan("一切正常\n")
    check("sentinel: 干净日志 clean", rep2.clean)


def test_runstore(tmp: Path) -> None:
    store = RunStore(tmp / "run")
    t1 = store.new_attempt()
    t2 = store.new_attempt()
    t3 = store.new_attempt()
    ok = [t.name for t in (t1, t2, t3)] == ["try1", "try2", "try3"]
    check("RunStore 单调递增不覆盖", ok)
    (t1 / "a.json").write_text(json.dumps({"v": 1}), encoding="utf-8")
    (t2 / "a.json").write_text(json.dumps({"v": 2}), encoding="utf-8")
    (t1 / "b.json").write_text(json.dumps({"v": "old"}), encoding="utf-8")
    got = store.hydrate(t3, ["a", "b", "missing"])
    check("RunStore hydrate 优先级(新到旧)",
          got.get("a", {}).get("v") == 2 and got.get("b", {}).get("v") == "old"
          and "missing" not in got, json.dumps(got, ensure_ascii=False))


def test_contract_validate() -> None:
    path = REPO_ROOT / "contracts" / "flow.rtl-basic.json"
    if not path.is_file():
        skip("flow.rtl-basic.json validate", "contracts/flow.rtl-basic.json 缺失（其他 agent 负责）")
        return
    c = Contract.load(path)
    problems = c.validate()
    check("flow.rtl-basic.json validate 无问题", not problems, ";".join(problems))


def test_tool_unavailable_gate(tmp: Path) -> None:
    """工具缺失 -> tool_unavailable；gate 不被适配器左右。"""
    stub = StubAdapter("nonexistent_tool")
    res = stub.run(SandboxRunner(tmp), {}, tmp)
    check("stub 显式 tool_unavailable",
          res.status == "tool_unavailable" and not res.ok)
    # gate: rc=0 但 sentinel 命中 -> sentinel_hit
    from sandbox.runner import RunResult
    fake = RunResult(argv=["x"], returncode=0, stdout="仿真 FAILED\n",
                     stderr="", sandbox_mode="bare", duration_sec=0.0)
    stage = Stage(id="sim", tool="iverilog_sim", inputs={},
                  gate={"sentinel": True, "allow_rc": [0]})
    r = gate_stage(stage, StageResult(stage_id="sim", ok=True, status="ok", run=fake))
    check("gate: rc=0+sentinel命中 -> sentinel_hit",
          r.status == "sentinel_hit" and not r.ok)
    # gate: timeout
    fake_timeout = RunResult(argv=["x"], returncode=124, stdout="", stderr="",
                             sandbox_mode="bare", duration_sec=0.0)
    r2 = gate_stage(stage, StageResult(stage_id="sim", ok=True, status="ok",
                                       run=fake_timeout))
    check("gate: rc=124 -> timeout", r2.status == "timeout" and not r2.ok)
    # gate: rc 不在 allow_rc -> tool_failed
    fake_rc = RunResult(argv=["x"], returncode=2, stdout="", stderr="",
                        sandbox_mode="bare", duration_sec=0.0)
    r3 = gate_stage(stage, StageResult(stage_id="x", ok=True, status="ok", run=fake_rc))
    check("gate: rc 不在 allow_rc -> tool_failed", r3.status == "tool_failed")

    # 端到端 on_fail=stop：清空 PATH 模拟工具缺失，流水线第一阶段即停
    import os
    empty_bin = tmp / "empty_bin"
    empty_bin.mkdir()
    env = dict(os.environ, PATH=str(empty_bin))
    contract_path = tmp / "flow.bad.json"
    contract_path.write_text(json.dumps({
        "name": "bad", "stages": [
            {"id": "s1", "tool": "verilator_lint", "inputs": {"rtl": "x.v"},
             "gate": {"sentinel": True, "allow_rc": [0]}, "on_fail": "stop"},
            {"id": "s2", "tool": "yosys_synth", "inputs": {"rtl": "x.v"},
             "gate": {"allow_rc": [0]}, "on_fail": "stop"}]}), encoding="utf-8")
    proc = subprocess.run(
        [sys.executable, "-m", "sandbox.cli", "run", str(contract_path),
         "--workspace", str(tmp / "ws")],
        cwd=str(REPO_ROOT), capture_output=True, text=True, env=env)
    out = proc.stdout + proc.stderr
    check("流水线: 工具缺失 on_fail=stop 即停且退出码 1",
          proc.returncode == 1 and "tool_unavailable" in out and "[s2]" not in proc.stdout,
          f"rc={proc.returncode}")


def test_e2e_counter(tmp: Path) -> None:
    example = REPO_ROOT / "examples" / "counter"
    flow = example / "flow.json"
    if not (example / "rtl.v").is_file() or not flow.is_file():
        skip("端到端 examples/counter", "examples/counter 缺失（其他 agent 负责）")
        return
    if shutil.which("iverilog") and shutil.which("vvp"):
        proc = subprocess.run(
            [sys.executable, "-m", "sandbox.cli", "run", str(flow),
             "--workspace", str(REPO_ROOT)],
            cwd=str(REPO_ROOT), capture_output=True, text=True)
        check("端到端: counter 全绿", proc.returncode == 0,
              (proc.stdout + proc.stderr).strip().splitlines()[-1]
              if (proc.stdout or proc.stderr) else "")
    else:
        skip("端到端: counter 全绿", "iverilog/vvp 缺失")
    if shutil.which("verilator"):
        bad_contract = tmp / "flow.badlint.json"
        bad_contract.write_text(json.dumps({
            "name": "badlint", "stages": [
                {"id": "lint", "tool": "verilator_lint",
                 "inputs": {"rtl": "examples/counter/rtl_bad.v"},
                 "gate": {"sentinel": True, "allow_rc": [0]}, "on_fail": "stop"}]}),
            encoding="utf-8")
        proc = subprocess.run(
            [sys.executable, "-m", "sandbox.cli", "run", str(bad_contract),
             "--workspace", str(REPO_ROOT)],
            cwd=str(REPO_ROOT), capture_output=True, text=True)
        check("端到端: rtl_bad.v lint 必失败", proc.returncode == 1
              and "ok=False" in proc.stdout, proc.stdout.strip().splitlines()[-1]
              if proc.stdout else "")
    else:
        skip("端到端: rtl_bad.v lint 必失败", "verilator 缺失")


def main() -> int:
    print(f"sandbox_mode={'bwrap' if SandboxRunner.bwrap_available() else 'bare'}")
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        test_runner(tmp)
        test_sentinel()
        test_runstore(tmp)
        test_contract_validate()
        test_tool_unavailable_gate(tmp)
        test_e2e_counter(tmp)
    fails = [n for n, s in RESULTS if s == "FAIL"]
    skips = sum(1 for _, s in RESULTS if s == "SKIP")
    print(f"\n合计 {len(RESULTS)} 项: PASS {sum(1 for _, s in RESULTS if s == 'PASS')}"
          f"  FAIL {len(fails)}  SKIP {skips}")
    if fails:
        print("SMOKE FAIL: " + ", ".join(fails))
        return 1
    print("SMOKE OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
