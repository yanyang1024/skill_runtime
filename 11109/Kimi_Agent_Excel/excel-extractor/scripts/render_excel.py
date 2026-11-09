#!/usr/bin/env python3
"""Render a preserved workbook through headless LibreOffice without saving back to XLSX."""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from excel_common import SCHEMA_VERSION, dump_json, load_json, sha256_file, utc_now


def require_tool(name: str) -> str:
    path = shutil.which(name)
    if not path:
        raise RuntimeError(f"tool_unavailable: {name} is required for this rendering mode")
    return path


def checked(command: list[str], timeout: int) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(command, text=True, capture_output=True, timeout=timeout)
    combined = (result.stdout + "\n" + result.stderr).strip()
    if result.returncode != 0:
        raise RuntimeError(f"Command failed ({result.returncode}): {combined[-4000:]}")
    return result


def run(args: argparse.Namespace) -> dict[str, str | int | list[str]]:
    run_dir = args.run_dir.resolve()
    manifest = load_json(run_dir / "manifest.json")
    source = run_dir / manifest["source_file"]
    before = sha256_file(source)
    output = args.output.resolve() if args.output else run_dir / "renders"
    output.mkdir(parents=True, exist_ok=True)
    soffice = require_tool("soffice")
    if args.format == "png":
        pdftoppm = require_tool("pdftoppm")
    with tempfile.TemporaryDirectory(prefix="excel-render-") as temp_name:
        temp = Path(temp_name)
        profile = temp / "profile"
        profile_uri = profile.resolve().as_uri()
        conversion = checked([
            soffice, f"-env:UserInstallation={profile_uri}", "--headless", "--norestore",
            "--convert-to", "pdf", "--outdir", str(temp), str(source),
        ], args.timeout)
        candidates = list(temp.glob("*.pdf"))
        if len(candidates) != 1 or candidates[0].stat().st_size == 0:
            raise RuntimeError("LibreOffice exited successfully but did not produce exactly one non-empty PDF")
        pdf_path = output / "workbook.pdf"
        shutil.copy2(candidates[0], pdf_path)
        png_files = []
        if args.format == "png":
            checked([pdftoppm, "-png", "-r", str(args.dpi), str(pdf_path), str(output / "page")], args.timeout)
            png_files = sorted(str(path.relative_to(output)) for path in output.glob("page-*.png"))
            if not png_files:
                raise RuntimeError("pdftoppm exited successfully but produced no PNG pages")
    if sha256_file(source) != before:
        raise RuntimeError("Source workbook bytes changed during rendering; result is rejected")
    render_manifest = {
        "schema_version": SCHEMA_VERSION, "created_at": utc_now(),
        "status": "success", "renderer": "libreoffice_headless_pdf",
        "source_sha256": before, "pdf": "workbook.pdf", "png_pages": png_files,
        "warnings": [
            "Rendering is a visual approximation, not byte-level proof of Excel fidelity.",
            "Print areas, page setup, fonts and pagination can hide or rearrange content.",
            "LibreOffice output was not saved back into the source workbook.",
        ],
        "converter_stdout": conversion.stdout[-4000:], "converter_stderr": conversion.stderr[-4000:],
    }
    dump_json(output / "render_manifest.json", render_manifest)
    return {"status": "success", "output": str(output), "pdf": str(pdf_path),
            "png_page_count": len(png_files), "warnings": len(render_manifest["warnings"])}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run_dir", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--format", choices=("pdf", "png"), default="pdf")
    parser.add_argument("--dpi", type=int, default=144)
    parser.add_argument("--timeout", type=int, default=180)
    args = parser.parse_args()
    try:
        print(json.dumps(run(args), ensure_ascii=False))
    except (RuntimeError, subprocess.TimeoutExpired, OSError, KeyError) as exc:
        print(json.dumps({"status": "failed", "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
