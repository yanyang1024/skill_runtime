"""Regression tests for metric integrity and training/benchmark leakage."""
import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from adapt_exports import md_messages
from bench import compare, grade
from build_datasets import build, validate_curated
from common import digest, timestamp, write_json, write_jsonl
from synthesize_slots import synthesize
from value_loop import add_reviews, case_id, connect, ingest, report, reuse_edges, snapshot, token_rows


def session(sid="s",tenant="t"):
    return {"tenant_id":tenant,"session_id":sid,"user_id":"u","start_at":"2026-08-01T00:00:00Z","end_at":"2026-08-02T00:00:00Z",
        "messages":[{"role":"user","text":"谢谢，还没解决","ts":"2026-08-01T00:00:00Z"}],"stats":{}}


def curated(s, split="train"):
    return {"id":s["session_id"],"case_id":case_id(s),"source_revision":digest(s),"source_group":"family-"+s["session_id"],
        "reviewer_id":"reviewer","review_status":"approved","context_complete":True,"split":split,
        "task_type":"query_extract","messages":[{"role":"user","content":"query "+s["session_id"]}],
        "target":{"lot_id":"L1","wafer":1,"metric":"cd"},"rubric":["exact slots"],"allowed_uses":["bench","sft"]}


class Integrity(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(); self.root=Path(self.tmp.name)
        self.db=connect(self.root/"test.db")
    def tearDown(self):
        self.db.close(); self.tmp.cleanup()
    def test_repeat_ingest_and_update_invalidates_review_without_losing_old_cases(self):
        s,t=session(),session("other")
        self.assertEqual(ingest(self.db,[s,t]),{"inserted":2})
        self.assertEqual(ingest(self.db,[s,t]),{"unchanged":2})
        r={"review_id":"r1","case_id":case_id(s),"source_revision":digest(s),"reviewer_id":"u",
           "reviewed_at":"2026-08-03T00:00:00Z","outcome":"usable","adoption":"unknown"}
        add_reviews(self.db,[r]); add_reviews(self.db,[r])
        s["messages"].append({"role":"user","text":"仍有问题","ts":"2026-08-04T00:00:00Z"})
        ingest(self.db,[s])
        rows=snapshot(self.db)
        self.assertEqual(len(rows),2)
        item=next(c for c in rows if c["case_id"]==case_id(s))
        self.assertTrue(item["stale_review"]); self.assertIsNone(item["review"])
        self.assertEqual(item["case_label"],"review")
    def test_thanks_no_outcome_and_empty_tokens_unknown(self):
        ingest(self.db,[session()])
        result=report(snapshot(self.db),timestamp("2026-08-01T00:00:00Z"),timestamp("2026-09-01T00:00:00Z"),self.root/"report")
        self.assertEqual(result["usable"],0)
        self.assertEqual(result["outcome_unknown_including_unreviewed"],1)
        self.assertIsNone(result["input_tokens_observed"])
    def test_markdown_code_fence_is_not_a_role(self):
        msgs=md_messages("## User\nquestion\n## Assistant\n```md\n## User\nquoted\n```\n")
        self.assertEqual(len(msgs),2)
        with self.assertRaises(ValueError): md_messages("This is an ordinary document.md")
    def test_request_dedup_and_partial_summary_exclusion(self):
        s,t=session(),session("child")
        request={"request_id":"r","ts":"2026-08-02T00:00:00Z","input_tokens":100,"output_tokens":10}
        s["requests"]=[request]; t["requests"]=[copy.deepcopy(request)]
        ingest(self.db,[s,t])
        rows,excluded=token_rows(snapshot(self.db),timestamp("2026-08-01T00:00:00Z"),timestamp("2026-09-01T00:00:00Z"))
        self.assertEqual(len(rows),1); self.assertEqual(excluded["duplicate_request_observations"],1)
        crossing=session("crossing"); crossing["start_at"]="2026-07-31T00:00:00Z"
        crossing["stats"]={"input_tokens":100000,"output_tokens":1000,"usage_scope":"session_exclusive"}
        ingest(self.db,[crossing])
        rows,excluded=token_rows(snapshot(self.db),timestamp("2026-08-01T00:00:00Z"),timestamp("2026-09-01T00:00:00Z"))
        self.assertEqual(sum(r["input_tokens"] for r in rows),100)
        self.assertEqual(excluded["summary_unattributable_or_missing"],1)
    def test_tenant_version_and_time_asset_identity(self):
        ss=[session("write"),session("read"),session("cross","other"),session("early")]
        for i,s in enumerate(ss):
            s["artifact_events"]=[{"event_id":str(i),"artifact_id":"shared/report.md","version":"v1","op":"write" if i==0 else "read","success":True,
                "ts":"2026-08-03T00:00:00Z" if i in (1,2) else "2026-08-02T00:00:00Z" if i==0 else "2026-08-01T00:00:00Z"}]
        ingest(self.db,ss)
        self.assertEqual(len(reuse_edges(snapshot(self.db))),1)
    def test_cross_split_group_and_historical_holdout_rejected(self):
        s,t=session(),session("other"); ingest(self.db,[s,t]); cases=snapshot(self.db)
        a,b=curated(s,"holdout"),curated(t,"train")
        b["source_group"]=a["source_group"]
        with self.assertRaises(ValueError): validate_curated([a,b],cases)
        build([a],cases,self.root/"d1",self.root/"registry.json")
        a["split"]="train"
        with self.assertRaises(ValueError): build([a],cases,self.root/"d2",self.root/"registry.json")
    def test_exact_duplicate_cross_split_rejected(self):
        s,t=session(),session("other"); ingest(self.db,[s,t])
        a,b=curated(s),curated(t,"holdout")
        b["messages"]=a["messages"]
        with self.assertRaises(ValueError):validate_curated([a,b],snapshot(self.db))
    def test_synthetic_never_uses_holdout_and_never_auto_approves(self):
        rows=[curated(session()),curated(session("held"),"holdout")]
        out=synthesize(rows,3,42)
        self.assertEqual(len(out),3)
        self.assertTrue(all(x["split"]=="train" and x["review_status"]=="candidate" for x in out))
    def test_json_grader_checks_meaning_not_keywords(self):
        self.assertTrue(grade('{"x":1}',{"x":1}))
        self.assertFalse(grade('{"x":true}',{"x":1}))
        self.assertFalse(grade('答案含有 x 和 1',{"x":1}))
    def test_missing_runs_are_not_a_tie(self):
        meta={"task_ids":["q"],"config":{"trials":1},"bench":{"tasks_sha256":"x"},"model":"demo","mock":True}
        for p in (self.root/"a",self.root/"b"):
            write_json(p/"run_manifest.json",meta); write_jsonl(p/"results.jsonl",[])
        compare(self.root/"a",self.root/"b",self.root/"compare.md")
        text=(self.root/"compare.md").read_text()
        self.assertIn("缺失配对 1",text); self.assertIn("双方未通过 0",text)


if __name__=="__main__": unittest.main()
