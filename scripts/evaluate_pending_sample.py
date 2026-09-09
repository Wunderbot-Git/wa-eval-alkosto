"""Evaluate the user-authorized sample; resume without reevaluating completed sessions.
Logs only counts, opaque IDs and technical errors, never transcripts or credentials.
"""
import concurrent.futures
import http.cookiejar
import json
import os
from pathlib import Path
import threading
import time
import urllib.request
import urllib.error
import argparse

parser = argparse.ArgumentParser()
parser.add_argument('--report-only', action='store_true')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
state = root / '.local'
state.mkdir(exist_ok=True)
local = threading.local()

def request(path, data=None):
    if not hasattr(local, 'opener'):
        local.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        request('/auth/login', {'email': os.environ.get('EVAL_EMAIL', 'admin@alkosto.com'), 'password': os.environ.get('EVAL_PASSWORD', 'admin123')})
    req = urllib.request.Request('http://127.0.0.1:3001' + path,
        data=None if data is None else json.dumps(data).encode(),
        headers={'Content-Type': 'application/json'})
    try:
        return json.load(local.opener.open(req, timeout=300))
    except urllib.error.HTTPError as e:
        error = json.load(e)
        raise RuntimeError(str(e.code) + ': ' + str(error.get('message', 'Error HTTP'))) from None

def overview():
    return request('/workspace')['sessions']

sessions = overview()
manifest = state / 'batch-30-targets.json'
if manifest.exists():
    targets = json.loads(manifest.read_text())
else:
    targets = [s['id'] for s in sessions if not s.get('assessment')]
    if len(targets) != 30:
        raise RuntimeError(f'Expected the 30 authorized pending sessions, found {len(targets)}')
    manifest.write_text(json.dumps(targets))
    manifest.chmod(0o600)
pending = [s['id'] for s in sessions if s['id'] in targets and (not s.get('assessment') or s['assessment'].get('stale'))]
print(json.dumps({'authorized': len(targets), 'already_complete': len(targets) - len(pending), 'pending': len(pending)}), flush=True)
errors = []

def evaluate(sid):
    # Verify again before POST so resuming never duplicates a persisted result.
    detail = request('/workspace/sessions/' + sid)
    for a in detail['assessments'][:1]:
        if a['inputHash'] == detail['inputHash'] and a['payload']['rubricVersion'] == detail['rubricVersion']:
            return {'id': sid, 'skipped': True}
    for attempt in range(6):
        try:
            a = request('/workspace/sessions/' + sid + '/evaluate', {})
            break
        except RuntimeError as e:
            if '429' not in str(e) or attempt == 5:
                raise
            delay = min(15 * 2 ** attempt, 60)
            print(json.dumps({'capacity_retry': attempt + 1, 'wait_seconds': delay}), flush=True)
            time.sleep(delay)
    assert a['payload']['mode'] == 'REAL'
    return {'id': sid, 'label': a['payload']['verdict']['label']}

if not args.report_only:
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        futures = {pool.submit(evaluate, sid): sid for sid in pending}
        for n, future in enumerate(concurrent.futures.as_completed(futures), 1):
            try:
                result = future.result()
                print(json.dumps({'finished': n, 'of': len(pending), **result}), flush=True)
            except Exception as e:
                error = {'id': futures[future], 'error': str(e)[:350]}
                errors.append(error)
                print(json.dumps({'finished': n, 'of': len(pending), **error}), flush=True)

sessions = overview()
counts = {}
for s in sessions:
    a = s.get('assessment')
    if not a: group = 'pending'
    elif a.get('stale'): group = 'stale'
    elif any(c['status'] == 'INCUMPLE' and c.get('severity') == 'CRITICAL' for c in a['criteria']): group = 'critical'
    elif any(c['status'] == 'INCUMPLE' for c in a['criteria']): group = 'findings'
    elif any(c['status'] == 'EVIDENCIA_INSUFICIENTE' for c in a['criteria']) or not any(c['status'] == 'CUMPLE' for c in a['criteria']): group = 'incomplete'
    else: group = 'clear'
    counts[group] = counts.get(group, 0) + 1
report = {'total': len(sessions), 'groups': counts, 'batch_remaining': sum(1 for s in sessions if s['id'] in targets and (not s.get('assessment') or s['assessment'].get('stale'))), 'errors': errors}
(state / 'batch-30-report.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report), flush=True)
