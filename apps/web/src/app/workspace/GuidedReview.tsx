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
  const [action, setAction] = useState('')
  const [also, setAlso] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [severity, setSeverity] = useState('WARNING')
  const [category, setCategory] = useState('adecuacion')
  const [observation, setObservation] = useState('')
  const [kind, setKind] = useState('finding')
  const [read, setRead] = useState(false)
  useEffect(() => { select(pending[0]?.name || findings[0]?.name || ''); }, [assessment.id])
  useEffect(() => { setAction(''); setAlso([]); setNote(''); setCategory(chosen?.name || 'adecuacion'); setSeverity(chosen?.severity || 'WARNING') }, [criterion])
  // Other pending findings citing at least one of the same messages — one
  // root cause usually fans out across criteria; offer applying the decision
  // to them in the same step (corrections stay per criterion).
  const related = chosen ? pending.filter(c => c.name !== chosen.name && c.evidenceIds.some((id: string) => chosen.evidenceIds.includes(id))) : []
  const batchable = ['confirm', 'dismiss', 'defer'].includes(action)
  useEffect(() => { setAlso(batchable ? related.map(c => c.name) : []) }, [action])
  useEffect(() => {
    const node = selectedMessages.length ? createRef.current : cardRef.current
    const pane = node?.closest('.desk-evaluation')
    if (!node || !pane) return
    const frame = requestAnimationFrame(() => pane.scrollTo({ top: pane.scrollTop + node.getBoundingClientRect().top - pane.getBoundingClientRect().top - 100, behavior: 'auto' }))
    return () => cancelAnimationFrame(frame)
  }, [criterion, selectedMessages.length > 0])
  const disabled = busy || stale
  async function decide() {
    const applied = batchable ? also.filter(name => related.some(c => c.name === name)) : []
    const ok = await submit({ action: 'decision', criterion, decision: action, note, severity, correctedCriterion: category, alsoCriteria: applied })
    if (ok) { setAction(''); setAlso([]); setNote(''); const nextFinding = pending.find(c => c.name !== criterion && !applied.includes(c.name)); if (nextFinding) select(nextFinding.name) }
  }
  const stopSelecting = () => { clearMessages(); setObservation(''); setSelecting(false) }
  const findingIndex = findings.findIndex(f => f.name === criterion)
  return <div className="guided-review">
    {chosen && <article ref={cardRef} className="guide-card"><div className="guide-card-top"><small className="guide-eyebrow">{chosen.status === 'INCUMPLE' ? `HALLAZGO ${findingIndex + 1} DE ${findings.length} · ${state.decisions[chosen.name] ? labels[state.decisions[chosen.name].decision].toUpperCase() : 'POR REVISAR'}` : 'CRITERIO · EVALUACIÓN DE IA'}</small>{findings.length > 1 && findingIndex >= 0 && <span className="guide-card-nav"><button aria-label="Hallazgo anterior" disabled={busy || findingIndex <= 0} onClick={() => select(findings[findingIndex - 1].name)}>‹</button><button aria-label="Hallazgo siguiente" disabled={busy || findingIndex >= findings.length - 1} onClick={() => select(findings[findingIndex + 1].name)}>›</button></span>}</div><h3>{criterionNames[chosen.name]}</h3>{chosen.severity === 'CRITICAL' && <span className="guide-suspected">Posible gravedad alta · por validar</span>}<p>{chosen.reason}</p><button className="guide-link" onClick={() => { select(chosen.name); openChat() }}>Ver {chosen.evidenceIds.length} mensajes de evidencia →</button>
      {state.decisions[criterion] && <div className="guide-decision"><strong>{labels[state.decisions[criterion].decision]}</strong>{state.decisions[criterion].correctedCriterion && <span> · {criterionNames[state.decisions[criterion].correctedCriterion]} · {state.decisions[criterion].severity === 'CRITICAL' ? 'Alta' : 'Moderada'}</span>}<p>{state.decisions[criterion].note || 'Confirmado por revisión humana.'}</p></div>}
      {chosen.status === 'INCUMPLE' && <div className="guide-actions"><button disabled={disabled} aria-pressed={action === 'confirm'} onClick={() => setAction('confirm')}>✓ Confirmar</button><button disabled={disabled} aria-pressed={action === 'correct'} onClick={() => setAction('correct')}>Corregir</button><button disabled={disabled} aria-pressed={action === 'dismiss'} onClick={() => setAction('dismiss')}>Descartar</button><button className="guide-link" disabled={disabled} onClick={() => setAction('defer')}>Revisar después</button></div>}
      {action && <form className="guide-form" onSubmit={e => { e.preventDefault(); decide() }}>{action === 'correct' && <><label>Criterio<select value={category} onChange={e => setCategory(e.target.value)}>{Object.entries(criterionNames).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><label>Gravedad<select value={severity} onChange={e => setSeverity(e.target.value)}><option value="WARNING">Moderada</option><option value="CRITICAL">Alta · puede conducir a una mala compra</option></select></label></>}<label>{action === 'confirm' ? 'Comentario (opcional)' : action === 'correct' ? 'Tu explicación corregida' : action === 'defer' ? '¿Qué contexto falta?' : '¿Por qué no corresponde?'}<textarea maxLength={4000} required={action !== 'confirm'} value={note} onChange={e => setNote(e.target.value)} autoFocus /></label>{batchable && related.length > 0 && <div className="guide-also"><strong>Misma evidencia en otros hallazgos pendientes — aplicar esta decisión también a:</strong>{related.map(c => <label key={c.name} className="guide-check"><input type="checkbox" checked={also.includes(c.name)} onChange={e => setAlso(v => e.target.checked ? [...v, c.name] : v.filter(n => n !== c.name))} />{criterionNames[c.name]}</label>)}<small>Cada decisión queda registrada por separado en el historial.</small></div>}<button disabled={disabled}>{batchable && also.length > 0 ? `Guardar decisión (${also.length + 1} hallazgos)` : 'Guardar decisión'}</button><button type="button" disabled={busy} onClick={() => setAction('')}>Cancelar</button></form>}
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
