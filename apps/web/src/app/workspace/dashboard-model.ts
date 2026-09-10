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
  SIN_INTERACCION: 'Sin diálogo: el cliente no respondió al saludo',
  CLIENTE_SIN_RESPUESTA: 'Cliente no respondió a la última pregunta',
  AGENTE_SIN_RESPUESTA: 'Agente no respondió al último mensaje',
  FINAL_SIN_PREGUNTA: 'Terminó sin pregunta pendiente',
}
// Session reconstruction confidence (conversations are rebuilt from bare
// messages — no session id in the shared BigQuery view).
export const reconstructionNames: Record<string, string> = { ALTA: 'Confiable', MEDIA: 'Inferida', BAJA: 'Incierta' }
export function reconstructionNotes(r: Row | null | undefined): string[] {
  if (!r) return []
  const starts: Record<string, string> = {
    REINICIO: 'Inicio confirmado por reinicio',
    TRAS_CIERRE: 'Inicio tras el cierre Yalo de la conversación anterior',
    PRIMER_CONTACTO: 'Primer contacto observado del cliente',
    TRAS_INACTIVIDAD: `Separada de la conversación anterior por ${r.gapBeforeMin} min de inactividad`,
    BORDE_DE_DATOS: 'Comienza cerca del inicio de los datos importados: puede faltar contexto anterior',
  }
  const ends: Record<string, string> = {
    CIERRE_YALO: 'Final confirmado por cierre Yalo',
    REINICIO: 'Final por reinicio posterior',
    INACTIVIDAD: `Separada de la siguiente por ${r.gapAfterMin} min de inactividad`,
    SILENCIO: 'El cliente no volvió a escribir',
    BORDE_DE_DATOS: 'Termina cerca del final de los datos importados: puede continuar después',
  }
  const notes = [starts[r.startReason], ends[r.endReason]]
  if (r.startReason === 'TRAS_INACTIVIDAD' && r.gapBeforeMin < 90) notes.push('La separación inicial está justo sobre el umbral de 1 h: podría ser la misma conversación que la anterior')
  if (r.endReason === 'INACTIVIDAD' && r.gapAfterMin < 90) notes.push('La separación final está justo sobre el umbral de 1 h: podría continuar en la siguiente')
  return notes.filter(Boolean)
}
export function categoriesOf(s: Row): string[] {
  const raw: string[] = s.assessment?.categories?.length ? s.assessment.categories : [s.assessment?.category || 'Sin categoría evaluada']
  const aliases: Record<string, string> = { computador: 'Computadores', computadores: 'Computadores', portátil: 'Computadores', 'portátil gamer': 'Computadores', portátiles: 'Computadores', laptop: 'Computadores', laptops: 'Computadores', impresora: 'Impresoras', impresoras: 'Impresoras', monitor: 'Monitores', monitores: 'Monitores', televisor: 'Televisores', televisores: 'Televisores', celular: 'Celulares', celulares: 'Celulares' }
  return [...new Set(raw.map(c => aliases[c.trim().toLowerCase()] || c))]
}
export const localDay = (value: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value))
export function filterRows(rows: Row[], f: { from: string; to: string; category: string; review: string; outcome: string; rec: string; search: string }) {
  return rows.filter(s => (!f.from || localDay(s.start) >= f.from) && (!f.to || localDay(s.start) <= f.to)
    && (!f.category || categoriesOf(s).includes(f.category)) && (!f.review || reviewOf(s) === f.review)
    && (!f.outcome || s.outcome === f.outcome) && (!f.rec || s.reconstruction?.confidence === f.rec)
    && `${s.preview || ''} ${s.subject} ${s.assessment?.summary || ''} ${categoriesOf(s).join(' ')}`.toLowerCase().includes(f.search.toLowerCase()))
}
// Short outcome labels for cards and chips; the long sentences in
// outcomeNames stay for the detail view where there is room to explain.
export const outcomeShort: Record<string, string> = {
  SIN_INTERACCION: 'Sin diálogo',
  CLIENTE_SIN_RESPUESTA: 'Cliente no respondió',
  AGENTE_SIN_RESPUESTA: 'Agente no respondió',
  FINAL_SIN_PREGUNTA: 'Cerrada sin pregunta',
}
// Colour carries meaning, not decoration: the agent leaving a customer
// hanging is a service failure, a customer dropping out mid-flow is a lost
// opportunity, a clean close is neither.
export const outcomeTone: Record<string, string> = {
  SIN_INTERACCION: 'muted',
  CLIENTE_SIN_RESPUESTA: 'warning',
  AGENTE_SIN_RESPUESTA: 'danger',
  FINAL_SIN_PREGUNTA: 'good',
}
// Only what varies between the cards of one section. The verdict group is
// the section heading, and "Por revisar" is the default state of every
// card, so neither is repeated here; the message text never appears.
export function cardChips(s: Row): { label: string; tone: string }[] {
  const chips: { label: string; tone: string }[] = []
  if (s.outcome) chips.push({ label: outcomeShort[s.outcome], tone: outcomeTone[s.outcome] })
  const criteria: Row[] = s.assessment && !s.assessment.stale ? s.assessment.criteria || [] : []
  const failures = criteria.filter(c => c.status === 'INCUMPLE')
  if (failures.length) chips.push({ label: `${failures.length} ${failures.length === 1 ? 'hallazgo' : 'hallazgos'}`, tone: failures.some(c => c.severity === 'CRITICAL') ? 'danger' : 'warning' })
  const category = criteria.length ? categoriesOf(s)[0] : ''
  if (category && category !== 'Sin categoría evaluada') chips.push({ label: category, tone: 'plain' })
  const review = reviewOf(s)
  if (review !== 'unavailable' && review !== 'pending') chips.push({ label: reviewNames[review], tone: 'human-status ' + review })
  return chips
}
// The queue as sections: one per verdict group, in triage order, so the
// heading carries the state and the cards only carry what differs.
export function sectionsOf(rows: Row[]) {
  return groups.map(g => ({ ...g, rows: rows.filter(s => groupOf(s) === g.id) })).filter(g => g.rows.length)
}
