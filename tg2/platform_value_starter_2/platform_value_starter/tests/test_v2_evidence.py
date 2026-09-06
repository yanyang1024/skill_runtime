"""V2 regression checks for the user's empirical failure modes."""
import copy
import tempfile
import unittest
from pathlib import Path
from test_invariants import session, curated
from adapt_exports import convert
from bench import freeze
from build_datasets import build
from common import digest, read_jsonl, timestamp
from evidence import label_source
from pull_sessions import collect_user
from resource_diagnostics import asset_relations, tool_summary, capability_summary
from route_prompts import PromptPolicy, keyword_route
from value_loop import add_reviews, case_id, connect, ingest, report, snapshot, token_rows

START=timestamp("2026-08-01T00:00:00Z");END=timestamp("2026-09-01T00:00:00Z")


class EmpiricalChecks(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        self.db=connect(self.root/"evidence.db")
    def tearDown(self):
        self.db.close();self.temp.cleanup()
    def test_auto_is_not_human_even_if_marked_approved_or_human(self):
        s=session();ingest(self.db,[s])
        r={"review_id":"auto","case_id":case_id(s),"source_revision":digest(s),"reviewer_id":"AUTO:heuristic-v1",
            "label_source":"human","reviewed_at":"2026-08-04T00:00:00Z","outcome":"usable","adoption":"used"}
        add_reviews(self.db,[r]);rows=snapshot(self.db)
        self.assertEqual(label_source(r),"heuristic");self.assertIsNone(rows[0]["review"])
        metrics=report(rows,START,END,self.root/"report")
        self.assertEqual(metrics["deduplicated_used_work_items"],0)
        self.assertEqual(metrics["auto_assessed_sessions"],1)
        human={**r,"review_id":"human","reviewer_id":"user","reviewed_at":"2026-08-03T00:00:00Z","adoption":"unknown"}
        add_reviews(self.db,[human]);self.assertEqual(snapshot(self.db)[0]["review"]["review_id"],"human")
    def test_weak_labels_go_only_to_diagnostic_bench_and_no_sft(self):
        s=session();ingest(self.db,[s]);r=curated(s,"holdout")
        r.update(reviewer_id="AUTO:heuristic-v1",label_source="heuristic")
        out=self.root/"dataset"
        manifest=build([r],snapshot(self.db),out,self.root/"splits.json",export_sft=True)
        self.assertEqual(manifest["counts"]["bench_candidates.jsonl"],0)
        weak=read_jsonl(out/"bench_diagnostic_candidates.jsonl")
        self.assertEqual(len(weak),1)
        with self.assertRaises(ValueError):freeze(weak,self.root/"gold")
        freeze(weak,self.root/"diagnostic","diagnostic")
        self.assertEqual(manifest["counts"]["sft_train.jsonl"],0)
    def test_weak_train_does_not_become_sft_when_opted_in(self):
        s=session();ingest(self.db,[s]);r=curated(s)
        r.update(reviewer_id="AUTO:model",label_source="model")
        m=build([r],snapshot(self.db),self.root/"d",self.root/"registry",export_sft=True)
        self.assertEqual(m["counts"]["sft_train.jsonl"],0)
    def test_org_holdout_is_optional_and_explicit(self):
        a,b=session("a"),session("b")
        for s in (a,b):s["org_section"]="same-org"
        ingest(self.db,[a,b]);rows=[curated(a),curated(b,"holdout")]
        build(rows,snapshot(self.db),self.root/"grouped",self.root/"g-reg")
        with self.assertRaises(ValueError):build(rows,snapshot(self.db),self.root/"org",self.root/"o-reg",org_field="org_section")
    def test_test_errors_need_assertion_and_phase_never_comes_from_org(self):
        s=session();s["dept"]="developer"
        base={"event_id":"e","name":"bash","status":"error","ts":"2026-08-02T00:00:00Z",
              "tool_origin":"native","origin_source":"registry","expected_error":True}
        s["tool_events"]=[base,{**base,"event_id":"e2","usage_phase":"development","phase_source":"manifest",
            "expectation_source":"test_definition","assertion_passed":True}]
        ingest(self.db,[s]);rows,_=tool_summary(snapshot(self.db),START,END)
        byphase={r["phase"]:r for r in rows}
        self.assertEqual(byphase["unknown"]["unexpected_errors"],1)
        self.assertEqual(byphase["development"]["unexpected_errors"],0)
        self.assertIsNone(byphase["development"]["unexpected_error_rate"])
        self.assertEqual(byphase["unknown"]["capability_id"],"unbound")
    def test_asset_hash_ambiguity_upload_lineage_and_tenant_isolation(self):
        a,b,c,d=[session(k) for k in ("a","b","c","d")];d["tenant_id"]="other"
        h={"sha256":"a"*64,"sha256_source":"file_bytes","size_bytes":20,"success":True}
        a["artifact_events"]=[{**h,"event_id":"w1","op":"write","ts":"2026-08-02T00:00:00Z","artifact_id":"A","version":"v1"}]
        b["artifact_events"]=[{**h,"event_id":"w2","op":"write","ts":"2026-08-03T00:00:00Z"}]
        c["artifact_events"]=[{**h,"event_id":"u1","op":"upload","ts":"2026-08-04T00:00:00Z"},
            {"event_id":"u2","op":"upload","success":True,"artifact_id":"new","version":"v1","ts":"2026-08-04T00:00:00Z",
             "source_artifact_id":"A","source_version":"v1","lineage_source":"runtime"}]
        d["artifact_events"]=[{**h,"event_id":"other","op":"read","ts":"2026-08-04T00:00:00Z"}]
        ingest(self.db,[a,b,c,d]);edges,_=asset_relations(snapshot(self.db),START,END)
        self.assertEqual(len(edges),2)
        byevent={e["event_id"]:e for e in edges}
        self.assertTrue(byevent["u1"]["ambiguous_source"])
        self.assertFalse(byevent["u1"]["source_attribution_confirmed"])
        self.assertTrue(byevent["u2"]["source_attribution_confirmed"])
    def test_capability_load_does_not_equal_invoke(self):
        s=session();s["dept"]="org"
        s["capability_events"]=[{"event_id":"c","kind":"skill","capability_id":"skill","version":"v1","action":"load",
            "event_source":"runtime","success":True,"ts":"2026-08-02T00:00:00Z"}]
        ingest(self.db,[s]);catalog=[{"tenant_id":"t","kind":"skill","capability_id":"skill","version":"v1",
            "visible_to_orgs":["org"],"published_at":"2026-07-01T00:00:00Z","visibility_source":"registry"}]
        rows,supply,_=capability_summary(snapshot(self.db),catalog,START,END)
        self.assertEqual(rows[0]["load_sessions"],1);self.assertEqual(rows[0]["invocation_sessions"],0)
        self.assertEqual(len(supply),1)
        catalog[0].pop("visibility_source")
        self.assertEqual(capability_summary(snapshot(self.db),catalog,START,END)[1],[])
    def test_shared_request_does_not_get_arbitrary_department_credit(self):
        a,b=session("a"),session("b");a["org_section"]="A";b["org_section"]="B"
        r={"request_id":"r","ts":"2026-08-02T00:00:00Z","input_tokens":100,"output_tokens":2}
        a["requests"]=[r];b["requests"]=[copy.deepcopy(r)]
        ingest(self.db,[a,b]);rows,_=token_rows(snapshot(self.db),START,END)
        self.assertEqual(len(rows),1);self.assertEqual(rows[0]["dept"],"unknown")
    def test_prompt_hint_preserves_inputs_and_abstains(self):
        messages=[{"role":"system","content":"只输出 JSON"},{"role":"user","content":"统计 1nm 和 3nm 的平均值；范围只限这两个值。"}]
        original=copy.deepcopy(messages);out,meta=PromptPolicy("keywords").apply(messages)
        self.assertEqual(messages,original);self.assertEqual(out[0],messages[0]);self.assertEqual(out[-1],messages[-1])
        self.assertTrue(meta["hint_applied"])
        self.assertEqual(keyword_route("解释并修改 Python 脚本"),"__abstain__")
        class Scores:
            def tolist(self):return [[0.4,0.6]]
        class Model:
            classes_=["coding","knowledge"]
            def predict_proba(self, texts):return Scores()
        policy=PromptPolicy();policy.name="classifier";policy.model=Model();policy.threshold=.75
        unchanged,meta=policy.apply(messages)
        self.assertEqual(unchanged,original);self.assertEqual(meta["fallback"],"low_score")
    def test_prompt_ablation_rejects_intent_answer_leakage(self):
        with self.assertRaises(ValueError):PromptPolicy("keywords").validate_tasks([{"task_type":"intent_routing"}])
    def test_pagination_200_is_not_history_or_detail_completeness(self):
        cfg={"url":"http://example.invalid/api/sessions","items_path":"items","next_cursor_path":"next","cursor_param":"cursor",
            "total_path":"total","filters":{"mode":"active","date":"2026-08-01"},"detail_required_fields":["messages"]}
        pages=iter([(200,{"items":[{"id":"one"}],"next":"p2","total":2}),
                    (200,{"items":[{"id":"two"}],"next":None,"total":2})])
        rows,audit,_=collect_user({"tenant_id":"t","user_id":"u"},cfg,lambda url:next(pages))
        self.assertEqual(len(rows),2);self.assertTrue(audit["query_complete"])
        self.assertFalse(audit["history_complete_claim"]);self.assertEqual(audit["missing_detail_items"],2)
        _,bad,_=collect_user({"tenant_id":"t","user_id":"u"},cfg,lambda url:(200,{"items":[],"next":"same","total":0}))
        self.assertFalse(bad["query_complete"]);self.assertEqual(bad["error_type"],"ValueError")
        _,empty,_=collect_user({"tenant_id":"t","user_id":"u"},cfg,lambda url:(200,{"items":[],"next":None,"total":0}))
        self.assertTrue(empty["query_complete"]);self.assertEqual(empty["unique_sessions"],0)
        _,wrong_owner,_=collect_user({"tenant_id":"t","user_id":"u"},{**cfg,"owner_path":"user_id"},
            lambda url:(200,{"items":[{"id":"other","user_id":"someone-else"}],"next":None,"total":1}))
        self.assertFalse(wrong_owner["query_complete"])
    def test_summary_dictionary_is_metadata_and_index_is_not_detail(self):
        meta={"tenant_id":"t","session_id":"s"}
        row=convert({"messages":[],"summary":{"diffs":[]}},meta)
        self.assertEqual(row["summary_metadata"],{"diffs":[]})
        with self.assertRaises(ValueError):convert({"id":"s","title":"index only"},meta)


if __name__=="__main__":unittest.main()
