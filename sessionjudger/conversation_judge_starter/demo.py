#!/usr/bin/env python3
"""Offline format demo with explicitly fictional human/judge fixtures; no model call."""
import argparse
import subprocess
import sys
from pathlib import Path
from sample_review import read, jsonl, sha
from judge_eval import agreement


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument("out");a=p.parse_args()
    out=Path(a.out);out.mkdir(parents=True,exist_ok=False);root=Path(__file__).resolve().parent
    sessions=[]
    for i in range(12):
        sessions.append({"tenant_id":"DEMO","session_id":"fictional-"+str(i),"dept":"虚构部门",
            "source_group":"family-"+str(i),"coverage":{"messages_complete":True},
            "messages":[{"role":"user","text":"只计算 2+3，返回数字。"},
                {"role":"assistant","text":"5" if i%2==0 else "6"}],
            "initial_context":{"complete":True,"user_request":"只计算 2+3，返回数字。","attachments":[],"available_resources":[]}})
    jsonl(out/"sessions.jsonl",sessions)
    subprocess.run([sys.executable,str(root/"sample_review.py"),str(out/"sessions.jsonl"),"--n","12",
        "--pilot","2","--calibration","4","--audit","4","--out",str(out/"sample")],check=True)
    humans=read(out/"sample/human_template.jsonl");packets={r["case_id"]:r for r in read(out/"sample/packets.jsonl")}
    predictions=[]
    for n,h in enumerate(humans):
        evidence=packets[h['case_id']]['evidence'];correct=evidence['records']['m1']['text']=="5"
        labels={"task_type":("data_analysis",["m0"]),"context_sufficiency":("sufficient",["initial"]),
            "observed_outcome":("met" if correct else "unmet",["m0","m1"]),
            "blocking_point":("no_observed_block" if correct else "output_mismatch",["m0","m1"])}
        h.update(review_status="verified",reviewer_id="FICTIONAL_REFERENCE_NOT_A_PERSON",fixture_only=True,
            labels={d:{"label":v,"evidence_ids":ids,"reason":"仅演示：对照算术任务及结果。"} for d,(v,ids) in labels.items()})
        # Copy via JSON-style reconstruction to avoid modifying human references.
        j={k:h[k] for k in ('case_id','source_revision','packet_hash','split','rubric_hash')}
        j.update(status="ok",model="FICTIONAL_JUDGE",prompt_hash=sha("fixture"),
            labels={d:dict(item) for d,item in h['labels'].items()},fixture_only=True)
        if n%3==0:j['labels']['observed_outcome']={"label":"unknown","evidence_ids":[],"reason":"虚构弃权"}
        predictions.append(j)
    jsonl(out/"human_fixture.jsonl",humans);jsonl(out/"judge_fixture.jsonl",predictions)
    subprocess.run([sys.executable,str(root/"judge_eval.py"),"compare","--packets",str(out/"sample/packets.jsonl"),
        "--rubric",str(out/"sample/rubric.json"),"--human",str(out/"human_fixture.jsonl"),
        "--predictions",str(out/"judge_fixture.jsonl"),"--split","audit","--out",str(out/"comparison")],check=True)
    # Only two arithmetic boundaries: no extra testing framework.
    assert agreement([('a','a'),('b','b')],['a','b'])['kappa']==1
    assert agreement([('a','a')],['a'])['kappa'] is None
    print("Fictional demo only:",out/"comparison/agreement.md")


if __name__=="__main__":main()
