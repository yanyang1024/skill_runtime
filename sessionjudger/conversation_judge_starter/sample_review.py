#!/usr/bin/env python3
"""Standard-library sampler. Accepts prior cases.jsonl or normalized session JSONL."""
import argparse
import hashlib
import json
import random
from collections import Counter, defaultdict
from pathlib import Path


def sha(obj):
    return hashlib.sha256(json.dumps(obj,ensure_ascii=False,sort_keys=True,allow_nan=False).encode()).hexdigest()


def read(path):
    with open(path,encoding="utf-8-sig") as f:
        return [json.loads(line) for line in f if line.strip()]


def dump(path,obj):
    Path(path).write_text(json.dumps(obj,ensure_ascii=False,indent=2,allow_nan=False)+"\n",encoding="utf-8")


def jsonl(path,rows):
    Path(path).write_text("".join(json.dumps(r,ensure_ascii=False,allow_nan=False)+"\n" for r in rows),encoding="utf-8")


def packet(row):
    s=row.get("session",row)
    cid=row.get("case_id") or sha([s["tenant_id"],s["session_id"]])[:24]
    refs={}
    # Intentionally exclude prior AUTO/human labels, employee names and department from judge input.
    for field,prefix in (("messages","m"),("tool_events","t"),("artifact_events","a"),("capability_events","c")):
        for i,event in enumerate(s.get(field,[])):
            refs[prefix+str(i)]=event
    initial=s.get("initial_context")
    if initial is not None:refs["initial"]=initial
    tools=s.get("tool_events",[])
    evidence={"records":refs,"coverage":s.get("coverage",{}),
        "initial_context":initial,"observed_counts":{
            "user_messages":sum(m.get("role")=="user" for m in s.get("messages",[])),
            "tool_status":dict(Counter(e.get("status","unknown") for e in tools)),
            "verified_expected_errors":sum(e.get("status")=="error" and e.get("expected_error") is True
                and e.get("expectation_source")=="test_definition" and e.get("assertion_passed") is True for e in tools),
            "failed_test_assertions":sum(e.get("expectation_source")=="test_definition" and e.get("assertion_passed") is False for e in tools)},
        "count_scope":"observed records in supplied export; no completeness inference"}
    return {"case_id":cid,"source_revision":row.get("source_revision") or sha(s),
        "tenant_id":s["tenant_id"],"org":s.get("org_section") or s.get("dept") or "unknown",
        "source_group":s.get("source_group") or "session:"+cid,
        "group_basis":"declared" if s.get("source_group") else "session_only",
        "packet_hash":sha(evidence),"evidence":evidence}


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("input");p.add_argument("--out",required=True);p.add_argument("--n",type=int,default=400)
    p.add_argument("--seed",type=int,default=42);p.add_argument("--pilot",type=int,default=30)
    p.add_argument("--calibration",type=int,default=40);p.add_argument("--audit",type=int,default=60)
    p.add_argument("--rubric",default=str(Path(__file__).with_name("rubric.json")))
    a=p.parse_args()
    if a.n<1 or min(a.pilot,a.calibration,a.audit)<0:raise ValueError("invalid sample sizes")
    rows=[packet(r) for r in read(a.input)]
    if len({r['case_id'] for r in rows})!=len(rows):raise ValueError("duplicate case IDs; use one current snapshot per case")
    rng=random.Random(a.seed)
    selected=rng.sample(sorted(rows,key=lambda r:r["case_id"]),min(a.n,len(rows)))
    # First sample sessions uniformly. Then keep known source families in one judge split.
    groups=defaultdict(list)
    for r in selected:groups[(r["tenant_id"],r["source_group"])].append(r)
    keys=sorted(groups);rng.shuffle(keys)
    counts=Counter()
    for key in keys:
        split=next((s for s,n in (("pilot",a.pilot),("calibration",a.calibration),("audit",a.audit)) if counts[s]<n),"reading")
        for r in groups[key]:r["split"]=split;counts[split]+=1
    out=Path(a.out);out.mkdir(parents=True,exist_ok=False)
    jsonl(out/"packets.jsonl",selected)
    rubric=json.loads(Path(a.rubric).read_text(encoding="utf-8"))
    rh=sha(rubric);dump(out/"rubric.json",rubric)
    templates=[{k:r[k] for k in ("case_id","source_revision","packet_hash","split")} | {
        "rubric_hash":rh,"reviewer_id":"","review_status":"pending","review_mode":"independent",
        "labels":{d:{"label":"unknown","evidence_ids":[],"reason":"待人工填写"} for d in rubric['dimensions']},
        "next_check":""} for r in selected]
    jsonl(out/"human_template.jsonl",templates)
    for split in counts:
        cards=["# 人工精读卡："+split,"", "先独立判断，再看 AI；不要把 pending 模板当金标准。JSON 保留完整证据，不自动截断。", ""]
        for r in selected:
            if r["split"]!=split:continue
            cards += ["## "+r["case_id"],"", "证据哈希："+r["packet_hash"],"", "``````json",
                json.dumps(r["evidence"],ensure_ascii=False,indent=2),"``````",""]
        (out/("read_"+split+".md")).write_text("\n".join(cards),encoding="utf-8")
    dump(out/"manifest.json",{"population_sessions":len(rows),"sample_sessions":len(selected),
        "sampling":"simple_random_sessions_without_replacement","seed":a.seed,
        "inclusion_probability":len(selected)/len(rows) if rows else None,"splits":dict(counts),
        "rubric_hash":rh,"input_file_sha256":hashlib.sha256(Path(a.input).read_bytes()).hexdigest(),
        "note":"Family preservation can exceed split targets. Judge splits do not override existing training/benchmark registries."})
    print(json.dumps(dict(counts)))


if __name__=="__main__":main()
