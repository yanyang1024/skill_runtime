"""Small checks for concrete mismatches found in the empirical follow-up."""
import unittest
from test_invariants import session
from common import digest, timestamp
from value_loop import case_id
from task_atlas import analyze, failure_signal
from make_action_board import build, markdown, optional_jsonl, tool_actions
from resource_diagnostics import capability_summary, tool_summary


def case(s):
    return {"case_id":case_id(s),"source_revision":digest(s),"session":s}


class PracticalChecks(unittest.TestCase):
    def test_missing_inputs_are_not_observed_zero(self):
        missing=build({},[],None,None,None)
        empty=build({},[],[],[],[])
        self.assertIsNone(missing["artifact_relations_observed"])
        self.assertEqual(empty["artifact_relations_observed"],0)
        self.assertIn("未知（未提供）",markdown(missing))
        self.assertIsNone(optional_jsonl(None))
        with self.assertRaises(FileNotFoundError):optional_jsonl("/not-a-real-input-v22.jsonl")

    def test_assertion_failure_survives_success_status(self):
        s=session();s["tool_events"]=[{"event_id":"x","status":"success","ts":"2026-08-02T00:00:00Z",
            "expectation_source":"test_definition","assertion_passed":False,
            "usage_phase":"development","phase_source":"manifest"}]
        rows,_=tool_summary([case(s)],timestamp("2026-08-01T00:00:00Z"),timestamp("2026-09-01T00:00:00Z"))
        self.assertTrue(failure_signal(s))
        self.assertEqual(rows[0]["unexpected_errors"],0)
        self.assertEqual(tool_actions(rows)[0]["evidence"]["assertion_failed"],1)

    def test_each_phase_can_enter_short_action_board(self):
        rows=[{"phase":"production","unexpected_errors":100,"org":str(i)} for i in range(10)]
        rows += [{"phase":"development","unexpected_errors":1}]
        self.assertIn("development",[r["phase"] for r in tool_actions(rows)])

    def test_load_only_and_unknown_version_are_not_inferred_unused(self):
        s=session();s["dept"]="org";s["capability_events"]=[{
            "event_id":"x","kind":"skill","capability_id":"skill","version":"v1","action":"load",
            "success":True,"event_source":"runtime","ts":"2026-08-02T00:00:00Z"}]
        catalog=[{"tenant_id":"t","kind":"skill","capability_id":"skill","version":"v1",
            "visible_to_orgs":["org"],"visibility_source":"registry","published_at":"2026-07-01T00:00:00Z"}]
        start,end=timestamp("2026-08-01T00:00:00Z"),timestamp("2026-09-01T00:00:00Z")
        _,supply,_=capability_summary([case(s)],catalog,start,end)
        self.assertEqual(supply[0]["reason"],"loaded_but_no_observed_invocation")
        s["capability_events"][0].pop("version")
        _,supply,_=capability_summary([case(s)],catalog,start,end)
        self.assertEqual(supply[0]["reason"],"version_unresolved_usage")

    def test_adoption_review_preserves_auto_label_and_seen_failure_queue(self):
        s=session();s["tool_events"]=[{"status":"error"}]
        s["capability_events"]=[{"kind":"skill","capability_id":"x","action":"load","event_source":"runtime","success":True}]
        c=case(s);c["review"]={"adoption":"used","reviewer_id":"human"}
        c["auto_assessment"]={"task_type":"coding","label_source":"heuristic"}
        result=analyze([c],registry={"case:"+c["case_id"]:"train"})
        self.assertEqual(result["rows"][0]["task_type"],"coding")
        self.assertEqual(result["rows"][0]["label_source"],"heuristic")
        self.assertEqual(result["seeds"],[])
        self.assertEqual(result["regressions"][0]["existing_split"],"train")
        self.assertEqual(result["edges"][0]["action"],"load")
        self.assertEqual(result["rows"][0]["capabilities"],[])


if __name__=="__main__":unittest.main()
