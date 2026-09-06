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
from org_skill_map import collect, gap_rows
from reuse_signals import edges as reuse_sig_edges, events as reuse_events, skill_reuse
from route_hint import apply as hint_apply, predict_mock


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
        text=(self.root/"compare.md").read_text(encoding="utf-8")
        self.assertIn("缺失配对 1",text); self.assertIn("双方未通过 0",text)


class FieldEvidence(unittest.TestCase):
    """Guardrails added from real-data iteration (docs/06_field_notes.md)."""
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(); self.root=Path(self.tmp.name)
    def tearDown(self):
        self.tmp.cleanup()
    def test_tool_dev_failures_never_enter_production_stats(self):
        dev=session("dev"); dev["dept"]="工具科"; dev["purpose"]="tool_dev"
        dev["tool_events"]=[{"event_id":"e1","name":"fab_query","origin":"custom","status":"error","ts":"2026-08-01T01:00:00Z"}]
        use=session("use"); use["dept"]="工艺科"; use["purpose"]="tool_use"
        use["tool_events"]=[{"event_id":"e2","name":"fab_query","origin":"custom","status":"success","ts":"2026-08-01T02:00:00Z"}]
        _,tool,_=collect([dev,use])
        self.assertEqual(tool[("工具科","fab_query","custom","tool_dev")],[1,1])
        self.assertEqual(tool[("工艺科","fab_query","custom","tool_use")],[1,0])
    def test_upload_is_stronger_than_read_and_cross_user_is_separate(self):
        w=session("w"); w["user_id"]="alice"
        w["artifact_events"]=[{"event_id":"w1","artifact_id":"a","version":"v1","op":"write","success":True,"ts":"2026-08-01T01:00:00Z"}]
        up=session("up"); up["user_id"]="bob"
        up["artifact_events"]=[{"event_id":"u1","artifact_id":"a","version":"v1","op":"upload","success":True,"ts":"2026-08-02T01:00:00Z"}]
        same=session("same"); same["user_id"]="alice"
        same["artifact_events"]=[{"event_id":"r1","artifact_id":"a","version":"v1","op":"read","success":True,"ts":"2026-08-03T01:00:00Z"}]
        writes,consumes=reuse_events([w,up,same])
        es=reuse_sig_edges(writes,consumes)
        self.assertEqual([(e["kind"],e["op"]) for e in es],[("cross_user","upload"),("same_user","read")])
    def test_skill_reuse_counts_depts_and_users(self):
        a,b=session("a"),session("b"); b["user_id"]="v"; b["dept"]="d2"; a["dept"]="d1"
        a["skills_used"]=b["skills_used"]=["etch-data"]
        r=skill_reuse([a,b])[0]
        self.assertEqual((r["depts"],r["users"],r["sessions"]),(2,2,2))
    def test_org_section_locked_to_one_split(self):
        s,t=session(),session("other"); ingest_db=connect(self.root/"t.db"); ingest(ingest_db,[s,t]); cases=snapshot(ingest_db); ingest_db.close()
        a,b=curated(s,"train"),curated(t,"holdout")
        a["org_section"]=b["org_section"]="IAD-D"
        with self.assertRaises(ValueError): validate_curated([a,b],cases)
    def test_hint_only_applied_above_threshold(self):
        from common import read_jsonl
        s=session(); ingest_db=connect(self.root/"h.db"); ingest(ingest_db,[s]); cases=snapshot(ingest_db); ingest_db.close()
        rows=[curated(s,"holdout")]; rows[0]["allowed_uses"]=["bench"]
        write_jsonl(self.root/"tasks.jsonl",rows)
        hint_apply(self.root/"tasks.jsonl","mock",None,0.95,self.root/"hinted")
        hinted=read_jsonl(self.root/"hinted"/"tasks.jsonl")
        meta=json.loads((self.root/"hinted"/"manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(hinted[0]["messages"][-1]["content"],rows[0]["messages"][-1]["content"])  # below 0.95: unchanged
        self.assertEqual(meta["hinted"],0)
        preds=predict_mock(rows)
        self.assertEqual(len(preds),1) and self.assertIn(preds[0]["label"],("knowledge","coding","data_analysis"))
    def test_atlas_unknown_never_disappears_and_min_n_suppressed(self):
        import subprocess
        s1=session("s1"); s1["dept"]="d1"; s1["messages"]=[{"role":"user","text":"统计这份表格的均值","ts":"2026-08-01T00:00:00Z"}]
        s2=session("s2"); s2["dept"]="d1"; s2["messages"]=[{"role":"user","text":"一段没有关键词的话","ts":"2026-08-02T00:00:00Z"}]
        write_jsonl(self.root/"sessions.jsonl",[s1,s2])
        write_json(self.root/"kw.json",{"data_analysis":["统计"]})
        subprocess.run([sys.executable,str(Path(__file__).resolve().parents[1]/"scripts"/"task_atlas.py"),
                        str(self.root/"sessions.jsonl"),"--keywords",str(self.root/"kw.json"),
                        "--min-n","2","--out",str(self.root/"atlas")],check=True)
        text=(self.root/"atlas"/"task_atlas.md").read_text(encoding="utf-8")
        stats=json.loads((self.root/"atlas"/"task_atlas.json").read_text(encoding="utf-8"))
        self.assertEqual(stats["tiers"],{"keywords":1,"unknown":1})
        self.assertIn("| d1 | 2 | - |",text)  # data_analysis n=1 < min-n 2 -> suppressed, unknown column likewise
    def test_bench_compare_has_org_slice(self):
        meta={"task_ids":["q1","q2"],"config":{"trials":1},"bench":{"tasks_sha256":"x"},"model":"m","mock":True,
              "task_info":{"q1":{"task_type":"t","subset":"representative","org":"IAD-D"},
                           "q2":{"task_type":"t","subset":"representative","org":"BEOL"}}}
        write_json(self.root/"a"/"run_manifest.json",meta)
        write_jsonl(self.root/"a"/"results.jsonl",[{"id":"q1","trial":0,"passed":True,"status":"ok"},{"id":"q2","trial":0,"passed":True,"status":"ok"}])
        write_json(self.root/"b"/"run_manifest.json",meta)
        write_jsonl(self.root/"b"/"results.jsonl",[{"id":"q1","trial":0,"passed":True,"status":"ok"},{"id":"q2","trial":0,"passed":False,"status":"ok"}])
        compare(self.root/"a",self.root/"b",self.root/"cmp.md")
        text=(self.root/"cmp.md").read_text(encoding="utf-8")
        self.assertIn("组织分片",text); self.assertIn("| BEOL | 1 | 1/1 (100.0%) | 0/1 (0.0%) | 1 |",text)


if __name__=="__main__": unittest.main()
