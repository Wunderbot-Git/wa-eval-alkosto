import { execFile } from 'child_process'
import { promisify } from 'util'
import { GoogleAuth } from 'google-auth-library'
const exec = promisify(execFile)
let cached: { token: string; expires: number } | undefined
let adc: GoogleAuth | undefined

// Access token for Google Cloud REST calls (BigQuery, local Vertex path).
// GOOGLE_AUTH_MODE=gcloud reuses the interactive gcloud session (LOCAL ONLY);
// otherwise Application Default Credentials (service account on Cloud Run,
// `gcloud auth application-default login` locally).
async function accessToken(): Promise<string> {
  if (process.env.GOOGLE_AUTH_MODE === 'gcloud') {
    if (!cached || cached.expires < Date.now()) {
      try {
        const result = await exec('gcloud', ['auth', 'print-access-token'], { timeout: 30000 })
        cached = { token: result.stdout.trim(), expires: Date.now() + 40 * 60 * 1000 }
      } catch { throw new Error('Renueva tu acceso local con gcloud auth login') }
    }
    return cached.token
  }
  adc ??= new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] })
  const token = await (await adc.getClient()).getAccessToken()
  if (!token.token) throw new Error('No hay credenciales de Google Cloud (Application Default Credentials)')
  return token.token
}

export async function cloudRequest(path: string, body?: unknown) {
  const token = await accessToken()
  const response = await fetch(path, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(120000) })
  const value = await response.json() as any
  if (!response.ok) {
    if (response.status === 401) cached = undefined
    throw new Error(`Google Cloud ${response.status}: ${value.error?.message || 'No se pudo completar la operación'}`)
  }
  return value
}

export async function queryMessages(from: string, to: string, options: { dryRun?: boolean; maxBytes?: number } = {}) {
  const start = new Date(from); const end = new Date(to)
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start || end.getTime() - start.getTime() > 7 * 86400000) throw new Error('Selecciona un intervalo válido de hasta siete días')
  const project = process.env.BIGQUERY_PROJECT || process.env.GOOGLE_CLOUD_PROJECT
  if (!project || !/^[a-z][a-z0-9-]+$/.test(project)) throw new Error('Configura BIGQUERY_PROJECT o GOOGLE_CLOUD_PROJECT para consultar BigQuery')
  const endpoint = `https://bigquery.googleapis.com/bigquery/v2/projects/${project}`
  const maxBytes = options.maxBytes ?? 5000000000
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 65000000000) throw new Error('Límite de consulta inválido; máximo 65 GB')
  const query = {
    query: `SELECT user_id,is_user_message,FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%E6SZ',event_timestamp,'UTC') AS event_timestamp,message_id,message_text,message_type,message_raw FROM \`yalo-eval-wa.yalo_data_sharing___alkosto_co.vw_messages\` WHERE event_date >= DATE(@start) AND event_date <= DATE(@end) AND event_timestamp >= @start AND event_timestamp < @end ORDER BY event_timestamp LIMIT 20001`,
    useLegacySql: false, parameterMode: 'NAMED', queryParameters: [
      { name: 'start', parameterType: { type: 'TIMESTAMP' }, parameterValue: { value: start.toISOString() } },
      { name: 'end', parameterType: { type: 'TIMESTAMP' }, parameterValue: { value: end.toISOString() } },
    ], maximumBytesBilled: String(maxBytes),
  }
  if (options.dryRun) {
    const preview = await cloudRequest(endpoint + '/jobs', { configuration: { dryRun: true, query }, jobReference: { projectId: project, location: 'US' } })
    const bytes = preview.statistics?.query?.totalBytesProcessed ?? preview.statistics?.totalBytesProcessed
    return { csv: '', jobId: '', estimatedBytes: bytes == null ? null : Number(bytes), estimateAccuracy: preview.statistics?.query?.totalBytesProcessedAccuracy || 'UNKNOWN' }
  }
  let result = await cloudRequest(endpoint + '/queries', { ...query, timeoutMs: 10000, maxResults: 20001 })
  const job = result.jobReference
  for (let n = 0; !result.jobComplete && n < 12; n++) {
    result = await cloudRequest(endpoint + `/queries/${encodeURIComponent(job.jobId)}?location=${encodeURIComponent(job.location || 'US')}&timeoutMs=10000&maxResults=20001`)
  }
  if (!result.jobComplete) throw new Error('La consulta sigue en ejecución; vuelve a intentarlo cuando termine')
  if (result.errors?.length) throw new Error('BigQuery: ' + result.errors[0].message)
  if (Number(result.totalRows || 0) > 20000) throw new Error('Más de 20.000 eventos. Reduce el intervalo; no se importó una muestra truncada.')
  let rows = result.rows || []
  while (result.pageToken) {
    result = await cloudRequest(endpoint + `/queries/${encodeURIComponent(job.jobId)}?location=${encodeURIComponent(job.location || 'US')}&pageToken=${encodeURIComponent(result.pageToken)}&maxResults=20001`)
    rows = rows.concat(result.rows || [])
  }
  const columns = ['user_id', 'is_user_message', 'event_timestamp', 'message_id', 'message_text', 'message_type', 'message_raw']
  const quote = (v: any) => '"' + String(v ?? '').replaceAll('"', '""') + '"'
  return { csv: [columns.join(';'), ...rows.map((r: any) => r.f.map((f: any) => quote(f.v)).join(';'))].join('\n'), jobId: job.jobId }
}
