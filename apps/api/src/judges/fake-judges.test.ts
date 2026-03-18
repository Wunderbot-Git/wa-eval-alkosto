import { describe, it, expect } from 'vitest'
import { FakeIntegrityJudge } from './fake-integrity.judge'
import { FakeQualityJudge } from './fake-quality.judge'
import { FakePatternJudge } from './fake-pattern.judge'
import { FakeConsolidatorJudge } from './fake-consolidator.judge'

const sampleMessages = [
  { role: 'CUSTOMER', content: 'Hello', orderIndex: 0 },
  { role: 'AGENT', content: 'Hi there!', orderIndex: 1 },
]

const sampleCatalog = [
  {
    externalId: '123',
    title: 'Test Product',
    listPrice: 1000,
    salePrice: 800,
    category: 'Electronics',
    brand: 'TestBrand',
  },
]

describe('FakeIntegrityJudge', () => {
  it('should return 1 warning finding', async () => {
    const judge = new FakeIntegrityJudge()
    const result = await judge.evaluate(sampleMessages, sampleCatalog)

    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].severity).toBe('WARNING')
    expect(result.findings[0].type).toBe('price_mismatch')
    expect(result.findings[0].description).toBeTruthy()
  })
})

describe('FakeQualityJudge', () => {
  it('should return score 7.5 with correct sub-scores', async () => {
    const judge = new FakeQualityJudge()
    const result = await judge.evaluate(sampleMessages)

    expect(result.score).toBe(7.5)
    expect(result.subScores.understanding).toBe(7.0)
    expect(result.subScores.recommendation).toBe(8.0)
    expect(result.subScores.fluency).toBe(7.5)
    expect(result.findings).toHaveLength(1)
  })
})

describe('FakePatternJudge', () => {
  it('should return 1 classification "consulta_producto"', async () => {
    const judge = new FakePatternJudge()
    const result = await judge.evaluate(sampleMessages)

    expect(result.classifications).toHaveLength(1)
    expect(result.classifications[0].name).toBe('consulta_producto')
    expect(result.classifications[0].isEmergent).toBe(false)
  })
})

describe('FakeConsolidatorJudge', () => {
  const consolidator = new FakeConsolidatorJudge()

  it('should label "aprobada" for score >= 8.5', async () => {
    const result = await consolidator.consolidate(
      null,
      { score: 9.0, subScores: { understanding: 9, recommendation: 9, fluency: 9 }, findings: [] },
      null,
    )
    expect(result.label).toBe('aprobada')
    expect(result.score).toBe(9.0)
  })

  it('should label "con_hallazgos" for score 6.0-8.4', async () => {
    const result = await consolidator.consolidate(
      null,
      { score: 7.5, subScores: { understanding: 7, recommendation: 8, fluency: 7.5 }, findings: [] },
      null,
    )
    expect(result.label).toBe('con_hallazgos')
    expect(result.score).toBe(7.5)
  })

  it('should label "fallida" for score < 6.0', async () => {
    const result = await consolidator.consolidate(
      null,
      { score: 4.0, subScores: { understanding: 4, recommendation: 4, fluency: 4 }, findings: [] },
      null,
    )
    expect(result.label).toBe('fallida')
    expect(result.score).toBe(4.0)
  })

  it('should default to score 5.0 when quality is null', async () => {
    const result = await consolidator.consolidate(null, null, null)
    expect(result.score).toBe(5.0)
    expect(result.label).toBe('fallida')
  })

  it('should label "con_hallazgos" at exactly 6.0', async () => {
    const result = await consolidator.consolidate(
      null,
      { score: 6.0, subScores: { understanding: 6, recommendation: 6, fluency: 6 }, findings: [] },
      null,
    )
    expect(result.label).toBe('con_hallazgos')
  })

  it('should label "aprobada" at exactly 8.5', async () => {
    const result = await consolidator.consolidate(
      null,
      { score: 8.5, subScores: { understanding: 8.5, recommendation: 8.5, fluency: 8.5 }, findings: [] },
      null,
    )
    expect(result.label).toBe('aprobada')
  })
})
