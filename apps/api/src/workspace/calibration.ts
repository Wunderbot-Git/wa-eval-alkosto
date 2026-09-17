import { reviewState } from './human-review'

// Calibration support for the pilot phase: what a rubric change actually did
// to the verdicts. Every re-evaluation appends a new assessment and keeps the
// old ones, so the comparison is a pure read over that history.
export interface AssessmentLike { id: string; createdAt: string | Date; payload: any }
export interface FlagLike { id: string; sessionId: string; kind: string; payload: any }

const time = (a: AssessmentLike) => new Date(a.createdAt).getTime()
const version = (a: AssessmentLike) => a.payload?.rubricVersion ?? null
const criteriaOf = (a: AssessmentLike): any[] => a.payload?.verdict?.criteria || []

// The newest assessment against the newest one produced under a different
// rubric version. Re-running the same rubric is not a rubric change, so it is
// not reported here.
export function rubricComparison(assessments: AssessmentLike[]) {
  const sorted = [...assessments].sort((a, b) => time(b) - time(a))
  const current = sorted[0]
  const previous = current && sorted.find(a => version(a) !== version(current))
  if (!current || !previous) return null
  const before = new Map(criteriaOf(previous).map(c => [c.name, c]))
  const changes = criteriaOf(current)
    .filter(c => before.has(c.name))
    .map(c => ({ name: c.name, from: before.get(c.name).status, to: c.status, severityFrom: before.get(c.name).severity ?? null, severityTo: c.severity ?? null }))
    .filter(c => c.from !== c.to || c.severityFrom !== c.severityTo)
  // A criterion the older rubric did not have at all is a change too.
  const added = criteriaOf(current).filter(c => !before.has(c.name)).map(c => ({ name: c.name, from: null, to: c.status, severityFrom: null, severityTo: c.severity ?? null }))
  const state = reviewState(previous.payload?.humanReview || [])
  return {
    from: version(previous), to: version(current),
    scoreFrom: previous.payload?.verdict?.score ?? null, scoreTo: current.payload?.verdict?.score ?? null,
    labelFrom: previous.payload?.verdict?.label ?? null, labelTo: current.payload?.verdict?.label ?? null,
    changes: [...changes, ...added],
    // Whether a person had already signed off on the older verdict. If they
    // had and the verdict moved, the change contradicts reviewed ground
    // truth — the case to look at first after every rubric change.
    reviewedBefore: state.completed || Object.keys(state.decisions).length > 0 || (previous.payload?.reviews || []).length > 0,
  }
}

// Every review action is an assertion about one criterion — that is what
// makes the review usable as calibration data instead of just an audit
// trail. Collected across all assessments of the conversation, because a
// rubric change replaces the assessment while the assertion still stands:
//   confirm  the finding is real          -> expect INCUMPLE
//   add      the model missed one         -> expect INCUMPLE
//   correct  real, but wrongly labelled   -> expect INCUMPLE on the corrected
//                                            criterion with the chosen severity
//   dismiss  the model invented it        -> expect anything but INCUMPLE
// A deferral asserts nothing yet and is left out.
export type Expectation = {
  id: string; criterion: string; expect: 'INCUMPLE' | 'NO_INCUMPLE'
  severity: string | null; note: string; source: 'confirm' | 'add' | 'correct' | 'dismiss'
  at: string; rubricVersion: string | null
}
export function reviewerExpectations(assessments: AssessmentLike[]): Expectation[] {
  return assessments.flatMap(a => {
    const state = reviewState(a.payload?.humanReview || [])
    const base = (h: any) => ({ id: h.id, note: h.note || '', at: h.at, rubricVersion: version(a) })
    const decisions: Expectation[] = Object.values(state.decisions).flatMap((d: any): Expectation[] =>
      d.decision === 'confirm' ? [{ ...base(d), criterion: d.criterion, expect: 'INCUMPLE' as const, severity: null, source: 'confirm' as const }]
      : d.decision === 'dismiss' ? [{ ...base(d), criterion: d.criterion, expect: 'NO_INCUMPLE' as const, severity: null, source: 'dismiss' as const }]
      : d.decision === 'correct' ? [{ ...base(d), criterion: d.correctedCriterion || d.criterion, expect: 'INCUMPLE' as const, severity: d.severity ?? null, source: 'correct' as const }]
      : [])
    const added: Expectation[] = state.additions
      .filter((h: any) => h.kind === 'finding')
      .map((h: any) => ({ ...base(h), criterion: h.criterion, expect: 'INCUMPLE' as const, severity: h.severity ?? null, source: 'add' as const }))
    return [...decisions, ...added]
  })
}

// The assertions the newest verdict still violates — in both directions, and
// that symmetry is the point: a finding the model misses and one it invented
// are equally wrong, and a reviewer who confirmed a finding that later
// disappeared has caught a regression. Each carries the reviewer's own words
// next to the reason the model gives instead.
export function openDisagreements(assessments: AssessmentLike[]) {
  const current = [...assessments].sort((a, b) => time(b) - time(a))[0]
  if (!current) return []
  const byName = new Map(criteriaOf(current).map(c => [c.name, c]))
  return reviewerExpectations(assessments)
    .filter(e => {
      const c = byName.get(e.criterion)
      if (e.expect === 'NO_INCUMPLE') return c?.status === 'INCUMPLE'
      if (c?.status !== 'INCUMPLE') return true
      return !!e.severity && c.severity !== e.severity
    })
    .map(e => ({ ...e, modelStatus: byName.get(e.criterion)?.status ?? null, modelSeverity: byName.get(e.criterion)?.severity ?? null,
                 modelReason: byName.get(e.criterion)?.reason ?? null, modelVersion: version(current) }))
}

// The same disagreements across the whole corpus, grouped by criterion and
// kind. One reviewer dismissing one finding is an anecdote; twelve
// dismissals of the same criterion is a rubric defect, and only the count
// tells them apart. The notes come along because they say why.
export function disagreementSummary(rows: { sessionId: string; open: ReturnType<typeof openDisagreements> }[]) {
  const groups = new Map<string, { criterion: string; source: string; count: number; sessions: string[]; notes: string[] }>()
  for (const row of rows) for (const d of row.open) {
    const key = `${d.criterion}|${d.source}`
    const g = groups.get(key) || { criterion: d.criterion, source: d.source, count: 0, sessions: [], notes: [] }
    g.count++
    if (!g.sessions.includes(row.sessionId)) g.sessions.push(row.sessionId)
    if (d.note && g.notes.length < 5) g.notes.push(d.note)
    groups.set(key, g)
  }
  return [...groups.values()].sort((a, b) => b.count - a.count)
}

// One row per conversation that either carries a calibration flag or changed
// between rubric versions. Buckets are ordered by how much they deserve a
// second look, never by whether the change looks like an improvement: only a
// person can say that, and saying it here would fake ground truth.
//   CONTRADICE_AL_REVISOR  the newest verdict violates what a reviewer asserted
//   CONTRADICE_REVISION  a person had reviewed the old verdict, the new one differs
//   MARCADA_Y_CAMBIO     an open flag, and the verdict moved since
//   MARCADA_SIN_CAMBIO   an open flag the change did not affect
//   CAMBIO               changed without a flag or an earlier review
export function calibrationRows(sessions: any[], assessments: AssessmentLike[] & { sessionId?: string }[], flags: FlagLike[]) {
  const rows = sessions.map(session => {
    const own = assessments.filter((a: any) => a.sessionId === session.id)
    const comparison = rubricComparison(own)
    const open = flags.filter(f => f.sessionId === session.id && !f.payload?.resolved)
    const moved = !!comparison && (comparison.changes.length > 0 || comparison.scoreFrom !== comparison.scoreTo)
    const missed = openDisagreements(own)
    const bucket = missed.length ? 'CONTRADICE_AL_REVISOR'
      : comparison?.reviewedBefore && moved ? 'CONTRADICE_REVISION'
      : open.length && moved ? 'MARCADA_Y_CAMBIO'
      : open.length ? 'MARCADA_SIN_CAMBIO'
      : moved ? 'CAMBIO' : null
    return bucket ? { sessionId: session.id, subject: session.subject, start: session.start, outcome: session.outcome, bucket, comparison, flags: open, missed } : null
  }).filter(Boolean) as any[]
  const order = ['CONTRADICE_AL_REVISOR', 'CONTRADICE_REVISION', 'MARCADA_Y_CAMBIO', 'MARCADA_SIN_CAMBIO', 'CAMBIO']
  return rows.sort((a, b) => order.indexOf(a.bucket) - order.indexOf(b.bucket) || b.start.localeCompare(a.start))
}

export const FLAG_KINDS = ['FALTA_HALLAZGO', 'HALLAZGO_FALSO', 'SEVERIDAD_INCORRECTA', 'CASO_DE_REFERENCIA']
