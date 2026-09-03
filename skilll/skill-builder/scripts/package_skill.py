#!/usr/bin/env python3
"""Skill 打包器：先校验，通过后打成 .skill（zip 格式改后缀）。

用法: python3 package_skill.py <skill目录> [输出目录]
"""

import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from validate_skill import validate


def package(skill_dir, output_dir=None):
    skill_dir = Path(skill_dir).resolve()
    errors, warnings = validate(skill_dir)
    for w in warnings:
        print(f"[WARNING] {w}")
    if errors:
        for e in errors:
            print(f"[ERROR]   {e}")
        print("校验未通过，请先修复再打包。")
        return None

    out = Path(output_dir).resolve() if output_dir else Path.cwd()
    out.mkdir(parents=True, exist_ok=True)
    target = out / f"{skill_dir.name}.skill"

    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in sorted(skill_dir.rglob("*")):
            if not f.is_file() or "__pycache__" in f.parts or f.suffix == ".pyc":
                continue
            arcname = f.relative_to(skill_dir.parent)
            zf.write(f, arcname)
            print(f"  打包: {arcname}")
    print(f"\n完成: {target}")
    return target


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: python3 package_skill.py <skill目录> [输出目录]")
        sys.exit(1)
    result = package(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
    sys.exit(0 if result else 1)
