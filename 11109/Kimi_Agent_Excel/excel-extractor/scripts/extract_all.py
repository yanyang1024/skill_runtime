#!/usr/bin/env python3
"""Run extract → regions → optional render/vision → agent bundle → verification."""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

from excel_common import dump_json, load_json, utc_now


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--include-ooxml", action="store_true")
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument("--render", choices=("none", "pdf", "png"), default="none")
    parser.add_argument("--vision", action="store_true", help="Describe all extracted images; requires API configuration")
    parser.add_argument("--vision-model", default="")
    parser.add_argument("--vision-base-url", default="")
    parser.add_argument("--vision-json-mode", action="store_true")
    parser.add_argument("--max-cells", type=int, default=1000)
    args = parser.parse_args()
    scripts = Path(__file__).resolve().parent
    run_dir = args.output.resolve()
    steps = []

    def execute(name: str, command: list[str]) -> None:
        result = subprocess.run(command, text=True, capture_output=True)
        record = {"step": name, "returncode": result.returncode,
                  "stdout": result.stdout[-8000:], "stderr": result.stderr[-8000:]}
        steps.append(record)
        if result.returncode != 0:
            dump_json(run_dir / "pipeline.json", {"status": "failed", "failed_step": name,
                                                  "created_at": utc_now(), "steps": steps})
            print(json.dumps({"status": "failed", "failed_step": name,
                              "detail": record}, ensure_ascii=False), file=sys.stderr)
            raise SystemExit(result.returncode)

    extract = [sys.executable, str(scripts / "extract_excel.py"), str(args.input), str(run_dir)]
    if args.include_ooxml:
        extract.append("--include-ooxml")
    if args.overwrite:
        extract.append("--overwrite")
    execute("extract", extract)
    execute("regions", [sys.executable, str(scripts / "detect_regions.py"), str(run_dir)])
    if args.render != "none":
        execute("render", [sys.executable, str(scripts / "render_excel.py"), str(run_dir),
                           "--format", args.render])
    if args.vision:
        vision = [sys.executable, str(scripts / "vision_describe.py"), str(run_dir), "--all"]
        if args.vision_model:
            vision += ["--model", args.vision_model]
        if args.vision_base_url:
            vision += ["--base-url", args.vision_base_url]
        if args.vision_json_mode:
            vision.append("--json-mode")
        execute("vision", vision)
    execute("agent_bundle", [sys.executable, str(scripts / "build_agent_bundle.py"), str(run_dir),
                             "--max-cells", str(args.max_cells)])
    execute("verify", [sys.executable, str(scripts / "verify_run.py"), str(run_dir),
                       "--output", str(run_dir / "verification.json")])
    extraction = load_json(run_dir / "manifest.json")
    regions = load_json(run_dir / "regions.json")
    render_path = run_dir / "renders" / "render_manifest.json"
    has_warnings = bool(extraction.get("warnings") or regions.get("warnings") or
                        (render_path.exists() and load_json(render_path).get("warnings")))
    status = "success_with_warnings" if has_warnings else "success"
    summary = {"status": status, "created_at": utc_now(), "run_dir": str(run_dir),
               "entrypoint": str(run_dir / "agent" / "overview.md"), "steps": steps}
    dump_json(run_dir / "pipeline.json", summary)
    print(json.dumps({"status": status, "run_dir": str(run_dir),
                      "entrypoint": summary["entrypoint"],
                      "completed_steps": [item["step"] for item in steps]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
