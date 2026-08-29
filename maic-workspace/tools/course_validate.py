#!/usr/bin/env python3
"""course_validate.py — MAIC-Lite DSL 权威校验器（零依赖，Python 3.8+ 标准库）

对齐 dsl/SPEC.md v0.2：场景类型只有 quiz / interactive / pbl（slide 已删除，
出现即为非法场景类型 ERROR）；导览动作白名单为 spotlight/annotate/wait/next。

用法:
  python3 tools/course_validate.py --course <course_dir>            # 校验整门课
  python3 tools/course_validate.py --course <course_dir> --scene s3 # 只校验一个场景
  python3 tools/course_validate.py --file <scene.json>              # 校验单个场景文件

退出码: 0 = 无 ERROR; 1 = 有 ERROR 或文件问题。
输出: 人类可读报告 + 最后一行机器可读摘要 JSON。
"""
import argparse
import json
import re
import sys
from pathlib import Path

SCENE_TYPES = ("quiz", "interactive", "pbl")
WIDGET_TYPES = ("tutorial", "simulation", "diagram", "code", "game")
QUIZ_TYPES = ("single", "multiple", "short_answer")
DSL_VERSION = "maic-lite/0.2"

# 外链资源探测（v0.2 起 interactive html 引用 http(s) 外链为 ERROR）：
# src/href 属性、CSS url()、@import、JS fetch / XHR open / 动态 import
EXT_LINK_RES = [
    re.compile(r'(?:src|href)\s*=\s*["\']\s*(https?://[^"\']+)', re.I),
    re.compile(r'url\(\s*["\']?\s*(https?://[^)"\']+)', re.I),
    re.compile(r'@import\s+(?:url\(\s*)?["\']?\s*(https?://[^"\')\s]+)', re.I),
    re.compile(r'\bfetch\s*\(\s*["\'](https?://[^"\']+)', re.I),
    re.compile(r'\.open\s*\(\s*["\'][A-Z]+["\']\s*,\s*["\'](https?://[^"\']+)', re.I),
    re.compile(r'\bimport\s*\(\s*["\'](https?://[^"\']+)', re.I),
]
# 常见 CDN 域名，命中时在报错信息里显式点名
CDN_HOSTS = ("cdn.jsdelivr.net", "unpkg.com", "cdnjs.cloudflare.com",
             "cdn.bootcdn.net", "ajax.googleapis.com", "fonts.googleapis.com",
             "fonts.gstatic.com")


class Report:
    def __init__(self):
        self.errors = []
        self.warnings = []

    def err(self, where, msg):
        self.errors.append(f"[ERROR] {where}: {msg}")

    def warn(self, where, msg):
        self.warnings.append(f"[WARN]  {where}: {msg}")


def is_num(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def req_str(obj, key, where, rep):
    v = obj.get(key)
    if not isinstance(v, str) or not v.strip():
        rep.err(where, f"缺少必需字符串字段 '{key}'")
        return None
    return v


def req_keys(obj, keys, where, rep):
    for k in keys:
        if k not in obj:
            rep.err(where, f"缺少必需字段 '{k}'")


def validate_quiz(content, where, rep):
    qs = content.get("questions")
    if not isinstance(qs, list) or not qs:
        rep.err(where, "quiz content 缺少非空 questions 数组")
        return
    for i, q in enumerate(qs):
        w = f"{where}.questions[{i}]"
        if not isinstance(q, dict):
            rep.err(w, "题目必须是对象")
            continue
        req_str(q, "id", w, rep)
        req_str(q, "question", w, rep)
        qtype = q.get("type")
        if qtype not in QUIZ_TYPES:
            rep.err(w, f"type 必须是 {QUIZ_TYPES}")
            continue
        if "analysis" not in q:
            rep.err(w, "每题必须有 analysis")
        if not is_num(q.get("points")):
            rep.err(w, "每题必须有数值 points")
        if qtype in ("single", "multiple"):
            opts = q.get("options")
            if not isinstance(opts, list) or len(opts) < 2:
                rep.err(w, f"{qtype} 至少需要 2 个 options")
                continue
            values = []
            for o in opts:
                if not isinstance(o, dict) or "label" not in o or "value" not in o:
                    rep.err(w, "option 必须含 label 和 value")
                else:
                    values.append(o["value"])
            ans = q.get("answer")
            if not isinstance(ans, list) or not ans:
                rep.err(w, f"{qtype} 必须有非空 answer 数组")
            else:
                bad = [a for a in ans if a not in values]
                if bad:
                    rep.err(w, f"answer {bad} 不在 options 的 value 中")
                if qtype == "single" and len(ans) != 1:
                    rep.err(w, "single 的 answer 必须恰好 1 个")
                if qtype == "multiple" and len(ans) < 2:
                    rep.warn(w, "multiple 的 answer 少于 2 个，是否应该用 single？")
        else:  # short_answer
            if not q.get("commentPrompt"):
                rep.err(w, "short_answer 必须有 commentPrompt（评分量规）")


def validate_interactive(content, where, rep):
    wt = content.get("widgetType")
    if wt not in WIDGET_TYPES:
        rep.err(where, f"widgetType '{wt}' 必须是 {WIDGET_TYPES}")
    html = content.get("html")
    if not isinstance(html, str) or "<html" not in html.lower():
        rep.err(where, "interactive content 缺少完整 html 文档")
        return
    # ---- 离线红线：任何 http(s) 外链资源引用都是 ERROR（SPEC 第 8 节） ----
    found = []
    for rx in EXT_LINK_RES:
        found.extend(rx.findall(html))
    if found:
        msg = (f"interactive html 引用 {len(found)} 个 http(s) 外链资源"
               f"（如 {found[0][:60]}）——离线纪律要求完全自包含")
        cdn = [u for u in found if any(h in u for h in CDN_HOSTS)]
        if cdn:
            msg += f"；命中已知 CDN 域名（如 {cdn[0][:60]}）"
        rep.err(where, msg)
    if html.lower().count("<!doctype html") > 1:
        rep.err(where, "html 含多个 DOCTYPE——输出被重复拼接了")
    if "</html>" not in html.lower():
        rep.err(where, "html 缺少 </html> 结尾，可能被截断")
    # ---- widget-config 内嵌配置必须可解析（SPEC 第 3 节） ----
    for m in re.finditer(r"<script\b([^>]*)>(.*?)</script>", html, re.S | re.I):
        attrs, body = m.group(1), m.group(2)
        if re.search(r'type\s*=\s*["\']application/json["\']', attrs, re.I) and \
           re.search(r'id\s*=\s*["\']widget-config["\']', attrs, re.I):
            try:
                json.loads(body.strip())
            except json.JSONDecodeError as e:
                rep.err(where, f"widget-config 的 JSON 解析失败: {e}")


def validate_pbl(content, where, rep):
    req_str(content, "projectTopic", where, rep)
    req_str(content, "projectDescription", where, rep)
    skills = content.get("targetSkills")
    if not isinstance(skills, list) or not (2 <= len(skills) <= 5):
        rep.err(where, "targetSkills 必须是 2-5 项的数组")
    issues = content.get("issues")
    if not isinstance(issues, list) or not (2 <= len(issues) <= 5):
        rep.err(where, "issues 必须是 2-5 项的数组")
    elif isinstance(issues, list):
        for i, it in enumerate(issues):
            if isinstance(it, dict):
                req_keys(it, ["id", "title", "description", "deliverable"], f"{where}.issues[{i}]", rep)


CONTENT_VALIDATORS = {
    "quiz": validate_quiz,
    "interactive": validate_interactive,
    "pbl": validate_pbl,
}

ACTIONS_ALLOWED = {"spotlight", "annotate", "wait", "next"}


def validate_scene(scene, path, stage_id, rep):
    where = str(path)
    if not isinstance(scene, dict):
        rep.err(where, "场景必须是 JSON 对象")
        return
    sid = req_str(scene, "id", where, rep)
    st = scene.get("stageId")
    if stage_id and st != stage_id:
        rep.err(where, f"stageId '{st}' 与 stage.json 的 id '{stage_id}' 不一致")
    stype = scene.get("type")
    if stype not in SCENE_TYPES:
        rep.err(where, f"非法场景类型 '{stype}'，type 必须是 {SCENE_TYPES}")
        return
    req_str(scene, "title", where, rep)
    if not isinstance(scene.get("order"), int):
        rep.err(where, "order 必须是整数")
    content = scene.get("content")
    if not isinstance(content, dict):
        rep.err(where, "缺少 content 对象")
        return
    if content.get("type") != stype:
        rep.err(where, f"type '{stype}' 与 content.type '{content.get('type')}' 不一致（硬约束）")
        return
    CONTENT_VALIDATORS[stype](content, f"{where}.content", rep)
    actions = scene.get("actions")
    if actions is not None:
        if not isinstance(actions, list):
            rep.err(where, "actions 必须是数组")
        else:
            for i, a in enumerate(actions):
                if not isinstance(a, dict) or a.get("actionName") not in ACTIONS_ALLOWED:
                    rep.warn(f"{where}.actions[{i}]",
                             f"actionName 应为 {sorted(ACTIONS_ALLOWED)} 之一")
    return sid


def validate_outline(course, rep):
    """outline.json 轻量校验（SPEC 第 7 节）。文件缺失不报错（向后兼容生成中期状态）。"""
    p = course / "outline.json"
    if not p.exists():
        return
    where = str(p)
    try:
        outline = json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        rep.err(where, f"JSON 解析失败: {e}")
        return
    if not isinstance(outline, dict):
        rep.err(where, "outline.json 必须是 JSON 对象（不允许裸数组）")
        return
    items = outline.get("outlines")
    if not isinstance(items, list):
        rep.err(where, "outline.json 缺少 outlines 数组")
        return
    seen_ids, seen_orders = set(), set()
    for i, it in enumerate(items):
        w = f"{where}.outlines[{i}]"
        if not isinstance(it, dict):
            rep.err(w, "大纲项必须是对象")
            continue
        for k in ("id", "type", "title", "order"):
            if k not in it:
                rep.err(w, f"缺少必需字段 '{k}'")
        t = it.get("type")
        if t is not None and t not in SCENE_TYPES:
            rep.err(w, f"非法场景类型 '{t}'，type 必须是 {SCENE_TYPES}")
        oid = it.get("id")
        if oid is not None:
            if oid in seen_ids:
                rep.err(w, f"id '{oid}' 重复")
            seen_ids.add(oid)
        order = it.get("order")
        if order is not None:
            if order in seen_orders:
                rep.err(w, f"order {order} 重复")
            seen_orders.add(order)


def validate_course(course_dir, only_scene=None):
    rep = Report()
    course = Path(course_dir)
    stage_path = course / "stage.json"
    if not stage_path.exists():
        rep.err(str(stage_path), "stage.json 不存在")
        return rep
    try:
        stage = json.loads(stage_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        rep.err(str(stage_path), f"JSON 解析失败: {e}")
        return rep
    where = str(stage_path)
    if stage.get("dslVersion") != DSL_VERSION:
        rep.warn(where, f"dslVersion 为 '{stage.get('dslVersion')}'，期望 '{DSL_VERSION}'")
    req_str(stage, "id", where, rep)
    req_str(stage, "name", where, rep)
    if "languageDirective" not in stage:
        rep.warn(where, "缺少 languageDirective（教学语言指令）")
    scene_files = stage.get("scenes")
    if not isinstance(scene_files, list):
        rep.err(where, "缺少 scenes 数组")
        return rep

    orders, seen_ids = [], set()
    for rel in scene_files:
        p = course / rel
        if not p.exists():
            rep.err(str(p), "场景文件不存在（stage.json 引用了它）")
            continue
        try:
            scene = json.loads(p.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            rep.err(str(p), f"JSON 解析失败: {e}")
            continue
        if only_scene and scene.get("id") != only_scene:
            continue
        sid = validate_scene(scene, p, stage.get("id"), rep)
        if sid:
            if sid in seen_ids:
                rep.err(str(p), f"场景 id '{sid}' 重复")
            seen_ids.add(sid)
            if isinstance(scene.get("order"), int):
                orders.append(scene["order"])
    if not only_scene and len(orders) != len(set(orders)):
        rep.err(where, "场景 order 有重复")
    if not only_scene:
        validate_outline(course, rep)
    return rep


def main():
    ap = argparse.ArgumentParser(description="MAIC-Lite course validator")
    ap.add_argument("--course", help="课程目录（含 stage.json）")
    ap.add_argument("--scene", help="只校验该 scene id")
    ap.add_argument("--file", help="直接校验单个场景 JSON 文件")
    args = ap.parse_args()

    if args.file:
        rep = Report()
        p = Path(args.file)
        try:
            scene = json.loads(p.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as e:
            rep.err(str(p), f"读取/解析失败: {e}")
        else:
            validate_scene(scene, p, None, rep)
    elif args.course:
        rep = validate_course(args.course, args.scene)
    else:
        ap.error("需要 --course 或 --file")

    for line in rep.errors + rep.warnings:
        print(line)
    summary = {"errors": len(rep.errors), "warnings": len(rep.warnings),
               "passed": len(rep.errors) == 0}
    print(json.dumps(summary, ensure_ascii=False))
    sys.exit(0 if summary["passed"] else 1)


if __name__ == "__main__":
    main()
