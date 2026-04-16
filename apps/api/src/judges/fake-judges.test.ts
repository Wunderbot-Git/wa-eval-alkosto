import { describe, it, expect } from 'vitest'
import { FakeIntegrityJudge } from './fake-integrity.judge'
import { FakeQualityJudge } from './fake-quality.judge'
import { FakePatternJudge } from './fake-pattern.judge'
import { FakeConsolidatorJudge } from './fake-consolidator.judge'
import { FakeExtractionJudge } from './fake-extraction.judge'
import { FakeRecommendationJudge } from './fake-recommendation.judge'

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

  it('should mark fallida when integrity has a CRITICAL finding even if quality is great', async () => {
    const result = await consolidator.consolidate(
      { findings: [{ type: 'price_mismatch', severity: 'CRITICAL', description: 'd' }] },
      { score: 9.0, subScores: { understanding: 9, recommendation: 9, fluency: 9 }, findings: [] },
      null,
    )
    expect(result.label).toBe('fallida')
  })

  it('should subtract for recommendation findings', async () => {
    const result = await consolidator.consolidate(
      null,
      { score: 8.0, subScores: { understanding: 8, recommendation: 8, fluency: 8 }, findings: [] },
      null,
      {
        findings: [
          { type: 'over_spec_for_need', severity: 'WARNING', description: 'd' },
          { type: 'over_spec_for_need', severity: 'WARNING', description: 'd' },
        ],
        summary: 's',
      },
    )
    // 8.0 - 0.4 - 0.4 = 7.2
    expect(result.score).toBeCloseTo(7.2, 1)
    expect(result.label).toBe('con_hallazgos')
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

describe('FakeExtractionJudge', () => {
  it('matches catalog products whose title shares a 6+ char token with the agent text', async () => {
    const judge = new FakeExtractionJudge()
    const transcript = [
      { role: 'AGENT', content: 'Te recomiendo la pavilion para diseño', orderIndex: 0 },
    ]
    const catalog = [
      { externalId: '1', title: 'HP Pavilion 15-eh3' },
      { externalId: '2', title: 'Apple iPad' },
    ]
    const result = await judge.evaluate(transcript as any, catalog as any)
    expect(result.mentionedExternalIds).toContain('1')
    expect(result.mentionedExternalIds).not.toContain('2')
    expect(result.statedNeeds.use_case).toBeNull()
  })

  it('returns empty when nothing matches', async () => {
    const judge = new FakeExtractionJudge()
    const result = await judge.evaluate(
      [{ role: 'AGENT', content: 'hello world', orderIndex: 0 }] as any,
      [{ externalId: '1', title: 'lorem ipsum' }] as any,
    )
    expect(result.mentionedExternalIds).toEqual([])
  })
})

describe('FakeRecommendationJudge', () => {
  it('returns no findings when no products were discussed', async () => {
    const judge = new FakeRecommendationJudge()
    const result = await judge.evaluate([] as any, {} as any, [], [])
    expect(result.findings).toEqual([])
  })

  it('returns one warning finding when products were discussed', async () => {
    const judge = new FakeRecommendationJudge()
    const result = await judge.evaluate(
      [] as any,
      {} as any,
      [{ externalId: '1', title: 't', specs: {} } as any],
      [],
    )
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].severity).toBe('WARNING')
  })
})
