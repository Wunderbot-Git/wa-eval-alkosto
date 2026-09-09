"""Local integration check. Never prints transcripts, cookies or credentials."""
import argparse
import http.cookiejar
import json
import os
from pathlib import Path
import subprocess
import urllib.error
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--evaluate', action='store_true')
parser.add_argument('--bigquery', action='store_true')
parser.add_argument('--seed-cases', action='store_true')
args = parser.parse_args()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))


def request(path, data=None, method=None):
    headers = {}
    if data is not None:
        headers['Content-Type'] = 'application/json'
        data = json.dumps(data).encode()
    req = urllib.request.Request('http://127.0.0.1:3001' + path, data=data, headers=headers, method=method)
    try:
        return json.load(opener.open(req, timeout=300))
    except urllib.error.HTTPError as error:
        message = json.load(error).get('message', 'HTTP error')
        raise RuntimeError(f'{error.code}: {message}') from None


def upload(path, filename, content, fields=None):
    boundary = '----' + uuid.uuid4().hex
    body = b''
    for name, value in (fields or {}).items():
        body += f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode()
    body += f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\nContent-Type: application/octet-stream\r\n\r\n'.encode() + content + f'\r\n--{boundary}--\r\n'.encode()
    req = urllib.request.Request('http://127.0.0.1:3001/workspace' + path, data=body, headers={'Content-Type': 'multipart/form-data; boundary=' + boundary})
    return json.load(opener.open(req, timeout=120))


request('/auth/login', {'email': os.environ.get('EVAL_EMAIL', 'admin@alkosto.com'), 'password': os.environ.get('EVAL_PASSWORD', 'admin123')})
sample = (ROOT / 'yalo_export.csv').read_bytes()
first = upload('/import', 'yalo_export.csv', sample)
second = upload('/import', 'yalo_export.csv', sample)
assert second['added'] == 0, 'Duplicate import added events'
print('CSV import:', first, 'repeat:', second)
feed = ROOT.parent / 'alkosto-yalo-feed'
for sha, at in [('7f862be', '2026-08-30T20:03:09Z'), ('931d264', '2026-08-31T18:07:58Z')]:
    content = subprocess.check_output(['git', 'show', sha + ':filtered_products.json'], cwd=feed)
    result = upload('/catalogs', 'feed.json', content, {'source': 'alkosto-yalo-feed@' + sha, 'capturedAt': at})
    assert result['verified'] is False
    print('Historical catalog:', result['products'], 'products; reference only')
overview = request('/workspace')
assert len(overview['sessions']) >= 30
session = next(s for s in overview['sessions'] if s['boundary'] == 'CIERRE_YALO' and s['count'] >= 8)
detail = request('/workspace/sessions/' + session['id'])
assert detail['events']
print('Sessions:', len(overview['sessions']), 'closures:', sum(s['boundary'] == 'CIERRE_YALO' for s in overview['sessions']))
if args.seed_cases:
    titles = {t['title'] for t in overview['tests']}
    added = 0
    for case in json.loads((ROOT / 'scripts/starter_cases.json').read_text()):
        if case['title'] not in titles:
            request('/workspace/tests', case, 'POST')
            added += 1
    print('Starter test cases added:', added)
if args.bigquery:
    result = request('/workspace/bigquery', {'from': '2026-08-31T00:00:00-05:00', 'to': '2026-08-31T01:00:00-05:00'})
    print('BigQuery bounded import:', result)
if args.evaluate:
    result = request('/workspace/sessions/' + session['id'] + '/evaluate', {}, 'POST')
    assert result['payload']['mode'] == 'REAL'
    print('Real evaluation:', result['payload']['model'], result['payload']['verdict']['label'], 'criteria:', len(result['payload']['verdict']['criteria']))
print('Integration checks completed.')
