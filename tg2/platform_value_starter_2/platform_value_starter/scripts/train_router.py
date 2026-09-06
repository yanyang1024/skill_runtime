#!/usr/bin/env python3
"""CPU TF-IDF + logistic regression, keywords and majority on identical splits.
Weak-reference metrics are agreement, not independently verified intent accuracy.
Only scikit-learn is optional; no model download or GPU is required.
"""
import argparse
import pickle
from collections import Counter
from pathlib import Path
from common import digest, read_jsonl, write_json
from route_prompts import keyword_route, load_rules


def check_splits(parts, org_holdout=False):
    seen = {}
    for split, rows in parts.items():
        for r in rows:
            if r["split"] != split: raise ValueError("unexpected split tag")
            keys = ["group:"+r["source_group"],"text:"+" ".join(r["text"].casefold().split())]
            if r.get("case_id"): keys.append("case:"+r["case_id"])
            if org_holdout:
                if not r.get("tenant_id") or r.get("org_section") in {None,"","unknown"}: raise ValueError("org holdout needs known tenant and org")
                keys.append("org:"+r["tenant_id"]+":"+r["org_section"])
            for key in keys:
                if key in seen and seen[key] != split: raise ValueError("train/eval source, text or requested org overlap")
                seen[key] = split


def selected_metrics(y, pred, scores, threshold):
    selected = [i for i,v in enumerate(scores) if v >= threshold]
    correct = sum(pred[i] == y[i] for i in selected)
    return {"threshold":threshold,"selected_n":len(selected),"selected_correct":correct,
        "selected_accuracy":correct/len(selected) if selected else None,"selection_coverage":len(selected)/len(y) if y else None}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--train",required=True);ap.add_argument("--dev",required=True)
    ap.add_argument("--test",help="final holdout; do not tune on it");ap.add_argument("--out",required=True)
    ap.add_argument("--threshold",type=float,default=0.75);ap.add_argument("--keywords",help="JSON label -> keyword list; align to your taxonomy")
    ap.add_argument("--org-holdout",action="store_true",help="optional cross-org transfer check")
    a=ap.parse_args()
    if not 0<=a.threshold<=1:raise ValueError("threshold must be in [0,1]")
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import classification_report, confusion_matrix, f1_score
    from sklearn.pipeline import make_pipeline
    import sklearn
    parts={"train":read_jsonl(a.train),"dev":read_jsonl(a.dev)}
    if a.test:parts["holdout"]=read_jsonl(a.test)
    check_splits(parts,a.org_holdout)
    train=parts["train"]
    if len({r["label"] for r in train})<2 or not parts["dev"]:raise ValueError("need >=2 train labels and nonempty dev")
    rules=load_rules(a.keywords)
    labels=sorted({r["label"] for rows in parts.values() for r in rows})
    model=make_pipeline(TfidfVectorizer(analyzer="char",ngram_range=(2,4),sublinear_tf=True,max_features=40000),
        LogisticRegression(C=1.0,max_iter=1000,class_weight="balanced",random_state=42))
    model.fit([r["text"] for r in train],[r["label"] for r in train])
    majority=Counter(r["label"] for r in train).most_common(1)[0][0]
    report={"sklearn_version":sklearn.__version__,"train_n":len(train),"train_sha256":digest(train),
        "train_source_groups":sorted({r["source_group"] for r in train}),
        "train_case_ids":sorted({r["case_id"] for r in train if r.get("case_id")}),
        "train_text_hashes":sorted({digest(" ".join(r["text"].casefold().split())) for r in train}),
        "train_label_sources":dict(Counter(r.get("label_source","unknown") for r in train)),
        "evaluation_goal":"cross_org_transfer" if a.org_holdout else "source_group_generalization",
        "fixed_macro_labels":labels,"keyword_rule_sha256":digest(rules),"threshold":a.threshold,
        "threshold_note":"Uncalibrated score. Select threshold on dev only; holdout gets one preselected cutoff.",
        "note":"All methods use the same label set; keyword abstentions count as errors. Weak-label accuracy means reference agreement.","eval":{}}
    for split,rows in parts.items():
        if split=="train" or not rows:continue
        texts,y=[r["text"] for r in rows],[r["label"] for r in rows]
        pred=list(model.predict(texts));scores=model.predict_proba(texts).max(axis=1).tolist()
        kp=[keyword_route(t,rules) for t in texts]
        baselines={"tfidf_logreg":pred,"keywords":kp,"majority":[majority]*len(y)}
        metrics={name:{"macro_f1":float(f1_score(y,p,labels=labels,average="macro",zero_division=0)),
            "correct":sum(a==b for a,b in zip(y,p)),"n":len(y),"abstentions":p.count("__abstain__")}
            for name,p in baselines.items()}
        qualities=Counter(r.get("reference_quality","unknown") for r in rows)
        item={"n":len(rows),"metrics_meaning":"validated_target_agreement" if set(qualities)=={"validated"} else "includes_weak_or_unknown_reference_agreement",
            "reference_quality_counts":dict(qualities),"label_source_counts":dict(Counter(r.get("label_source","unknown") for r in rows)),
            "baselines":metrics,"classification_report":classification_report(y,pred,labels=labels,output_dict=True,zero_division=0),
            "confusion_matrix":confusion_matrix(y,pred,labels=labels).tolist(),"labels":labels,
            **selected_metrics(y,pred,scores,a.threshold),"eval_sha256":digest(rows),"slices":[]}
        for field in ("org_section","reference_quality","source_kind"):
            for value in sorted({r.get(field,"unknown") for r in rows}):
                ix=[i for i,r in enumerate(rows) if r.get(field,"unknown")==value]
                item["slices"].append({"field":field,"value":value,"n":len(ix),
                    "macro_f1":float(f1_score([y[i] for i in ix],[pred[i] for i in ix],labels=labels,average="macro",zero_division=0)),
                    **selected_metrics([y[i] for i in ix],[pred[i] for i in ix],[scores[i] for i in ix],a.threshold)})
        if split=="dev":item["dev_threshold_curve"]=[selected_metrics(y,pred,scores,t) for t in sorted({0.0,0.42,0.5,0.75,0.9,a.threshold})]
        report["eval"][split]=item
    out=Path(a.out)
    if out.exists():raise ValueError("model output exists; create a new version")
    out.mkdir(parents=True)
    with (out/"router.pkl").open("xb") as f:pickle.dump(model,f)
    write_json(out/"metrics.json",report)
    print(out/"metrics.json")


if __name__=="__main__":main()
