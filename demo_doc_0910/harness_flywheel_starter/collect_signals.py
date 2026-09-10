#!/usr/bin/env python3
"""Reuse the existing resource diagnostics; emit evidence-backed review candidates."""
import argparse
from collections import defaultdict
from pathlib import Path
from common import digest, read_jsonl, timestamp, write_json, write_jsonl, write_text
from resource_diagnostics import events, phase_of, report

VERSION = "signals-v1"


def normalize(rows):
    cases=[]
    for row in rows:
        s=row.get("session",row)
        cases.append({"case_id":row.get("case_id") or digest([s["tenant_id"],s["session_id"]])[:24],
            "source_revision":row.get("source_revision") or digest(s),"session":s})
    if len({c["case_id"] for c in cases})!=len(cases):raise ValueError("use one current snapshot per case")
    return cases


def extract(cases,catalog,start,end,out):
    out=Path(out);out.mkdir(parents=True,exist_ok=False)
    report(cases,catalog,start,end,out/"resources")
    signals=[];revisions={c["case_id"]:c["source_revision"] for c in cases}
    tool_events,_=events(cases,"tool_events",start,end)

    def refs(items):
        return sorted({f"{cid}@{revisions[cid]}/{x['event']['event_id']}" for x in items for cid in x['source_cases']})

    def emit(name,scope,observation,evidence,next_check,**extra):
        evidence=sorted(set(evidence))
        signals.append({"signal_id":digest([VERSION,name,scope,observation,evidence])[:24],
            "kind":"observation","name":name,"scope":scope,"observation":observation,"evidence_refs":evidence,
            "extractor_version":VERSION,"state":"candidate","next_check":next_check,**extra})

    for row in read_jsonl(out/"resources/org_tool_metrics.jsonl"):
        if not (row["unexpected_errors"] or row.get("assertion_failed",0)):continue
        selected=[e for e in tool_events if e['tenant_id']==row['tenant_id'] and e['event']['event_id'] in row['event_ids']]
        scope={k:row[k] for k in ("tenant_id","org","phase","origin","tool_id","tool_version","capability_kind","capability_id","capability_version")}
        emit("tool_problem",scope,{k:row.get(k) for k in (
            "known_calls","unexpected_errors","expected_error","assertion_failed","error_kinds","observed_sessions")},
            refs(selected),"先核对测试阶段、错误输入和工具契约；不把错误比例当部门价值或工具缺陷率")

    # Chronology is only linked when runtime supplies branch IDs. No guessing across subagents.
    branches=defaultdict(list);unlinked=0
    for x in tool_events:
        e=x['event']
        if not e.get('run_id') or not e.get('branch_id'):
            unlinked+=1;continue
        branches[(x['tenant_id'],e['run_id'],e['branch_id'])].append(x)
    for key,items in branches.items():
        items.sort(key=lambda x:timestamp(x['event']['ts']))
        retries=defaultdict(list);issues=defaultdict(list)
        for x in items:
            e=x['event'];expected=e.get('expected_error') is True and e.get('expectation_source')=='test_definition' and e.get('assertion_passed') is True
            if e.get('status')=='error' and not expected and e.get('args') is not None:
                signature=(e.get('tool_id') or e.get('name'),e.get('tool_version'),phase_of(e),
                    digest(e['args']),e.get('input_revision'),e.get('error_kind'))
                retries[signature].append(x)
            if e.get('issue_id'):issues[(e['issue_id'],e.get('tool_id') or e.get('name'),e.get('tool_version'),phase_of(e))].append(x)
        for signature,repeat in retries.items():
            if len(repeat)<3:continue
            emit("same_args_error_repeated",{"tenant_id":key[0],"run_id":key[1],"branch_id":key[2],
                "tool_id":signature[0],"tool_version":signature[1],"phase":signature[2]},
                {"events":len(repeat),"args_hash":signature[3],"input_revision":signature[4],"error_kind":signature[5]},
                refs(repeat),"3 次只是排查示例；核对动态数据、轮询和限流后，才能判断是否无进展；不要求连续发生")
        for issue_key,chain in issues.items():
            prior=None
            for x in chain:
                e=x['event']
                if e.get('status')=='error':prior=x
                elif e.get('status')=='success' and prior and timestamp(prior['event']['ts'])<timestamp(e['ts']):
                    emit("call_error_then_success",{"tenant_id":key[0],"run_id":key[1],"branch_id":key[2],
                        "issue_id":issue_key[0],"tool_id":issue_key[1],"tool_version":issue_key[2],"phase":issue_key[3]},
                        {"earlier_status":"error","later_status":"success","task_outcome":"unknown"},refs([prior,x]),
                        "复盘前后改变及预期负例；调用恢复不证明任务完成，也不证明修改造成成功")
                    prior=None

    for row in read_jsonl(out/"resources/artifact_relations.jsonl"):
        emit("artifact_reintroduced",{"tenant_id":row['tenant_id'],"org":row['consumer_org']},row,
            [f"{cid}@{revisions[cid]}/{row['event_id']}" for cid in row['consumer_case_ids']],
            "核对来源、实际使用和验收；hash 候选不自动归因，上传不等于采用")
    # Preserve direct runtime evidence for loads/invokes; no inferred skill-use event.
    caps,_=events(cases,"capability_events",start,end)
    for row in read_jsonl(out/"resources/org_capability_usage.jsonl"):
        if not(row['load_sessions'] or row['invocation_sessions']):continue
        selected=[x for x in caps if x['tenant_id']==row['tenant_id'] and x['org']==row['consumer_org']
            and (x['event'].get('kind'),x['event'].get('capability_id'),x['event'].get('version') or 'unknown')
            ==(row['kind'],row['capability_id'],row['version']) and x['event'].get('event_source')=='runtime']
        emit("capability_contact",{k:row[k] for k in ('tenant_id','consumer_org','provider_org','kind','capability_id','version')},row,
            refs(selected),"分别看加载和调用；仅作为能力使用与扩散线索，不证明任务收益")

    signals.sort(key=lambda s:s['signal_id'])
    write_jsonl(out/"signals.jsonl",signals)
    # A few real pointers are enough for the next review; no full transcripts or old labels injected.
    prompt=Path(__file__).with_name('review_prompt.md').read_text(encoding='utf-8')
    jobs=[{"signal_id":s['signal_id'],"system_prompt":prompt,"signal":s,
        "context_status":"fetch_source_evidence_before_diagnosis"} for s in signals if s['name']!='capability_contact']
    write_jsonl(out/"review_requests.jsonl",jobs)
    write_json(out/"manifest.json",{"extractor_version":VERSION,"window":[start.isoformat(),end.isoformat()],
        "input_cases":len(cases),"signals":len(signals),"unlinked_tool_events_for_sequence_checks":unlinked,
        "field_coverage":{field:{"provided_cases":sum(field in c['session'] for c in cases),
            "declared_complete_cases":sum(c['session'].get('coverage',{}).get(field+'_complete') is True for c in cases)}
            for field in ('tool_events','capability_events','artifact_events')},
        "snapshot_hash":digest(cases),"note":"Signals overlap. No evidence of task completion is inferred from tool status."})
    lines=["# 信号复盘入口", "", "以下是观测候选，未做 AI 根因判断，也未更改任何运行时规则。", "",
        "| 信号 | 类型 | 范围 | 下一步 |", "|---|---|---|---|"]
    def cell(x):return str(x).replace('|','\\|').replace('\n',' ')
    for s in signals:lines.append(f"| {s['signal_id']} | {s['name']} | {cell(s['scope'])} | {cell(s['next_check'])} |")
    lines += ["", "原始计数、分母、缺失时间戳及资产关联见 resources/。未发现候选不表示没有问题；不同类型可能引用同一事件，不能把信号条数当失败次数。"]
    write_text(out/"review_queue.md","\n".join(lines)+"\n")
    return signals


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('input');p.add_argument('--catalog')
    p.add_argument('--start',required=True);p.add_argument('--end',required=True);p.add_argument('--out',required=True)
    a=p.parse_args();start,end=timestamp(a.start),timestamp(a.end)
    if not start or not end or start>=end:raise ValueError('invalid window')
    print(len(extract(normalize(read_jsonl(a.input)),read_jsonl(a.catalog) if a.catalog else [],start,end,a.out)),"signals")


if __name__=='__main__':main()
