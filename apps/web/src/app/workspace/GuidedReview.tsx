'use client'
import { useEffect, useRef, useState } from 'react'
import { criterionNames, Row } from './dashboard-model'
export function humanState(history: Row[]) {
  const undone = new Set(history.filter(h => h.action === 'undo').map(h => h.target))
  const active = history.filter(h => !undone.has(h.id) && h.action !== 'undo')
  const decisions: Row = {}; active.forEach(h => { if (h.action === 'decision') decisions[h.criterion] = h })
  return { decisions, additions: active.filter(h => h.action === 'add'), completed: history.at(-1)?.action === 'complete' }
}
const labels: Row = { confirm: 'Confirmado', correct: 'Corregido', dismiss: 'Descartado', defer: 'Pendiente de contexto' }
// One case, one step: the current finding is the only primary action. Adding
// own observations lives behind a single button (which switches the chat into
// selection mode), history behind one collapsed menu, and the finish card only
// appears once nothing is pending.
export default function GuidedReview({ assessment, stale, criteria, criterion, select, selectedMessages, clearMessages, showEvidence, openChat, submit, busy, next, selecting, setSelecting }: { assessment: Row; stale: boolean; criteria: Row[]; criterion: string; select: (name: string) => void; selectedMessages: string[]; clearMessages: () => void; showEvidence: (ids: string[]) => void; openChat: () => void; submit: (body: Row) => Promise<boolean>; busy: boolean; next: () => void; selecting: boolean; setSelecting: (v: boolean) => void }) {
  const cardRef = useRef<HTMLElement>(null)
  const createRef = useRef<HTMLDivElement>(null)
  const history: Row[] = assessment.payload.humanReview || []
  const reviews: Row[] = assessment.payload.reviews || []
  const state = humanState(history)
  const findings = criteria.filter(c => c.status === 'INCUMPLE')
  const pending = findings.filter(c => !state.decisions[c.name] || state.decisions[c.name].decision === 'defer')
  const chosen = criteria.find(c => c.name === criterion)
  const [all, setAll] = useState(false)
  const [action, setAction] = useState('')
  const [note, setNote] = useState('')
  const [severity, setSeverity] = useState('WARNING')
  const [category, setCategory] = useState('adecuacion')
  const [observation, setObservation] = useState('')
  const [kind, setKind] = useState('finding')
  const [read, setRead] = useState(false)
  useEffect(() => { select(pending[0]?.name || findings[0]?.name || ''); }, [assessment.id])
  useEffect(() => { setAction(''); setNote(''); setCategory(chosen?.name || 'adecuacion'); setSeverity(chosen?.severity || 'WARNING') }, [criterion])
  useEffect(() => {
    const node = selectedMessages.length ? createRef.current : cardRef.current
    const pane = node?.closest('.desk-evaluation')
    if (!node || !pane) return
    const frame = requestAnimationFrame(() => pane.scrollTo({ top: pane.scrollTop + node.getBoundingClientRect().top - pane.getBoundingClientRect().top - 100, behavior: 'auto' }))
    return () => cancelAnimationFrame(frame)
  }, [criterion, selectedMessages.length > 0])
  const disabled = busy || stale
  async function decide() {
    const ok = await submit({ action: 'decision', criterion, decision: action, note, severity, correctedCriterion: category })
    if (ok) { setAction(''); setNote(''); const nextFinding = pending.find(c => c.name !== criterion); if (nextFinding) select(nextFinding.name) }
  }
  const stopSelecting = () => { clearMessages(); setObservation(''); setSelecting(false) }
  return <div className="guided-review">
    {(all ? criteria : findings).length > 0 && <div className="guide-steps">{(all ? criteria : findings).map((c, i) => <button key={c.name} disabled={busy} aria-pressed={criterion === c.name} onClick={() => select(c.name)}><span>{state.decisions[c.name] ? '✓' : i + 1}</span>{criterionNames[c.name]}<small>{state.decisions[c.name] ? labels[state.decisions[c.name].decision] : c.status === 'INCUMPLE' ? 'Por revisar' : c.status === 'CUMPLE' ? 'Cumple según IA' : c.status === 'NO_APLICA' ? 'No aplica' : 'Falta evidencia'}</small></button>)}</div>}
    {criteria.length > findings.length && <button className="guide-link" disabled={busy} onClick={() => setAll(a => !a)}>{all ? 'Mostrar solo los hallazgos' : `Ver todos los criterios (${criteria.length})`}</button>}
    {chosen && <article ref={cardRef} className="guide-card"><small className="guide-eyebrow">{chosen.status === 'INCUMPLE' ? 'POSIBLE PROBLEMA · DETECTADO POR IA' : 'CRITERIO · EVALUACIÓN DE IA'}</small><h3>{criterionNames[chosen.name]}</h3>{chosen.severity === 'CRITICAL' && <span className="guide-suspected">Posible gravedad alta · por validar</span>}<p>{chosen.reason}</p><button className="guide-link" onClick={() => { select(chosen.name); openChat() }}>Ver {chosen.evidenceIds.length} mensajes de evidencia →</button>
      {state.decisions[criterion] && <div className="guide-decision"><strong>{labels[state.decisions[criterion].decision]}</strong>{state.decisions[criterion].correctedCriterion && <span> · {criterionNames[state.decisions[criterion].correctedCriterion]} · {state.decisions[criterion].severity === 'CRITICAL' ? 'Alta' : 'Moderada'}</span>}<p>{state.decisions[criterion].note || 'Confirmado por revisión humana.'}</p></div>}
      {chosen.status === 'INCUMPLE' && <div className="guide-actions"><button disabled={disabled} aria-pressed={action === 'confirm'} onClick={() => setAction('confirm')}>✓ Confirmar</button><button disabled={disabled} aria-pressed={action === 'correct'} onClick={() => setAction('correct')}>Corregir</button><button disabled={disabled} aria-pressed={action === 'dismiss'} onClick={() => setAction('dismiss')}>Descartar</button><button className="guide-link" disabled={disabled} onClick={() => setAction('defer')}>Revisar después</button></div>}
      {action && <form className="guide-form" onSubmit={e => { e.preventDefault(); decide() }}>{action === 'correct' && <><label>Criterio<select value={category} onChange={e => setCategory(e.target.value)}>{Object.entries(criterionNames).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><label>Gravedad<select value={severity} onChange={e => setSeverity(e.target.value)}><option value="WARNING">Moderada</option><option value="CRITICAL">Alta · puede conducir a una mala compra</option></select></label></>}<label>{action === 'confirm' ? 'Comentario (opcional)' : action === 'correct' ? 'Tu explicación corregida' : action === 'defer' ? '¿Qué contexto falta?' : '¿Por qué no corresponde?'}<textarea maxLength={4000} required={action !== 'confirm'} value={note} onChange={e => setNote(e.target.value)} autoFocus /></label><button disabled={disabled}>Guardar decisión</button><button type="button" disabled={busy} onClick={() => setAction('')}>Cancelar</button></form>}
    </article>}
    {pending.length === 0 && <div className="guide-finish"><h3>{state.completed ? 'Revisión completada' : findings.length ? 'Finalizar revisión' : 'La IA no encontró hallazgos'}</h3><p>{findings.length || state.additions.length ? `${Object.values(state.decisions).filter((d: any) => d.decision === 'confirm').length} confirmados · ${Object.values(state.decisions).filter((d: any) => d.decision === 'correct').length} corregidos · ${Object.values(state.decisions).filter((d: any) => d.decision === 'dismiss').length} descartados · ${state.additions.filter(a => a.kind === 'finding').length} añadidos` : 'Lee la conversación completa; puedes añadir una observación o finalizar.'}</p>{!state.completed && <label className="guide-check"><input type="checkbox" checked={read} onChange={e => setRead(e.target.checked)} />Revisé el resto de la conversación para detectar omisiones.</label>}<button disabled={disabled || (!state.completed && !read)} onClick={async () => { if (state.completed || await submit({ action: 'complete', readConversation: read })) next() }}>{state.completed ? 'Continuar con otro caso →' : 'Finalizar revisión y continuar →'}</button></div>}
    <div ref={createRef} className="guide-create">
      {!selecting ? <button className="guide-add" disabled={disabled} onClick={() => { setSelecting(true); openChat() }}>+ Añadir hallazgo u observación propia</button>
        : selectedMessages.length === 0 ? <p className="desk-context">Marca en el chat los mensajes correspondientes. <button className="guide-link" disabled={busy} onClick={stopSelecting}>Cancelar</button></p>
        : <form className="guide-form" onSubmit={async e => { e.preventDefault(); if (await submit({ action: 'add', kind, criterion: category, severity, note: observation, evidenceIds: selectedMessages })) stopSelecting() }}><strong>{selectedMessages.length} mensajes seleccionados</strong><label>Qué quieres registrar<select value={kind} onChange={e => setKind(e.target.value)}><option value="finding">Añadir hallazgo</option><option value="positive">Destacar buena respuesta</option></select></label><label>Criterio<select value={category} onChange={e => setCategory(e.target.value)}>{Object.entries(criterionNames).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>{kind === 'finding' && <label>Gravedad<select value={severity} onChange={e => setSeverity(e.target.value)}><option value="WARNING">Moderada</option><option value="CRITICAL">Alta</option></select></label>}<label>Tu observación<textarea required maxLength={4000} value={observation} onChange={e => setObservation(e.target.value)} /></label><button disabled={disabled}>Guardar observación</button><button type="button" onClick={stopSelecting}>Cancelar selección</button></form>}
      {state.additions.map(a => <div className="guide-decision" key={a.id}><strong>{a.kind === 'positive' ? '★ Buena respuesta' : 'Hallazgo humano'} · {criterionNames[a.criterion]}</strong><p>{a.note}</p><button className="guide-link" onClick={() => showEvidence(a.evidenceIds)}>Ver {a.evidenceIds.length} mensajes vinculados →</button></div>)}
    </div>
    {(history.length > 0 || reviews.length > 0) && <details className="guide-history"><summary>Historial · {history.length + reviews.length}</summary>
      {history.length > 0 && history.at(-1)?.action !== 'undo' && <button className="guide-link" disabled={disabled} onClick={() => submit({ action: 'undo', target: history.at(-1)?.id })}>Deshacer última acción</button>}
      {reviews.map((r: Row, i: number) => <p key={'r' + i}>{r.decision === 'DE_ACUERDO' ? 'De acuerdo' : 'En desacuerdo'} · {r.note}</p>)}
      {history.map(h => <p key={h.id}><strong>{h.action === 'decision' ? labels[h.decision] : h.action === 'add' ? 'Observación añadida' : h.action === 'undo' ? 'Acción deshecha' : 'Revisión finalizada'}</strong> · {new Date(h.at).toLocaleString('es-CO')}<br /><small>Revisor {h.userId} {h.criterion ? '· ' + criterionNames[h.criterion] : ''}</small>{h.note && <span> — {h.note}</span>}</p>)}
    </details>}
  </div>
}
