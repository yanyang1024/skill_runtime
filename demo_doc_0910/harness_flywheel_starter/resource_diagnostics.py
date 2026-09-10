#!/usr/bin/env python3
"""Org x tool/skill/agent diagnostics, plus artifact reintroduction evidence.

Zero dependencies. No department is automatically treated as a testing department.
Loads, invocations, uploads, byte matches and business adoption remain separate.
"""
import argparse
import hashlib
from collections import Counter, defaultdict
from pathlib import Path

from common import cell, digest, rate, read_jsonl, timestamp, write_json, write_jsonl, write_text

TRUSTED_METADATA = {"runtime", "registry", "manifest", "human"}


def events(cases, field, start=None, end=None):
    index, missing = {}, 0
    for c in cases:
        s = c["session"]
        for e in s.get(field, []):
            ts = timestamp(e.get("ts"))
            if not ts:
                missing += 1; continue
            if start and not start <= ts < end:
                continue
            key = (s["tenant_id"], e["event_id"])
            org = s.get("org_section") or s.get("dept") or "unknown"
            if key in index:
                old = index[key]
                if digest(old["event"]) != digest(e):
                    raise ValueError(f"conflicting {field} event id: {e['event_id']}")
                old["source_cases"].add(c["case_id"])
                if old["org"] != org:
                    old["org"] = "unknown"  # Ambiguous projection, no arbitrary department attribution.
                if old["user_id"] != s.get("user_id"):
                    old["user_id"] = None
                continue
            index[key] = {"tenant_id": s["tenant_id"], "org": org, "user_id": s.get("user_id"),
                          "case_id": c["case_id"], "source_cases": {c["case_id"]}, "event": e}
    return list(index.values()), missing


def phase_of(e):
    phase = e.get("usage_phase", "unknown")
    return phase if e.get("phase_source") in TRUSTED_METADATA and phase in {"development","acceptance","production"} else "unknown"


def origin_of(e):
    return e.get("tool_origin") if e.get("origin_source") in TRUSTED_METADATA and e.get("tool_origin") in {"native","custom"} else "unknown"


def capability_key(e):
    cap = e.get("capability", {})
    if cap.get("kind") in {"skill","agent"} and cap.get("id"):
        return (cap["kind"],cap["id"],cap.get("version") or "unknown")
    return ("unknown","unbound","unknown")


def tool_summary(cases, start, end, min_calls=20):
    observed, missing = events(cases,"tool_events",start,end)
    groups = {}
    for x in observed:
        e = x["event"]
        cap = capability_key(e)
        key = (x["tenant_id"],x["org"],phase_of(e),origin_of(e),e.get("tool_id") or e.get("name") or "unknown",
               e.get("tool_version") or "unknown",*cap)
        g = groups.setdefault(key,{"counts":Counter(),"cases":set(),"error_cases":set(),"users":set(),"targets":set(),"error_kinds":Counter(),"event_ids":[]})
        count = g["counts"]
        status = e.get("status","unknown")
        count["events"] += 1
        count[status if status in {"success","error","cancelled"} else "unknown"] += 1
        expected = status == "error" and e.get("expected_error") is True and e.get("expectation_source") == "test_definition" and e.get("assertion_passed") is True
        count["expected_error"] += int(expected)
        count["assertion_failed"] += int(e.get("assertion_passed") is False and e.get("expectation_source") == "test_definition")
        if status=="error" and not expected:
            g["error_cases"].update(x["source_cases"])
            g["error_kinds"][e.get("error_kind") or "unknown"] += 1
        g["cases"].update(x["source_cases"])
        if x["user_id"]: g["users"].add(x["user_id"])
        if e.get("underlying_target"): g["targets"].add(e["underlying_target"])
        g["event_ids"].append(e["event_id"])
    rows = []
    for key,g in sorted(groups.items()):
        n = g["counts"]
        known = n["success"]+n["error"]
        eligible = known-n["expected_error"]
        unexpected = n["error"]-n["expected_error"]
        rows.append(dict(zip(("tenant_id","org","phase","origin","tool_id","tool_version","capability_kind","capability_id","capability_version"),key),
            **dict(n), known_calls=known, non_expected_test_calls=eligible, unexpected_errors=unexpected,
            unexpected_error_rate=unexpected/eligible if eligible else None,
            observed_sessions=len(g["cases"]),error_observed_sessions=len(g["error_cases"]),observed_users=len(g["users"]),error_kinds=dict(g["error_kinds"]),
            underlying_targets=sorted(g["targets"]),event_ids=g["event_ids"],
            sample_note="small_sample" if eligible < min_calls else "descriptive_only"))
    return rows,missing


def capability_summary(cases, catalog, start, end):
    observed,missing = events(cases,"capability_events",start,end)
    catalog_by_key = {}
    for r in catalog:
        key = (r["tenant_id"],r["kind"],r["capability_id"],r.get("version") or "unknown")
        if key in catalog_by_key: raise ValueError("duplicate capability catalog version")
        catalog_by_key[key] = r
    groups = {}
    for x in observed:
        e = x["event"]
        key = (x["tenant_id"],e["kind"],e["capability_id"],e.get("version") or "unknown",x["org"])
        g = groups.setdefault(key,{"load_cases":set(),"invoke_cases":set(),"successful_invoke_cases":set(),"users":set(),"mentions":0})
        if e.get("event_source") != "runtime" or e["action"] == "mention":
            g["mentions"] += 1; continue
        if e["action"] == "load" and e.get("success") is True: g["load_cases"].update(x["source_cases"])
        if e["action"] == "invoke":
            g["invoke_cases"].update(x["source_cases"])
            if e.get("success") is True: g["successful_invoke_cases"].update(x["source_cases"])
        if x["user_id"]: g["users"].add(x["user_id"])
    rows = []
    for key,g in sorted(groups.items()):
        cat = catalog_by_key.get(key[:4],{})
        rows.append(dict(zip(("tenant_id","kind","capability_id","version","consumer_org"),key),
            provider_org=cat.get("provider_org") or "unknown",category=cat.get("category") or "unknown",load_sessions=len(g["load_cases"]),
            invocation_sessions=len(g["invoke_cases"]),successful_invocation_sessions=len(g["successful_invoke_cases"]),
            observed_users=len(g["users"]),text_mentions=g["mentions"]))
    supply = []
    for key,cat in sorted(catalog_by_key.items()):
        if cat.get("visibility_source") not in TRUSTED_METADATA:
            continue  # No denominator without a reliable visible-to-org inventory.
        published = timestamp(cat.get("published_at"))
        retired=timestamp(cat.get("retired_at"))
        if not published or published >= end or (retired and retired<=start): continue
        for org in cat.get("visible_to_orgs",[]):
            matched = [r for r in rows if tuple(r[k] for k in ("tenant_id","kind","capability_id","version")) == key and r["consumer_org"] == org]
            n = sum(r["invocation_sessions"] for r in matched)
            loads = sum(r["load_sessions"] for r in matched)
            unversioned = any(r["tenant_id"] == key[0] and r["kind"] == key[1] and r["capability_id"] == key[2]
                and r["version"] == "unknown" and r["consumer_org"] == org
                and (r["load_sessions"] or r["invocation_sessions"]) for r in rows)
            if not n:
                supply.append({"tenant_id":key[0],"kind":key[1],"capability_id":key[2],"version":key[3],"org":org,
                               "load_sessions":loads,"invocation_sessions":n,
                               "reason":"loaded_but_no_observed_invocation" if loads else "version_unresolved_usage" if unversioned else "visible_but_no_observed_invocation",
                               "interpretation":"候选：加载已是材料接触证据；没有 invoke 事件可能是平台无此事件定义。未知版本使用不能归给具体版本；不能推断没有需求/宣传失败"})
    return rows,supply,missing


def identity(e):
    return (e["artifact_id"],e["version"]) if e.get("artifact_id") and e.get("version") else None


def byte_hash(e):
    h = str(e.get("sha256","")).lower()
    size=e.get("size_bytes")
    return h if len(h)==64 and all(c in "0123456789abcdef" for c in h) and e.get("sha256_source")=="file_bytes" and type(size) is int and size>0 else None


def asset_relations(cases,start,end):
    observed,missing = events(cases,"artifact_events")  # Earlier writes may precede reporting window.
    writes_id,writes_hash = defaultdict(list),defaultdict(list)
    for x in observed:
        e=x["event"]
        if e["op"] != "write" or not e.get("success"): continue
        if identity(e): writes_id[(x["tenant_id"],identity(e))].append(x)
        if byte_hash(e): writes_hash[(x["tenant_id"],byte_hash(e))].append(x)
    result=[]
    for x in observed:
        e=x["event"]
        if e["op"] not in {"upload","read"} or not e.get("success") or not start <= timestamp(e["ts"]) < end: continue
        source_identity=identity(e)
        method="same_asset_version"
        if e.get("lineage_source") in {"runtime","registry"} and e.get("source_artifact_id") and e.get("source_version"):
            source_identity=(e["source_artifact_id"],e["source_version"]); method="explicit_lineage"
        def eligible(pool):
            return [w for w in pool if not (w["source_cases"] & x["source_cases"]) and timestamp(w["event"]["ts"]) < timestamp(e["ts"])]
        candidates=eligible(writes_id.get((x["tenant_id"],source_identity),[]))
        if not candidates and byte_hash(e):
            candidates=eligible(writes_hash.get((x["tenant_id"],byte_hash(e)),[])); method="identical_bytes_candidate"
        if not candidates: continue
        source_cases=sorted({c for w in candidates for c in w["source_cases"]})
        ambiguous=len(source_cases)>1
        result.append({"tenant_id":x["tenant_id"],"consumer_case_ids":sorted(x["source_cases"]),
            "consumer_org":x["org"],"event_id":e["event_id"],"event_at":e["ts"],"operation":e["op"],"method":method,
            "source_case_ids":source_cases,"source_orgs":sorted({w["org"] for w in candidates}),
            "ambiguous_source":ambiguous,"source_attribution_confirmed":method!="identical_bytes_candidate" and not ambiguous,
            "interpretation":"重新上传，不等于已阅读/采用" if e["op"]=="upload" else "观察到文件读取，不等于业务采用"})
    return result,missing


def report(cases,catalog,start,end,out,min_calls=20):
    tools,tm=tool_summary(cases,start,end,min_calls)
    caps,supply,cm=capability_summary(cases,catalog,start,end)
    assets,am=asset_relations(cases,start,end)
    out=Path(out)
    write_jsonl(out/"org_tool_metrics.jsonl",tools)
    write_jsonl(out/"org_capability_usage.jsonl",caps)
    write_jsonl(out/"supply_candidates.jsonl",supply)
    write_jsonl(out/"artifact_relations.jsonl",assets)
    coverage={"cases":len(cases),"missing_event_timestamps":{"tool":tm,"capability":cm,"artifact":am},
        "declared_complete_capability_sessions":sum(c["session"].get("coverage",{}).get("capability_events_complete") is True for c in cases)}
    write_json(out/"coverage.json",coverage)
    lines=["# 组织 × 工具 / skill / agent 诊断", "", f"窗口 [{start.isoformat()}, {end.isoformat()})。这是一份问题与使用线索表，不是部门价值排名。", "",
        "开发、验收、生产只接受明确来源元数据；缺失保持 unknown。自定义工具不自动等于测试；原生 bash 也可能在运行自定义脚本。", "",
        "| 组织 | 阶段 | 来源 | 工具 / 版本 | 直接绑定能力 | 原始错误/已知调用 | 已验证预期错误 | 非预期错误/排除预期测试后的调用 | 断言失败次数 | 样本 |",
        "|---|---|---|---|---|---|---|---|---|---|"]
    for r in tools:
        lines.append(f"| {cell(r['org'])} | {r['phase']} | {r['origin']} | {cell(r['tool_id'])} / {cell(r['tool_version'])} | {cell(r['capability_kind']+':'+r['capability_id']+'@'+r['capability_version'])} | {rate(r.get('error',0),r['known_calls'])} | {r.get('expected_error',0)} | {rate(r['unexpected_errors'],r['non_expected_test_calls'])} | {r.get('assertion_failed',0)} | {r['sample_note']} |")
    lines += ["", "表中‘非预期’只表示未被证明是通过断言的预期错误，不等于已确认缺陷。工具事件只有直接带 capability 绑定时才做错误归属，不向所有加载过的 skill 平摊。表内错误仍不是最终任务失败；先看 error_kind、underlying_target、assertion_failed 与恢复结果，再决定该改工具、数据、提示还是模型。", "",
        "## 能力使用与扩散", "", "| 类型 / 能力 / 版本 | 提供部门 | 使用部门 | 成功加载会话 | 调用会话 | 已知成功调用会话 | 用户数 |", "|---|---|---|---|---|---|---|"]
    for r in caps:
        lines.append(f"| {cell(r['kind']+':'+r['capability_id']+'@'+r['version'])} | {cell(r['provider_org'])} | {cell(r['consumer_org'])} | {r['load_sessions']} | {r['invocation_sessions']} | {r['successful_invocation_sessions']} | {r['observed_users']} |")
    lines += ["",f"可见但未观察到调用的候选：{len(supply)}。加载不等于执行，调用不等于成果被采用。查看 supply_candidates.jsonl；没有可靠可见范围时不会生成该候选。", "",
        "## 文件产物的再次进入与使用", "", f"观察到关联 {len(assets)} 条：上传 {sum(a['operation']=='upload' for a in assets)}；读取 {sum(a['operation']=='read' for a in assets)}。",
        f"其中仅字节匹配候选 {sum(a['method']=='identical_bytes_candidate' for a in assets)}，来源有歧义 {sum(a['ambiguous_source'] for a in assets)}。不按 basename 关联，也不把 hash 相同直接归功于某一部门。", "",
        "覆盖信息见 coverage.json。无事件表示未观察到，不表示没有复用。测试期与发布后应按 capability/tool 版本及阶段分别观察；不从部门名称猜阶段。"]
    write_text(out/"resource_diagnostics.md","\n".join(lines)+"\n")
    return {"tool_groups":len(tools),"capability_groups":len(caps),"asset_relations":len(assets)}


def hash_files(manifest,out):
    base=Path(manifest).resolve().parent
    rows=[]
    for r in read_jsonl(manifest):
        path=base/r["path"]
        h=hashlib.sha256()
        with path.open("rb") as f:
            for chunk in iter(lambda:f.read(1024*1024),b""):h.update(chunk)
        rows.append({**r,"sha256":h.hexdigest(),"sha256_source":"file_bytes","size_bytes":path.stat().st_size})
    write_jsonl(out,rows)


def main():
    p=argparse.ArgumentParser(description=__doc__);sub=p.add_subparsers(dest="cmd",required=True)
    a=sub.add_parser("report");a.add_argument("--cases",required=True);a.add_argument("--catalog")
    a.add_argument("--start",required=True);a.add_argument("--end",required=True);a.add_argument("--out",required=True)
    a.add_argument("--min-calls",type=int,default=20)
    a=sub.add_parser("hash-files");a.add_argument("manifest");a.add_argument("--out",required=True)
    a=p.parse_args()
    if a.cmd=="hash-files":hash_files(a.manifest,a.out)
    else:
        start,end=timestamp(a.start),timestamp(a.end)
        if not start or not end or start>=end:raise ValueError("invalid window")
        print(report(read_jsonl(a.cases),read_jsonl(a.catalog) if a.catalog else [],start,end,a.out,a.min_calls))


if __name__=="__main__":main()
