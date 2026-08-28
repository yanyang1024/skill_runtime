"""bubblewrap 沙盒执行器（核心）。

职责：
- 优先使用 bwrap（bubblewrap）在隔离命名空间中执行命令；
- bwrap 不可用时降级为 bare 模式（直接 subprocess），并在结果中显式标注 sandbox_mode；
- run() 永不抛异常，所有失败（含超时 returncode=124）都进 RunResult。
"""

from __future__ import annotations

import os
import shutil
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path

# 环境变量白名单：只把这些变量（及用户显式传入的 env）带进沙盒
_ENV_WHITELIST = ("PATH", "HOME", "LANG", "LC_ALL", "LC_CTYPE", "TERM", "TMPDIR")


@dataclass
class RunResult:
    """一次命令执行的结果。returncode==124 表示超时。"""

    argv: list[str]
    returncode: int
    stdout: str
    stderr: str
    sandbox_mode: str  # "bwrap" | "bare"
    duration_sec: float = 0.0


class SandboxRunner:
    """沙盒执行器：workspace 会被 bind 到 /workspace。"""

    def __init__(self, workspace: Path, network: bool = False,
                 extra_ro_binds: list[str] = [], timeout_sec: int = 300):
        self.workspace = Path(workspace).resolve()
        self.network = network
        self.extra_ro_binds = list(extra_ro_binds)
        self.timeout_sec = timeout_sec

    @staticmethod
    def bwrap_available() -> bool:
        """检测 bubblewrap 是否可用。"""
        return shutil.which("bwrap") is not None

    def _base_env(self) -> dict:
        """按白名单构造环境变量。"""
        env = {k: v for k, v in os.environ.items() if k in _ENV_WHITELIST}
        env.setdefault("PATH", "/usr/bin:/bin")
        return env

    def _build_bwrap_argv(self, argv: list[str], cwd: str) -> list[str]:
        """组装 bwrap 命令行。"""
        cmd = ["bwrap"]
        if self.network:
            # 需要网络时保留 net namespace，其余仍然隔离
            cmd += ["--unshare-user", "--unshare-pid", "--unshare-ipc"]
        else:
            cmd += ["--unshare-all"]
        cmd += ["--ro-bind", "/", "/"]
        for src in self.extra_ro_binds:
            cmd += ["--ro-bind", src, src]
        cmd += ["--bind", str(self.workspace), "/workspace"]
        cmd += ["--chdir", f"/workspace/{cwd}"]
        cmd += ["--tmpfs", "/tmp", "--proc", "/proc", "--dev", "/dev"]
        cmd += ["--die-with-parent"]
        cmd += ["--"] + list(argv)
        return cmd

    def run(self, argv: list[str], cwd: str = ".", env: dict = {}) -> RunResult:
        """在沙盒中执行命令。永不抛异常，失败一律进 RunResult。"""
        merged_env = self._base_env()
        merged_env.update(env or {})
        start = time.monotonic()
        use_bwrap = self.bwrap_available()
        try:
            if use_bwrap:
                final_argv = self._build_bwrap_argv(argv, cwd)
                real_cwd = str(self.workspace)
            else:
                final_argv = list(argv)
                real_cwd = str(self.workspace / cwd)
            proc = subprocess.run(
                final_argv,
                cwd=real_cwd,
                env=merged_env,
                capture_output=True,
                text=True,
                timeout=self.timeout_sec,
            )
            returncode = proc.returncode
            stdout, stderr = proc.stdout, proc.stderr
        except subprocess.TimeoutExpired as exc:
            # 超时：按契约 returncode=124，尽力收集已有输出
            returncode = 124
            stdout = (exc.stdout or "") if isinstance(exc.stdout, str) else (
                exc.stdout.decode(errors="replace") if exc.stdout else "")
            stderr = (exc.stderr or "") if isinstance(exc.stderr, str) else (
                exc.stderr.decode(errors="replace") if exc.stderr else "")
            stderr += f"\n[sandbox] 超时 {self.timeout_sec}s，已终止"
        except Exception as exc:  # 永不抛异常
            returncode = 1
            stdout = ""
            stderr = f"[sandbox] 执行异常: {exc!r}"
        return RunResult(
            argv=list(argv),
            returncode=returncode,
            stdout=stdout,
            stderr=stderr,
            sandbox_mode="bwrap" if use_bwrap else "bare",
            duration_sec=time.monotonic() - start,
        )
