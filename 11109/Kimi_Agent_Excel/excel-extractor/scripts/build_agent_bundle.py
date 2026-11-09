#!/usr/bin/env python3
"""Build bounded, sparse Markdown views for agents without discarding the full JSON evidence."""
from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

from excel_common import (SCHEMA_VERSION, a1_range, dump_json, iter_jsonl, load_json,
                          read_regions, safe_name, sheet_cell_path, split_coordinate, utc_now)


def region_bounds(region: dict[str, Any], cells: list[dict[str, Any]]) -> tuple[int, int, int, int]:
    if "min_row" in region:
        return region["min_row"], region["min_column"], region["max_row"], region["max_column"]
    if region.get("range"):
        parts = region["range"].split(":", 1)
        min_row, min_col = split_coordinate(parts[0])
        max_row, max_col = split_coordinate(parts[-1])
        return min_row, min_col, max_row, max_col
    return (min(c["row"] for c in cells), min(c["column"] for c in cells),
            max(c["row"] for c in cells), max(c["column"] for c in cells))


def text_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.replace("\n", "\\n").replace("\r", "")
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def style_summary(style: dict[str, Any]) -> str:
    font = style.get("font", {})
    fill = style.get("fill", {})
    color = (fill.get("fg_color") or {}).get("resolved_argb")
    raw_color = fill.get("fg_color") or {}
    fields = []
    if fill.get("pattern_type"):
        fields.append(f"fill={color or raw_color.get('type') or raw_color.get('rgb') or 'unknown'}")
    if font.get("size") is not None:
        fields.append(f"font_size={font['size']}")
    if font.get("name"):
        fields.append(f"font={font['name']}")
    if font.get("bold"):
        fields.append("bold")
    if font.get("italic"):
        fields.append("italic")
    if font.get("strike"):
        fields.append("strike")
    font_color = (font.get("color") or {}).get("resolved_argb")
    if font_color:
        fields.append(f"font_color={font_color}")
    if style.get("number_format") and style["number_format"] != "General":
        fields.append(f"number_format={style['number_format']}")
    alignment = style.get("alignment", {})
    if alignment.get("horizontal"):
        fields.append(f"align={alignment['horizontal']}")
    if alignment.get("wrap_text"):
        fields.append("wrap")
    return ", ".join(fields) or "default/no explicit visual summary"


def run(args: argparse.Namespace) -> dict[str, Any]:
    run_dir = args.run_dir.resolve()
    workbook = load_json(run_dir / "workbook.json")
    manifest = load_json(run_dir / "manifest.json")
    styles = load_json(run_dir / "styles.json")["styles"]
    assets = load_json(run_dir / "assets.json")["placements"] if (run_dir / "assets.json").exists() else []
    regions_by_sheet = read_regions(run_dir)
    output_root = run_dir / "agent"
    region_root = output_root / "regions"
    region_root.mkdir(parents=True, exist_ok=True)
    agent_files = []
    overview_regions = defaultdict(list)

    for sheet in workbook["sheets"]:
        cells = list(iter_jsonl(sheet_cell_path(run_dir, sheet)))
        regions = regions_by_sheet.get(sheet["name"], [])
        if not regions and cells:
            regions = [{"region_id": "whole-sheet", "kind": "whole_sheet_fallback", "range": None,
                        "confidence": "not_detected"}]
        for region in regions:
            min_row, min_col, max_row, max_col = region_bounds(region, cells)
            selected = [c for c in cells if min_row <= c["row"] <= max_row
                        and min_col <= c["column"] <= max_col]
            truncated = max(0, len(selected) - args.max_cells)
            selected = selected[:args.max_cells]
            used_styles = sorted({str(c["style_id"]) for c in selected}, key=int)
            by_row: dict[int, list[dict[str, Any]]] = defaultdict(list)
            for cell in selected:
                by_row[cell["row"]].append(cell)
            actual_range = a1_range(min_row, min_col, max_row, max_col)
            lines = [
                f"# {sheet['name']} / {region['region_id']}",
                "",
                f"- 区域：`{actual_range}`",
                f"- 类型：`{region.get('kind', 'unknown')}`；置信标记：`{region.get('confidence', 'unknown')}`",
                "- 坐标与样式 ID 是事实；区域边界可能是启发式候选。完整数据见上级 `sheets/`、`styles.json`。",
                "",
                "## 本区域样式图例",
                "",
            ]
            for style_id in used_styles:
                lines.append(f"- `s{style_id}`：{style_summary(styles.get(style_id, {}))}")
            lines.extend(["", "## 稀疏单元格视图", "",
                          "格式：`坐标=值 [s样式ID]`；公式以 `ƒ(...)` 保留。空单元格未列出，除非它因样式/合并在完整 JSONL 中存在。", ""])
            for row in sorted(by_row):
                parts = []
                for cell in sorted(by_row[row], key=lambda item: item["column"]):
                    value = text_value(cell["value"])
                    formula = f" ƒ({text_value(cell['formula'])})" if cell.get("formula") else ""
                    missing = " [missing_cached_value]" if cell.get("value_status") == "missing_cache" else ""
                    hidden = " [hidden]" if cell.get("hidden") else ""
                    merged = f" [merge={cell['merged_range']}]" if cell.get("merged_range") else ""
                    parts.append(f"{cell['cell']}={value}{formula} [s{cell['style_id']}]{missing}{hidden}{merged}")
                lines.append(f"- r{row}: " + " | ".join(parts))
            if truncated:
                lines.extend(["", f"**视图已截断：另有 {truncated} 个已存储单元格未显示。提高 --max-cells 或直接分页读取 JSONL。**"])
            related_assets = []
            for asset in assets:
                anchor = asset.get("anchor") or {}
                from_cell = anchor.get("from_cell")
                if asset.get("sheet") != sheet["name"] or not from_cell:
                    continue
                row, column = split_coordinate(from_cell)
                if min_row <= row <= max_row and min_col <= column <= max_col:
                    related_assets.append(asset)
            if related_assets:
                lines.extend(["", "## 图片证据", ""])
                for asset in related_assets:
                    lines.append(f"- `{asset['asset_id']}`：`{asset['file']}`；锚点 `{asset['anchor'].get('from_cell')}`；原始 SHA-256 `{asset['sha256']}`")
                    vision_path = run_dir / "vision" / f"{asset['asset_id']}.json"
                    if vision_path.exists():
                        vision = load_json(vision_path)
                        if vision.get("status") == "success":
                            lines.append(f"  - 视觉结果：`vision/{asset['asset_id']}.json`（模型生成，需与原图核对）")
            file_name = f"{safe_name(sheet['name'])}__{safe_name(region['region_id'])}.md"
            path = region_root / file_name
            path.write_text("\n".join(lines) + "\n", encoding="utf-8")
            relative = str(path.relative_to(run_dir))
            agent_files.append(relative)
            overview_regions[sheet["name"]].append({"region_id": region["region_id"],
                                                     "range": actual_range, "file": relative})

    overview = [
        f"# 工作簿 Agent 导航：{manifest['input_name']}", "",
        f"- 源文件：`{manifest['source_file']}`",
        f"- 源 SHA-256：`{manifest['source_sha256']}`",
        f"- 提取状态：`{manifest['status']}`",
        "- 此目录是紧凑视图，不是无损事实源；原文件、OOXML 元数据、JSONL 和原始图片优先。",
        "- 公式值可能只是上次保存的缓存，本技能未重算。", "",
        "## 工作表与区域", "",
    ]
    for sheet in workbook["sheets"]:
        overview.append(f"### {sheet['name']}")
        overview.append("")
        overview.append(f"- 状态：`{sheet['state']}`；范围：`{sheet['dimension']}`；存储单元格：{sheet['cell_count']}")
        for region in overview_regions.get(sheet["name"], []):
            overview.append(f"- `{region['region_id']}` `{region['range']}`：`{region['file']}`")
        overview.append("")
    orphans = [asset for asset in assets if asset.get("status") == "orphan_media"]
    if orphans:
        overview.extend(["## 未定位图片", "", "这些图片字节已保留，但不能声称已恢复 sheet/单元格位置。", ""])
        for asset in orphans:
            overview.append(f"- `{asset['asset_id']}`：`{asset['file']}`；part `{asset['media_part']}`")
        overview.append("")
    if manifest.get("warnings"):
        overview.extend(["## 提取警告", ""])
        for warning in manifest["warnings"]:
            overview.append(f"- `{warning['code']}`：{warning.get('message', '')}")
    (output_root / "overview.md").write_text("\n".join(overview) + "\n", encoding="utf-8")
    agent_manifest = {"schema_version": SCHEMA_VERSION, "created_at": utc_now(),
                      "entrypoint": "agent/overview.md", "region_files": agent_files,
                      "lossless_source": manifest["source_file"], "full_workbook": "workbook.json"}
    dump_json(output_root / "manifest.json", agent_manifest)
    return {"status": "success", "entrypoint": str(output_root / "overview.md"),
            "region_file_count": len(agent_files)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run_dir", type=Path)
    parser.add_argument("--max-cells", type=int, default=1000, help="Maximum stored cells shown per region")
    args = parser.parse_args()
    try:
        print(json.dumps(run(args), ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({"status": "failed", "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
