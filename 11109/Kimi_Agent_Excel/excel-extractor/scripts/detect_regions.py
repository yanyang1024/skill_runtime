#!/usr/bin/env python3
"""Detect table/region candidates using values and styled-empty cells; results are heuristic."""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any

from excel_common import (SCHEMA_VERSION, a1_range, dump_json, iter_jsonl, load_json,
                          sheet_cell_path, utc_now)


def bounds(cells: list[dict[str, Any]]) -> tuple[int, int, int, int]:
    return (min(c["row"] for c in cells), min(c["column"] for c in cells),
            max(c["row"] for c in cells), max(c["column"] for c in cells))


def split_blank_lines(cells: list[dict[str, Any]], axis: str, depth: int = 0) -> list[list[dict[str, Any]]]:
    """Recursively split only on fully blank rows/columns inside the current candidate."""
    if not cells or depth > 30:
        return [cells]
    min_row, min_col, max_row, max_col = bounds(cells)
    if axis == "row" and min_row < max_row:
        occupied = {c["row"] for c in cells}
        groups: list[list[int]] = []
        current: list[int] = []
        for row in range(min_row, max_row + 1):
            if row in occupied:
                current.append(row)
            elif current:
                groups.append(current)
                current = []
        if current:
            groups.append(current)
        if len(groups) > 1:
            result = []
            for group in groups:
                subset = [c for c in cells if group[0] <= c["row"] <= group[-1]]
                result.extend(split_blank_lines(subset, "column", depth + 1))
            return result
    if axis == "column" and min_col < max_col:
        occupied = {c["column"] for c in cells}
        groups = []
        current = []
        for column in range(min_col, max_col + 1):
            if column in occupied:
                current.append(column)
            elif current:
                groups.append(current)
                current = []
        if current:
            groups.append(current)
        if len(groups) > 1:
            result = []
            for group in groups:
                subset = [c for c in cells if group[0] <= c["column"] <= group[-1]]
                result.extend(split_blank_lines(subset, "row", depth + 1))
            return result
    # Try the other axis before declaring an indivisible region.
    other = "column" if axis == "row" else "row"
    min_a, min_b = (min_row, max_row) if other == "row" else (min_col, max_col)
    occupied_other = {c[other] for c in cells}
    if min_a < min_b and any(index not in occupied_other for index in range(min_a, min_b + 1)):
        return split_blank_lines(cells, other, depth + 1)
    return [cells]


def candidate(cells: list[dict[str, Any]], region_id: str, min_nonempty: int) -> dict[str, Any] | None:
    nonempty = [c for c in cells if c["value"] is not None or c.get("formula")]
    if len(nonempty) < min_nonempty:
        return None
    min_row, min_col, max_row, max_col = bounds(cells)
    area = (max_row - min_row + 1) * (max_col - min_col + 1)
    density = len(cells) / area if area else 0
    value_density = len(nonempty) / area if area else 0
    # This is a triage score, not calibrated probability.
    score = min(0.95, 0.30 + min(0.25, math.log10(len(nonempty) + 1) * 0.12)
                + min(0.25, value_density * 0.35) + min(0.15, density * 0.15))
    confidence = "high" if score >= 0.72 else "medium" if score >= 0.52 else "low"
    return {
        "region_id": region_id, "kind": "heuristic_candidate",
        "range": a1_range(min_row, min_col, max_row, max_col),
        "min_row": min_row, "min_column": min_col, "max_row": max_row, "max_column": max_col,
        "cell_count": len(cells), "nonempty_count": len(nonempty),
        "styled_empty_count": len(cells) - len(nonempty),
        "occupied_density": round(density, 4), "value_density": round(value_density, 4),
        "score": round(score, 3), "confidence": confidence,
        "confidence_kind": "heuristic_not_calibrated",
        "evidence": ["fully_blank_row_column_splits", "nonempty_cells", "styled_empty_cells"],
    }


def run(args: argparse.Namespace) -> dict[str, Any]:
    run_dir = args.run_dir.resolve()
    workbook = load_json(run_dir / "workbook.json")
    output_sheets = []
    total = 0
    warnings = []
    for sheet in workbook["sheets"]:
        if sheet["cell_count"] > args.max_cells:
            warnings.append({"sheet": sheet["name"], "code": "region_detection_skipped",
                             "message": f"Cell count {sheet['cell_count']} exceeds --max-cells={args.max_cells}"})
            output_sheets.append({"sheet": sheet["name"], "regions": []})
            continue
        cells = list(iter_jsonl(sheet_cell_path(run_dir, sheet)))
        occupied = [c for c in cells if c["value"] is not None or c.get("formula")
                    or (args.include_style_only and int(c["style_id"]) != 0)
                    or c.get("merged_range")]
        regions = []
        for table in sheet.get("tables", []):
            regions.append({"region_id": f"r{len(regions) + 1:03d}", "kind": "excel_table",
                            "range": table["ref"], "name": table["name"],
                            "confidence": "declared", "confidence_kind": "ooxml_table_definition",
                            "evidence": ["xl/tables table definition"]})
        declared_ranges = {item["range"] for item in regions}
        for group in split_blank_lines(occupied, "row"):
            item = candidate(group, f"r{len(regions) + 1:03d}", args.min_nonempty)
            if item and item["range"] not in declared_ranges:
                regions.append(item)
                declared_ranges.add(item["range"])
        total += len(regions)
        output_sheets.append({"sheet": sheet["name"], "occupied_cell_count": len(occupied),
                              "regions": regions})
    result = {
        "schema_version": SCHEMA_VERSION, "created_at": utc_now(),
        "method": "recursive_blank_line_split_v1",
        "limitations": [
            "Candidates are not guaranteed table boundaries or semantic headers.",
            "Adjacent tables without a fully blank row/column may remain merged.",
            "Merged titles, notes and footer rows may be included in a candidate.",
            "Use template-pinned ranges for repeated business-critical templates.",
        ],
        "warnings": warnings, "sheets": output_sheets,
    }
    dump_json(run_dir / "regions.json", result)
    return {"status": "success_with_warnings" if warnings else "success",
            "output": str(run_dir / "regions.json"), "region_count": total,
            "warnings": len(warnings)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run_dir", type=Path)
    parser.add_argument("--min-nonempty", type=int, default=3)
    parser.add_argument("--max-cells", type=int, default=250000)
    parser.add_argument("--exclude-style-only", dest="include_style_only", action="store_false")
    parser.set_defaults(include_style_only=True)
    args = parser.parse_args()
    try:
        print(json.dumps(run(args), ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({"status": "failed", "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
