import { describe, it, expect } from 'vitest'
import { calibrationRows, rubricComparison } from './calibration'

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

describe('calibration rows', () => {
  const session = { id: 's1', subject: 'abc', start: '2026-09-01T10:00:00Z', outcome: 'FINAL_SIN_PREGUNTA' }
  const before = assessment('a', '2026-09-01T10:00:00Z', 'pilot-3', [criterion('comprension', 'CUMPLE')])
  const after = assessment('b', '2026-09-03T10:00:00Z', 'pilot-4', [criterion('comprension', 'INCUMPLE', 'WARNING')])
  const flag = { id: 'f1', sessionId: 's1', kind: 'FALTA_HALLAZGO', payload: { note: 'No detectó el requisito descartado', resolved: null } }

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
