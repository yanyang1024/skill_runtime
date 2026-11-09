#!/usr/bin/env python3
"""Verify extraction evidence, counts, style references and original asset hashes."""
from __future__ import annotations

import argparse
import json
import sys
import zipfile
from pathlib import Path
from typing import Any

from excel_common import (SCHEMA_VERSION, dump_json, iter_jsonl, load_json,
                          sha256_file, sheet_cell_path, split_coordinate, utc_now)


def run(args: argparse.Namespace) -> tuple[dict[str, Any], bool]:
    run_dir = args.run_dir.resolve()
    checks: list[dict[str, Any]] = []

    def check(name: str, condition: bool, detail: Any = "") -> None:
        checks.append({"name": name, "status": "passed" if condition else "failed", "detail": detail})

    required = ["manifest.json", "workbook.json", "styles.json", "assets.json", "package.json"]
    for name in required:
        check(f"required:{name}", (run_dir / name).is_file())
    if any(item["status"] == "failed" for item in checks):
        return {"status": "failed", "checks": checks}, True

    manifest = load_json(run_dir / "manifest.json")
    workbook = load_json(run_dir / "workbook.json")
    styles = load_json(run_dir / "styles.json")["styles"]
    assets_data = load_json(run_dir / "assets.json")
    source = run_dir / manifest["source_file"]
    check("source_exists", source.is_file())
    actual_hash = sha256_file(source)
    check("source_hash", actual_hash == manifest["source_sha256"], actual_hash)
    check("workbook_source_hash", workbook["source_sha256"] == actual_hash)

    total_cells = 0
    for sheet in workbook["sheets"]:
        path = sheet_cell_path(run_dir, sheet)
        check(f"cells_file:{sheet['name']}", path.is_file())
        if not path.is_file():
            continue
        count = 0
        bad_coordinates = []
        unknown_styles = set()
        for cell in iter_jsonl(path):
            count += 1
            try:
                row, column = split_coordinate(cell["cell"])
                if row != cell["row"] or column != cell["column"]:
                    bad_coordinates.append(cell["cell"])
            except (ValueError, KeyError):
                bad_coordinates.append(str(cell.get("cell")))
            if str(cell["style_id"]) not in styles:
                unknown_styles.add(str(cell["style_id"]))
        total_cells += count
        check(f"cell_count:{sheet['name']}", count == sheet["cell_count"],
              {"expected": sheet["cell_count"], "actual": count})
        check(f"coordinates:{sheet['name']}", not bad_coordinates, bad_coordinates[:20])
        check(f"style_references:{sheet['name']}", not unknown_styles, sorted(unknown_styles))
    check("workbook_cell_count", total_cells == workbook["cell_count"],
          {"expected": workbook["cell_count"], "actual": total_cells})

    seen_asset_ids = set()
    for asset in assets_data["placements"]:
        asset_id = asset["asset_id"]
        check(f"asset_id_unique:{asset_id}", asset_id not in seen_asset_ids)
        seen_asset_ids.add(asset_id)
        path = (run_dir / asset["file"]).resolve()
        check(f"asset_path_safe:{asset_id}", run_dir in path.parents and path.is_file())
        if path.is_file():
            check(f"asset_hash:{asset_id}", sha256_file(path) == asset["sha256"])
        if asset["status"] == "mapped":
            check(f"asset_anchor:{asset_id}", bool(asset.get("sheet") and asset.get("anchor", {}).get("from_cell")
                                                  if (asset.get("anchor") or {}).get("kind") != "absoluteAnchor"
                                                  else asset.get("sheet") and asset.get("anchor")))

    with zipfile.ZipFile(source) as archive:
        source_parts = [item for item in archive.infolist() if not item.is_dir()]
        package = load_json(run_dir / "package.json")["parts"]
        check("package_part_count", len(source_parts) == len(package),
              {"source": len(source_parts), "recorded": len(package)})
        source_crc = {item.filename: f"{item.CRC:08x}" for item in source_parts}
        recorded_crc = {item["part"]: item["crc"] for item in package}
        check("package_part_crcs", source_crc == recorded_crc)
        media_count = len([item for item in source_parts if item.filename.startswith("xl/media/")])
        check("media_part_count", media_count == assets_data["media_part_count"],
              {"source": media_count, "recorded": assets_data["media_part_count"]})

    regions_path = run_dir / "regions.json"
    if regions_path.exists():
        regions = load_json(regions_path)
        for sheet in regions.get("sheets", []):
            ids = [item["region_id"] for item in sheet.get("regions", [])]
            check(f"region_ids:{sheet['sheet']}", len(ids) == len(set(ids)))
    agent_manifest = run_dir / "agent" / "manifest.json"
    if agent_manifest.exists():
        agent = load_json(agent_manifest)
        check("agent_entrypoint", (run_dir / agent["entrypoint"]).is_file())
        missing = [path for path in agent.get("region_files", []) if not (run_dir / path).is_file()]
        check("agent_region_files", not missing, missing)

    failed = any(item["status"] == "failed" for item in checks)
    result = {"schema_version": SCHEMA_VERSION, "created_at": utc_now(),
              "status": "failed" if failed else "passed",
              "check_count": len(checks), "checks": checks}
    if args.output:
        dump_json(args.output, result)
    return result, failed


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run_dir", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    try:
        result, failed = run(args)
        print(json.dumps({"status": result["status"], "check_count": result["check_count"],
                          "failed_checks": [item for item in result["checks"] if item["status"] == "failed"]},
                         ensure_ascii=False))
        if failed:
            raise SystemExit(1)
    except Exception as exc:
        print(json.dumps({"status": "failed", "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
