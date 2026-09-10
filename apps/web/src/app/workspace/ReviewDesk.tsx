'use client'
import { useEffect, useRef, useState } from 'react'
import { cardChips, criterionNames, groupOf, groups, outcomeNames, reconstructionNames, reconstructionNotes, reviewOf, Row, sectionsOf } from './dashboard-model'
import './review-desk.css'
import GuidedReview, { humanState } from './GuidedReview'
const statuses: Record<string, string> = { INCUMPLE: 'Hallazgo', CUMPLE: 'Cumple', NO_APLICA: 'No aplica', EVIDENCIA_INSUFICIENTE: 'Evidencia insuficiente' }
const timestamp = (v: string) => new Date(v).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' })
const shortDate = (v: string) => new Date(v).toLocaleString('es-CO', { timeZone: 'America/Bogota', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
const day = (v: string) => new Date(v).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'long', year: 'numeric' })
export default function ReviewDesk({ sessions, selectedId, onSelect, api, onRefresh, aiReady, batch }: { sessions: Row[]; selectedId: string; onSelect: (id: string) => void; api: (path: string, options?: RequestInit) => Promise<any>; onRefresh: () => Promise<void>; aiReady?: boolean; batch?: Row | null }) {
  const [humanEvidence, setHumanEvidence] = useState<string[]>([])
  const [selectedMessages, setSelectedMessages] = useState<string[]>([])
  const [selecting, setSelecting] = useState(false)
  // Focus overlay: cards are the entry point; arriving with a preselected
  // conversation (e.g. dashboard "Ver evaluación") opens it directly.
  const [open, setOpen] = useState(!!selectedId)
  const [filter, setFilter] = useState('all')
  const [expanded, setExpanded] = useState<string[]>([])
  const [flagging, setFlagging] = useState(false)
  // Research assistant: questions about the evidence only. Kept per
  // conversation and cleared with it, like every other review state.
  const [ask, setAsk] = useState('')
  const [asked, setAsked] = useState<Row[]>([])
  const [detail, setDetail] = useState<Row | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [criterion, setCriterion] = useState('')
  const [reference, setReference] = useState(0)
  const [revision, setRevision] = useState(0)
  const [mobile, setMobile] = useState('findings')
  const [improvement, setImprovement] = useState(false)
  const [decision, setDecision] = useState('')
  const [note, setNote] = useState('')
  const [expected, setExpected] = useState('')
  const apiRef = useRef(api); apiRef.current = api
  const scroll = useRef<HTMLDivElement>(null)
  const bubbles = useRef(new Map<string, HTMLDivElement>())
  // Greeting-only conversations (no dialogue) have nothing to review; they
  // are hidden from every queue except their own explicit filter.
  const queue = sessions.filter(s => filter === 'trivial' ? s.outcome === 'SIN_INTERACCION'
    : s.outcome !== 'SIN_INTERACCION' && (filter === 'all' || filter === 'findings' && ['critical', 'findings'].includes(groupOf(s)) || filter === 'review' && ['pending', 'in_progress'].includes(reviewOf(s))))
    .sort((a, b) => groups.findIndex(g => g.id === groupOf(a)) - groups.findIndex(g => g.id === groupOf(b)) || b.start.localeCompare(a.start))
  const activeId = queue.some(s => s.id === selectedId) ? selectedId : queue[0]?.id || ''
  const position = queue.findIndex(s => s.id === activeId)
  useEffect(() => {
    let cancelled = false
    setHumanEvidence([]); setSelectedMessages([]); setSelecting(false); setDetail(null); setError(''); setNotice(''); setCriterion(''); setReference(0); setImprovement(false); setDecision(''); setNote(''); setExpected(''); setMobile('findings'); setAsk(''); setAsked([])
    if (activeId) apiRef.current('/sessions/' + activeId).then(d => { if (!cancelled) setDetail(d) }).catch(e => { if (!cancelled) setError(e.message) })
    return () => { cancelled = true }
  }, [activeId, revision])
  useEffect(() => { if (selectedId) setOpen(true) }, [selectedId])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  const assessment = detail?.assessments?.[0]
  const verdict = assessment?.payload?.verdict
  const stale = assessment && (assessment.inputHash !== detail?.inputHash || assessment.payload.rubricVersion !== detail?.rubricVersion)
  const criteria: Row[] = [...(verdict?.criteria || [])].sort((a, b) => ['INCUMPLE', 'EVIDENCIA_INSUFICIENTE', 'CUMPLE', 'NO_APLICA'].indexOf(a.status) - ['INCUMPLE', 'EVIDENCIA_INSUFICIENTE', 'CUMPLE', 'NO_APLICA'].indexOf(b.status))
  const chosen = criteria.find(c => c.name === criterion)
  const cited: string[] = humanEvidence.length ? humanEvidence : chosen?.evidenceIds || []
  // Keep citations in conversational order, regardless of the order generated by the model.
  const references: string[] = (detail?.events || []).filter((e: Row) => cited.includes(e.id)).map((e: Row) => e.id)
  const missing = cited.filter(id => !references.includes(id)).length
  const focusId = references[reference]
  useEffect(() => {
    const node = focusId ? bubbles.current.get(focusId) : null
    const container = scroll.current
    if (!node || !container) return
    const frame = requestAnimationFrame(() => {
      container.scrollTo({ top: container.scrollTop + node.getBoundingClientRect().top - container.getBoundingClientRect().top - 60, behavior: 'auto' })
      node.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [focusId, criterion, detail, mobile])
  const showEvidenceIds = (ids: string[]) => { setHumanEvidence(ids); setCriterion(''); setReference(0); setMobile('chat') }
  async function save(path: string, body: Row, success: string) {
    setBusy(true); setError(''); setNotice('')
    try {
      await api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await api('/sessions/' + activeId)
      setDetail(d); await onRefresh(); setNotice(success)
      setNote(''); setDecision(''); setExpected(''); setImprovement(false)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  // Conversations the daily job would evaluate: enough dialogue to judge.
  const candidates = sessions.filter(s => s.candidacy === 'APTA' && (!s.assessment || s.assessment.stale))
  const running = !!batch?.running
  async function evaluatePending() {
    setBusy(true); setError(''); setNotice('')
    try {
      const r = await api('/evaluate/pending', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ limit: 50 }) })
      await onRefresh()
      setNotice(`Evaluando ${r.started} conversaciones en segundo plano. Tarda varios minutos; puedes seguir revisando.`)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return <div className="review-desk">
    {!open ? <>
    <div className="desk-queue"><label>Cola de revisión<select value={filter} disabled={busy} onChange={e => setFilter(e.target.value)}><option value="all">Todas las conversaciones con diálogo</option><option value="findings">Con hallazgos</option><option value="review">Pendientes de revisión humana</option><option value="trivial">Sin diálogo (solo saludo)</option></select></label><span className="desk-count">{batch ? `${batch.done + batch.failed} de ${batch.total} evaluadas${batch.running ? '…' : batch.failed ? ` · ${batch.failed} fallidas` : ' · lote terminado'} · ` : ''}{queue.length} conversaciones · haz clic en una tarjeta para revisarla</span></div>
    {error && <div className="desk-error" role="alert">{error} <button disabled={busy} onClick={() => setRevision(n => n + 1)}>Actualizar conversación</button></div>}
    {notice && <p className="desk-saved" role="status">{notice}</p>}
    {!queue.length ? <p className="empty">No hay conversaciones en esta cola. Cambia el filtro.</p> :
    sectionsOf(queue).map(section => { const limit = expanded.includes(section.id) ? section.rows.length : 48; return <section key={section.id} className="desk-section">
      <h3 className={'desk-section-head ' + section.tone}><span>{section.title}</span><b>{section.rows.length}</b><small>{section.hint}</small></h3>
      {section.id === 'pending' && <p className="desk-batch">{candidates.length
        ? <>{candidates.length} de estas {section.rows.length} tienen diálogo suficiente para evaluarse; el resto se queda sin evaluar a propósito. <button disabled={busy || !aiReady || running} onClick={evaluatePending}>Evaluar {Math.min(candidates.length, 50)} con IA ahora</button></>
        : 'Ninguna tiene todavía diálogo suficiente para una evaluación con IA.'}</p>}
      <div className="desk-cards">{section.rows.slice(0, limit).map(s => { const a = s.assessment && !s.assessment.stale ? s.assessment : null; return <button key={s.id} className="desk-card" onClick={() => { onSelect(s.id); setOpen(true) }}>
        <span className="desk-card-top"><small>{shortDate(s.start)}{s.count ? ` · ${s.count} mensajes` : ''}</small><b>{a ? `${a.score ?? '—'}/10` : ''}</b></span>
        <span className="desk-card-chips">{cardChips(s).map(c => <span key={c.label} className={`outcome-tag ${c.tone}`}>{c.label}</span>)}</span>
      </button> })}</div>
      {section.rows.length > limit && <button className="desk-more" onClick={() => setExpanded(v => [...v, section.id])}>Mostrar las {section.rows.length - limit} restantes</button>}
    </section> })}
    </> : <div className="desk-overlay" role="dialog" aria-modal="true" aria-label="Revisión de la conversación">
    <div className="desk-overlay-bar">
      <button className="desk-overlay-close" onClick={() => setOpen(false)}>✕ Cerrar</button>
      <span className="desk-overlay-pos">{position < 0 ? 0 : position + 1} de {queue.length}</span>
      <div className="desk-paging"><button aria-label="Conversación anterior" disabled={busy || position <= 0} onClick={() => onSelect(queue[position - 1].id)}>←</button><button aria-label="Conversación siguiente" disabled={busy || position < 0 || position >= queue.length - 1} onClick={() => onSelect(queue[position + 1].id)}>→</button></div>
      <button className="desk-flag-open" disabled={busy} aria-pressed={flagging} onClick={() => setFlagging(v => !v)}>⚑ Marcar para calibración</button>
      {notice && <p className="desk-saved" role="status">{notice}</p>}
      {error && <div className="desk-error" role="alert">{error} <button disabled={busy} onClick={() => setRevision(n => n + 1)}>Actualizar conversación</button></div>}
    </div>
    {flagging && <form className="desk-flag" onSubmit={async e => {
      e.preventDefault()
      const f = Object.fromEntries(new FormData(e.currentTarget))
      setBusy(true); setError(''); setNotice('')
      try {
        await api(`/sessions/${activeId}/flags`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) })
        setFlagging(false); setNotice('Marcada. Aparecerá en Calibración hasta que la revises tras el próximo cambio de rúbrica.')
      } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
    }}>
      <p>Qué falló en esta evaluación. La marca queda en la conversación y sobrevive a la reevaluación, para comprobar después si el cambio de rúbrica la resolvió.</p>
      <label>Tipo<select name="kind" defaultValue="FALTA_HALLAZGO"><option value="FALTA_HALLAZGO">Faltó un hallazgo</option><option value="HALLAZGO_FALSO">Hallazgo inventado</option><option value="SEVERIDAD_INCORRECTA">Severidad incorrecta</option><option value="CASO_DE_REFERENCIA">Caso de referencia (debe seguir igual)</option></select></label>
      <label>Criterio (opcional)<select name="criterion" defaultValue=""><option value="">Sin criterio concreto</option>{Object.entries(criterionNames).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label>Qué debería haber detectado<textarea name="note" required maxLength={4000} placeholder="p. ej. el agente descartó «iPhone» a partir de «no quiero aifon» sin confirmar" /></label>
      <button disabled={busy}>Guardar marca</button><button type="button" disabled={busy} onClick={() => setFlagging(false)}>Cancelar</button>
    </form>}
    {!activeId ? <p className="empty">No hay conversaciones en esta cola.</p> : !detail ? <p className="empty" role="status">Cargando conversación y evaluación…</p> : <>
    <div className="desk-mobile-tabs"><button aria-pressed={mobile === 'findings'} onClick={() => setMobile('findings')}>Evaluación y hallazgos</button><button aria-pressed={mobile === 'chat'} onClick={() => setMobile('chat')}>Conversación</button></div>
    <div className={'desk-panels mobile-' + mobile}>
      <section className="desk-evaluation" aria-label="Evaluación y hallazgos">
      {(!assessment || stale) && (detail.reconstruction?.endReason === 'BORDE_DE_DATOS'
        ? <p className="caution">Esta conversación termina cerca del final de los datos importados y podría continuar después. Se podrá evaluar tras importar el día siguiente.</p>
        : <button className="desk-evaluate" disabled={busy || !aiReady} onClick={() => save(`/sessions/${activeId}/evaluate`, {}, 'Evaluación real guardada')}>{assessment ? 'Reevaluar con IA' : 'Evaluar con IA'}</button>)}
      {!assessment ? <p className="desk-context">Esta conversación todavía no tiene una evaluación. Puedes leer el chat completo a la derecha.</p> : <>
        {stale && <p className="caution">Evaluación obsoleta. No la uses como resultado vigente: cambiaron los mensajes o la rúbrica.</p>}
        <div className="desk-overview">
          <p className="desk-overview-line"><strong>{groups.find(g => g.id === groupOf(queue[position] || {}))?.title || 'Evaluación de IA'}</strong><span> · Nota IA {verdict.score ?? '—'}/10 · Cobertura {verdict.coverage}</span></p>
          <details className="desk-summary-details"><summary>Resumen de la evaluación</summary><p className="desk-summary">{verdict.summary}</p></details>
          <details className="desk-summary-details"><summary>Los {criteria.length} criterios de la IA</summary><div className="criteria-chips">{criteria.map((c: Row) => <button key={c.name} className={'s-' + c.status.toLowerCase()} disabled={busy} aria-pressed={criterion === c.name} onClick={() => { setHumanEvidence([]); setCriterion(c.name); setReference(0) }}>{criterionNames[c.name]}<small>{statuses[c.status]}</small></button>)}</div></details>
        </div>
        {(verdict.fricciones || []).length > 0 && <div className="desk-frictions"><small>FRICCIONES DEL CANAL · NO CUENTAN EN LA NOTA</small>{(verdict.fricciones || []).map((f: Row, i: number) => <p key={i}>{f.description}<button className="guide-link" onClick={() => { setHumanEvidence(f.evidenceIds); setCriterion(''); setReference(0); setMobile('chat') }}>Ver {f.evidenceIds.length} {f.evidenceIds.length === 1 ? 'mensaje' : 'mensajes'} →</button></p>)}</div>}
        <GuidedReview key={assessment.id} assessment={assessment} stale={!!stale} criteria={criteria} criterion={criterion} select={name => { setHumanEvidence([]); setCriterion(name); setReference(0) }} openChat={() => setMobile('chat')} showEvidence={ids => { setHumanEvidence(ids); setCriterion(''); setReference(0); setMobile('chat') }} selectedMessages={selectedMessages} clearMessages={() => setSelectedMessages([])} selecting={selecting} setSelecting={setSelecting} busy={busy} next={() => { const candidate = queue.slice(position + 1).concat(queue.slice(0, position)).find(s => ['pending', 'in_progress'].includes(reviewOf(s))); if (candidate) onSelect(candidate.id); else setNotice('Has completado esta cola. Gracias por tu revisión.'); }} submit={async body => {
          setBusy(true); setError(''); setNotice('')
          try { await api(`/assessments/${assessment.id}/guided-review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, version: (assessment.payload.humanReview || []).length }) }); setDetail(await api('/sessions/' + activeId)); await onRefresh(); setNotice(body.action === 'undo' ? 'Acción deshecha. El historial se conserva.' : 'Guardado. Tu revisión ayuda a mejorar el agente.'); return true }
          catch (e) { setError((e as Error).message); return false } finally { setBusy(false) }
        }} />
        {chosen?.status === 'INCUMPLE' && ['confirm', 'correct'].includes(humanState(assessment.payload.humanReview || []).decisions[chosen.name]?.decision) && !stale && <div className="desk-improvement"><button disabled={busy} onClick={() => setImprovement(v => !v)}>Preparar mejora de este hallazgo</button>{improvement && <form onSubmit={e => { e.preventDefault(); save('/issues', { sessionId: activeId, title: `${criterionNames[chosen.name]} · ${detail.subject.slice(0, 8)}`, expected }, 'Solicitud creada en Mejoras. No se ha enviado ningún correo.') }}><h3>{criterionNames[chosen.name]}</h3><label>Resultado esperado y prueba de aceptación<textarea required value={expected} onChange={e => setExpected(e.target.value)} /></label><button disabled={busy}>Crear solicitud de mejora</button></form>}</div>}
      </>}
      <div className="desk-assistant">
        <h3>Consultar la conversación</h3>
        <p>Busca datos en los mensajes: qué se dijo, quién lo dijo, si una pregunta quedó sin respuesta. No opina sobre la evaluación — esa valoración es tuya y debe seguir siéndolo.</p>
        {!asked.length && <div className="desk-assistant-hints">{['¿Dónde menciona el cliente su presupuesto?', '¿Qué productos mostró el agente?', '¿Quedó alguna pregunta del cliente sin responder?'].map(q =>
          <button key={q} type="button" disabled={busy || !aiReady} onClick={() => setAsk(q)}>{q}</button>)}</div>}
        {asked.map((a, i) => <div className={'desk-answer' + (a.kind === 'FUERA_DE_ALCANCE' ? ' out-of-scope' : '')} key={i}>
          <small>{a.question}</small>
          <p>{a.answer}</p>
          {a.evidenceIds?.length > 0 && <button className="guide-link" onClick={() => showEvidenceIds(a.evidenceIds)}>Ver {a.evidenceIds.length} {a.evidenceIds.length === 1 ? 'mensaje' : 'mensajes'} citados →</button>}
        </div>)}
        <form onSubmit={async e => {
          e.preventDefault()
          const question = ask.trim(); if (!question) return
          setBusy(true); setError('')
          try {
            const answer = await api(`/sessions/${activeId}/assistant`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question }) })
            setAsked(v => [...v, answer]); setAsk('')
          } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
        }}>
          <input aria-label="Pregunta sobre la conversación" value={ask} onChange={e => setAsk(e.target.value)} maxLength={500} placeholder="Pregunta sobre los mensajes…" disabled={busy || !aiReady} />
          <button disabled={busy || !aiReady || !ask.trim()}>Preguntar</button>
        </form>
        {!aiReady && <small>Requiere acceso a la IA configurado.</small>}
      </div>
      </section>
      <section className="desk-chat" aria-label="Conversación estilo WhatsApp"><div className="wa-header"><div className="wa-avatar">{detail.subject.slice(0, 2).toUpperCase()}</div><div><h2>Cliente · {detail.subject.slice(0, 8)}</h2><p>Cliente a la izquierda · Agente a la derecha{detail.outcome ? ` · ${outcomeNames[detail.outcome]}` : ''}</p></div><span className="wa-readonly">Solo lectura</span></div>
        <div className="wa-evidence-nav" aria-live="polite"><div><strong>{humanEvidence.length ? 'Observación humana' : chosen ? criterionNames[chosen.name] : 'Conversación completa'}</strong><span>{chosen || humanEvidence.length ? references.length ? `Evidencia ${reference + 1} de ${references.length} · Mensajes citados resaltados` : 'Este criterio no cita mensajes disponibles.' : 'Elige un hallazgo a la izquierda para saltar a su evidencia.'}{missing > 0 ? ` ${missing} referencias no disponibles.` : ''}</span></div>{references.length > 0 && <div><button aria-label="Evidencia anterior" disabled={reference === 0} onClick={() => setReference(n => n - 1)}>↑</button><button aria-label="Evidencia siguiente" disabled={reference === references.length - 1} onClick={() => setReference(n => n + 1)}>↓</button><button onClick={() => { setHumanEvidence([]); setCriterion(''); setReference(0) }}>Quitar resaltado</button></div>}</div>
        <div className="wa-messages" ref={scroll} tabIndex={0} aria-label="Mensajes de la conversación">
          <div className="wa-notice">Vista de la exportación{detail.reconstruction ? ` · Reconstrucción ${reconstructionNames[detail.reconstruction.confidence].toLowerCase()}: ${reconstructionNotes(detail.reconstruction).join(' · ')}` : ''}</div>
          {detail.events.map((e: Row, index: number) => { const system = !['customer', 'agent'].includes(e.kind); return <div className="wa-message-group" key={e.id}>{(index === 0 || day(e.at) !== day(detail.events[index - 1].at)) && <div className="wa-date">{day(e.at)}</div>}<div ref={node => { if (node) bubbles.current.set(e.id, node); else bubbles.current.delete(e.id) }} tabIndex={-1} data-message-id={e.id} data-evidence={references.includes(e.id) ? 'true' : 'false'} className={`wa-message ${system ? 'wa-system' : e.kind === 'customer' ? 'wa-incoming' : 'wa-outgoing'} ${references.includes(e.id) ? 'wa-cited' : ''} ${focusId === e.id ? 'wa-focused' : ''}`}>
            {references.includes(e.id) && <div className="wa-citation">Evidencia {references.indexOf(e.id) + 1}{focusId === e.id ? ' · seleccionada' : ''}</div>}
            <small className="wa-sender">{system ? ({ closure: 'Cierre automático', survey: 'Encuesta automática', rating: 'Respuesta a encuesta', reset: 'Reinicio', trace: 'Evento del sistema' } as Record<string, string>)[e.kind] || 'Sistema' : e.kind === 'customer' ? 'Cliente' : 'Agente Alkosto'}</small>
            {e.media === 'IMAGE' && <div className="wa-media-placeholder">▧ Imagen · contenido visual no disponible</div>}
            <p>{e.text || (e.media !== 'IMAGE' ? '[Mensaje sin texto disponible]' : '')}</p>
            {e.cardsText && <div className="wa-products"><small>PRODUCTOS COMPARTIDOS</small><p>{e.cardsText}</p></div>}
            {selecting && <label className="wa-select"><input type="checkbox" aria-label={`Seleccionar mensaje ${index + 1}`} disabled={busy || !!stale || !assessment} checked={selectedMessages.includes(e.id)} onChange={event => { setSelectedMessages(ids => event.target.checked ? [...ids, e.id] : ids.filter(id => id !== e.id)) }} />{selectedMessages.includes(e.id) ? 'Seleccionado' : 'Seleccionar para observación'}</label>}<time dateTime={e.at}>{timestamp(e.at)}</time>
          </div></div> })}
        </div><div className="wa-footer">{selectedMessages.length > 0 && <button onClick={() => setMobile('findings')}>{selectedMessages.length} mensajes · Añadir observación ←</button>}Conversación histórica · No se envían mensajes desde esta vista.</div>
      </section>
    </div></>}
    </div>}
  </div>
}
