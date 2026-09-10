import { describe, it, expect } from 'vitest'
import { calibrationRows, humanContradictions, rubricComparison } from './calibration'

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

const humanFinding = (criterion: string, note: string) => [{ id: 'h1', action: 'add', kind: 'finding', criterion, note, severity: 'WARNING', evidenceIds: ['e1'], userId: 'u', at: '2026-09-04T10:00:00Z' }]

describe('human findings the model misses', () => {
  it('reports a hand-written finding the newest evaluation still calls fine', () => {
    const withFinding = assessment('a', '2026-09-01T10:00:00Z', 'pilot-4', [criterion('contexto', 'CUMPLE')], { humanReview: humanFinding('contexto', 'Leyó «no quiero aifon» al pie de la letra') })
    const [missed] = humanContradictions([withFinding])
    expect(missed).toMatchObject({ criterion: 'contexto', modelStatus: 'CUMPLE', modelVersion: 'pilot-4', rubricVersion: 'pilot-4' })
    expect(missed.note).toContain('aifon')
  })
  it('keeps ground truth written under an older rubric and clears it once the model agrees', () => {
    const old = assessment('a', '2026-09-01T10:00:00Z', 'pilot-4', [criterion('contexto', 'CUMPLE')], { humanReview: humanFinding('contexto', 'Malinterpretó la respuesta') })
    // The finding lives on the older assessment; the newer rubric now flags it.
    const fixed = assessment('b', '2026-09-05T10:00:00Z', 'pilot-5', [criterion('contexto', 'INCUMPLE', 'WARNING')])
    expect(humanContradictions([old, fixed])).toEqual([])
    // Still fine in the newest evaluation: the contradiction survives the rubric change.
    const unfixed = assessment('b', '2026-09-05T10:00:00Z', 'pilot-5', [criterion('contexto', 'CUMPLE')])
    expect(humanContradictions([old, unfixed])).toHaveLength(1)
  })
  it('ignores confirmations of the model and observations that are not findings', () => {
    const notes = [{ id: 'h2', action: 'add', kind: 'positive', criterion: 'contexto', note: 'Buena respuesta', evidenceIds: ['e1'], userId: 'u', at: '2026-09-04T10:00:00Z' }]
    expect(humanContradictions([assessment('a', '2026-09-01T10:00:00Z', 'pilot-4', [criterion('contexto', 'CUMPLE')], { humanReview: notes })])).toEqual([])
    // A hand-written finding on a criterion the model already flagged is agreement, not a gap.
    expect(humanContradictions([assessment('a', '2026-09-01T10:00:00Z', 'pilot-4', [criterion('contexto', 'INCUMPLE', 'WARNING')], { humanReview: humanFinding('contexto', 'x') })])).toEqual([])
  })
})

describe('calibration rows', () => {
  const session = { id: 's1', subject: 'abc', start: '2026-09-01T10:00:00Z', outcome: 'FINAL_SIN_PREGUNTA' }
  const before = assessment('a', '2026-09-01T10:00:00Z', 'pilot-3', [criterion('comprension', 'CUMPLE')])
  const after = assessment('b', '2026-09-03T10:00:00Z', 'pilot-4', [criterion('comprension', 'INCUMPLE', 'WARNING')])
  const flag = { id: 'f1', sessionId: 's1', kind: 'FALTA_HALLAZGO', payload: { note: 'No detectó el requisito descartado', resolved: null } }

  it('ranks a missed human finding above every other reason to look', () => {
    const missed = assessment('b', '2026-09-03T10:00:00Z', 'pilot-4', [criterion('comprension', 'CUMPLE')], { humanReview: humanFinding('comprension', 'Descartó iPhone sin confirmar') })
    const rows = calibrationRows([session], [before, missed] as any, [flag])
    expect(rows[0].bucket).toBe('CONTRADICE_HALLAZGO_HUMANO')
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
