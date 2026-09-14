#!/usr/bin/env python3
"""本次 MAIC 样例的可改写审计：交接、Skill 接触、产物一致性，不自动给 Harness 总分。"""
import argparse
import json
import re
from collections import Counter
from pathlib import Path, PurePosixPath
from md_trace import sha, write_json, write_jsonl

REQUIRED = {
    "material-analyst": {"status", "outline_path", "scene_stats"},
    "scene-builder": {"status", "scene_path", "validation"},
    "scene-verifier": {"verdict", "checks", "issues", "advice"},
}
SKILL_FOR = {"interactive": "interactive-authoring", "quiz": "quiz-authoring", "pbl": "pbl-design"}


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def file_ref(path, pointer=""):
    path = Path(path)
    return f"{path.name}@{sha(path.read_bytes())}#{pointer}"


def audit(trace_dir, workspace, course, course_key, out, creator=None):
    trace_dir, workspace, course, out = map(Path, (trace_dir, workspace, course, out))
    workspace, course = workspace.resolve(), course.resolve()
    out.mkdir(parents=True, exist_ok=False)
    events = [json.loads(l) for l in (trace_dir / "events.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
    manifests = load(trace_dir / "manifest.json")
    checks, contacts, handoffs = [], [], []

    def emit(dimension, name, result, observation, refs, **extra):
        row = {"dimension": dimension, "name": name, "result": result, "observation": observation,
               "evidence_refs": refs, "kind": "contract_check", "rule_version": "maic-contract-profile-1", **extra}
        row["signal_id"] = sha(json.dumps(row, sort_keys=True, ensure_ascii=False).encode())[:24]
        checks.append(row)

    def resolve(ref):
        p = PurePosixPath(str(ref))
        if p.is_absolute() or ".." in p.parts:
            return None  # 历史绝对路径不自动映射为当前主机文件。
        if str(p) == course_key or str(p).startswith(course_key.rstrip("/") + "/"):
            base, rel = course, p.relative_to(PurePosixPath(course_key))
        else:
            base, rel = workspace, p
        target = (base / str(rel)).resolve()
        return target if target == base or base in target.parents else None

    for e in events:
        args = e.get("input") if isinstance(e.get("input"), dict) else {}
        if e["tool"] == "task":
            role = args.get("subagent_type", "unknown")
            r = e.get("receipt") or {}
            prompt = args.get("prompt", "")
            # 只适配本样例 scenes/sN 与 jobs/sN 约定，不用任务标题相似度做强绑定。
            matched = re.findall(r"(?:jobs|scenes)/(s\d+)\.json", prompt)
            ids = sorted(set(matched))
            sid = ids[0] if len(ids) == 1 else None
            row = {"session_id": e["session_id"], "caller": e["agent_label"], "role": role, "scene_id": sid,
                   "child_session_id": e.get("child_session_id"), "dispatch_state": e.get("dispatch_state"),
                   "receipt_format": e.get("receipt_format"), "receipt": r, "evidence_ref": e["evidence_ref"],
                   "child_actions_observed": False, "historical_artifact_hash": None}
            handoffs.append(row)
            emit("agent", "receipt_strict_json", "pass" if e.get("receipt_format") == "exact_json" else "fail",
                 {"format": e.get("receipt_format"), "recoverable": bool(r)}, [e["evidence_ref"]],
                 target=role, meaning="仅格式契约；可恢复 JSON 不能解释成业务失败")
            schema_ok = bool(r) and REQUIRED.get(role, set()) <= r.keys()
            if role in {"scene-builder", "material-analyst"}:
                schema_ok = schema_ok and r.get("status") in {"done", "failed"}
            if role == "scene-verifier":
                schema_ok = schema_ok and r.get("verdict") in {"pass", "warn", "fail"} and isinstance(r.get("checks"), dict)
            emit("agent", "receipt_minimum_fields", "unknown" if role not in REQUIRED else "pass" if schema_ok else "fail",
                 {"role": role}, [e["evidence_ref"]], target=role)
            if role == "scene-builder":
                emit("agent", "builder_job_pointer", "pass" if re.search(r"jobs/s\d+\.json", prompt) else "fail",
                     {"scene_id": sid}, [e["evidence_ref"]], target=role)
                p = resolve(r.get("scene_path", "")) if r.get("scene_path") else None
                emit("agent", "claimed_artifact_in_supplied_snapshot", "pass" if p and p.is_file() else "unknown",
                     {"scene_id": sid, "historical_same_version": "unknown"},
                     [e["evidence_ref"]] + ([file_ref(p)] if p and p.is_file() else []), target=role)
            if role == "scene-verifier" and isinstance(r.get("checks"), dict):
                fails = any(str(v).lower().startswith("fail") for v in r["checks"].values())
                emit("agent", "verdict_internal_consistency", "fail" if fails and r.get("verdict") != "fail" else "pass",
                     {"verdict": r.get("verdict"), "any_check_fail": fails}, [e["evidence_ref"]], target=role)
                emit("agent", "verifier_execution_evidence", "unknown",
                     {"verdict_claim": r.get("verdict"), "child_trace_supplied": False}, [e["evidence_ref"]], target=role,
                     meaning="task 返回 completed 不证明裁判实际执行/只读/覆盖正确；这不是判它没有执行")
        if e["tool"] == "skill":
            contacts.append({"session_id": e["session_id"], "observer": e["agent_label"], "skill": args.get("name"),
                "contact": "skill_tool_output" if "<skill_content" in e.get("output", "") else "skill_request",
                "evidence_ref": e["evidence_ref"]})
        if e["tool"] == "read" and "/skills/" in str(args.get("filePath", "")):
            contacts.append({"session_id": e["session_id"], "observer": e["agent_label"], "path": args["filePath"],
                "contact": "read_result" if "<content>" in e.get("output", "") else "read_request",
                "evidence_ref": e["evidence_ref"], "applied_correctly": "unknown"})

    # 只比较同一主会话内的同一场景指针，不拼接不同主会话同名 s1。
    for session in sorted({h["session_id"] for h in handoffs}):
        hs = [h for h in handoffs if h["session_id"] == session]
        for sid in sorted({h["scene_id"] for h in hs if h["scene_id"]}):
            builds = [h for h in hs if h["scene_id"] == sid and h["role"] == "scene-builder"]
            verifies = [h for h in hs if h["scene_id"] == sid and h["role"] == "scene-verifier"]
            emit("agent", "builder_verifier_pair_observed", "pass" if builds and verifies else "unknown",
                 {"scene_id": sid, "builder_calls": len(builds), "verifier_calls": len(verifies),
                 "context_isolation_verified": False}, [h["evidence_ref"] for h in builds + verifies], target="course-director")

    # 真正在会话中出现的 doc-reshaper：只检查可见参考读取与初次写入的标志，不假装测到了保真质量。
    for se in [e for e in events if e["tool"] == "skill" and (e.get("input") or {}).get("name") == "doc-reshaper"]:
        local = [e for e in events if e["session_id"] == se["session_id"]]
        writes = [e for e in local if e["tool"] == "write" and e["source_line"] > se["source_line"]
                  and str((e.get("input") or {}).get("filePath", "")).endswith(".html")]
        if not writes:
            continue
        first = writes[0]
        required = ["references/fidelity-checklist.md", "references/html-rendering.md", "assets/template.html"]
        accesses = [e for e in local if e["tool"] == "read" and se["source_line"] < e["source_line"] < first["source_line"]
                    and "<content>" in e.get("output", "")]
        found = {suffix: [e["evidence_ref"] for e in accesses if str((e.get("input") or {}).get("filePath", "")).endswith("/doc-reshaper/" + suffix)]
                 for suffix in required}
        emit("skill", "doc_reshaper_required_reference_access", "pass" if all(found.values()) else "unknown",
             {"reference_access": {k: bool(v) for k, v in found.items()}, "reference_comprehension": "unknown"},
             [se["evidence_ref"], first["evidence_ref"]] + [r for refs in found.values() for r in refs], target="doc-reshaper")
        content = str((first.get("input") or {}).get("content", ""))
        markers = {k: k in content for k in ("保真检查", "术语表")}
        emit("skill", "doc_reshaper_appendix_markers", "pass" if all(markers.values()) else "unknown",
             {"markers": markers, "artifact_scope": "initial_write_payload; not final filesystem bytes", "fidelity": "unknown"},
             [first["evidence_ref"]], target="doc-reshaper", meaning="章节字样出现不证明保真，仍需逐主张核对原文")

    outline = load(course / "outline.json")
    items = {x["id"]: x for x in outline.get("outlines", [])}
    stage = load(course / "stage.json")
    for jp in sorted((course / "jobs").glob("*.json")):
        job = load(jp); sid = job["scene_id"]; item = items.get(sid, {})
        refs = [file_ref(jp), file_ref(course / "outline.json", "/outlines/id=" + sid)]
        required_job = {"task", "course_dir", "scene_id", "scene_type", "title", "outline_item", "languageDirective", "skill_ref", "material_refs", "output_path"}
        minimal = required_job <= job.keys() and isinstance(job.get("outline_item"), dict) and isinstance(job.get("material_refs"), list)
        emit("agent", "job_minimum_fields", "pass" if minimal else "fail", {"scene_id": sid}, refs, target="course-director")
        fields = ("description", "keyPoints", "widgetType", "widgetOutline", "quizConfig", "pblConfig")
        drift = [k for k in fields if item.get(k) != job.get("outline_item", {}).get(k)]
        emit("agent", "outline_job_consistency", "fail" if drift else "pass", {"scene_id": sid, "different_fields": drift},
             refs, target="planning_to_job_tool", scope="supplied_snapshot_only")
        targets = {"output": job.get("output_path"), "skill": str(job.get("skill_ref", "")) + "/SKILL.md"}
        targets.update({"material_" + str(i): r for i, r in enumerate(job.get("material_refs", []))})
        bad = {k: v for k, v in targets.items() if not resolve(v) or not resolve(v).is_file()}
        emit("tools", "job_references_resolve", "fail" if bad else "pass", {"scene_id": sid, "missing": bad}, refs,
             target="job_preflight", scope="current_files_not_historical_files")
        expected = SKILL_FOR.get(job.get("scene_type"))
        actual = PurePosixPath(job.get("skill_ref", "")).name
        emit("skill", "skill_declared_for_scene_type", "pass" if expected == actual else "fail",
             {"scene_id": sid, "declared": actual, "expected": expected, "child_read_evidence": "unknown"}, refs,
             target=actual, meaning="检查任务包指定了合适类型的 Skill；不代表子代理已加载或遵循")
        sp = resolve(job.get("output_path", ""))
        if sp and sp.is_file():
            scene = load(sp)
            aligned = scene.get("id") == sid and scene.get("type") == job.get("scene_type") and scene.get("stageId") == stage.get("id")
            emit("agent", "job_scene_identity", "pass" if aligned else "fail", {"scene_id": sid},
                 refs + [file_ref(sp)], target="scene-builder", scope="supplied_snapshot_only")

    # 简单的静态候选，不代替 YAML 解析器或内网分支的配置加载试验。
    roots = [("maic", workspace)] + ([("creator", Path(creator))] if creator else [])
    for label, root in roots:
        for sp in root.glob("skills/*/SKILL.md"):
            text = sp.read_text(encoding="utf-8-sig")
            name = re.search(r"(?m)^name:\s*([^\n]+)", text)
            declared = name[1].strip().strip("\"'") if name else None
            emit("skill", "skill_name_directory_match", "pass" if declared == sp.parent.name else "fail",
                 {"package": label, "directory": sp.parent.name, "declared_name": declared}, [file_ref(sp)],
                 target=declared, scope="static_public_contract; internal_loader_may_differ")
        for ap in root.glob("agents/*.md"):
            text = ap.read_text(encoding="utf-8-sig")
            if re.search(r"(?m)^\s+edit:\s*deny", text) and re.search(r"(?m)^\s+write:\s*allow", text):
                emit("agent", "permission_semantics_probe_needed", "unknown", {"agent": ap.stem, "edit": "deny", "write": "allow"},
                     [file_ref(ap)], target=ap.stem, kind="review_candidate",
                     next_check="核对当前实际 runtime 的写权限收口，不依据模板字面证明可写；启动微型写入探针")

    by_role = Counter(h["role"] for h in handoffs)
    summary = {"source_sessions": manifests, "dispatch_roles": dict(by_role),
        "rule_version": "maic-contract-profile-1",
        "provided_contract_hashes": {str(p.relative_to(workspace)): sha(p.read_bytes()) for p in
            [workspace / "PROTOCOL.md", workspace / "dsl/SPEC.md", workspace / "tools/course_validate.py", *workspace.glob("agents/*.md")]
            if p.is_file()},
        "receipt_formats": dict(Counter(h["receipt_format"] for h in handoffs)),
        "verdict_claims": dict(Counter(h["receipt"].get("verdict", "unknown") for h in handoffs if h["role"] == "scene-verifier")),
        "check_counts": dict(Counter(c["name"] for c in checks)),
        "failures_by_property": dict(Counter(c["name"] for c in checks if c["result"] == "fail")),
        "note": "不跨属性计算总通过率；格式偏离、业务效果、缺少执行证据是不同问题。配置快照不冒充历史实际加载版本。"}
    write_json(out / "summary.json", summary)
    write_jsonl(out / "checks.jsonl", checks)
    write_jsonl(out / "handoffs.jsonl", handoffs)
    write_jsonl(out / "skill_contacts.jsonl", contacts)
    # 只给语义裁判必要指针；不把旧裁判 verdict 作为新裁判的提示输入。
    jobs = []
    for sid in ("s5", "s12"):
        jp, sp = course / "jobs" / (sid + ".json"), course / "scenes" / (sid + ".json")
        if jp.exists() and sp.exists():
            jobs.append({"review_id": "coverage-" + sid, "target": "quiz-authoring + scene-verifier",
                "criterion": "分别映射 description、keyPoints 到题干/选项/解析；区分直接考查与旁注，不按关键词覆盖率给分",
                "source_refs": [file_ref(jp), file_ref(sp)], "required_files": [str(jp), str(sp)],
                "frozen_goal": "以此 job card 快照为准；不是后来已修改的 outline", "old_judge_label_included": False,
                "result": "unknown", "source_group": "interfaces-protocols-course"})
    write_jsonl(out / "review_requests.jsonl", jobs)
    print(json.dumps({"checks": len(checks), "handoffs": len(handoffs), "failures_by_property": summary["failures_by_property"]}, ensure_ascii=False))


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--trace-dir", required=True); p.add_argument("--workspace", required=True)
    p.add_argument("--course", required=True); p.add_argument("--course-key", default="courses/interfaces-protocols")
    p.add_argument("--creator"); p.add_argument("--out", required=True)
    a = p.parse_args()
    audit(a.trace_dir, a.workspace, a.course, a.course_key, a.out, a.creator)


if __name__ == "__main__":
    main()
