#!/usr/bin/env python3
"""Optional CPU baseline: character TF-IDF + logistic regression task classifier.

Needs scikit-learn. No model download. Never predicts business value or employee
performance. A held-out result from demo data is not evidence of production quality.
"""
import argparse
import pickle
from collections import Counter
from pathlib import Path

from common import digest, read_jsonl, write_json


def check_splits(parts):
    groups, texts = {}, {}
    for split, rows in parts.items():
        for r in rows:
            if r["split"] != split:
                raise ValueError("unexpected split tag")
            g, t = r["source_group"], " ".join(r["text"].lower().split())
            if (g in groups and groups[g] != split) or (t in texts and texts[t] != split):
                raise ValueError("train/eval source or exact text overlap")
            groups[g] = split; texts[t] = split


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--train", required=True); ap.add_argument("--dev", required=True)
    ap.add_argument("--test", help="optional final holdout; do not tune on this")
    ap.add_argument("--out", required=True); ap.add_argument("--threshold", type=float, default=0.75)
    a = ap.parse_args()
    if not 0 <= a.threshold <= 1:
        raise ValueError("threshold must be in [0,1]")
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.linear_model import LogisticRegression
    from sklearn.metrics import classification_report, confusion_matrix, f1_score
    from sklearn.pipeline import make_pipeline
    import sklearn

    parts = {"train": read_jsonl(a.train), "dev": read_jsonl(a.dev)}
    if a.test: parts["holdout"] = read_jsonl(a.test)
    check_splits(parts)
    train = parts["train"]
    if len({r["label"] for r in train}) < 2 or not parts["dev"]:
        raise ValueError("need >=2 train labels and a nonempty grouped dev set")
    model = make_pipeline(TfidfVectorizer(analyzer="char", ngram_range=(2,4), sublinear_tf=True, max_features=40000),
                          LogisticRegression(C=1.0, max_iter=1000, class_weight="balanced", random_state=42))
    model.fit([r["text"] for r in train], [r["label"] for r in train])
    majority = Counter(r["label"] for r in train).most_common(1)[0][0]
    report = {"sklearn_version": sklearn.__version__, "train_n": len(train), "train_sha256": digest(train),
              "threshold": a.threshold, "threshold_note": "Illustrative cutoff; probability is not calibrated. Tune on dev only.", "eval": {}}
    for split, rows in parts.items():
        if split == "train" or not rows: continue
        texts, y = [r["text"] for r in rows], [r["label"] for r in rows]
        pred = list(model.predict(texts))
        conf = model.predict_proba(texts).max(axis=1)
        selected = [i for i,v in enumerate(conf) if v >= a.threshold]
        labels = sorted(set(y) | set(pred))
        report["eval"][split] = {"n": len(rows), "labels": labels,
            "macro_f1": f1_score(y, pred, average="macro", zero_division=0),
            "majority_macro_f1": f1_score(y, [majority]*len(y), average="macro", zero_division=0),
            "classification_report": classification_report(y,pred,output_dict=True,zero_division=0),
            "confusion_matrix": confusion_matrix(y,pred,labels=labels).tolist(),
            "selected_n": len(selected), "selected_accuracy": sum(pred[i] == y[i] for i in selected)/len(selected) if selected else None,
            "selection_coverage": len(selected)/len(rows), "eval_sha256": digest(rows)}
    out = Path(a.out)
    if out.exists(): raise ValueError("model output exists; create a new version")
    out.mkdir(parents=True)
    # Only load this pickle from a trusted local artifact; pickle is executable data.
    with (out / "router.pkl").open("xb") as f: pickle.dump(model, f)
    write_json(out / "metrics.json", report)
    print(out / "metrics.json")


if __name__ == "__main__":
    main()
