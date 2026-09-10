'use client'
import { useEffect, useState } from 'react'
import { criterionNames, outcomeShort, Row } from './dashboard-model'
import './review-desk.css'

// Pilot-phase view: what a rubric change did to the verdicts, and which
// calibration marks it addressed. It deliberately never calls a change good
// or bad — only a person can, and the buckets say what to look at first.
const buckets: Record<string, { title: string; hint: string; tone: string }> = {
  CONTRADICE_REVISION: { title: 'Contradice una revisión humana', tone: 'danger', hint: 'Alguien ya había revisado el veredicto anterior y el nuevo difiere. Empieza por aquí: o el cambio corrigió un error tuyo, o lo introdujo.' },
  MARCADA_Y_CAMBIO: { title: 'Marcada y con cambio', tone: 'warning', hint: 'Tiene una marca abierta y el veredicto se movió. Comprueba si el cambio resolvió lo que marcaste y cierra la marca.' },
  MARCADA_SIN_CAMBIO: { title: 'Marcada, sin cambio', tone: 'neutral', hint: 'El cambio de rúbrica no afectó a esta conversación. Lo que marcaste sigue sin resolverse.' },
  CAMBIO: { title: 'Cambió sin marca previa', tone: 'good', hint: 'Nadie la había revisado ni marcado. Una muestra aquí indica si el cambio se comporta como esperabas en el resto del corpus.' },
}
const kinds: Record<string, string> = { FALTA_HALLAZGO: 'Faltó un hallazgo', HALLAZGO_FALSO: 'Hallazgo inventado', SEVERIDAD_INCORRECTA: 'Severidad incorrecta', CASO_DE_REFERENCIA: 'Caso de referencia' }
const statuses: Record<string, string> = { INCUMPLE: 'Hallazgo', CUMPLE: 'Cumple', NO_APLICA: 'No aplica', EVIDENCIA_INSUFICIENTE: 'Sin evidencia suficiente' }
const when = (v: string) => new Date(v).toLocaleString('es-CO', { timeZone: 'America/Bogota', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function Calibration({ api, onOpen }: { api: (path: string, options?: RequestInit) => Promise<any>; onOpen: (id: string) => void }) {
  const [data, setData] = useState<Row | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const load = () => api('/calibration').then(setData).catch(e => setError(e.message))
  useEffect(() => { load() }, [])
  async function act(id: string, body: Row) {
    setBusy(true); setError('')
    try { await api('/flags/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); await load() }
    catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  if (error) return <div className="review-content"><p className="desk-error" role="alert">{error}</p></div>
  if (!data) return <div className="review-content"><p>Cargando calibración…</p></div>
  const rows: Row[] = data.rows || []
  return <div className="review-content calibration">
    <p className="intro">Herramienta de la fase piloto. Cada reevaluación conserva la anterior, así que aquí se ve qué cambió al pasar de una versión de la rúbrica a otra y si las marcas que dejaste quedaron resueltas. La rúbrica vigente es <b>{data.current}</b>{data.versions.length > 1 ? ` · versiones con evaluaciones: ${data.versions.join(', ')}` : ' · todavía no hay evaluaciones de otra versión con las que comparar'}. {data.open} de {data.total} marcas siguen abiertas.</p>
    {!rows.length && <p className="empty">Nada que revisar todavía: no hay marcas abiertas ni conversaciones evaluadas bajo dos versiones de la rúbrica.</p>}
    {Object.keys(buckets).map(id => {
      const group = rows.filter(r => r.bucket === id)
      if (!group.length) return null
      const b = buckets[id]
      return <section key={id} className="desk-section">
        <h3 className={'desk-section-head ' + b.tone}><span>{b.title}</span><b>{group.length}</b></h3>
        <p className="calibration-hint">{b.hint}</p>
        {group.map(r => <div className="record calibration-row" key={r.sessionId}>
          <strong>{when(r.start)} · {r.subject.slice(0, 8)}{r.outcome ? ` · ${outcomeShort[r.outcome]}` : ''}</strong>
          {r.comparison && <p className="calibration-diff">
            <span className="outcome-tag plain">{r.comparison.from} → {r.comparison.to}</span>
            <span className="outcome-tag plain">Nota {r.comparison.scoreFrom ?? '—'} → {r.comparison.scoreTo ?? '—'}</span>
            {r.comparison.changes.map((c: Row) => <span key={c.name} className={'outcome-tag ' + (c.to === 'INCUMPLE' ? 'warning' : 'good')}>{criterionNames[c.name] || c.name}: {c.from ? statuses[c.from] || c.from : 'nuevo'} → {statuses[c.to] || c.to}{c.severityTo === 'CRITICAL' ? ' (alta)' : ''}</span>)}
            {!r.comparison.changes.length && <span className="outcome-tag muted">Sin cambios por criterio</span>}
          </p>}
          {r.flags.map((f: Row) => <div className="calibration-flag" key={f.id}>
            <small>⚑ {kinds[f.kind] || f.kind}{f.payload.criterion ? ` · ${criterionNames[f.payload.criterion]}` : ''} · marcada con {f.payload.rubricVersion || 'sin evaluación'}{f.payload.score == null ? '' : `, nota ${f.payload.score}`}</small>
            <p>{f.payload.note}</p>
            <button className="guide-link" disabled={busy} onClick={() => act(f.id, { note: 'Resuelta tras el cambio de rúbrica' })}>Marcar como resuelta</button>
          </div>)}
          <button onClick={() => onOpen(r.sessionId)}>Abrir conversación ↗</button>
        </div>)}
      </section>
    })}
  </div>
}
