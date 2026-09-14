#!/usr/bin/env python3
"""契约审计（profile 驱动）：交接回执、一致性、静态 Skill 检查；不自动给 Harness 总分。

所有业务约定（回执必填字段、角色配对、一致性映射、复核目标）都在 --profile JSON 里声明，
脚本不含任何特定业务（课程/recipe/文档）的死逻辑。输出全部是契约检查与候选，不是质量总分。
模板见 assets/audit_profile.example.json。
"""
import argparse
import glob as globmod
import hashlib
import json
import re
from collections import Counter
from pathlib import Path, PurePosixPath


def sha(data):
    return hashlib.sha256(data).hexdigest()


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_jsonl(path, rows):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows), encoding="utf-8")


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def file_ref(path, pointer=""):
    path = Path(path)
    return f"{path.name}@{sha(path.read_bytes())}#{pointer}"


def get_path(obj, dotted):
    """按点分路径取值；缺失返回 None。支持 list 索引（数字段）。"""
    cur = obj
    for part in str(dotted).split("."):
        if isinstance(cur, list) and part.isdigit() and int(part) < len(cur):
            cur = cur[int(part)]
        elif isinstance(cur, dict) and part in cur:
            cur = cur[part]
        else:
            return None
    return cur


def audit(trace_dir, roots, profile, out):
    trace_dir, out = Path(trace_dir), Path(out)
    roots = {k: Path(v).resolve() for k, v in roots.items()}
    out.mkdir(parents=True, exist_ok=False)
    events = [json.loads(l) for l in (trace_dir / "events.jsonl").read_text(encoding="utf-8").splitlines() if l.strip()]
    manifests = load(trace_dir / "manifest.json") if (trace_dir / "manifest.json").is_file() else []
    roles = profile.get("roles", {})
    markers = {"skill_tool_output": "<skill_content", "read_result": "<content>",
               **profile.get("contact_markers", {})}
    # 逻辑路径前缀 -> 根名：历史导出里的相对路径据此映射到当前根；绝对路径不映射。
    path_roots = profile.get("path_roots", {})
    checks, contacts, handoffs = [], [], []
    version = profile.get("rule_version", "unversioned-profile")

    def emit(dimension, name, result, observation, refs, **extra):
        row = {"dimension": dimension, "name": name, "result": result, "observation": observation,
               "evidence_refs": refs, "kind": "contract_check", "rule_version": version, **extra}
        row["signal_id"] = sha(json.dumps(row, sort_keys=True, ensure_ascii=False).encode())[:24]
        checks.append(row)

    def resolve(ref):
        p = PurePosixPath(str(ref))
        if p.is_absolute() or ".." in p.parts:
            return None  # 历史绝对路径不自动映射为当前主机文件。
        base_name, rel = "workspace", p
        for prefix in sorted(path_roots, key=len, reverse=True):
            if str(p) == prefix or str(p).startswith(prefix.rstrip("/") + "/"):
                base_name = path_roots[prefix]
                rel = p.relative_to(PurePosixPath(prefix))
                break
        base = roots.get(base_name)
        if base is None:
            return None
        target = (base / str(rel)).resolve()
        return target if target == base or base in target.parents else None

    # ---- 交接与回执（task 事件）----
    pair_cfg = profile.get("pair_check") or {}
    for e in events:
        args = e.get("input") if isinstance(e.get("input"), dict) else {}
        if e.get("tool") == "task":
            role = args.get("subagent_type", "unknown")
            rcfg = roles.get(role, {})
            r = e.get("receipt") or {}
            prompt = str(args.get("prompt", ""))
            id_re = rcfg.get("prompt_id_regex")
            ids = sorted(set(re.findall(id_re, prompt))) if id_re else []
            item_id = ids[0] if len(ids) == 1 else None
            handoffs.append({"session_id": e["session_id"], "caller": e.get("agent_label"), "role": role,
                "item_id": item_id, "child_session_id": e.get("child_session_id"),
                "dispatch_state": e.get("dispatch_state"), "receipt_format": e.get("receipt_format"),
                "receipt": r, "evidence_ref": e["evidence_ref"],
                "child_actions_observed": False, "historical_artifact_hash": None})
            emit("agent", "receipt_strict_json", "pass" if e.get("receipt_format") == "exact_json" else "fail",
                 {"format": e.get("receipt_format"), "recoverable": bool(r)}, [e["evidence_ref"]],
                 target=role, meaning="仅格式契约；可恢复 JSON 不能解释成业务失败")
            required = set(rcfg.get("required_receipt_fields", []))
            schema_ok = bool(r) and required <= r.keys()
            sf, sv = rcfg.get("status_field"), rcfg.get("status_values")
            if sf and sv:
                schema_ok = schema_ok and r.get(sf) in sv
            vf, vv = rcfg.get("verdict_field"), rcfg.get("verdict_values")
            if vf and vv:
                schema_ok = schema_ok and r.get(vf) in vv
            if rcfg.get("checks_field"):
                schema_ok = schema_ok and isinstance(r.get(rcfg["checks_field"]), dict)
            emit("agent", "receipt_minimum_fields",
                 "unknown" if role not in roles else "pass" if schema_ok else "fail",
                 {"role": role}, [e["evidence_ref"]], target=role)
            pp_re = rcfg.get("prompt_pointer_regex")
            if pp_re:
                emit("agent", "prompt_pointer_present", "pass" if re.search(pp_re, prompt) else "fail",
                     {"item_id": item_id}, [e["evidence_ref"]], target=role)
            af = rcfg.get("artifact_field")
            if af and r.get(af):
                p = resolve(r.get(af))
                emit("agent", "claimed_artifact_in_supplied_snapshot", "pass" if p and p.is_file() else "unknown",
                     {"item_id": item_id, "historical_same_version": "unknown"},
                     [e["evidence_ref"]] + ([file_ref(p)] if p and p.is_file() else []), target=role)
            cf = rcfg.get("checks_field")
            if vf and cf and isinstance(r.get(cf), dict):
                fails = any(str(v).lower().startswith("fail") for v in r[cf].values())
                emit("agent", "verdict_internal_consistency",
                     "fail" if fails and r.get(vf) != "fail" else "pass",
                     {"verdict": r.get(vf), "any_check_fail": fails}, [e["evidence_ref"]], target=role)
                emit("agent", "verifier_execution_evidence", "unknown",
                     {"verdict_claim": r.get(vf), "child_trace_supplied": False}, [e["evidence_ref"]], target=role,
                     meaning="task 返回 completed 不证明裁判实际执行/只读/覆盖正确；这不是判它没有执行")
        if e.get("tool") == "skill":
            contacts.append({"session_id": e["session_id"], "observer": e.get("agent_label"),
                "skill": args.get("name"),
                "contact": "skill_tool_output" if markers["skill_tool_output"] in str(e.get("output", "")) else "skill_request",
                "evidence_ref": e["evidence_ref"]})
        if e.get("tool") == "read" and profile.get("skill_path_marker", "/skills/") in str(args.get("filePath", "")):
            contacts.append({"session_id": e["session_id"], "observer": e.get("agent_label"),
                "path": args["filePath"],
                "contact": "read_result" if markers["read_result"] in str(e.get("output", "")) else "read_request",
                "evidence_ref": e["evidence_ref"], "applied_correctly": "unknown"})

    # ---- 配对检查：只在同一主会话内配对同一对象指针 ----
    if pair_cfg:
        brole, vrole = pair_cfg.get("builder_role"), pair_cfg.get("verifier_role")
        for session in sorted({h["session_id"] for h in handoffs}):
            hs = [h for h in handoffs if h["session_id"] == session]
            for iid in sorted({h["item_id"] for h in hs if h["item_id"]}):
                builds = [h for h in hs if h["item_id"] == iid and h["role"] == brole]
                verifies = [h for h in hs if h["item_id"] == iid and h["role"] == vrole]
                emit("agent", "builder_verifier_pair_observed", "pass" if builds and verifies else "unknown",
                     {"item_id": iid, "builder_calls": len(builds), "verifier_calls": len(verifies),
                      "context_isolation_verified": False},
                     [h["evidence_ref"] for h in builds + verifies], target=pair_cfg.get("owner", "dispatcher"))

    # ---- 一致性检查：集合文档 vs 派生文档的字段映射（全部来自 profile）----
    for cc in profile.get("consistency_checks", []):
        src, der = cc["source"], cc["derived"]
        sroot, droot = roots.get(src["root"]), roots.get(der["root"])
        if not sroot or not droot:
            continue
        sdoc = sroot / src["file"]
        if not sdoc.is_file():
            continue
        items = {get_path(x, src["id_field"]): x for x in get_path(load(sdoc), src["items"]) or []}
        for dp in sorted(droot.glob(der["glob"])):
            doc = load(dp)
            iid = get_path(doc, der["id_field"])
            item = items.get(iid, {})
            refs = [file_ref(dp), file_ref(sdoc, f"/{src['items']}/id={iid}")]
            drift = [name for name, m in cc.get("compare", {}).items()
                     if get_path(item, m.get("source")) != get_path(doc, m.get("derived"))]
            emit(cc.get("dimension", "agent"), cc["name"], "fail" if drift else "pass",
                 {"item_id": iid, "different_fields": drift}, refs,
                 target=cc.get("target", "unknown"), scope="supplied_snapshot_only")

    # ---- 引用可解析检查：文档中的路径字段是否指向存在的文件 ----
    for rc in profile.get("reference_checks", []):
        droot = roots.get(rc["root"])
        if not droot:
            continue
        for dp in sorted(droot.glob(rc["glob"])):
            doc = load(dp)
            bad = {}
            for field in rc.get("fields", []):
                v = get_path(doc, field)
                suffix = rc.get("suffixes", {}).get(field, "")
                values = v if isinstance(v, list) else [v]
                for i, one in enumerate(values):
                    if one is None:
                        continue
                    ref = str(one) + suffix
                    p = resolve(ref)
                    if not p or not p.is_file():
                        bad[f"{field}[{i}]" if isinstance(v, list) else field] = ref
            emit(rc.get("dimension", "tools"), rc["name"], "fail" if bad else "pass",
                 {"doc": dp.name, "missing": bad}, [file_ref(dp)],
                 target=rc.get("target", "unknown"), scope="current_files_not_historical_files")

    # ---- 静态 Skill/Agent 检查（不代替运行时加载探针）----
    for sc in profile.get("static_checks", []):
        root = roots.get(sc["root"])
        if not root:
            continue
        for sp in root.glob(sc.get("skill_glob", "skills/*/SKILL.md")):
            text = sp.read_text(encoding="utf-8-sig")
            m = re.search(r"(?m)^name:\s*([^\n]+)", text)
            declared = m[1].strip().strip("\"'") if m else None
            emit("skill", "skill_name_directory_match", "pass" if declared == sp.parent.name else "fail",
                 {"package": sc["root"], "directory": sp.parent.name, "declared_name": declared}, [file_ref(sp)],
                 target=declared, scope="static_public_contract; internal_loader_may_differ")
        for ap in root.glob(sc.get("agent_glob", "agents/*.md")):
            text = ap.read_text(encoding="utf-8-sig")
            if re.search(r"(?m)^\s+edit:\s*deny", text) and re.search(r"(?m)^\s+write:\s*allow", text):
                emit("agent", "permission_semantics_probe_needed", "unknown",
                     {"agent": ap.stem, "edit": "deny", "write": "allow"}, [file_ref(ap)],
                     target=ap.stem, kind="review_candidate",
                     next_check="核对当前实际 runtime 的写权限收口，不依据模板字面证明可写；启动微型写入探针")

    # ---- 语义复核请求：只给必要指针，不带旧裁判结论 ----
    reviews = []
    for rv in profile.get("review_requests", []):
        files, refs = [], []
        for root_name, rel in rv.get("files", []):
            p = (roots.get(root_name) or Path(".")) / rel
            if p.is_file():
                files.append(str(p))
                refs.append(file_ref(p))
        reviews.append({"review_id": rv["review_id"], "target": rv.get("target"), "criterion": rv.get("criterion"),
            "source_refs": refs, "required_files": files, "frozen_goal": rv.get("frozen_goal"),
            "old_judge_label_included": False, "result": "unknown", "source_group": rv.get("source_group")})

    by_role = Counter(h["role"] for h in handoffs)
    summary = {"source_sessions": manifests, "dispatch_roles": dict(by_role), "rule_version": version,
        "receipt_formats": dict(Counter(h["receipt_format"] for h in handoffs)),
        "check_counts": dict(Counter(c["name"] for c in checks)),
        "failures_by_property": dict(Counter(c["name"] for c in checks if c["result"] == "fail")),
        "note": "不跨属性计算总通过率；格式偏离、业务效果、缺少执行证据是不同问题。配置快照不冒充历史实际加载版本。"}
    write_json(out / "summary.json", summary)
    write_jsonl(out / "checks.jsonl", checks)
    write_jsonl(out / "handoffs.jsonl", handoffs)
    write_jsonl(out / "skill_contacts.jsonl", contacts)
    write_jsonl(out / "review_requests.jsonl", reviews)
    print(json.dumps({"checks": len(checks), "handoffs": len(handoffs),
                      "failures_by_property": summary["failures_by_property"]}, ensure_ascii=False))


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--trace-dir", required=True)
    p.add_argument("--root", action="append", default=[], metavar="NAME=PATH",
                   help="命名根目录，可多次；至少一个，默认名 workspace")
    p.add_argument("--profile", required=True)
    p.add_argument("--out", required=True)
    a = p.parse_args()
    roots = {}
    for item in a.root:
        name, _, path = item.partition("=")
        if not path:
            name, path = "workspace", name
        roots[name] = path
    if not roots:
        p.error("至少一个 --root")
    audit(a.trace_dir, roots, load(a.profile), a.out)


if __name__ == "__main__":
    main()
