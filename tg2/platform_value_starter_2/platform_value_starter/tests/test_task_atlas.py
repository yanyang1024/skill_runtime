"""Only the two main candidate-generation boundaries; no new test framework."""
import unittest
from test_invariants import session
from common import digest
from value_loop import case_id
from task_atlas import analyze, render


class TaskAtlasChecks(unittest.TestCase):
    def cases(self,n):
        return [{"case_id":case_id(s),"source_revision":digest(s),"session":s}
                for s in [session(str(i)) for i in range(n)]]

    def test_unknown_and_stale_are_not_gold(self):
        cases=self.cases(1)
        result=analyze(cases,[{"case_id":cases[0]["case_id"],"source_revision":"old","task_type":"coding"}])
        self.assertEqual(result["rows"][0]["task_type"],"unknown")
        self.assertEqual(result["seeds"],[])
        self.assertNotIn("```mermaid",render(analyze([])))

    def test_sources_and_training_exclusion(self):
        cases=self.cases(4)
        labels=[{"case_id":c["case_id"],"source_revision":c["source_revision"],"task_type":"coding",
                 "label_source":"heuristic","reviewer_id":"AUTO:router","source_group":"family-"+str(i//2)}
                for i,c in enumerate(cases)]
        result=analyze(cases,labels,registry={"group:family-0":"train"})
        self.assertEqual(sum(c["sessions"] for c in result["cells"]),4)
        self.assertEqual(len(result["seeds"]),1)
        candidate=result["seeds"][0]
        self.assertEqual(candidate["source_group"],"family-1")
        self.assertEqual(candidate["allowed_uses"],[])
        self.assertNotIn("target",candidate)


if __name__=="__main__":unittest.main()
