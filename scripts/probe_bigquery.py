"""Dry-run only: compare bytes by projection/filter without reading any rows."""
import json
import subprocess
import urllib.request
import urllib.error

token = subprocess.check_output(['gcloud', 'auth', 'print-access-token'], text=True).strip()
source = '`yalo-eval-wa.yalo_data_sharing___alkosto_co.vw_messages`'
queries = {
    'count_date': f"SELECT COUNT(*) FROM {source} WHERE event_date=DATE '2026-08-31'",
    'minimal_date': f"SELECT user_id,event_timestamp,message_id FROM {source} WHERE event_date=DATE '2026-08-31'",
    'text_date': f"SELECT user_id,is_user_message,event_timestamp,message_id,message_text,message_type FROM {source} WHERE event_date=DATE '2026-08-31'",
    'full_date': f"SELECT user_id,is_user_message,event_timestamp,message_id,message_text,message_type,message_raw FROM {source} WHERE event_date=DATE '2026-08-31'",
    'timestamp_day': f"SELECT user_id,is_user_message,event_timestamp,message_id,message_text,message_type,message_raw FROM {source} WHERE event_timestamp >= TIMESTAMP '2026-08-31 00:00:00+00' AND event_timestamp < TIMESTAMP '2026-09-01 00:00:00+00'",
}
for name, query in queries.items():
    payload = {'configuration': {'dryRun': True, 'query': {'query': query, 'useLegacySql': False}}, 'jobReference': {'projectId': 'yalo-eval-wa', 'location': 'US'}}
    req = urllib.request.Request('https://bigquery.googleapis.com/bigquery/v2/projects/yalo-eval-wa/jobs', data=json.dumps(payload).encode(), headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
    try:
        data = json.load(urllib.request.urlopen(req, timeout=60))
        stats = data.get('statistics', {})
        print(json.dumps({'case': name, 'bytes': stats.get('query', {}).get('totalBytesProcessed', stats.get('totalBytesProcessed')), 'accuracy': stats.get('query', {}).get('totalBytesProcessedAccuracy'), 'referencedTables': stats.get('query', {}).get('referencedTables')}))
    except urllib.error.HTTPError as e:
        print(json.dumps({'case': name, 'error': json.load(e).get('error', {}).get('message')}))
