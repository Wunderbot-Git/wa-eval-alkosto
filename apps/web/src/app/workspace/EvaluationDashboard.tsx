'use client'
import { useState } from 'react'
import WorkspaceIcon from './WorkspaceIcon'
import { categoriesOf, criterionNames, filterRows, groupOf, groups, reviewNames, reviewOf, Row } from './dashboard-model'

export default function EvaluationDashboard({ sessions, onOpen }: { sessions: Row[]; onOpen: (id: string) => void }) {
  const [filter, setFilter] = useState({ from: '', to: '', category: '', review: '', search: '' })
  const [group, setGroup] = useState('evaluated')
  const [criterion, setCriterion] = useState('')
  const base = filterRows(sessions, filter)
  const current = base.filter(s => s.assessment && !s.assessment.stale)
  const findings = current.flatMap(s => s.assessment.criteria.filter((c: Row) => c.status === 'INCUMPLE'))
  const visible = base.filter(s => (group === 'all' || group === 'evaluated' && s.assessment && !s.assessment.stale || groupOf(s) === group) && (!criterion || (s.assessment && !s.assessment.stale && s.assessment.criteria.some((c: Row) => c.name === criterion && c.status === 'INCUMPLE'))))
    .sort((a, b) => groups.findIndex(g => g.id === groupOf(a)) - groups.findIndex(g => g.id === groupOf(b)) || b.start.localeCompare(a.start))
  const date = (v: string) => new Date(v).toLocaleString('es-CO', { timeZone: 'America/Bogota', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  const field = (key: string, value: string) => setFilter(f => ({ ...f, [key]: value }))
  return <div className="evaluation-dashboard">
    <div className="dashboard-intro"><p>Una vista clara de la calidad de tus conversaciones.</p><span>Última evaluación vigente por conversación</span></div>
    <div className="dashboard-filters" role="group" aria-label="Filtros del resumen">
      <label>Desde<input type="date" value={filter.from} onChange={e => field('from', e.target.value)} /></label>
      <label>Hasta<input type="date" value={filter.to} min={filter.from || undefined} onChange={e => field('to', e.target.value)} /></label>
      <label>Categoría<select value={filter.category} onChange={e => field('category', e.target.value)}><option value="">Todas las categorías</option>{[...new Set(sessions.flatMap(categoriesOf))].sort().map(c => <option key={c}>{c}</option>)}</select></label>
      <label>Revisión humana<select value={filter.review} onChange={e => field('review', e.target.value)}><option value="">Todos los estados</option>{['pending', 'in_progress', 'reviewed', 'agreed', 'disagreed'].map(r => <option key={r} value={r}>{reviewNames[r]}</option>)}</select></label>
      <button className="quiet-button" onClick={() => { setFilter({ from: '', to: '', category: '', review: '', search: '' }); setGroup('evaluated'); setCriterion('') }}>Restablecer</button>
    </div>
    <p className="scope-note">Fechas de inicio de conversación · Colombia · {base.length} conversaciones en el filtro</p>
    <div className="dashboard-totals">
      <div className="metric-card"><span className="metric-icon"><WorkspaceIcon name="conversaciones" /></span><span>Conversaciones</span><b>{base.length}</b><small>En el período seleccionado</small></div>
      <div className="metric-card"><span className="metric-icon"><WorkspaceIcon name="checked" /></span><span>Evaluaciones vigentes</span><b>{current.length}<small> / {base.length}</small></b><small>Sin contar versiones anteriores</small></div>
      <div className="metric-card"><span className="metric-icon"><WorkspaceIcon name="alert" /></span><span>Hallazgos detectados</span><b>{findings.length}</b><small>Incumplimientos en criterios</small></div>
      <div className="metric-card"><span className="metric-icon"><WorkspaceIcon name="clock" /></span><span>Por revisar</span><b>{current.filter(s => ['pending', 'in_progress'].includes(reviewOf(s))).length}</b><small>Revisión humana por completar</small></div>
    </div>

    <div className="dashboard-analytics"><section className="findings-breakdown"><div><h2>Hallazgos por criterio</h2><p>Conversaciones con incumplimiento por criterio.<br/>Haz clic para ver los casos.</p></div><div className="criterion-bars">{Object.entries(criterionNames).map(([key, name]) => {
      const count = current.filter(s => s.assessment.criteria.some((c: Row) => c.name === key && c.status === 'INCUMPLE')).length
      const unknown = current.filter(s => s.assessment.criteria.some((c: Row) => c.name === key && c.status === 'EVIDENCIA_INSUFICIENTE')).length
      return <button key={key} aria-pressed={criterion === key} disabled={!count} onClick={() => { setCriterion(criterion === key ? '' : key); setGroup('all') }}><span>{name}</span><span className="bar-track"><i style={{ width: `${current.length ? count / current.length * 100 : 0}%` }} /></span><b>{count}</b>{unknown > 0 && <small>{unknown} sin evidencia suficiente</small>}</button>
    })}</div></section>
    <section className="coverage-panel"><h2>Avance de evaluación</h2><p>Conversaciones analizadas en este filtro</p><div className="coverage-donut" role="img" aria-label={`${current.length} de ${base.length} conversaciones evaluadas`} style={{ background: `conic-gradient(#004797 0% ${base.length ? current.length / base.length * 100 : 0}%, #E2E9F1 0% 100%)` }}><div><strong>{base.length ? Math.round(current.length / base.length * 100) : 0}%</strong><span>evaluadas</span></div></div><div className="coverage-legend"><span><i /> Evaluadas <b>{current.length}</b></span><span><i /> Sin evaluar o actualizar <b>{base.length - current.length}</b></span></div><p className="coverage-note">Este porcentaje mide avance, no calidad. Una conversación puede tener varios hallazgos.</p></section></div>
    <section className="outcome-panel"><div className="panel-heading"><h2>Resultados de las conversaciones</h2><span>Selecciona un estado para explorar</span></div>
    <div className="outcome-cards" role="group" aria-label="Clasificación de resultados">{groups.map(g => <button key={g.id} aria-pressed={group === g.id} className={`outcome-card ${g.tone} ${group === g.id ? 'chosen' : ''}`} onClick={() => { setGroup(group === g.id ? 'evaluated' : g.id); setCriterion('') }}><span>{g.title}</span><b>{base.filter(s => groupOf(s) === g.id).length}</b><small>{g.hint}</small></button>)}</div>
    </section>
    <section className="evaluation-results"><div className="result-switch" role="group" aria-label="Ámbito de resultados"><button aria-pressed={group === 'evaluated' && !criterion} onClick={() => { setGroup('evaluated'); setCriterion('') }}>Evaluaciones vigentes ({current.length})</button><button aria-pressed={group === 'all' && !criterion} onClick={() => { setGroup('all'); setCriterion('') }}>Todas las conversaciones ({base.length})</button></div><div className="results-heading"><div><h2>{criterion ? criterionNames[criterion] : group === 'all' ? 'Todas las conversaciones' : group === 'evaluated' ? 'Evaluaciones vigentes' : groups.find(g => g.id === group)?.title} <span>{visible.length}</span></h2><p>Abre un caso para ver la explicación y los mensajes que la sustentan.</p></div><input aria-label="Buscar evaluaciones" placeholder="Buscar en los resultados…" value={filter.search} onChange={e => field('search', e.target.value)} /></div>
      <div className="results-table-wrap"><table className="results-table"><thead><tr><th>Conversación / categoría</th><th>Resultado</th><th>Qué encontró el evaluador</th><th>Revisión humana</th><th><span className="sr-only">Detalle</span></th></tr></thead><tbody>{visible.map(s => {
        const g = groups.find(g => g.id === groupOf(s))!
        const a = s.assessment && !s.assessment.stale ? s.assessment : null
        const failures = a?.criteria.filter((c: Row) => c.status === 'INCUMPLE') || []
        const unknown = a?.criteria.filter((c: Row) => c.status === 'EVIDENCIA_INSUFICIENTE').length || 0
        return <tr key={s.id}><td><small>{date(s.start)} · {s.subject.slice(0, 8)}</small><strong>{categoriesOf(s).join(' · ')}</strong><p className="row-preview">{s.preview || 'Sin consulta visible'}</p></td><td><span className={`outcome-tag ${g.tone}`}>{g.title}</span>{a && <small>{a.score == null ? 'Sin nota' : `${a.score}/10`} · Cobertura {a.coverage}</small>}</td><td>{a ? <><p>{failures.length ? failures.map((c: Row) => criterionNames[c.name] || c.name).join(' · ') : a.summary}</p>{failures.length > 0 && <small>{failures.length} hallazgos · </small>}{unknown > 0 && <small>{unknown} {unknown === 1 ? 'criterio' : 'criterios'} sin evidencia suficiente</small>}</> : <p>{s.assessment ? 'El resultado anterior necesita actualizarse.' : 'Evalúa la conversación para identificar hallazgos.'}</p>}</td><td><span className={`human-status ${reviewOf(s)}`}>{reviewNames[reviewOf(s)]}</span></td><td><button onClick={() => onOpen(s.id)}>Ver {a ? 'evaluación' : 'conversación'} ↗</button></td></tr>
      })}</tbody></table>{!visible.length && <div className="empty"><h3>No hay casos en esta selección</h3><p>Cambia la clasificación o restablece los filtros. No se han generado datos de ejemplo.</p></div>}</div>
    </section>
  </div>
}
