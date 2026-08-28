"""asbox 命令行：doctor / run / exec / runs / tail。

退出码约定：流水线全绿 0，否则 1。
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

from .contracts import Contract, StageResult, gate_stage
from .runner import SandboxRunner
from .runs import RunStore
from .sentinel import Sentinel

# 工具适配器注册表（延迟导入，避免循环依赖）
def _tool_registry() -> dict:
    from tools.verilator_lint import VerilatorLintAdapter
    from tools.iverilog_sim import IverilogSimAdapter
    from tools.yosys_synth import YosysSynthAdapter
    adapters = [VerilatorLintAdapter(), IverilogSimAdapter(), YosysSynthAdapter()]
    return {a.name: a for a in adapters}


def _capability_matrix() -> dict:
    """体检：bwrap 与各 EDA 工具可用性。"""
    return {
        "bwrap": SandboxRunner.bwrap_available(),
        "verilator": shutil.which("verilator") is not None,
        "iverilog": shutil.which("iverilog") is not None,
        "vvp": shutil.which("vvp") is not None,
        "yosys": shutil.which("yosys") is not None,
    }


def cmd_doctor(args) -> int:
    """打印能力矩阵与 sandbox_mode。"""
    matrix = _capability_matrix()
    print("能力矩阵:")
    for k, v in matrix.items():
        print(f"  {k:10s}: {'可用' if v else '缺失'}")
    mode = "bwrap" if matrix["bwrap"] else "bare"
    print(f"sandbox_mode: {mode}" + ("" if mode == "bwrap" else "（降级裸跑，无隔离）"))
    return 0


def _write_stage_log(try_dir: Path, stage_id: str, result: StageResult) -> None:
    """把 stage 结果写入 <tryN>/<stage>.json，日志并入 run.log。"""
    payload = {
        "stage_id": result.stage_id,
        "ok": result.ok,
        "status": result.status,
        "artifacts": result.artifacts,
        "run": None if result.run is None else {
            "argv": result.run.argv,
            "returncode": result.run.returncode,
            "sandbox_mode": result.run.sandbox_mode,
            "duration_sec": round(result.run.duration_sec, 3),
        },
        "sentinel_hits": None if result.report is None else [
            {"line": n, "text": t} for n, t in result.report.fatal_hits],
    }
    (try_dir / f"{stage_id}.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    # 追加 run.log：记录执行轨迹与 hydrate 顺序之外的日志原文
    with (try_dir / "run.log").open("a", encoding="utf-8") as f:
        f.write(f"===== stage={stage_id} status={result.status} ok={result.ok} =====\n")
        if result.run is not None:
            f.write(f"$ {' '.join(result.run.argv)}  [rc={result.run.returncode}"
                    f" mode={result.run.sandbox_mode}]\n")
            if result.run.stdout:
                f.write("--- stdout ---\n" + result.run.stdout + "\n")
            if result.run.stderr:
                f.write("--- stderr ---\n" + result.run.stderr + "\n")
        if result.report and not result.report.clean:
            f.write("--- sentinel 命中 ---\n")
            for n, t in result.report.fatal_hits:
                f.write(f"  行{n}: {t}\n")


def cmd_run(args) -> int:
    """跑契约流水线：new_attempt -> 逐 stage 执行 -> gate -> 落盘结果。"""
    workspace = Path(args.workspace).resolve()
    workspace.mkdir(parents=True, exist_ok=True)
    try:
        contract = Contract.load(Path(args.contract))
    except (OSError, ValueError) as exc:
        print(f"[contract_error] 契约加载失败: {exc}", file=sys.stderr)
        return 1
    problems = contract.validate()
    if problems:
        for p in problems:
            print(f"[contract_error] {p}", file=sys.stderr)
        return 1

    registry = _tool_registry()
    store = RunStore(workspace / "run")
    try_dir = store.new_attempt()
    print(f"流水线 {contract.name} -> {try_dir} (sandbox_mode="
          f"{'bwrap' if SandboxRunner.bwrap_available() else 'bare'})")

    runner = SandboxRunner(workspace, network=args.network)
    all_ok = True
    for stage in contract.stages:
        adapter = registry.get(stage.tool)
        if adapter is None:
            result = StageResult(stage_id=stage.id, ok=False,
                                 status="contract_error")
        elif not adapter.available():
            # 显式 tool_unavailable，绝不伪造成功
            result = StageResult(stage_id=stage.id, ok=False,
                                 status="tool_unavailable")
        else:
            result = adapter.run(runner, stage.inputs, try_dir)
            result.stage_id = stage.id
            result = gate_stage(stage, result)
        _write_stage_log(try_dir, stage.id, result)
        print(f"  [{stage.id}] {result.status} ok={result.ok}")

        if args.interactive:
            # 人类 gate：逐 stage 确认
            while True:
                choice = input("  [c]ontinue/[s]top/[v]iew log ? ").strip().lower()
                if choice == "v":
                    log = try_dir / "run.log"
                    print(log.read_text(encoding="utf-8") if log.exists() else "(空)")
                elif choice in ("c", "s"):
                    break
            if choice == "s":
                all_ok = False
                print("人工停止。")
                break
        if not result.ok:
            all_ok = False
            if stage.on_fail == "stop":
                print(f"stage {stage.id} 失败，on_fail=stop，流水线停止。")
                break
    print(f"结果目录: {try_dir}")
    return 0 if all_ok else 1


def cmd_exec(args) -> int:
    """在沙盒里裸跑单条命令（调试用）。"""
    workspace = Path(args.workspace).resolve()
    workspace.mkdir(parents=True, exist_ok=True)
    runner = SandboxRunner(workspace, network=args.network,
                           timeout_sec=args.timeout)
    result = runner.run(args.cmd)
    sys.stdout.write(result.stdout)
    sys.stderr.write(result.stderr)
    print(f"[exec] rc={result.returncode} sandbox_mode={result.sandbox_mode}",
          file=sys.stderr)
    return result.returncode


def cmd_runs(args) -> int:
    """列出历史 attempt 及各 stage 状态。"""
    store = RunStore(Path(args.workspace).resolve() / "run")
    tries = store._list_tries()
    if args.last:
        tries = tries[-args.last:]
    if not tries:
        print("（无历史 run）")
        return 0
    for t in tries:
        stages = []
        for f in sorted(t.glob("*.json")):
            try:
                payload = json.loads(f.read_text(encoding="utf-8"))
                stages.append(f"{payload.get('stage_id', f.stem)}:{payload.get('status')}")
            except (OSError, json.JSONDecodeError):
                stages.append(f"{f.stem}:<损坏>")
        print(f"{t.name}: {'  '.join(stages) if stages else '(无 stage 结果)'}")
    return 0


def cmd_tail(args) -> int:
    """打印该 stage 的 JSON 结果 + run.log 尾部 + sentinel 命中行。"""
    try_dir = Path(args.try_dir)
    stage_file = try_dir / f"{args.stage}.json"
    if not stage_file.is_file():
        print(f"找不到 {stage_file}", file=sys.stderr)
        return 1
    payload = json.loads(stage_file.read_text(encoding="utf-8"))
    print(json.dumps(payload, ensure_ascii=False, indent=2))
    log = try_dir / "run.log"
    if log.is_file():
        lines = log.read_text(encoding="utf-8").splitlines()
        print("--- run.log 尾部 ---")
        for line in lines[-args.lines:]:
            print(line)
    hits = payload.get("sentinel_hits") or []
    if hits:
        print("--- sentinel 命中 ---")
        for h in hits:
            print(f"  行{h['line']}: {h['text']}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="asbox", description="agentic EDA 沙盒 CLI")
    sub = p.add_subparsers(dest="subcmd", required=True)

    sub.add_parser("doctor", help="能力矩阵体检").set_defaults(func=cmd_doctor)

    pr = sub.add_parser("run", help="跑契约流水线")
    pr.add_argument("contract", help="契约 JSON 路径")
    pr.add_argument("--workspace", default=".", help="工作区目录（默认当前目录）")
    pr.add_argument("--network", action="store_true", help="保留网络命名空间")
    pr.add_argument("--interactive", action="store_true",
                    help="人类 gate：每个 stage 后提示确认")
    pr.set_defaults(func=cmd_run)

    pe = sub.add_parser("exec", help="沙盒内裸跑单条命令")
    pe.add_argument("--workspace", default=".")
    pe.add_argument("--network", action="store_true")
    pe.add_argument("--timeout", type=int, default=300)
    pe.add_argument("cmd", nargs=argparse.REMAINDER, help="-- 之后的命令")
    pe.set_defaults(func=cmd_exec)

    ps = sub.add_parser("runs", help="列出历史 attempt")
    ps.add_argument("--workspace", default=".")
    ps.add_argument("--last", type=int, default=0, help="只显示最近 N 次")
    ps.set_defaults(func=cmd_runs)

    pt = sub.add_parser("tail", help="打印某 stage 日志尾部与 sentinel 命中")
    pt.add_argument("try_dir", help="如 run/try1")
    pt.add_argument("stage", help="stage id")
    pt.add_argument("--lines", type=int, default=40)
    pt.set_defaults(func=cmd_tail)
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if getattr(args, "subcmd", None) == "exec":
        # 去掉 REMAINDER 里可能残留的开头 "--"
        if args.cmd and args.cmd[0] == "--":
            args.cmd = args.cmd[1:]
        if not args.cmd:
            print("exec 需要在 -- 后给出命令", file=sys.stderr)
            return 1
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
