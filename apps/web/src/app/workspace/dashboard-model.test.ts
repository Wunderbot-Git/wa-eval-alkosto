import { describe, expect, it } from 'vitest'
import { cardChips, filterRows, groupOf, reviewOf } from './dashboard-model'
const row = (criteria: any[], extra = {}) => ({ start: '2026-09-01T03:00:00Z', subject: 'test', assessment: { criteria, ...extra } })
const pass = { name: 'comunicacion', status: 'CUMPLE' }
const unknown = { name: 'exactitud', status: 'EVIDENCIA_INSUFICIENTE' }
describe('commercial dashboard classification', () => {
  it('never reports incomplete evidence as a clean result, even with a high score', () => {
    expect(groupOf(row([pass, unknown], { score: 10 }))).toBe('incomplete')
    expect(groupOf(row([pass, { status: 'NO_APLICA' }]))).toBe('clear')
    expect(groupOf(row([{ status: 'NO_APLICA' }]))).toBe('incomplete')
  })
  it('prioritizes failures over unknowns and critical failures over other failures', () => {
    const failure = { status: 'INCUMPLE', severity: 'WARNING' }
    expect(groupOf(row([unknown, failure]))).toBe('findings')
    expect(groupOf(row([failure, { status: 'INCUMPLE', severity: 'CRITICAL' }]))).toBe('critical')
  })
  it('excludes obsolete verdicts and their reviews from current outcomes', () => {
    const s = row([{ status: 'INCUMPLE', severity: 'CRITICAL' }], { stale: true, review: { decision: 'DE_ACUERDO' } })
    expect(groupOf(s)).toBe('stale')
    expect(reviewOf(s)).toBe('unavailable')
    expect(groupOf({})).toBe('pending')
  })
  it('keeps human disagreement separate from model outcome', () => {
    const s = row([pass], { review: { decision: 'EN_DESACUERDO' } })
    expect(groupOf(s)).toBe('clear')
    expect(reviewOf(s)).toBe('disagreed')
  })
  it('filters by Colombian conversation date rather than UTC or evaluation date', () => {
    const s = row([pass])
    const f = { from: '2026-08-31', to: '2026-08-31', category: '', review: '', outcome: '', rec: '', search: '' }
    expect(filterRows([s], f)).toHaveLength(1)
    expect(filterRows([s], { ...f, from: '2026-09-01', to: '2026-09-01' })).toHaveLength(0)
  })
  it('summarizes a card in at most three chips and never with conversation text', () => {
    const critical = { name: 'adecuacion', status: 'INCUMPLE', severity: 'CRITICAL' }
    const warning = { name: 'resolucion', status: 'INCUMPLE', severity: 'WARNING' }
    const s = { ...row([critical, warning, pass], { categories: ['Televisores'] }), preview: 'Hola, busco un televisor' }
    const chips = cardChips(s)
    expect(chips.map(c => c.label)).toEqual(['Crítico · 2 hallazgos', 'Televisores', 'Por revisar'])
    expect(chips[0].tone).toBe('danger')
    expect(chips.some(c => c.label.includes('televisor'))).toBe(false)
    // Without an evaluation there is nothing to categorize or review yet.
    expect(cardChips({ start: s.start, subject: 'test' }).map(c => c.label)).toEqual(['Sin evaluar'])
    expect(cardChips(row([pass])).map(c => c.label)).toEqual(['Sin hallazgos', 'Por revisar'])
  })
  it('combines category, human review and text filters', () => {
    const s = row([pass], { categories: ['Computadores', 'Monitores'], summary: 'Presupuesto', review: { decision: 'EN_DESACUERDO' } })
    const f = { from: '', to: '', category: 'Monitores', review: 'disagreed', outcome: '', rec: '', search: 'presupuesto' }
    expect(filterRows([s], f)).toHaveLength(1)
    expect(filterRows([s], { ...f, review: 'agreed' })).toHaveLength(0)
  })
})
