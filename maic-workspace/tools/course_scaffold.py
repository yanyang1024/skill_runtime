#!/usr/bin/env python3
"""course_scaffold.py — 课程脚手架：建目录、生成 job cards、汇总验收（零依赖）

用法:
  python3 tools/course_scaffold.py new <course_dir> --name "课程名"
  python3 tools/course_scaffold.py jobs <course_dir>            # 由 outline.json 生成 jobs/*.json
  python3 tools/course_scaffold.py assemble <course_dir>        # 校验全部场景并刷新 stage.json 的 scenes
"""
import argparse
import json
import subprocess
import sys
import time
from pathlib import Path

# 场景类型 → skill 目录（见 PROTOCOL.md 第 2 节；slide 已在 DSL v0.2 删除）
SKILL_BY_TYPE = {
    "quiz": "skills/quiz-authoring",
    "interactive": "skills/interactive-authoring",
    "pbl": "skills/pbl-design",
}


def cmd_new(course_dir, name):
    course = Path(course_dir)
    if course.exists() and any(course.iterdir()):
        print(f"目录 {course} 已存在且非空，退出以避免覆盖。")
        sys.exit(1)
    (course / "scenes").mkdir(parents=True, exist_ok=True)
    (course / "jobs").mkdir(exist_ok=True)
    (course / "materials").mkdir(exist_ok=True)
    (course / "assets").mkdir(exist_ok=True)
    now = int(time.time() * 1000)
    stage_id = "stage_" + course.name.replace("-", "_").replace(" ", "_")
    stage = {
        "dslVersion": "maic-lite/0.2",
        "id": stage_id,
        "name": name,
        "description": "",
        "languageDirective": "",
        "style": "professional",
        "interactiveMode": False,
        "createdAt": now,
        "updatedAt": now,
        "scenes": [],
    }
    (course / "stage.json").write_text(
        json.dumps(stage, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"已创建课程骨架: {course}")
    print(f"  stage.id = {stage_id}")
    print("下一步: 放材料到 materials/，然后由 material-analyst 产出 outline.json")


def cmd_jobs(course_dir):
    course = Path(course_dir)
    outline_path = course / "outline.json"
    if not outline_path.exists():
        print("缺少 outline.json（由 material-analyst 产出）")
        sys.exit(1)
    outline = json.loads(outline_path.read_text(encoding="utf-8"))
    items = outline.get("outlines")
    if not isinstance(items, list) or not items:
        print("outline.json 中没有 outlines 数组")
        sys.exit(1)
    directive = outline.get("languageDirective", "")
    jobs_dir = course / "jobs"
    jobs_dir.mkdir(exist_ok=True)
    count = 0
    for item in items:
        stype = item.get("type", "interactive")  # v0.2 默认类型（slide 已删除）
        sid = item.get("id", f"scene_{count + 1}")
        card = {
            "task": "build-scene",
            "course_dir": str(course),
            "scene_id": sid,
            "scene_type": stype,
            "title": item.get("title", ""),
            "outline_item": {
                "description": item.get("description", ""),
                "keyPoints": item.get("keyPoints", []),
                "teachingObjective": item.get("teachingObjective", ""),
                **{k: item[k] for k in ("quizConfig", "widgetType", "widgetOutline", "pblConfig") if k in item},
            },
            "languageDirective": directive,
            "skill_ref": SKILL_BY_TYPE.get(stype, ""),
            "material_refs": item.get("materialRefs", []),
            "output_path": str(course / "scenes" / f"{sid}.json"),
        }
        (jobs_dir / f"{sid}.json").write_text(
            json.dumps(card, ensure_ascii=False, indent=2), encoding="utf-8")
        count += 1
    print(f"已生成 {count} 张 job card 到 {jobs_dir}/")
    print("下一步: director 为每张 card 派发一个 scene-builder subagent（可并行）")


def cmd_assemble(course_dir):
    course = Path(course_dir)
    stage_path = course / "stage.json"
    stage = json.loads(stage_path.read_text(encoding="utf-8"))
    scenes_dir = course / "scenes"
    # 按 outline 顺序（若有）排列，否则按文件名
    order_map = {}
    outline_path = course / "outline.json"
    if outline_path.exists():
        outline = json.loads(outline_path.read_text(encoding="utf-8"))
        for item in outline.get("outlines", []):
            order_map[item.get("id")] = item.get("order", 999)
    files = sorted(scenes_dir.glob("*.json"),
                   key=lambda p: (order_map.get(p.stem, 999), p.name))
    stage["scenes"] = [f"scenes/{p.name}" for p in files]
    stage["updatedAt"] = int(time.time() * 1000)
    stage_path.write_text(json.dumps(stage, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"stage.json 已刷新，共 {len(files)} 个场景，开始校验……")
    here = Path(__file__).resolve().parent
    result = subprocess.run(
        [sys.executable, str(here / "course_validate.py"), "--course", str(course)],
        capture_output=True, text=True)
    print(result.stdout)
    if result.returncode != 0:
        print("校验未通过：存在 ERROR。请按 PROTOCOL.md 第 5 节退回修复。")
        sys.exit(1)
    print("校验通过（ERROR=0）。可用 build_player.py 生成播放器。")


def main():
    ap = argparse.ArgumentParser(description="MAIC-Lite course scaffold")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p_new = sub.add_parser("new", help="创建课程骨架")
    p_new.add_argument("course_dir")
    p_new.add_argument("--name", required=True)
    p_jobs = sub.add_parser("jobs", help="由 outline.json 生成 job cards")
    p_jobs.add_argument("course_dir")
    p_asm = sub.add_parser("assemble", help="汇总场景并校验")
    p_asm.add_argument("course_dir")
    args = ap.parse_args()
    if args.cmd == "new":
        cmd_new(args.course_dir, args.name)
    elif args.cmd == "jobs":
        cmd_jobs(args.course_dir)
    else:
        cmd_assemble(args.course_dir)


if __name__ == "__main__":
    main()
