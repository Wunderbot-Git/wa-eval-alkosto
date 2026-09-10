import { describe, expect, it } from 'vitest'
import { cardChips, filterRows, groupOf, reviewOf, sectionsOf } from './dashboard-model'
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
  it('puts only what varies on a card: outcome, findings, category, review progress', () => {
    const critical = { name: 'adecuacion', status: 'INCUMPLE', severity: 'CRITICAL' }
    const warning = { name: 'resolucion', status: 'INCUMPLE', severity: 'WARNING' }
    const s = { ...row([critical, warning, pass], { categories: ['Televisores'] }), outcome: 'AGENTE_SIN_RESPUESTA', preview: 'Hola, busco un televisor' }
    const chips = cardChips(s)
    expect(chips.map(c => c.label)).toEqual(['Agente no respondió', '2 hallazgos', 'Televisores'])
    // The agent abandoning the customer is a failure; colour says so.
    expect(chips[0].tone).toBe('danger')
    expect(chips.some(c => c.label.includes('televisor'))).toBe(false)
    // The verdict group is the section heading and "Por revisar" is every
    // card's default, so neither is repeated on the card itself.
    expect(cardChips({ outcome: 'FINAL_SIN_PREGUNTA' }).map(c => c.label)).toEqual(['Cerrada sin pregunta'])
    expect(cardChips(row([pass])).map(c => c.label)).toEqual([])
    expect(cardChips(row([pass], { humanReview: { completed: true } })).map(c => c.label)).toEqual(['Revisada'])
  })
  it('groups the queue by verdict in triage order and drops empty groups', () => {
    const failing = row([{ name: 'adecuacion', status: 'INCUMPLE', severity: 'WARNING' }])
    const sections = sectionsOf([row([pass]), { start: failing.start, subject: 'x' }, failing])
    expect(sections.map(g => [g.id, g.rows.length])).toEqual([['findings', 1], ['clear', 1], ['pending', 1]])
  })
  it('combines category, human review and text filters', () => {
    const s = row([pass], { categories: ['Computadores', 'Monitores'], summary: 'Presupuesto', review: { decision: 'EN_DESACUERDO' } })
    const f = { from: '', to: '', category: 'Monitores', review: 'disagreed', outcome: '', rec: '', search: 'presupuesto' }
    expect(filterRows([s], f)).toHaveLength(1)
    expect(filterRows([s], { ...f, review: 'agreed' })).toHaveLength(0)
  })
})
