import { createHash, createHmac } from 'crypto'

export type EventKind = 'customer' | 'agent' | 'closure' | 'survey' | 'rating' | 'reset' | 'trace'
export interface Event {
  id: string; subject: string; at: string; kind: EventKind; text: string; media: string; cardsText?: string
}
// How the conversation ended — a deterministic heuristic on the last
// commercial message, independent of the quality verdict:
//   SIN_INTERACCION       — the customer never wrote again after the agent's
//     first message (greeting only, no dialogue — nothing to evaluate)
//   CLIENTE_SIN_RESPUESTA — the agent's final message asks a question the
//     customer never answered (mid-flow abandonment)
//   AGENTE_SIN_RESPUESTA  — the customer's final message got no agent reply
//   FINAL_SIN_PREGUNTA    — the agent had the last word without an open question
export type SessionOutcome = 'SIN_INTERACCION' | 'CLIENTE_SIN_RESPUESTA' | 'AGENTE_SIN_RESPUESTA' | 'FINAL_SIN_PREGUNTA'

// How trustworthy the session reconstruction is. Conversations are rebuilt
// from bare messages (the BigQuery view has no session id), so both edges are
// heuristic. Deterministic signals only:
//   startReason  REINICIO (!reset) · TRAS_CIERRE (previous session closed by
//                Yalo) · PRIMER_CONTACTO (first observed contact, well inside
//                the imported window) · TRAS_INACTIVIDAD (split by >=1h gap) ·
//                BORDE_DE_DATOS (starts near the edge of imported data —
//                earlier context may be missing)
//   endReason    CIERRE_YALO · REINICIO (next session starts with reset) ·
//                INACTIVIDAD (split by gap) · SILENCIO (customer never wrote
//                again) · BORDE_DE_DATOS (ends near the data edge — may
//                continue beyond the import window)
//   confidence   ALTA (both edges confirmed) · MEDIA (clean inferred splits) ·
//                BAJA (data-edge truncation risk, or a split barely over the
//                1h threshold that could belong to the same conversation)
export interface SessionReconstruction {
  confidence: 'ALTA' | 'MEDIA' | 'BAJA'
  startReason: 'REINICIO' | 'TRAS_CIERRE' | 'PRIMER_CONTACTO' | 'TRAS_INACTIVIDAD' | 'BORDE_DE_DATOS'
  endReason: 'CIERRE_YALO' | 'REINICIO' | 'INACTIVIDAD' | 'SILENCIO' | 'BORDE_DE_DATOS'
  gapBeforeMin: number | null
  gapAfterMin: number | null
}

export interface ReviewSession {
  id: string; subject: string; start: string; end: string; boundary: string
  incompleteStart: boolean; events: Event[]; inputHash: string; rating: number | null
  outcome: SessionOutcome | null
  reconstruction: SessionReconstruction | null
}
const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' && !(value instanceof Date) ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value
export const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
const normal = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

// Do not change product IDs inside URLs. Personal contact information in prose is removed.
export function redact(text: string) {
  return text.split(/(https?:\/\/\S+|www\.\S+)/g).map((part) =>
    /^(https?:\/\/|www\.)/.test(part)
      ? part.replace(/([?&](?:phone|to|email|user_id)=)[^&\s]+/gi, '$1[oculto]')
      : part.replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[correo oculto]')
        .replace(/(?<!\d)(?:\+?57[ -]?)?3\d{2}[ -]?\d{3}[ -]?\d{4}(?!\d)/g, '[teléfono oculto]')
  ).join('')
}

// RFC-style quoted cells, including embedded separators, quotes and line breaks.
export function csvRows(text: string): string[][] {
  text = text.replace(/^\uFEFF/, '')
  const separator = text.split(/\r?\n/, 1)[0].includes(';') ? ';' : ','
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++ }
      else if (quoted || cell === '') quoted = !quoted
      else cell += c
    } else if (c === separator && !quoted) { row.push(cell); cell = '' }
    else if (c === '\n' && !quoted) { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = '' }
    else cell += c
  }
  if (quoted) throw new Error('CSV incompleto: comillas sin cerrar')
  if (cell || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row) }
  return rows.filter(r => r.some(Boolean))
}

export function parseEvents(text: string, secret: string, stats = { conflicts: 0, skipped: 0, rawInvalid: 0 }): Event[] {
  if (!secret) throw new Error('Falta la clave local de seudonimización')
  const [headers, ...rows] = csvRows(text)
  const required = ['user_id', 'is_user_message', 'event_timestamp', 'message_id', 'message_text', 'message_type']
  if (!headers || required.some(h => !headers.includes(h))) throw new Error('CSV de Yalo: faltan columnas requeridas')
  const unique = new Map<string, Event>()
  rows.forEach((cells, index) => {
    if (cells.length !== headers.length) throw new Error(`Fila ${index + 2}: número de columnas incorrecto`)
    const r = Object.fromEntries(headers.map((h, i) => [h, cells[i]]))
    const date = new Date(r.event_timestamp.replace(' UTC', 'Z').replace(' ', 'T'))
    // The shared view sometimes emits rows with a NULL user, role or
    // timestamp. Without them the message cannot be attributed or placed on
    // the timeline, so the row is skipped and counted instead of aborting
    // the whole import.
    if (!r.user_id || !['true', 'false'].includes((r.is_user_message || '').toLowerCase()) || !Number.isFinite(date.getTime())) { stats.skipped++; return }
    const subject = createHmac('sha256', secret).update(r.user_id).digest('hex').slice(0, 24)
    let body = r.message_text; let cardsText = ''; const customer = r.is_user_message.toLowerCase() === 'true'
    if (r.message_raw) {
      try {
        const raw = JSON.parse(r.message_raw); const interaction = raw.interactive
        const url = interaction?.action?.parameters?.url
        if (interaction?.type === 'carousel' && Array.isArray(interaction.action?.cards)) cardsText = interaction.action.cards.map((c: any, i: number) => typeof c.body?.text === 'string' ? `Opción ${i + 1}: ${c.body.text}` : '').filter(Boolean).join('\n')
        body = [body, interaction?.body?.text, interaction?.action?.parameters?.display_text,
          typeof url === 'string' ? url : null].filter(Boolean).join('\n')
      } catch { stats.rawInvalid++ } // keep the plain text; only the interactive payload is unreadable
    }
    const n = normal(body)
    let kind: EventKind = customer ? 'customer' : 'agent'
    if (!customer && n.includes('hace una hora no hablamos') && n.includes('encuesta')) kind = 'closure'
    else if (!customer && n.includes('que recomiendes este canal') && n.includes('1 al 10')) kind = 'survey'
    else if (n === '!reset' || (!customer && n.includes('ha sido reiniciado'))) kind = 'reset'
    else if (!customer && /^(step |vendidas:|finalizar$|productos step)/.test(n)) kind = 'trace'
    const text = redact(body)
    // A missing message_id gets a content-derived id, so the event stays
    // importable and re-imports of the same row still deduplicate.
    const id = r.message_id ? hash(['yalo', subject, r.message_id]) : hash(['yalo', subject, 'sin-id', date.toISOString(), text])
    const event: Event = { id, subject, at: date.toISOString(), kind, text, media: r.message_type, ...(cardsText ? { cardsText: redact(cardsText) } : {}) }
    const previous = unique.get(event.id)
    if (!previous || hash(previous) === hash(event)) { unique.set(event.id, event); return }
    // The shared view occasionally repeats a message_id. An ingestion retry
    // (identical content, timestamps almost equal) collapses to the earliest
    // copy; genuinely different content is kept as a separate event under a
    // content-derived id. The earliest copy keeps the plain id regardless of
    // input order, so re-imports of overlapping windows stay idempotent.
    if (hash({ ...previous, at: '' }) === hash({ ...event, at: '' }) && Math.abs(Date.parse(previous.at) - Date.parse(event.at)) <= 300000) {
      if (event.at < previous.at) unique.set(event.id, event)
      return
    }
    stats.conflicts++
    const derived = (e: Event): Event => ({ ...e, id: hash(['yalo', e.subject, r.message_id, e.at, e.text]) })
    const incoming = Date.parse(event.at) < Date.parse(previous.at) || (event.at === previous.at && hash(event) < hash(previous))
    const moved = derived(incoming ? previous : event)
    unique.set(moved.id, moved)
    if (incoming) unique.set(event.id, event)
  })
  return [...unique.values()]
}

// Which conversations are worth an automatic evaluation. Two model calls
// per conversation cost real money, and a greeting answered by a template
// produces "EVIDENCIA_INSUFICIENTE" on every criterion — an expensive way
// to learn nothing. Four independent reasons to skip one:
//   SIN_DIALOGO           the customer never wrote after the agent's first
//                         message: there is no exchange to judge
//   BORDE_DE_DATOS        the conversation may continue past the import
//                         cutoff; evaluate() refuses it anyway
//   CONVERSACION_CORTA    fewer than `messages` customer/agent turns —
//                         closure, survey, reset and trace events do not
//                         count, so template noise cannot inflate this
//   SIN_APORTE_DEL_CLIENTE fewer than `customerTurns` customer messages —
//                         in practice an agent-initiated flow the customer
//                         only acknowledged; nothing was asked, understood
//                         or compared (a customer opener with no reply is
//                         already SIN_DIALOGO)
// Manual evaluation of a single conversation stays available for all of them.
export type Candidacy = { eligible: boolean; reason: 'APTA' | 'SIN_DIALOGO' | 'BORDE_DE_DATOS' | 'CONVERSACION_CORTA' | 'SIN_APORTE_DEL_CLIENTE' }
export function evaluationCandidacy(session: ReviewSession, limits = { messages: 4, customerTurns: 2 }): Candidacy {
  if (session.outcome === 'SIN_INTERACCION') return { eligible: false, reason: 'SIN_DIALOGO' }
  if (session.reconstruction?.endReason === 'BORDE_DE_DATOS') return { eligible: false, reason: 'BORDE_DE_DATOS' }
  const commercial = session.events.filter(e => e.kind === 'customer' || e.kind === 'agent')
  if (commercial.length < limits.messages) return { eligible: false, reason: 'CONVERSACION_CORTA' }
  if (commercial.filter(e => e.kind === 'customer').length < limits.customerTurns) return { eligible: false, reason: 'SIN_APORTE_DEL_CLIENTE' }
  return { eligible: true, reason: 'APTA' }
}

export function sessionsFromEvents(events: Event[]): ReviewSession[] {
  const groups = new Map<string, Event[]>()
  for (const e of events) groups.set(e.subject, [...(groups.get(e.subject) || []), e])
  const sessions: ReviewSession[] = []
  for (const [subject, group] of groups) {
    group.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))
    let current: ReviewSession | undefined; let pendingSurvey = false
    const start = (e: Event) => {
      current = { id: hash(['session-v1', subject, e.id]), subject, start: e.at, end: e.at,
        boundary: 'ABIERTA', incompleteStart: true, events: [], inputHash: '', rating: null, outcome: null, reconstruction: null }
      sessions.push(current); pendingSurvey = false
    }
    for (const original of group) {
      const e = { ...original }
      const gap = current ? new Date(e.at).getTime() - new Date(current.end).getTime() : 0
      if (current && pendingSurvey && e.kind === 'customer' && /^(?:[1-9]|10)$/.test(e.text.trim()) && gap <= 86400000) {
        e.kind = 'rating'; current.rating = Number(e.text.trim()); pendingSurvey = false
      } else if (e.kind === 'customer' || e.kind === 'reset') {
        pendingSurvey = false
        if (current && (current.boundary === 'CIERRE_YALO' || e.kind === 'reset' || gap >= 3600000)) {
          if (current.boundary !== 'CIERRE_YALO') current.boundary = e.kind === 'reset' ? 'REINICIO' : 'INACTIVIDAD_INFERIDA'
          current = undefined
        }
      }
      if (!current) start(e)
      if (e.kind === 'reset') current!.incompleteStart = false
      if (e.kind === 'closure') { current!.boundary = 'CIERRE_YALO'; pendingSurvey = false }
      if (e.kind === 'survey' && current!.boundary === 'CIERRE_YALO') pendingSurvey = true
      current!.events.push(e); current!.end = e.at
    }
  }
  for (const s of sessions) {
    s.inputHash = hash({ version: 1, events: s.events, boundary: s.boundary })
    const commercial = s.events.filter(e => e.kind === 'customer' || e.kind === 'agent')
    const last = commercial.at(-1)
    const firstAgent = commercial.findIndex(e => e.kind === 'agent')
    const dialogue = firstAgent >= 0 && commercial.slice(firstAgent + 1).some(e => e.kind === 'customer')
    s.outcome = !last ? null : last.kind === 'customer' ? 'AGENTE_SIN_RESPUESTA'
      : !dialogue ? 'SIN_INTERACCION'
      : /[?¿]/.test(last.text) ? 'CLIENTE_SIN_RESPUESTA' : 'FINAL_SIN_PREGUNTA'
  }
  // Reconstruction confidence: adjacency within the same subject (including
  // sessions filtered out below) plus distance to the edges of imported data.
  const t = (iso: string) => new Date(iso).getTime()
  const times = events.map(e => t(e.at))
  const minAll = Math.min(...times); const maxAll = Math.max(...times)
  const bySubject = new Map<string, ReviewSession[]>()
  for (const s of sessions) bySubject.set(s.subject, [...(bySubject.get(s.subject) || []), s])
  for (const list of bySubject.values()) list.forEach((s, i) => {
    const prev = list[i - 1]; const next = list[i + 1]
    const gapBeforeMin = prev ? Math.round((t(s.start) - t(prev.end)) / 60000) : null
    const gapAfterMin = next ? Math.round((t(next.start) - t(s.end)) / 60000) : null
    const startReason = s.events[0]?.kind === 'reset' ? 'REINICIO'
      : !prev ? (t(s.start) - minAll < 86400000 ? 'BORDE_DE_DATOS' : 'PRIMER_CONTACTO')
      : prev.boundary === 'CIERRE_YALO' ? 'TRAS_CIERRE' : 'TRAS_INACTIVIDAD'
    // One hour of observed silence after the session end already proves the
    // session is over (any later message within the hour would have extended
    // it), so only ends closer than 1h to the data edge can still continue.
    const endReason = s.boundary === 'CIERRE_YALO' ? 'CIERRE_YALO'
      : next ? (next.events[0]?.kind === 'reset' ? 'REINICIO' : 'INACTIVIDAD')
      : maxAll - t(s.end) < 3600000 ? 'BORDE_DE_DATOS' : 'SILENCIO'
    const risky = startReason === 'BORDE_DE_DATOS' || endReason === 'BORDE_DE_DATOS'
      || (startReason === 'TRAS_INACTIVIDAD' && gapBeforeMin !== null && gapBeforeMin < 90)
      || (endReason === 'INACTIVIDAD' && gapAfterMin !== null && gapAfterMin < 90)
    const confident = ['REINICIO', 'TRAS_CIERRE', 'PRIMER_CONTACTO'].includes(startReason)
      && ['CIERRE_YALO', 'REINICIO', 'SILENCIO'].includes(endReason)
    s.reconstruction = { confidence: risky ? 'BAJA' : confident ? 'ALTA' : 'MEDIA', startReason, endReason, gapBeforeMin, gapAfterMin }
  })
  return sessions.filter(s => s.events.some(e => e.kind === 'customer' || e.kind === 'agent')).sort((a, b) => b.start.localeCompare(a.start))
}
