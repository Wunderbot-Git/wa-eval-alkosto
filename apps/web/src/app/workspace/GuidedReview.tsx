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
export default function GuidedReview({ assessment, stale, criteria, criterion, select, selectedMessages, clearMessages, showEvidence, openChat, submit, busy, next }: { assessment: Row; stale: boolean; criteria: Row[]; criterion: string; select: (name: string) => void; selectedMessages: string[]; clearMessages: () => void; showEvidence: (ids: string[]) => void; openChat: () => void; submit: (body: Row) => Promise<boolean>; busy: boolean; next: () => void }) {
  const cardRef = useRef<HTMLElement>(null)
  const createRef = useRef<HTMLDivElement>(null)
  const history: Row[] = assessment.payload.humanReview || []
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
  return <div className="guided-review">
    <div className="guide-progress"><div><strong>{state.completed ? 'Revisión completada' : 'Tu criterio hace la diferencia'}</strong><span>{findings.length - pending.length} de {findings.length} hallazgos resueltos</span></div><progress aria-label="Progreso de revisión" value={findings.length - pending.length} max={findings.length || 1} /><p>{state.completed ? 'Tus decisiones quedaron guardadas junto a la evaluación original.' : pending.length === 1 ? 'Un hallazgo más y puedes cerrar este caso.' : pending.length ? 'Comprueba la evidencia y decide con confianza.' : 'Lee el chat completo: puedes encontrar algo que la IA no vio.'}</p></div>
    <div className="guide-switch"><button aria-pressed={!all} onClick={() => setAll(false)}>Hallazgos · {findings.length}</button><button aria-pressed={all} onClick={() => setAll(true)}>Todos los criterios</button></div>
    <div className="guide-steps">{(all ? criteria : findings).map((c, i) => <button key={c.name} disabled={busy} aria-pressed={criterion === c.name} onClick={() => select(c.name)}><span>{state.decisions[c.name] ? '✓' : i + 1}</span>{criterionNames[c.name]}<small>{state.decisions[c.name] ? labels[state.decisions[c.name].decision] : c.status === 'INCUMPLE' ? 'Por revisar' : c.status === 'CUMPLE' ? 'Cumple según IA' : c.status === 'NO_APLICA' ? 'No aplica' : 'Falta evidencia'}</small></button>)}</div>
    {chosen && <article ref={cardRef} className="guide-card"><small className="guide-eyebrow">{chosen.status === 'INCUMPLE' ? 'POSIBLE PROBLEMA · DETECTADO POR IA' : 'CRITERIO · EVALUACIÓN DE IA'}</small><h3>{criterionNames[chosen.name]}</h3>{chosen.severity === 'CRITICAL' && <span className="guide-suspected">Posible gravedad alta · por validar</span>}<p>{chosen.reason}</p><button className="guide-link" onClick={() => { select(chosen.name); openChat() }}>Ver {chosen.evidenceIds.length} mensajes de evidencia →</button>
      {state.decisions[criterion] && <div className="guide-decision"><strong>{labels[state.decisions[criterion].decision]}</strong>{state.decisions[criterion].correctedCriterion && <span> · {criterionNames[state.decisions[criterion].correctedCriterion]} · {state.decisions[criterion].severity === 'CRITICAL' ? 'Alta' : 'Moderada'}</span>}<p>{state.decisions[criterion].note || 'Confirmado por revisión humana.'}</p></div>}
      {chosen.status === 'INCUMPLE' ? <div className="guide-actions"><button disabled={disabled} aria-pressed={action === 'confirm'} onClick={() => setAction('confirm')}>✓ Confirmar</button><button disabled={disabled} aria-pressed={action === 'correct'} onClick={() => setAction('correct')}>Corregir</button><button disabled={disabled} aria-pressed={action === 'dismiss'} onClick={() => setAction('dismiss')}>Descartar</button><button className="guide-link" disabled={disabled} onClick={() => setAction('defer')}>Revisar después</button></div> : <p className="desk-context">¿La IA pasó por alto un problema? Selecciona mensajes en el chat para añadirlo.</p>}
      {action && <form className="guide-form" onSubmit={e => { e.preventDefault(); decide() }}>{action === 'correct' && <><label>Criterio<select value={category} onChange={e => setCategory(e.target.value)}>{Object.entries(criterionNames).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><label>Gravedad<select value={severity} onChange={e => setSeverity(e.target.value)}><option value="WARNING">Moderada</option><option value="CRITICAL">Alta · puede conducir a una mala compra</option></select></label></>}<label>{action === 'confirm' ? 'Comentario (opcional)' : action === 'correct' ? 'Tu explicación corregida' : action === 'defer' ? '¿Qué contexto falta?' : '¿Por qué no corresponde?'}<textarea maxLength={4000} required={action !== 'confirm'} value={note} onChange={e => setNote(e.target.value)} autoFocus /></label><button disabled={disabled}>Guardar decisión</button><button type="button" disabled={busy} onClick={() => setAction('')}>Cancelar</button></form>}
    </article>}
    {!findings.length && !all && <div className="guide-empty"><h3>Una mirada humana sigue siendo clave</h3><p>La IA no señaló incumplimientos. Revisa el chat y registra tanto problemas omitidos como buenas respuestas.</p></div>}
    <div ref={createRef} className="guide-create"><h3>Lo que tú encontraste</h3><p>Marca uno o varios mensajes del chat para añadir un hallazgo o destacar una buena respuesta.</p>{selectedMessages.length > 0 && <form className="guide-form" onSubmit={async e => { e.preventDefault(); if (await submit({ action: 'add', kind, criterion: category, severity, note: observation, evidenceIds: selectedMessages })) { clearMessages(); setObservation('') } }}><strong>{selectedMessages.length} mensajes seleccionados</strong><label>Qué quieres registrar<select value={kind} onChange={e => setKind(e.target.value)}><option value="finding">Añadir hallazgo</option><option value="positive">Destacar buena respuesta</option></select></label><label>Criterio<select value={category} onChange={e => setCategory(e.target.value)}>{Object.entries(criterionNames).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>{kind === 'finding' && <label>Gravedad<select value={severity} onChange={e => setSeverity(e.target.value)}><option value="WARNING">Moderada</option><option value="CRITICAL">Alta</option></select></label>}<label>Tu observación<textarea required maxLength={4000} value={observation} onChange={e => setObservation(e.target.value)} /></label><button disabled={disabled}>Guardar observación</button><button type="button" onClick={clearMessages}>Cancelar selección</button></form>}{state.additions.map(a => <div className="guide-decision" key={a.id}><strong>{a.kind === 'positive' ? '★ Buena respuesta' : 'Hallazgo humano'} · {criterionNames[a.criterion]}</strong><p>{a.note}</p><button className="guide-link" onClick={() => showEvidence(a.evidenceIds)}>Ver {a.evidenceIds.length} mensajes vinculados →</button></div>)}</div>
    {(assessment.payload.reviews || []).length > 0 && <details className="guide-history"><summary>Revisiones generales anteriores</summary>{assessment.payload.reviews.map((r: Row, i: number) => <p key={i}>{r.decision === 'DE_ACUERDO' ? 'De acuerdo' : 'En desacuerdo'} · {r.note}</p>)}</details>}
    {history.length > 0 && <details className="guide-history"><summary>Historial de revisión · {history.length} acciones</summary>{history.map(h => <p key={h.id}><strong>{h.action === 'decision' ? labels[h.decision] : h.action === 'add' ? 'Observación añadida' : h.action === 'undo' ? 'Acción deshecha' : 'Revisión finalizada'}</strong> · {new Date(h.at).toLocaleString('es-CO')}<br /><small>Revisor {h.userId} {h.criterion ? '· ' + criterionNames[h.criterion] : ''}</small>{h.note && <span> — {h.note}</span>}</p>)}</details>}
    {history.length > 0 && history.at(-1)?.action !== 'undo' && <button className="guide-link" disabled={disabled} onClick={() => submit({ action: 'undo', target: history.at(-1)?.id })}>Deshacer última acción</button>}
    <div className="guide-finish"><h3>{state.completed ? 'Gracias por aportar tu criterio' : 'Cierra el caso con una mirada completa'}</h3><p>{Object.values(state.decisions).filter((d: any) => d.decision === 'confirm').length} confirmados · {Object.values(state.decisions).filter((d: any) => d.decision === 'correct').length} corregidos · {Object.values(state.decisions).filter((d: any) => d.decision === 'dismiss').length} descartados · {state.additions.filter(a => a.kind === 'finding').length} añadidos</p>{!state.completed && <label className="guide-check"><input type="checkbox" checked={read} onChange={e => setRead(e.target.checked)} />Revisé el resto de la conversación para detectar omisiones.</label>}{pending.length > 0 && <p>Quedan {pending.length} hallazgos por resolver. Puedes continuar otro caso y volver después.</p>}<button disabled={disabled || (!state.completed && (!read || pending.length > 0 || Object.values(state.decisions).some((d: any) => d.decision === 'defer')))} onClick={async () => { if (state.completed || await submit({ action: 'complete', readConversation: read })) next() }}>{state.completed ? 'Continuar con otro caso →' : 'Finalizar revisión y continuar →'}</button></div>
  </div>
}
