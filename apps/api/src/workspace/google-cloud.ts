import { execFile } from 'child_process'
import { promisify } from 'util'
const exec = promisify(execFile)
let cached: { token: string; expires: number } | undefined
export async function cloudRequest(path: string, body?: unknown) {
  if (process.env.GOOGLE_AUTH_MODE !== 'gcloud') throw new Error('Configura GOOGLE_AUTH_MODE=gcloud para usar tu sesión local')
  if (!cached || cached.expires < Date.now()) {
    try {
      const result = await exec('gcloud', ['auth', 'print-access-token'], { timeout: 30000 })
      cached = { token: result.stdout.trim(), expires: Date.now() + 40 * 60 * 1000 }
    } catch { throw new Error('Renueva tu acceso local con gcloud auth login') }
  }
  const response = await fetch(path, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${cached.token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(120000) })
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
  const project = process.env.GOOGLE_CLOUD_PROJECT || 'yalo-eval-wa'
  if (!/^[a-z][a-z0-9-]+$/.test(project)) throw new Error('Proyecto inválido')
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
