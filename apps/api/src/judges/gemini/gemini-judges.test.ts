import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GeminiClientService } from './gemini-client.service'
import { GeminiIntegrityJudge } from './gemini-integrity.judge'
import { GeminiQualityJudge } from './gemini-quality.judge'
import { GeminiPatternJudge } from './gemini-pattern.judge'
import { GeminiConsolidatorJudge } from './gemini-consolidator.judge'

const sampleMessages = [
  { role: 'CUSTOMER', content: 'Hello, how much is product X?', orderIndex: 0 },
  { role: 'AGENT', content: 'Product X costs $500', orderIndex: 1 },
]

const sampleCatalog = [
  {
    externalId: '123',
    title: 'Product X',
    listPrice: 600,
    salePrice: 500,
    category: 'Electronics',
    brand: 'TestBrand',
  },
]

function createMockPromptLoader() {
  return {
    getPrompt: vi.fn().mockReturnValue({ content: 'mock prompt', version: 'abc123' }),
    getVersion: vi.fn().mockReturnValue('abc123'),
  } as any
}

function createMockClient() {
  return {
    generateJSON: vi.fn(),
  } as any as GeminiClientService & { generateJSON: ReturnType<typeof vi.fn> }
}

describe('GeminiClientService', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  it('should throw if GEMINI_API_KEY is missing', () => {
    delete process.env.GEMINI_API_KEY
    expect(() => new GeminiClientService()).toThrow('GEMINI_API_KEY is required')
  })
})

describe('GeminiIntegrityJudge', () => {
  it('should call Gemini and return normalized findings', async () => {
    const client = createMockClient()
    client.generateJSON.mockResolvedValueOnce({
      findings: [
        {
          type: 'price_mismatch',
          severity: 'CRITICAL',
          description: 'Price does not match catalog',
          evidence: 'Agent said $400 but catalog says $500',
        },
      ],
    })

    const promptLoader = createMockPromptLoader()
    const judge = new GeminiIntegrityJudge(client, promptLoader)

    const result = await judge.evaluate(sampleMessages, sampleCatalog)

    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].type).toBe('price_mismatch')
    expect(result.findings[0].severity).toBe('CRITICAL')
    expect(result.findings[0].description).toBe('Price does not match catalog')
    expect(result.findings[0].evidence).toBe('Agent said $400 but catalog says $500')
    expect(promptLoader.getPrompt).toHaveBeenCalledWith('integrity', 'system.md')
    expect(promptLoader.getPrompt).toHaveBeenCalledWith('integrity', 'user.md', {
      TRANSCRIPT: JSON.stringify(sampleMessages),
      CATALOG: JSON.stringify(sampleCatalog),
    })
  })

  it('should return empty findings for empty array', async () => {
    const client = createMockClient()
    client.generateJSON.mockResolvedValueOnce({ findings: [] })

    const judge = new GeminiIntegrityJudge(client, createMockPromptLoader())
    const result = await judge.evaluate(sampleMessages, sampleCatalog)
    expect(result.findings).toHaveLength(0)
  })

  it('should default severity to WARNING for unknown severity', async () => {
    const client = createMockClient()
    client.generateJSON.mockResolvedValueOnce({
      findings: [{ type: 'test', severity: 'UNKNOWN', description: 'test' }],
    })

    const judge = new GeminiIntegrityJudge(client, createMockPromptLoader())
    const result = await judge.evaluate(sampleMessages, sampleCatalog)
    expect(result.findings[0].severity).toBe('WARNING')
  })
})

describe('GeminiQualityJudge', () => {
  it('should call Gemini and return normalized quality result', async () => {
    const client = createMockClient()
    client.generateJSON.mockResolvedValueOnce({
      score: 8.5,
      subScores: { understanding: 9.0, recommendation: 8.0, fluency: 8.5 },
      findings: [{ description: 'Good response', messageRef: 1 }],
    })

    const judge = new GeminiQualityJudge(client, createMockPromptLoader())
    const result = await judge.evaluate(sampleMessages)

    expect(result.score).toBe(8.5)
    expect(result.subScores.understanding).toBe(9.0)
    expect(result.subScores.recommendation).toBe(8.0)
    expect(result.subScores.fluency).toBe(8.5)
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].description).toBe('Good response')
  })

  it('should clamp scores to 0-10 range', async () => {
    const client = createMockClient()
    client.generateJSON.mockResolvedValueOnce({
      score: 15,
      subScores: { understanding: -2, recommendation: 12, fluency: 5 },
      findings: [],
    })

    const judge = new GeminiQualityJudge(client, createMockPromptLoader())
    const result = await judge.evaluate(sampleMessages)

    expect(result.score).toBe(10)
    expect(result.subScores.understanding).toBe(0)
    expect(result.subScores.recommendation).toBe(10)
    expect(result.subScores.fluency).toBe(5)
  })

  it('should handle missing findings array', async () => {
    const client = createMockClient()
    client.generateJSON.mockResolvedValueOnce({
      score: 7,
      subScores: { understanding: 7, recommendation: 7, fluency: 7 },
    })

    const judge = new GeminiQualityJudge(client, createMockPromptLoader())
    const result = await judge.evaluate(sampleMessages)

    expect(result.findings).toHaveLength(0)
  })
})

describe('GeminiPatternJudge', () => {
  it('should call Gemini and return normalized classifications', async () => {
    const client = createMockClient()
    client.generateJSON.mockResolvedValueOnce({
      classifications: [
        {
          name: 'consulta_producto',
          isEmergent: false,
          explanation: 'Customer asked about a product',
          evidence: 'Asked about Product X',
        },
        {
          name: 'new_pattern',
          isEmergent: true,
          explanation: 'New emerging pattern',
        },
      ],
    })

    const judge = new GeminiPatternJudge(client, createMockPromptLoader())
    const result = await judge.evaluate(sampleMessages)

    expect(result.classifications).toHaveLength(2)
    expect(result.classifications[0].name).toBe('consulta_producto')
    expect(result.classifications[0].isEmergent).toBe(false)
    expect(result.classifications[1].isEmergent).toBe(true)
    expect(result.classifications[1].evidence).toBeUndefined()
  })

  it('should handle empty classifications', async () => {
    const client = createMockClient()
    client.generateJSON.mockResolvedValueOnce({ classifications: [] })

    const judge = new GeminiPatternJudge(client, createMockPromptLoader())
    const result = await judge.evaluate(sampleMessages)

    expect(result.classifications).toHaveLength(0)
  })
})

describe('GeminiConsolidatorJudge', () => {
  it('should call Gemini and return normalized consolidation result', async () => {
    const client = createMockClient()
    client.generateJSON.mockResolvedValueOnce({
      score: 7.5,
      label: 'con_hallazgos',
      explanation: 'Conversation had some issues',
    })

    const judge = new GeminiConsolidatorJudge(client, createMockPromptLoader())
    const result = await judge.consolidate(null, null, null)

    expect(result.score).toBe(7.5)
    expect(result.label).toBe('con_hallazgos')
    expect(result.explanation).toBe('Conversation had some issues')
  })

  it('should default to "fallida" for invalid labels', async () => {
    const client = createMockClient()
    client.generateJSON.mockResolvedValueOnce({
      score: 5,
      label: 'invalid_label',
      explanation: 'Some explanation',
    })

    const judge = new GeminiConsolidatorJudge(client, createMockPromptLoader())
    const result = await judge.consolidate(null, null, null)

    expect(result.label).toBe('fallida')
  })

  it('should clamp score to 0-10', async () => {
    const client = createMockClient()
    client.generateJSON.mockResolvedValueOnce({
      score: -3,
      label: 'aprobada',
      explanation: 'Explanation',
    })

    const judge = new GeminiConsolidatorJudge(client, createMockPromptLoader())
    const result = await judge.consolidate(null, null, null)

    expect(result.score).toBe(0)
  })

  it('should accept all valid labels', async () => {
    const client = createMockClient()
    for (const label of ['aprobada', 'con_hallazgos', 'fallida'] as const) {
      client.generateJSON.mockResolvedValueOnce({
        score: 5,
        label,
        explanation: 'test',
      })

      const judge = new GeminiConsolidatorJudge(client, createMockPromptLoader())
      const result = await judge.consolidate(null, null, null)
      expect(result.label).toBe(label)
    }
  })
})
