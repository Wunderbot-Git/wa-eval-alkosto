"""Read-only audit of stored sample evaluations; no model calls."""
import sys
import runpy
import json
from collections import Counter
from pathlib import Path
sys.argv = ['audit', '--report-only']
m = runpy.run_path(str(Path(__file__).with_name('evaluate_pending_sample.py')))
sessions = m['overview']()
assert len(sessions) == 31
criteria = Counter()
unknown = Counter()
reviews = 0
for s in sessions:
    assert s.get('assessment') and not s['assessment']['stale'], 'Pending or stale evaluation'
    d = m['request']('/workspace/sessions/' + s['id'])
    a = d['assessments'][0]
    assert a['inputHash'] == d['inputHash']
    assert a['payload']['mode'] == 'REAL'
    assert a['payload']['rubricVersion'] == d['rubricVersion']
    cs = a['payload']['verdict']['criteria']
    assert len(cs) == 7 and len({c['name'] for c in cs}) == 7
    ids = {e['id'] for e in d['events']}
    for c in cs:
        assert set(c['evidenceIds']) <= ids
        if c['status'] == 'INCUMPLE':
            assert c['evidenceIds'] and c['severity'] in ('WARNING', 'CRITICAL')
            criteria[c['name']] += 1
        if c['status'] == 'EVIDENCIA_INSUFICIENTE': unknown[c['name']] += 1
    reviews += bool(a['payload'].get('reviews'))
result = {'verified_real_evaluations': len(sessions), 'criteria_verified': len(sessions)*7, 'findings_by_criterion': dict(criteria), 'insufficient_by_criterion': dict(unknown), 'human_reviewed': reviews}
(m['state'] / 'sample-audit.json').write_text(json.dumps(result, indent=2))
print(json.dumps(result))
