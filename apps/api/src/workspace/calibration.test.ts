import { describe, it, expect } from 'vitest'
import { calibrationRows, disagreementSummary, openDisagreements, rubricComparison } from './calibration'

const criterion = (name: string, status: string, severity: string | null = null) => ({ name, status, severity, reason: 'r', evidenceIds: [] })
const assessment = (id: string, createdAt: string, rubricVersion: string, criteria: any[], extra: any = {}) =>
  ({ id, sessionId: 's1', createdAt, payload: { rubricVersion, verdict: { criteria, score: criteria.filter(c => c.status === 'CUMPLE').length, label: criteria.some(c => c.status === 'INCUMPLE') ? 'CON_HALLAZGOS' : 'SIN_HALLAZGOS_OBSERVADOS' }, ...extra } })

describe('rubric comparison', () => {
  it('compares against the last different rubric, not the last run', () => {
    const rows = [
      assessment('a', '2026-09-01T10:00:00Z', 'pilot-3', [criterion('comprension', 'CUMPLE')]),
      assessment('b', '2026-09-02T10:00:00Z', 'pilot-3', [criterion('comprension', 'CUMPLE')]),
      assessment('c', '2026-09-03T10:00:00Z', 'pilot-4', [criterion('comprension', 'INCUMPLE', 'WARNING')]),
    ]
    const c = rubricComparison(rows)!
    expect(c).toMatchObject({ from: 'pilot-3', to: 'pilot-4', scoreFrom: 1, scoreTo: 0 })
    expect(c.changes).toEqual([{ name: 'comprension', from: 'CUMPLE', to: 'INCUMPLE', severityFrom: null, severityTo: 'WARNING' }])
    // Re-running the same rubric is not a rubric change.
    expect(rubricComparison(rows.slice(0, 2))).toBeNull()
    expect(rubricComparison([])).toBeNull()
  })
  it('reports a severity change and a criterion the old rubric lacked', () => {
    const c = rubricComparison([
      assessment('a', '2026-09-01T10:00:00Z', 'pilot-3', [criterion('adecuacion', 'INCUMPLE', 'WARNING')]),
      assessment('b', '2026-09-03T10:00:00Z', 'pilot-4', [criterion('adecuacion', 'INCUMPLE', 'CRITICAL'), criterion('verificacion', 'CUMPLE')]),
    ])!
    expect(c.changes).toEqual([
      { name: 'adecuacion', from: 'INCUMPLE', to: 'INCUMPLE', severityFrom: 'WARNING', severityTo: 'CRITICAL' },
      { name: 'verificacion', from: null, to: 'CUMPLE', severityFrom: null, severityTo: null },
    ])
  })
})

const decision = (criterion: string, d: string, extra: any = {}) => [{ id: 'd1', action: 'decision', criterion, decision: d, note: 'porque sí', userId: 'u', at: '2026-09-04T10:00:00Z', ...extra }]
const humanFinding = (criterion: string, note: string) => [{ id: 'h1', action: 'add', kind: 'finding', criterion, note, severity: 'WARNING', evidenceIds: ['e1'], userId: 'u', at: '2026-09-04T10:00:00Z' }]

describe('reviewer assertions the model violates', () => {
  const judged = (status: string, severity: string | null = null, humanReview: any[] = []) =>
    assessment('a', '2026-09-01T10:00:00Z', 'pilot-5', [criterion('contexto', status, severity)], { humanReview })

  it('catches a finding the model misses and one it invented', () => {
    // Written by hand, model says the criterion is fine.
    const [missing] = openDisagreements([judged('CUMPLE', null, humanFinding('contexto', 'Leyó «no quiero aifon» al pie de la letra'))])
    expect(missing).toMatchObject({ source: 'add', expect: 'INCUMPLE', modelStatus: 'CUMPLE' })
    // Dismissed by the reviewer, model still reports it: a false positive.
    const [invented] = openDisagreements([judged('INCUMPLE', 'WARNING', decision('contexto', 'dismiss'))])
    expect(invented).toMatchObject({ source: 'dismiss', expect: 'NO_INCUMPLE', modelStatus: 'INCUMPLE' })
    // Agreement in either direction is not a disagreement.
    expect(openDisagreements([judged('INCUMPLE', 'WARNING', humanFinding('contexto', 'x'))])).toEqual([])
    expect(openDisagreements([judged('CUMPLE', null, decision('contexto', 'dismiss'))])).toEqual([])
  })
  it('treats a confirmed finding that later disappeared as a regression', () => {
    const confirmed = assessment('a', '2026-09-01T10:00:00Z', 'pilot-4', [criterion('contexto', 'INCUMPLE', 'WARNING')], { humanReview: decision('contexto', 'confirm') })
    const gone = assessment('b', '2026-09-05T10:00:00Z', 'pilot-5', [criterion('contexto', 'CUMPLE')])
    expect(openDisagreements([confirmed, gone])[0]).toMatchObject({ source: 'confirm', modelStatus: 'CUMPLE', rubricVersion: 'pilot-4' })
    // Still reported: the confirmation holds.
    expect(openDisagreements([confirmed])).toEqual([])
  })
  it('follows a correction to the criterion and severity the reviewer chose', () => {
    const corrected = decision('adecuacion', 'correct', { correctedCriterion: 'contexto', severity: 'CRITICAL' })
    // Model reports the corrected criterion, but not at the chosen severity.
    expect(openDisagreements([judged('INCUMPLE', 'WARNING', corrected)])[0]).toMatchObject({ source: 'correct', criterion: 'contexto', severity: 'CRITICAL', modelSeverity: 'WARNING' })
    expect(openDisagreements([judged('INCUMPLE', 'CRITICAL', corrected)])).toEqual([])
    // A deferral asserts nothing yet.
    expect(openDisagreements([judged('INCUMPLE', 'WARNING', decision('contexto', 'defer'))])).toEqual([])
  })
  it('counts the same correction across conversations so a pattern outweighs an anecdote', () => {
    const open = openDisagreements([judged('INCUMPLE', 'WARNING', decision('contexto', 'dismiss'))])
    const summary = disagreementSummary([{ sessionId: 's1', open }, { sessionId: 's2', open }, { sessionId: 's3', open: openDisagreements([judged('CUMPLE', null, humanFinding('contexto', 'otra cosa'))]) }])
    expect(summary[0]).toMatchObject({ criterion: 'contexto', source: 'dismiss', count: 2 })
    expect(summary[0].sessions).toEqual(['s1', 's2'])
    expect(summary[1]).toMatchObject({ source: 'add', count: 1 })
  })
})

describe('calibration rows', () => {
  const session = { id: 's1', subject: 'abc', start: '2026-09-01T10:00:00Z', outcome: 'FINAL_SIN_PREGUNTA' }
  const before = assessment('a', '2026-09-01T10:00:00Z', 'pilot-3', [criterion('comprension', 'CUMPLE')])
  const after = assessment('b', '2026-09-03T10:00:00Z', 'pilot-4', [criterion('comprension', 'INCUMPLE', 'WARNING')])
  const flag = { id: 'f1', sessionId: 's1', kind: 'FALTA_HALLAZGO', payload: { note: 'No detectó el requisito descartado', resolved: null } }

  it('ranks a violated reviewer assertion above every other reason to look', () => {
    const missed = assessment('b', '2026-09-03T10:00:00Z', 'pilot-4', [criterion('comprension', 'CUMPLE')], { humanReview: humanFinding('comprension', 'Descartó iPhone sin confirmar') })
    const rows = calibrationRows([session], [before, missed] as any, [flag])
    expect(rows[0].bucket).toBe('CONTRADICE_AL_REVISOR')
    expect(rows[0].missed[0].modelStatus).toBe('CUMPLE')
  })
  it('puts a change that contradicts an earlier human review first', () => {
    const reviewed = { ...before, payload: { ...before.payload, humanReview: [{ id: 'h', action: 'complete', userId: 'u', at: '2026-09-02T10:00:00Z' }] } }
    const rows = calibrationRows([session, { ...session, id: 's2', start: '2026-09-01T09:00:00Z' }],
      [reviewed, after, { ...before, id: 'c', sessionId: 's2' }, { ...after, id: 'd', sessionId: 's2' }] as any, [])
    expect(rows.map(r => [r.sessionId, r.bucket])).toEqual([['s1', 'CONTRADICE_REVISION'], ['s2', 'CAMBIO']])
  })
  it('separates marks the change moved from marks it did not', () => {
    expect(calibrationRows([session], [before, after] as any, [flag])[0].bucket).toBe('MARCADA_Y_CAMBIO')
    // Same rubric twice: the mark is still open and nothing moved.
    expect(calibrationRows([session], [before] as any, [flag])[0]).toMatchObject({ bucket: 'MARCADA_SIN_CAMBIO', comparison: null })
    // A resolved mark on an unchanged conversation is no longer listed.
    expect(calibrationRows([session], [before] as any, [{ ...flag, payload: { ...flag.payload, resolved: { at: 'x' } } }])).toEqual([])
  })
  it('ignores conversations with nothing to look at', () => {
    expect(calibrationRows([session], [before] as any, [])).toEqual([])
  })
})
