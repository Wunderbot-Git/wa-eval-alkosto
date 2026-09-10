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

// Findings a reviewer wrote by hand, from every assessment of the session:
// a rubric change replaces the assessment, so the older ones are where the
// earlier ground truth lives.
export function humanFindings(assessments: AssessmentLike[]) {
  return assessments.flatMap(a => reviewState(a.payload?.humanReview || []).additions
    .filter((h: any) => h.kind === 'finding')
    .map((h: any) => ({ id: h.id, criterion: h.criterion, note: h.note, severity: h.severity, evidenceIds: h.evidenceIds || [], at: h.at, rubricVersion: version(a) })))
}

// The sharpest calibration signal there is, and it costs the reviewer no
// extra work: a person wrote a finding on a criterion, and the newest
// evaluation still reports that criterion as fine. Flags say "look again";
// this says exactly what the model is still missing, in the reviewer's own
// words, next to the reason the model gave instead.
export function humanContradictions(assessments: AssessmentLike[]) {
  const current = [...assessments].sort((a, b) => time(b) - time(a))[0]
  if (!current) return []
  const byName = new Map(criteriaOf(current).map(c => [c.name, c]))
  return humanFindings(assessments)
    .filter(h => byName.get(h.criterion)?.status !== 'INCUMPLE')
    .map(h => ({ ...h, modelStatus: byName.get(h.criterion)?.status ?? null, modelReason: byName.get(h.criterion)?.reason ?? null, modelVersion: version(current) }))
}

// One row per conversation that either carries a calibration flag or changed
// between rubric versions. Buckets are ordered by how much they deserve a
// second look, never by whether the change looks like an improvement: only a
// person can say that, and saying it here would fake ground truth.
//   CONTRADICE_HALLAZGO_HUMANO  a reviewer's own finding the model still misses
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
    const missed = humanContradictions(own)
    const bucket = missed.length ? 'CONTRADICE_HALLAZGO_HUMANO'
      : comparison?.reviewedBefore && moved ? 'CONTRADICE_REVISION'
      : open.length && moved ? 'MARCADA_Y_CAMBIO'
      : open.length ? 'MARCADA_SIN_CAMBIO'
      : moved ? 'CAMBIO' : null
    return bucket ? { sessionId: session.id, subject: session.subject, start: session.start, outcome: session.outcome, bucket, comparison, flags: open, missed } : null
  }).filter(Boolean) as any[]
  const order = ['CONTRADICE_HALLAZGO_HUMANO', 'CONTRADICE_REVISION', 'MARCADA_Y_CAMBIO', 'MARCADA_SIN_CAMBIO', 'CAMBIO']
  return rows.sort((a, b) => order.indexOf(a.bucket) - order.indexOf(b.bucket) || b.start.localeCompare(a.start))
}

export const FLAG_KINDS = ['FALTA_HALLAZGO', 'HALLAZGO_FALSO', 'SEVERIDAD_INCORRECTA', 'CASO_DE_REFERENCIA']
