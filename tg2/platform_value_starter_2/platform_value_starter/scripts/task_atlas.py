#!/usr/bin/env python3
"""Session task map -> balanced coverage seeds and failure-regression seeds.

Standard library; no LLM calls. Outputs are pointers to candidates, NOT test gold.
One primary task per session; mixed and unknown remain visible.
"""
import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path

from common import cell, digest, read_jsonl, timestamp, write_json, write_jsonl, write_text
from evidence import label_source


def label_for(case, labels):
    explicit = labels.get(case["case_id"])
    if explicit:
        if explicit.get("source_revision") != case["source_revision"]:
            return {"task_type":"unknown","label_source":"unknown","label_note":"stale_annotation"}
        row = explicit
    else:
        # An adoption-only human review does not independently label task type.
        review = case.get("review") or {}
        row = review if review.get("task_type") else case.get("auto_assessment") or {}
    task = row.get("task_type") or "unknown"
    source = label_source(row)
    if task == "unknown": source = "unknown"
    return {"task_type":task,"label_source":source,
            "label_note":"explicit" if explicit else "existing_review_or_auto", "source_group":row.get("source_group")}


def failure_signal(session):
    # Signal only: not a tool defect, task failure or department quality verdict.
    return any((e.get("expectation_source")=="test_definition" and e.get("assertion_passed") is False) or (e.get("status")=="error" and not (
        e.get("expected_error") is True and e.get("expectation_source")=="test_definition"
        and e.get("assertion_passed") is True)) for e in session.get("tool_events",[]))


def analyze(cases, labels=(), per_cell=2, seed=42, start=None, end=None, registry=None):
    if per_cell < 1: raise ValueError("per_cell must be >=1")
    by_id = {r["case_id"]:r for r in labels}
    if len(by_id)!=len(labels): raise ValueError("one task annotation per case_id is required")
    rows=[]; excluded_time=0; registry=registry or {}
    for c in cases:
        s=c["session"]
        if start:
            ts=timestamp(s.get("start_at"))
            if not ts or not start<=ts<end:
                excluded_time+=1;continue
        label=label_for(c,by_id)
        group=label.pop("source_group",None) or s.get("source_group")
        caps=sorted({f"{e['kind']}:{e['capability_id']}@{e.get('version') or 'unknown'}"
            for e in s.get("capability_events",[]) if e.get("event_source")=="runtime" and e.get("action")=="invoke"})
        loads=sorted({f"{e['kind']}:{e['capability_id']}@{e.get('version') or 'unknown'}"
            for e in s.get("capability_events",[]) if e.get("event_source")=="runtime" and e.get("action")=="load" and e.get("success") is True})
        first_user=next((m.get("text","") for m in s.get("messages",[]) if m.get("role")=="user"),"")
        rows.append({"case_id":c["case_id"],"source_revision":c["source_revision"],
            "tenant_id":s["tenant_id"],"org":s.get("org_section") or s.get("dept") or "unknown",
            "user_id":s.get("user_id"), **label,
            "source_group":group or "session:"+c["case_id"],"source_group_basis":"declared" if group else "session_only",
            "existing_split":registry.get("case:"+c["case_id"]) or (registry.get("group:"+group) if group else None),
            "capabilities":caps,"capability_loads":loads,"failure_signal":failure_signal(s),"user_request_preview":first_user[:180]})
    cells=defaultdict(list)
    for r in rows:cells[(r["tenant_id"],r["org"],r["task_type"])].append(r)
    summaries=[]; seeds=[]; seen_groups=set()
    # Coverage-balanced selection; this is not a probability sample of production traffic.
    for key,items in sorted(cells.items()):
        summaries.append({"tenant_id":key[0],"org":key[1],"task_type":key[2],"sessions":len(items),
            "observed_users":len({r["user_id"] for r in items if r["user_id"]}),
            "label_sources":dict(Counter(r["label_source"] for r in items)),
            "error_signal_sessions":sum(r["failure_signal"] for r in items)})
        if key[2] in {"unknown","mixed"}:continue
        eligible=sorted(items,key=lambda r:digest([seed,r["case_id"]]))
        # Existing train/dev cases stay there: do not recommend them as new holdout seeds.
        eligible=[r for r in eligible if r["existing_split"] not in {"train","dev"}]
        selected=[]
        for r in eligible:
            group=(r["tenant_id"],r["source_group"])
            if group in seen_groups:continue
            selected.append((r,"coverage_seed"));seen_groups.add(group)
            if len(selected)>=per_cell:break
        # One additional failure seed if coverage picks did not already include one.
        if not any(r["failure_signal"] for r,_ in selected):
            for r in eligible:
                group=(r["tenant_id"],r["source_group"])
                if r["failure_signal"] and group not in seen_groups:
                    selected.append((r,"failure_regression_seed"));seen_groups.add(group);break
        for r,reason in selected:
            seeds.append({**r,"selection_reason":reason,"review_status":"candidate","allowed_uses":[],
                "next_step":"回看完整输入与附件，确认来源家族，补验收目标，再进入正式数据构建；预览不是完整题面"})
    unresolved=[r for r in rows if r["task_type"] in {"unknown","mixed"}]
    # Historical training/development failures are still useful, just not unseen tests.
    regressions=[]; regression_groups=set()
    for r in sorted(rows,key=lambda r:digest([seed,r["case_id"]])):
        group=(r["tenant_id"],r["source_group"])
        if r["failure_signal"] and r["existing_split"] in {"train","dev"} and group not in regression_groups:
            regressions.append({**r,"selection_reason":"seen_source_debugging","review_status":"candidate","allowed_uses":[],
                "next_step":"保留原 split；用于已见问题复现，不算未见 holdout，不自动获得训练授权"})
            regression_groups.add(group)
    cap_counts=Counter((r["tenant_id"],r["org"],r["task_type"],cap,action)
        for r in rows for action,field in (("invoke","capabilities"),("load","capability_loads")) for cap in r[field])
    edges=[dict(zip(("tenant_id","org","task_type","capability","action"),k),sessions=n,meaning="session_cooccurrence_not_causality")
        for k,n in sorted(cap_counts.items())]
    return {"rows":rows,"cells":summaries,"seeds":seeds,"regressions":regressions,"unresolved":unresolved,"edges":edges,
        "meta":{"unit":"new_session_cohort" if start else "current_session_snapshot","n_sessions":len(rows),
            "excluded_by_time_or_missing_time":excluded_time,"unknown_or_mixed":len(unresolved),
            "window":[start.isoformat(),end.isoformat()] if start else None,"seed":seed,"per_cell":per_cell,
            "sampling":"coverage_balanced_plus_failure_candidates_not_traffic_representative",
            "note":"Counts describe observed labels. Seed selection does not create gold targets, assign splits, or grant training use."}}


def render(result):
    rows=result["rows"];meta=result["meta"]
    lines=["# 任务分布与评测选题", "", f"口径：{meta['unit']}；会话 {len(rows)}，未知/多任务 {meta['unknown_or_mixed']}。一个会话按一个主任务统计，不称为独立任务总量。", "",
        "## 组织 × 主任务类型", "", "| 租户 / 组织 | 主任务 | 会话数 | 用户数 | 标签来源 | 有错误线索会话 |", "|---|---|---|---|---|---|"]
    for c in result["cells"]:
        lines.append(f"| {cell(c['tenant_id']+' / '+c['org'])} | {cell(c['task_type'])} | {c['sessions']} | {c['observed_users']} | {cell(c['label_sources'])} | {c['error_signal_sessions']} |")
    lines += ["", "## 当前快照的任务分布图", "", "标签未独立验证时，此图是‘自动标签分布’，不是业务任务真值分布。跨租户汇总仅供获准的内部离线分析。", "", "```mermaid", "pie showData", '    title "当前会话的主任务标签分布"']
    for task,n in sorted(Counter(r["task_type"] for r in rows).items()):
        safe=task.replace('"',"'").replace("\n"," ").replace("`", "'")
        lines.append(f'    "{safe}" : {n}')
    if not rows:lines=lines[:-4] + ["没有符合窗口的会话，不绘制空图。"]
    else:lines += ["```"]
    lines += ["", "## 评测候选", "", f"选出 {len(result['seeds'])} 条：覆盖候选与额外失败候选分别标记；unknown/mixed 共 {len(result['unresolved'])} 条另存待整理清单。", "",
        "- 候选仅有来源指针和请求预览，不是可直接执行的 benchmark。", "- 相同来源组只选一个；未声明来源族时只能按 session 去重，仍需合并 recipe/lot/模板衍生题。",
        "- 组织规模不决定所有名额，避免大部门淹没小部门；这不是线上代表性随机抽样。",
        f"- 已知 train/dev 来源不推荐为新 holdout；其中 {len(result['regressions'])} 个失败来源另存 development_regression_candidates.jsonl，可调试但不算未见泛化。正式构建仍由 build_datasets.py 校验。",
        "- task_capability_edges.jsonl 以 action 分开成功加载与调用；同会话共现不证明该能力完成了任务或造成错误。不能把两种边的会话数相加成使用总会话数。",
        "", "建议先人工/程序验收整理少量下游题；只有路由标签的候选继续作为路由诊断，不用来证明提示路由提升任务成功。"]
    return "\n".join(lines)+"\n"


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--cases",required=True);p.add_argument("--labels");p.add_argument("--registry")
    p.add_argument("--start");p.add_argument("--end");p.add_argument("--per-cell",type=int,default=2)
    p.add_argument("--seed",type=int,default=42);p.add_argument("--out",required=True)
    a=p.parse_args();start,end=timestamp(a.start),timestamp(a.end)
    if bool(start)!=bool(end) or (start and start>=end):raise ValueError("provide a valid start/end pair")
    result=analyze(read_jsonl(a.cases),read_jsonl(a.labels) if a.labels else [],a.per_cell,a.seed,start,end,
        json.loads(Path(a.registry).read_text()) if a.registry else None)
    out=Path(a.out)
    for name,key in (("session_task_labels","rows"),("org_task_distribution","cells"),("bench_seed_candidates","seeds"),
        ("classification_review_candidates","unresolved"),("task_capability_edges","edges"),
        ("development_regression_candidates","regressions")):
        write_jsonl(out/(name+".jsonl"),result[key])
    write_json(out/"manifest.json",result["meta"])
    write_text(out/"task_atlas.md",render(result));print(out/"task_atlas.md")


if __name__=="__main__":main()
