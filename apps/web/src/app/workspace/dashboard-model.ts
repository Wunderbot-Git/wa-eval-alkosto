export type Row = Record<string, any>
export const groups = [
  { id: 'critical', title: 'Hallazgos críticos', hint: 'Al menos un criterio con un hallazgo crítico.', tone: 'danger' },
  { id: 'findings', title: 'Con hallazgos', hint: 'Incumplimientos detectados, sin criticidad alta.', tone: 'warning' },
  { id: 'incomplete', title: 'Evidencia insuficiente', hint: 'Sin incumplimientos detectados, pero faltan datos para concluir.', tone: 'neutral' },
  { id: 'clear', title: 'Sin hallazgos observados', hint: 'Todos los criterios aplicables cumplen. No equivale a una aprobación humana.', tone: 'good' },
  { id: 'pending', title: 'Sin evaluar', hint: 'Todavía no hay una evaluación.', tone: 'muted' },
  { id: 'stale', title: 'Reevaluación necesaria', hint: 'Cambiaron los mensajes o la rúbrica. El resultado anterior no cuenta como vigente.', tone: 'muted' },
]
export const criterionNames: Record<string, string> = { comprension: 'Comprensión de la necesidad', adecuacion: 'Adecuación del producto', exactitud: 'Exactitud de la información', comparacion: 'Comparación de opciones', contexto: 'Continuidad y contexto', resolucion: 'Resolución de la consulta', comunicacion: 'Claridad de la comunicación' }
export function groupOf(s: Row) {
  const a = s.assessment
  if (!a) return 'pending'
  if (a.stale) return 'stale'
  const cs: Row[] = a.criteria || []
  if (cs.some(c => c.status === 'INCUMPLE' && c.severity === 'CRITICAL')) return 'critical'
  if (cs.some(c => c.status === 'INCUMPLE')) return 'findings'
  if (!cs.some(c => c.status === 'CUMPLE') || cs.some(c => c.status === 'EVIDENCIA_INSUFICIENTE')) return 'incomplete'
  return 'clear'
}
export function reviewOf(s: Row) {
  if (!s.assessment || s.assessment.stale) return 'unavailable'
  if (s.assessment.humanReview?.completed) return 'reviewed'
  if (Object.keys(s.assessment.humanReview?.decisions || {}).length || s.assessment.humanReview?.additions?.length) return 'in_progress'
  const decision = s.assessment.review?.decision
  return decision === 'EN_DESACUERDO' ? 'disagreed' : decision === 'DE_ACUERDO' ? 'agreed' : 'pending'
}
export const reviewNames: Record<string, string> = { reviewed: 'Revisada', in_progress: 'En revisión', pending: 'Por revisar', agreed: 'Revisada · de acuerdo', disagreed: 'Revisada · en desacuerdo', unavailable: '—' }
// Deterministic conversation outcome (last commercial message), independent of quality.
export const outcomeNames: Record<string, string> = {
  CLIENTE_SIN_RESPUESTA: 'Cliente no respondió a la última pregunta',
  AGENTE_SIN_RESPUESTA: 'Agente no respondió al último mensaje',
  FINAL_SIN_PREGUNTA: 'Terminó sin pregunta pendiente',
}
export function categoriesOf(s: Row): string[] {
  const raw: string[] = s.assessment?.categories?.length ? s.assessment.categories : [s.assessment?.category || 'Sin categoría evaluada']
  const aliases: Record<string, string> = { computador: 'Computadores', computadores: 'Computadores', portátil: 'Computadores', 'portátil gamer': 'Computadores', portátiles: 'Computadores', laptop: 'Computadores', laptops: 'Computadores', impresora: 'Impresoras', impresoras: 'Impresoras', monitor: 'Monitores', monitores: 'Monitores', televisor: 'Televisores', televisores: 'Televisores', celular: 'Celulares', celulares: 'Celulares' }
  return [...new Set(raw.map(c => aliases[c.trim().toLowerCase()] || c))]
}
export const localDay = (value: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value))
export function filterRows(rows: Row[], f: { from: string; to: string; category: string; review: string; outcome: string; search: string }) {
  return rows.filter(s => (!f.from || localDay(s.start) >= f.from) && (!f.to || localDay(s.start) <= f.to)
    && (!f.category || categoriesOf(s).includes(f.category)) && (!f.review || reviewOf(s) === f.review)
    && (!f.outcome || s.outcome === f.outcome)
    && `${s.preview || ''} ${s.subject} ${s.assessment?.summary || ''} ${categoriesOf(s).join(' ')}`.toLowerCase().includes(f.search.toLowerCase()))
}
