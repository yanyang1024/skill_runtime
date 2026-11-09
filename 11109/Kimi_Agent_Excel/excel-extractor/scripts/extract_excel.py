#!/usr/bin/env python3
"""Extract XLSX/XLSM cells, styles, drawings and source evidence without rewriting the input."""
from __future__ import annotations

import argparse
import colorsys
import json
import mimetypes
import os
import posixpath
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET

from openpyxl import load_workbook
from openpyxl.styles.colors import COLOR_INDEX
from openpyxl.utils import get_column_letter

from excel_common import (SCHEMA_VERSION, a1_range, coordinate, dump_json, json_value,
                          safe_name, sha256_bytes, sha256_file, utc_now)

SS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
DOC_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships"
XDR = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
A = "http://schemas.openxmlformats.org/drawingml/2006/main"
NS = {"s": SS, "r": DOC_REL, "xdr": XDR, "a": A, "pr": PKG_REL}
R_ID = f"{{{DOC_REL}}}id"
R_EMBED = f"{{{DOC_REL}}}embed"


def resolve_part(source_part: str, target: str) -> str:
    if target.startswith("/"):
        return posixpath.normpath(target.lstrip("/"))
    return posixpath.normpath(posixpath.join(posixpath.dirname(source_part), target))


def rels_part(part: str) -> str:
    return posixpath.join(posixpath.dirname(part), "_rels", posixpath.basename(part) + ".rels")


def relationships(archive: zipfile.ZipFile, source_part: str) -> dict[str, dict[str, str]]:
    path = rels_part(source_part)
    if path not in archive.namelist():
        return {}
    root = ET.fromstring(archive.read(path))
    result = {}
    for rel in root.findall(f"{{{PKG_REL}}}Relationship"):
        result[rel.attrib["Id"]] = {
            "target": rel.attrib.get("Target", ""),
            "mode": rel.attrib.get("TargetMode", "Internal"),
            "type": rel.attrib.get("Type", ""),
        }
    return result


def color_dict(color: Any, theme_colors: list[str]) -> dict[str, Any] | None:
    if color is None:
        return None
    kind = getattr(color, "type", None)
    result: dict[str, Any] = {"type": kind}
    # openpyxl descriptors return typed error objects for irrelevant color fields.
    if kind == "rgb" and isinstance(getattr(color, "rgb", None), str):
        result["rgb"] = color.rgb
    elif kind == "indexed" and isinstance(getattr(color, "indexed", None), int):
        result["indexed"] = color.indexed
    elif kind == "theme" and isinstance(getattr(color, "theme", None), int):
        result["theme"] = color.theme
    if isinstance(getattr(color, "tint", None), (int, float)):
        result["tint"] = color.tint
    if isinstance(getattr(color, "auto", None), bool):
        result["auto"] = color.auto
    resolved = None
    resolution = "unresolved"
    try:
        if getattr(color, "type", None) == "rgb" and getattr(color, "rgb", None):
            resolved = str(color.rgb).upper()
            resolution = "exact_rgb"
        elif getattr(color, "type", None) == "indexed":
            index = int(color.indexed)
            if 0 <= index < len(COLOR_INDEX):
                resolved = COLOR_INDEX[index].upper()
                resolution = "exact_indexed"
        elif getattr(color, "type", None) == "theme":
            index = int(color.theme)
            if 0 <= index < len(theme_colors):
                base = theme_colors[index].lstrip("#")
                rgb = base[-6:]
                channels = [int(rgb[i:i + 2], 16) / 255 for i in (0, 2, 4)]
                tint = float(getattr(color, "tint", 0) or 0)
                if tint:
                    hue, lightness, saturation = colorsys.rgb_to_hls(*channels)
                    lightness = lightness * (1 + tint) if tint < 0 else lightness * (1 - tint) + tint
                    channels = colorsys.hls_to_rgb(hue, max(0, min(1, lightness)), saturation)
                    resolution = "theme_tint_approximation"
                else:
                    resolution = "exact_theme"
                resolved = "FF" + "".join(f"{round(max(0, min(1, c)) * 255):02X}" for c in channels)
    except (TypeError, ValueError, IndexError):
        pass
    result["resolved_argb"] = resolved
    result["resolution"] = resolution
    return result


def theme_colors(workbook: Any) -> list[str]:
    if not workbook.loaded_theme:
        return []
    try:
        root = ET.fromstring(workbook.loaded_theme)
        scheme = root.find(".//a:clrScheme", NS)
        if scheme is None:
            return []
        by_name: dict[str, str] = {}
        for child in list(scheme):
            name = child.tag.rsplit("}", 1)[-1]
            srgb = child.find("a:srgbClr", NS)
            system = child.find("a:sysClr", NS)
            value = srgb.attrib.get("val") if srgb is not None else (
                system.attrib.get("lastClr") if system is not None else None)
            if value:
                by_name[name] = value
        # Spreadsheet theme indexes differ from the XML scheme order for the first four.
        order = ["lt1", "dk1", "lt2", "dk2", "accent1", "accent2", "accent3",
                 "accent4", "accent5", "accent6", "hlink", "folHlink"]
        return [by_name.get(name, "FF000000") for name in order]
    except ET.ParseError:
        return []


def side_dict(side: Any, themes: list[str]) -> dict[str, Any]:
    return {"style": getattr(side, "style", None),
            "color": color_dict(getattr(side, "color", None), themes)}


def style_dict(cell: Any, themes: list[str]) -> dict[str, Any]:
    font = cell.font
    fill = cell.fill
    border = cell.border
    alignment = cell.alignment
    return {
        "font": {
            "name": font.name, "size": font.sz, "bold": font.b, "italic": font.i,
            "underline": font.u, "strike": font.strike,
            "vert_align": font.vertAlign, "color": color_dict(font.color, themes),
        },
        "fill": {
            "pattern_type": fill.patternType,
            "fg_color": color_dict(fill.fgColor, themes),
            "bg_color": color_dict(fill.bgColor, themes),
        },
        "border": {name: side_dict(getattr(border, name), themes)
                   for name in ("left", "right", "top", "bottom", "diagonal")},
        "alignment": {
            "horizontal": alignment.horizontal, "vertical": alignment.vertical,
            "wrap_text": alignment.wrap_text, "shrink_to_fit": alignment.shrink_to_fit,
            "text_rotation": alignment.text_rotation, "indent": alignment.indent,
        },
        "number_format": cell.number_format,
        "protection": {"locked": cell.protection.locked, "hidden": cell.protection.hidden},
    }


def formula_text(value: Any) -> str | None:
    if value is None:
        return None
    text = getattr(value, "text", None)
    if text is not None:
        return str(text)
    return str(value)


def marker_from_xml(element: ET.Element | None) -> dict[str, int] | None:
    if element is None:
        return None
    return {key: int(element.findtext(f"xdr:{key}", default="0", namespaces=NS))
            for key in ("col", "colOff", "row", "rowOff")}


def anchor_dict(anchor: ET.Element) -> dict[str, Any]:
    kind = anchor.tag.rsplit("}", 1)[-1]
    result: dict[str, Any] = {"kind": kind}
    if kind in ("twoCellAnchor", "oneCellAnchor"):
        start = marker_from_xml(anchor.find("xdr:from", NS))
        result["from"] = start
        if start:
            result["from_cell"] = coordinate(start["row"] + 1, start["col"] + 1)
    if kind == "twoCellAnchor":
        end = marker_from_xml(anchor.find("xdr:to", NS))
        result["to"] = end
        if end:
            result["to_cell"] = coordinate(end["row"] + 1, end["col"] + 1)
    for tag in ("pos", "ext"):
        element = anchor.find(f"xdr:{tag}", NS)
        if element is not None:
            result[tag] = {key: int(value) for key, value in element.attrib.items()}
            if tag == "ext":
                result["size_px_approx"] = {
                    "width": round(int(element.attrib.get("cx", 0)) / 9525),
                    "height": round(int(element.attrib.get("cy", 0)) / 9525),
                }
    result["edit_as"] = anchor.attrib.get("editAs")
    return result


def extract_drawings(archive: zipfile.ZipFile, sheet_parts: dict[str, str], temp: Path,
                     warnings: list[dict[str, Any]]) -> dict[str, Any]:
    placements: list[dict[str, Any]] = []
    referenced_media: set[str] = set()
    written: set[str] = set()
    names = set(archive.namelist())

    def save_media(part: str, data: bytes) -> tuple[str, str]:
        digest = sha256_bytes(data)
        suffix = Path(part).suffix.lower()
        relative = f"assets/{digest[:20]}{suffix}"
        if relative not in written:
            target = temp / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            written.add(relative)
        return relative, digest

    for sheet_name, sheet_part in sheet_parts.items():
        if sheet_part not in names:
            warnings.append({"code": "missing_sheet_part", "sheet": sheet_name,
                             "message": f"Worksheet part not found: {sheet_part}"})
            continue
        sheet_root = ET.fromstring(archive.read(sheet_part))
        sheet_rels = relationships(archive, sheet_part)
        for drawing in sheet_root.findall("s:drawing", NS):
            rel_id = drawing.attrib.get(R_ID)
            rel = sheet_rels.get(rel_id or "")
            if not rel or rel["mode"] == "External":
                warnings.append({"code": "unresolved_drawing", "sheet": sheet_name,
                                 "message": f"Cannot resolve drawing relationship {rel_id}"})
                continue
            drawing_part = resolve_part(sheet_part, rel["target"])
            if drawing_part not in names:
                warnings.append({"code": "missing_drawing_part", "sheet": sheet_name,
                                 "message": drawing_part})
                continue
            drawing_rels = relationships(archive, drawing_part)
            root = ET.fromstring(archive.read(drawing_part))
            for anchor in list(root):
                for picture in anchor.findall("xdr:pic", NS):
                    blip = picture.find(".//a:blip", NS)
                    embed = blip.attrib.get(R_EMBED) if blip is not None else None
                    image_rel = drawing_rels.get(embed or "")
                    if not image_rel or image_rel["mode"] == "External":
                        warnings.append({"code": "external_or_missing_image", "sheet": sheet_name,
                                         "message": f"Unresolved image relationship {embed}"})
                        continue
                    media_part = resolve_part(drawing_part, image_rel["target"])
                    if media_part not in names:
                        warnings.append({"code": "missing_media_part", "sheet": sheet_name,
                                         "message": media_part})
                        continue
                    data = archive.read(media_part)
                    relative, digest = save_media(media_part, data)
                    referenced_media.add(media_part)
                    non_visual = picture.find("xdr:nvPicPr/xdr:cNvPr", NS)
                    crop = picture.find("xdr:blipFill/a:srcRect", NS)
                    placements.append({
                        "asset_id": f"img-{len(placements) + 1:04d}",
                        "status": "mapped",
                        "sheet": sheet_name,
                        "drawing_part": drawing_part,
                        "media_part": media_part,
                        "file": relative,
                        "sha256": digest,
                        "size_bytes": len(data),
                        "media_type": mimetypes.guess_type(media_part)[0],
                        "name": non_visual.attrib.get("name") if non_visual is not None else None,
                        "description": non_visual.attrib.get("descr") if non_visual is not None else None,
                        "anchor": anchor_dict(anchor),
                        "crop": dict(crop.attrib) if crop is not None else None,
                    })

    orphans = []
    for media_part in sorted(name for name in names if name.startswith("xl/media/") and not name.endswith("/")):
        if media_part in referenced_media:
            continue
        data = archive.read(media_part)
        relative, digest = save_media(media_part, data)
        asset = {
            "asset_id": f"img-{len(placements) + 1:04d}", "status": "orphan_media",
            "sheet": None, "drawing_part": None, "media_part": media_part,
            "file": relative, "sha256": digest, "size_bytes": len(data),
            "media_type": mimetypes.guess_type(media_part)[0], "name": None,
            "description": None, "anchor": None, "crop": None,
        }
        placements.append(asset)
        orphans.append(media_part)
    if orphans:
        warnings.append({"code": "orphan_media", "count": len(orphans),
                         "message": "Media bytes were preserved, but worksheet anchors were not resolved."})
    return {"placements": placements, "media_part_count": len([n for n in names if n.startswith("xl/media/") and not n.endswith("/")]),
            "mapped_placement_count": sum(p["status"] == "mapped" for p in placements),
            "orphan_media_count": len(orphans)}


def workbook_sheet_parts(archive: zipfile.ZipFile) -> dict[str, str]:
    workbook_part = "xl/workbook.xml"
    root = ET.fromstring(archive.read(workbook_part))
    rels = relationships(archive, workbook_part)
    result = {}
    for sheet in root.findall("s:sheets/s:sheet", NS):
        rel = rels.get(sheet.attrib.get(R_ID, ""))
        if rel and rel["mode"] != "External":
            result[sheet.attrib["name"]] = resolve_part(workbook_part, rel["target"])
    return result


def raw_sheet_features(archive: zipfile.ZipFile, sheet_part: str) -> dict[str, Any]:
    root = ET.fromstring(archive.read(sheet_part))
    conditional = root.findall("s:conditionalFormatting", NS)
    validations = root.find("s:dataValidations", NS)
    return {
        "conditional_formatting_blocks": len(conditional),
        "conditional_formatting_xml": [ET.tostring(item, encoding="unicode") for item in conditional],
        "data_validation_count": int(validations.attrib.get("count", 0)) if validations is not None else 0,
        "legacy_drawing": root.find("s:legacyDrawing", NS) is not None,
        "picture_background": root.find("s:picture", NS) is not None,
    }


def package_parts(archive: zipfile.ZipFile) -> list[dict[str, Any]]:
    result = []
    for info in archive.infolist():
        if info.is_dir():
            continue
        result.append({"part": info.filename, "size": info.file_size,
                       "compressed_size": info.compress_size, "crc": f"{info.CRC:08x}"})
    return result


def extract_ooxml(archive: zipfile.ZipFile, temp: Path) -> None:
    for info in archive.infolist():
        if info.is_dir():
            continue
        target = (temp / "ooxml" / info.filename).resolve()
        if temp.resolve() not in target.parents:
            raise ValueError(f"Unsafe ZIP member path: {info.filename}")
        target.parent.mkdir(parents=True, exist_ok=True)
        with archive.open(info) as source, target.open("wb") as destination:
            shutil.copyfileobj(source, destination)


def run(args: argparse.Namespace) -> dict[str, Any]:
    source = args.input.resolve()
    output = args.output.resolve()
    if not source.is_file():
        raise ValueError(f"Input is not a file: {source}")
    if source.suffix.lower() not in (".xlsx", ".xlsm"):
        raise ValueError("Only .xlsx and .xlsm are supported; convert legacy .xls explicitly first.")
    if output.exists() and not args.overwrite:
        raise ValueError(f"Output exists; choose another directory or pass --overwrite: {output}")
    output.parent.mkdir(parents=True, exist_ok=True)
    temp = Path(tempfile.mkdtemp(prefix=".excel-extractor-", dir=output.parent))
    warnings: list[dict[str, Any]] = []
    try:
        preserved_source = temp / ("source" + source.suffix.lower())
        shutil.copy2(source, preserved_source)
        source_hash = sha256_file(source)
        with zipfile.ZipFile(source) as archive:
            infos = [item for item in archive.infolist() if not item.is_dir()]
            total_size = sum(item.file_size for item in infos)
            if total_size > args.max_unpacked_mb * 1024 * 1024:
                raise ValueError(f"Unpacked package exceeds --max-unpacked-mb={args.max_unpacked_mb}")
            for item in infos:
                if item.file_size > args.max_part_mb * 1024 * 1024:
                    raise ValueError(f"Package part exceeds --max-part-mb: {item.filename}")
            parts = package_parts(archive)
            sheet_parts = workbook_sheet_parts(archive)
            assets = extract_drawings(archive, sheet_parts, temp, warnings)
            raw_features = {name: raw_sheet_features(archive, part) for name, part in sheet_parts.items()}
            names = set(archive.namelist())
            if any(name.startswith("xl/richData/") for name in names):
                warnings.append({"code": "rich_data_present",
                                 "message": "Rich values or in-cell images may require manual OOXML review; source parts are preserved."})
            if any(name.startswith("xl/externalLinks/") for name in names):
                warnings.append({"code": "external_links_present",
                                 "message": "External links were not fetched or recalculated."})
            if any(name.startswith("xl/drawings/vmlDrawing") for name in names):
                warnings.append({"code": "vml_drawing_present",
                                 "message": "Legacy VML/comment artwork is preserved in source but not semantically extracted."})
            if "xl/vbaProject.bin" in names:
                warnings.append({"code": "vba_present", "message": "VBA is preserved in source and was not executed."})
            dump_json(temp / "package.json", {"parts": parts})
            if args.include_ooxml:
                extract_ooxml(archive, temp)

        keep_vba = source.suffix.lower() == ".xlsm"
        workbook = load_workbook(source, data_only=False, read_only=False,
                                 keep_vba=keep_vba, rich_text=True, keep_links=True)
        cached = load_workbook(source, data_only=True, read_only=False,
                               keep_vba=keep_vba, rich_text=True, keep_links=True)
        themes = theme_colors(workbook)
        styles: dict[str, Any] = {}
        sheet_records = []
        total_cells = 0
        for index, worksheet in enumerate(workbook.worksheets):
            cached_sheet = cached[worksheet.title]
            safe_sheet = f"{index + 1:03d}__{safe_name(worksheet.title)}"
            cells_file = f"sheets/{safe_sheet}.cells.jsonl"
            merges = [str(item) for item in worksheet.merged_cells.ranges]
            cells_path = temp / cells_file
            cells_path.parent.mkdir(parents=True, exist_ok=True)
            count = 0
            # Normal mode is required for styles/drawings. _cells avoids expanding a huge used range.
            existing_cells = sorted(worksheet._cells.values(), key=lambda cell: (cell.row, cell.column))
            with cells_path.open("w", encoding="utf-8") as handle:
                for cell in existing_cells:
                    style_id = int(cell.style_id)
                    if str(style_id) not in styles:
                        styles[str(style_id)] = style_dict(cell, themes)
                    is_formula = cell.data_type == "f"
                    cached_value = cached_sheet[cell.coordinate].value if is_formula else None
                    merged_range = next((item for item in merges if cell.coordinate in item), None)
                    record = {
                        "cell": cell.coordinate, "row": cell.row, "column": cell.column,
                        "value": json_value(cached_value if is_formula else cell.value),
                        "formula": formula_text(cell.value) if is_formula else None,
                        "value_status": ("cached" if is_formula and cached_value is not None else
                                         "missing_cache" if is_formula else "literal"),
                        "data_type": cell.data_type, "style_id": style_id,
                        "number_format": cell.number_format, "merged_range": merged_range,
                        "rich_text": type(cell.value).__name__ == "CellRichText",
                        "hidden": bool(worksheet.row_dimensions[cell.row].hidden or
                                       worksheet.column_dimensions[get_column_letter(cell.column)].hidden),
                        "hyperlink": ({"target": cell.hyperlink.target, "location": cell.hyperlink.location,
                                       "tooltip": cell.hyperlink.tooltip} if getattr(cell, "hyperlink", None) else None),
                        "comment": ({"text": cell.comment.text, "author": cell.comment.author}
                                    if getattr(cell, "comment", None) else None),
                    }
                    handle.write(json.dumps(record, ensure_ascii=False, allow_nan=False) + "\n")
                    count += 1
            total_cells += count
            tables = [{"name": table.displayName, "ref": table.ref}
                      for table in worksheet.tables.values()]
            row_dimensions = {str(key): {"height": value.height, "hidden": value.hidden,
                                         "outline_level": value.outlineLevel}
                              for key, value in worksheet.row_dimensions.items()
                              if value.height is not None or value.hidden or value.outlineLevel}
            column_dimensions = {key: {"width": value.width, "hidden": value.hidden,
                                       "outline_level": value.outlineLevel,
                                       "best_fit": value.bestFit}
                                 for key, value in worksheet.column_dimensions.items()
                                 if value.width is not None or value.hidden or value.outlineLevel}
            features = raw_features.get(worksheet.title, {})
            if features.get("legacy_drawing") or features.get("picture_background"):
                warnings.append({"code": "special_sheet_artwork", "sheet": worksheet.title,
                                 "message": "Legacy drawing or sheet background requires manual review."})
            sheet_records.append({
                "sheet_id": f"sheet-{index + 1:03d}", "name": worksheet.title, "index": index,
                "state": worksheet.sheet_state, "dimension": worksheet.calculate_dimension(),
                "max_row": worksheet.max_row, "max_column": worksheet.max_column,
                "cell_count": count, "cells_file": cells_file,
                "ooxml_part": sheet_parts.get(worksheet.title), "merged_ranges": merges,
                "tables": tables, "freeze_panes": (worksheet.freeze_panes.coordinate
                                                     if hasattr(worksheet.freeze_panes, "coordinate")
                                                     else worksheet.freeze_panes),
                "auto_filter": worksheet.auto_filter.ref,
                "print_area": str(worksheet.print_area) if worksheet.print_area else None,
                "print_title_rows": worksheet.print_title_rows,
                "print_title_cols": worksheet.print_title_cols,
                "show_grid_lines": worksheet.sheet_view.showGridLines,
                "row_dimensions": row_dimensions, "column_dimensions": column_dimensions,
                **features,
            })
        defined_names = []
        for item in workbook.defined_names.values():
            defined_names.append({"name": item.name, "value": item.attr_text,
                                  "local_sheet_id": item.localSheetId, "hidden": item.hidden})
        workbook_data = {
            "schema_version": SCHEMA_VERSION, "source_sha256": source_hash,
            "sheet_count": len(sheet_records), "cell_count": total_cells,
            "epoch": str(workbook.epoch), "defined_names": defined_names,
            "calculation": {"calc_mode": workbook.calculation.calcMode,
                            "full_calc_on_load": workbook.calculation.fullCalcOnLoad,
                            "force_full_calc": workbook.calculation.forceFullCalc},
            "sheets": sheet_records,
        }
        dump_json(temp / "workbook.json", workbook_data)
        dump_json(temp / "styles.json", {"schema_version": SCHEMA_VERSION, "styles": styles,
                                         "theme_color_resolution": "RGB/indexed exact; theme tint is a display approximation"})
        dump_json(temp / "assets.json", {"schema_version": SCHEMA_VERSION, **assets})
        manifest = {
            "schema_version": SCHEMA_VERSION, "tool": "excel-extractor", "tool_version": "1.0.0",
            "created_at": utc_now(), "input_name": source.name,
            "source_file": preserved_source.name, "source_sha256": source_hash,
            "status": "success_with_warnings" if warnings else "success",
            "warnings": warnings,
            "counts": {"sheets": len(sheet_records), "cells": total_cells, "styles": len(styles),
                       "package_parts": len(parts), **{key: assets[key] for key in
                       ("media_part_count", "mapped_placement_count", "orphan_media_count")}},
            "capabilities": {"formula_recalculation": False, "source_rewritten": False,
                             "ooxml_unpacked": bool(args.include_ooxml),
                             "region_detection": "run detect_regions.py separately",
                             "vision_description": "run vision_describe.py separately"},
        }
        dump_json(temp / "manifest.json", manifest)
        if sha256_file(source) != source_hash:
            raise RuntimeError("Input changed during extraction; discard this run and retry.")
        if output.exists():
            shutil.rmtree(output)
        os.replace(temp, output)
        return {"status": manifest["status"], "output": str(output), "counts": manifest["counts"],
                "warnings": len(warnings)}
    except Exception:
        shutil.rmtree(temp, ignore_errors=True)
        raise


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path, help="New run directory")
    parser.add_argument("--include-ooxml", action="store_true", help="Also unpack every OOXML part")
    parser.add_argument("--overwrite", action="store_true", help="Replace an existing run directory")
    parser.add_argument("--max-unpacked-mb", type=int, default=512)
    parser.add_argument("--max-part-mb", type=int, default=128)
    args = parser.parse_args()
    try:
        print(json.dumps(run(args), ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({"status": "failed", "error": str(exc)}, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
