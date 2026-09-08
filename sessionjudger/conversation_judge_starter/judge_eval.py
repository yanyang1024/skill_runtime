#!/usr/bin/env python3
"""Reference JSON judge adapter + per-dimension human/judge agreement. Standard library."""
import argparse
import json
import os
import time
import urllib.request
from collections import Counter
from pathlib import Path
from sample_review import dump, jsonl, read, sha


def indexed(rows):
    result={r["case_id"]:r for r in rows}
    if len(result)!=len(rows):raise ValueError("duplicate case_id; choose one reviewer/run explicitly")
    return result


def validate_labels(row,packet,rubric):
    labels=row.get("labels",{})
    for d,spec in rubric["dimensions"].items():
        item=labels.get(d,{})
        if item.get("label") not in spec["labels"]:raise ValueError("invalid/missing label: "+d)
        refs=item.get("evidence_ids")
        if not isinstance(refs,list) or any(x not in packet["evidence"]["records"] for x in refs):
            raise ValueError("invalid evidence IDs: "+d)
        if item["label"]!="unknown" and not refs:raise ValueError("evidence required: "+d)
        if not isinstance(item.get("reason"),str) or not item["reason"].strip():raise ValueError("short reason required")
    initial=packet["evidence"].get("initial_context")
    if labels["context_sufficiency"]["label"]!="unknown":
        if not isinstance(initial,dict) or initial.get("complete") is not True:
            raise ValueError("initial context is not declared complete")
        if "initial" not in labels["context_sufficiency"]["evidence_ids"]:
            raise ValueError("context label must cite initial snapshot")


def judge(a):
    packets=[p for p in read(a.packets) if p["split"]==a.split]
    indexed(packets)
    rubric=json.loads(Path(a.rubric).read_text(encoding="utf-8"))
    prompt=Path(a.prompt).read_text(encoding="utf-8")
    # Only explicit CLI invocation sends data. No model calls in sample/compare/demo.
    key=os.environ.get(a.key_env,"")
    headers={"Content-Type":"application/json"}
    if key:headers["Authorization"]="Bearer "+key
    out=Path(a.out);out.parent.mkdir(parents=True,exist_ok=True)
    with out.open("x",encoding="utf-8") as f:
        for p in packets:
            row={k:p[k] for k in ("case_id","source_revision","packet_hash","split")}
            row.update(rubric_hash=sha(rubric),prompt_hash=sha(prompt),model=a.model,temperature=0,status="error")
            begin=time.monotonic()
            try:
                if sha(p["evidence"])!=p["packet_hash"]:raise ValueError("packet changed")
                payload=json.dumps({"rubric":rubric,"evidence":p["evidence"]},ensure_ascii=False)
                if len(payload)>a.max_chars:raise ValueError("oversize packet; no silent truncation")
                body={"model":a.model,"temperature":0,"messages":[{"role":"system","content":prompt},
                    {"role":"user","content":payload}]}
                request=urllib.request.Request(a.endpoint,data=json.dumps(body).encode(),headers=headers,method="POST")
                with urllib.request.urlopen(request,timeout=a.timeout) as response:
                    answer=json.load(response)
                result=json.loads(answer["choices"][0]["message"]["content"])
                validate_labels(result,p,rubric)
                row.update(status="ok",labels=result["labels"],next_check=result.get("next_check",""),usage=answer.get("usage"))
            except Exception as exc:
                # Do not print gateway bodies, request text or credentials. Failures remain in coverage.
                row["error_type"]=type(exc).__name__
            row["latency_s"]=time.monotonic()-begin
            f.write(json.dumps(row,ensure_ascii=False)+"\n");f.flush()
    print(out)


def agreement(pairs,labels):
    n=len(pairs);gold=Counter(a for a,b in pairs);pred=Counter(b for a,b in pairs)
    confusion=Counter(pairs)
    po=sum(a==b for a,b in pairs)/n if n else None
    pe=sum(gold[x]*pred[x] for x in labels)/(n*n) if n else None
    kappa=(po-pe)/(1-pe) if n and pe<1 else None
    per_class={}
    for x in labels:
        tp=confusion[x,x];denom=gold[x]+pred[x]
        per_class[x]={"human_support":gold[x],"judge_count":pred[x],
            "recall":tp/gold[x] if gold[x] else None,"precision":tp/pred[x] if pred[x] else None,
            "f1":2*tp/denom if denom else None}
    return {"n_pairs":n,"exact_agreement":po,"kappa":kappa,
        "kappa_note":"undefined when no pairs or chance agreement is one" if kappa is None else "nominal unweighted; not task accuracy",
        "confusion":[{"human":a,"judge":b,"n":c} for (a,b),c in sorted(confusion.items())],
        "per_class":per_class}


def compare(a):
    packets=[p for p in read(a.packets) if p["split"]==a.split]
    indexed(packets)
    human=indexed(read(a.human));pred=indexed(read(a.predictions))
    rubric=json.loads(Path(a.rubric).read_text(encoding="utf-8"));rh=sha(rubric)
    selected_ids={p["case_id"] for p in packets}
    runs={(r.get("model"),r.get("prompt_hash"),r.get("rubric_hash")) for r in pred.values() if r["case_id"] in selected_ids}
    if len(runs)>1:raise ValueError("mixed judge versions; compare one frozen run at a time")
    pairs={d:[] for d in rubric["dimensions"]};queue=[];excluded=Counter();modes=Counter();orgs={}
    human_eligible=0
    for p in packets:
        h,j=human.get(p["case_id"]),pred.get(p["case_id"])
        def valid_provenance(r):
            return r and r.get("packet_hash")==p["packet_hash"] and r.get("source_revision")==p["source_revision"] and r.get("rubric_hash")==rh
        if sha(p["evidence"])!=p["packet_hash"]:raise ValueError("packet changed")
        reason=None
        if not valid_provenance(h):reason="missing_or_stale_human"
        elif h.get("review_status")!="verified" or not h.get("reviewer_id") or h["reviewer_id"].startswith("AUTO"):
            reason="not_human_verified"
        elif h.get("review_mode") not in {"independent","assisted"}:reason="unknown_review_mode"
        elif a.split=="audit" and h.get("review_mode")!="independent":reason="audit_requires_blind_human"
        else:
            try:validate_labels(h,p,rubric)
            except (ValueError,TypeError):reason="invalid_human_labels"
        if reason:
            excluded[reason]+=1
            queue.append({"case_id":p["case_id"],"reason":reason,"split":a.split});continue
        human_eligible+=1;modes[h["review_mode"]]+=1
        if not valid_provenance(j) or j.get("status")!="ok":reason="missing_failed_or_stale_judge"
        else:
            try:validate_labels(j,p,rubric)
            except (ValueError,TypeError):reason="invalid_judge_labels"
        if reason:
            excluded[reason]+=1;queue.append({"case_id":p["case_id"],"reason":reason,"split":a.split});continue
        diff=[]
        org_key=p["tenant_id"]+" / "+p["org"]
        orgs.setdefault(org_key,[])
        for d in pairs:
            pair=(h["labels"][d]["label"],j["labels"][d]["label"])
            pairs[d].append(pair)
            if pair[0]!=pair[1]:diff.append(d)
            if d=="observed_outcome":orgs[org_key].append(pair)
        if diff:queue.append({"case_id":p["case_id"],"split":a.split,"reason":"disagreement","dimensions":diff,
            "next_step":"核对输入完整性、rubric 歧义、人工判断与裁判；audit 只记录发现，不边看边调分"})
    metrics={}
    for d,spec in rubric["dimensions"].items():
        results=agreement(pairs[d],spec["labels"])
        known=[(h,j) for h,j in pairs[d] if h!="unknown" and j!="unknown"]
        results["both_non_unknown"]=agreement(known,[x for x in spec["labels"] if x!="unknown"])
        results["human_unknown"]=sum(h=="unknown" for h,j in pairs[d])
        results["judge_unknown"]=sum(j=="unknown" for h,j in pairs[d])
        metrics[d]=results
    outcomes=pairs.get("observed_outcome",[])
    negatives=sum(h in {"unmet","partial"} for h,j in outcomes)
    false_met=sum(h in {"unmet","partial"} and j=="met" for h,j in outcomes)
    unknown_met=sum(h=="unknown" and j=="met" for h,j in outcomes)
    report={"split":a.split,"fixture_only":any(r.get("fixture_only") for r in human.values()),"judge_versions":[list(r) for r in runs],
        "expected_packets":len(packets),"eligible_human":human_eligible,
        "valid_judge_pairs":len(outcomes),"judge_coverage_of_eligible_human":len(outcomes)/human_eligible if human_eligible else None,
        "review_modes":dict(modes),"exclusions":dict(excluded),"dimensions":metrics,
        "false_met":{"count":false_met,"human_unmet_or_partial":negatives,"rate":false_met/negatives if negatives else None},
        "human_unknown_judge_met":unknown_met,
        "outcome_by_org":{org:agreement(v,rubric["dimensions"]["observed_outcome"]["labels"]) for org,v in orgs.items()},
        "warning":"No automatic pass threshold. Agreement is with these human references, not business value or causal attribution."}
    out=Path(a.out);out.mkdir(parents=True,exist_ok=False)
    dump(out/"agreement.json",report);jsonl(out/"review_queue.jsonl",queue)
    def fmt(v):return "N/A" if v is None else f"{v:.3f}"
    lines=["# 人工参考与裁判一致性", "", "虚构夹具演示：不是实际人机实验。" if report['fixture_only'] else "人工参考的正确性仍需审阅。",
        "",f"分集：{a.split}；计划 {len(packets)}，合格人工参考 {human_eligible}，有效人机对 {len(outcomes)}。",
        "", "| 维度 | 有效对数 | 一致率 | κ（含 unknown） | 双方非 unknown 对数 | 双方非 unknown κ |", "|---|---|---|---|---|---|"]
    for d,m in metrics.items():
        lines.append(f"| {d} | {m['n_pairs']} | {fmt(m['exact_agreement'])} | {fmt(m['kappa'])} | {m['both_non_unknown']['n_pairs']} | {fmt(m['both_non_unknown']['kappa'])} |")
    lines += ["",f"把未满足/部分满足判成 met：{false_met}/{negatives}；人工 unknown 被判 met：{unknown_met}。",
        "", "未响应/坏 JSON/过期记录不会悄悄剔除：见 agreement.json 的 exclusions 和覆盖率。",
        "", "小样本切片只看具体案例和分子分母；不自动宣布裁判达标。audit 用于一次性核验，调过以后需新独立题。",
        "", "人工参考若也看不见附件或缺少业务标准，不能因为人机一致就声称真实完成。"]
    (out/"agreement.md").write_text("\n".join(lines)+"\n",encoding="utf-8");print(out)


def main():
    p=argparse.ArgumentParser(description=__doc__);sub=p.add_subparsers(dest="cmd",required=True)
    for name in ("judge","compare"):
        x=sub.add_parser(name);x.add_argument("--packets",required=True);x.add_argument("--rubric",required=True)
        x.add_argument("--split",choices=["pilot","calibration","audit","reading"],default="calibration")
        x.add_argument("--out",required=True)
        if name=="judge":
            x.add_argument("--endpoint",required=True);x.add_argument("--model",required=True)
            x.add_argument("--key-env",default="JUDGE_API_KEY");x.add_argument("--timeout",type=int,default=120)
            x.add_argument("--max-chars",type=int,default=200000)
            x.add_argument("--prompt",default=str(Path(__file__).with_name("judge_prompt.md")))
        else:x.add_argument("--human",required=True);x.add_argument("--predictions",required=True)
    a=p.parse_args();judge(a) if a.cmd=="judge" else compare(a)


if __name__=="__main__":main()
