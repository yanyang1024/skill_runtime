"""Local behavior probes for pinned OKF source. Requires Python 3.11+ and PyYAML.
Run from any directory: python analysis-data/reproduce-probes.py
No cloud calls; outputs observations, not a production compliance verdict.
"""
import importlib.util
import json
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'okf-source/src'))
from reference_agent.bundle.document import trust_tier, is_stale
from reference_agent.bundle.index import regenerate_indexes
from reference_agent.tools.context import set_context, get_context
from reference_agent.tools.bundle_tools import write_concept_doc, read_existing_doc

spec = importlib.util.spec_from_file_location('sample_attester', ROOT / 'okf-source/bundles/acme_retail/attesters/sql_equality.py')
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

def probe(sql, executed, result, claimed, **extra):
    try:
        return mod.attest(sanctioned_sql=sql, receipt={'executed_sql': executed, 'result': result, **extra}, claimed_value=claimed)
    except Exception as exc:
        return {'exception': type(exc).__name__, 'message': str(exc)}

out = {
    'matching': probe('SELECT 1', 'SELECT 1', [1], 1),
    'different_table': probe('SELECT x FROM a', 'SELECT x FROM b', [1], 1),
    'no_job_id': probe('SELECT 1', 'SELECT 1', [1], 1),
    'unverified_parameters': probe('SELECT @year', 'SELECT @year', [1999], 1999, parameters={'year': 1999}),
    'literal_case_changed': probe("SELECT 'select'", "SELECT 'SELECT'", ['SELECT'], 'SELECT'),
    'empty_result': probe('SELECT 1', 'SELECT 1', [], 1),
    'old_review_after_new_generation': trust_tier({'generated': {'at': '2026-10-01T00:00:00Z'}, 'verified': {'by': 'human:reviewer', 'at': '2026-01-01T00:00:00Z'}}),
    'date_only_stale': is_stale({'stale_after': '2020-01-01'}, datetime(2026, 1, 1, tzinfo=timezone.utc)),
    'offset_stale': is_stale({'stale_after': '2020-01-01T00:00:00Z'}, datetime(2026, 1, 1, tzinfo=timezone.utc)),
}
with tempfile.TemporaryDirectory() as tmp:
    root = Path(tmp)
    (root/'index.md').write_text('---\nokf_version: "0.2"\n---\n')
    (root/'metric.md').write_text('---\ntype: Metric\ntitle: Metric\n---\nDefinition\n')
    (root/'log.md').write_text('# Change log\n')
    regenerate_indexes(root, synthesize=lambda *a, **kw: 'Summary')
    index = (root/'index.md').read_text()
    out['root_version_preserved'] = 'okf_version' in index
    out['log_in_index'] = '(log.md)' in index
    # These tools do not access source methods; None isolates local write behavior.
    set_context(None, root/'first', model='probe')
    set_context(None, root/'second', model='probe')
    out['global_context_overwritten'] = get_context().bundle_root == root/'second'
    write_concept_doc('metric', {'type':'Metric','generated':{'by':'old','at':'2020-01-01T00:00:00Z'}}, 'Changed body')
    out['supplied_generated_at_retained'] = read_existing_doc('metric')['frontmatter']['generated']['at']
print(json.dumps(out, ensure_ascii=False, indent=2))
