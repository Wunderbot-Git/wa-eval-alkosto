import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConsolidatorService } from './consolidator.service'

function makePrismaStub() {
  return {
    evaluation: {
      update: vi.fn().mockResolvedValue({}),
    },
    snapshot: {
      create: vi.fn().mockResolvedValue({}),
    },
  }
}

function makePromptLoaderStub() {
  return {
    getVersion: vi.fn().mockReturnValue('abc12345'),
  }
}

function makeJudgeStub() {
  return {
    consolidate: vi.fn().mockResolvedValue({
      score: 7.5,
      label: 'con_hallazgos',
      explanation: 'Moderate quality with some findings',
    }),
  }
}

const sampleIntegrity = {
  findings: [
    {
      type: 'price_mismatch',
      severity: 'WARNING' as const,
      description: 'Price mismatch',
      evidence: 'evidence',
    },
  ],
}

const sampleQuality = {
  score: 7.5,
  subScores: { understanding: 7.0, recommendation: 8.0, fluency: 7.5 },
  findings: [],
}

const samplePatterns = {
  classifications: [
    {
      name: 'consulta_producto',
      isEmergent: false,
      explanation: 'Product inquiry',
      evidence: 'Asked about product',
    },
  ],
}

describe('ConsolidatorService', () => {
  let service: ConsolidatorService
  let prisma: ReturnType<typeof makePrismaStub>
  let promptLoader: ReturnType<typeof makePromptLoaderStub>
  let judge: ReturnType<typeof makeJudgeStub>

  beforeEach(() => {
    prisma = makePrismaStub()
    promptLoader = makePromptLoaderStub()
    judge = makeJudgeStub()
    service = new ConsolidatorService(prisma as any, promptLoader as any, judge)
  })

  it('should call the consolidator judge with all four judge results', async () => {
    await service.consolidate({
      conversationId: 'conv-1',
      evaluationId: 'eval-1',
      integrity: sampleIntegrity,
      quality: sampleQuality,
      patterns: samplePatterns,
    })

    expect(judge.consolidate).toHaveBeenCalledWith(
      sampleIntegrity,
      sampleQuality,
      samplePatterns,
      null,
    )
  })

  it('should forward recommendation result to the judge when provided', async () => {
    const rec = {
      findings: [
        {
          type: 'over_spec_for_need',
          severity: 'WARNING' as const,
          description: 'over-spec',
          evidence: 'ev',
        },
      ],
      summary: 'plausible',
    }
    await service.consolidate({
      conversationId: 'conv-1',
      evaluationId: 'eval-1',
      integrity: sampleIntegrity,
      quality: sampleQuality,
      patterns: samplePatterns,
      recommendation: rec,
    })

    expect(judge.consolidate).toHaveBeenCalledWith(
      sampleIntegrity,
      sampleQuality,
      samplePatterns,
      rec,
    )
  })

  it('should update the evaluation record with consolidated results (incl recommendation)', async () => {
    const rec = {
      findings: [
        { type: 't', severity: 'CRITICAL' as const, description: 'd', evidence: 'e' },
      ],
      summary: 'sum',
    }
    const needs = { use_case: 'gaming' }
    await service.consolidate({
      conversationId: 'conv-1',
      evaluationId: 'eval-1',
      integrity: sampleIntegrity,
      quality: sampleQuality,
      patterns: samplePatterns,
      recommendation: rec,
      statedNeeds: needs as any,
    })

    expect(prisma.evaluation.update).toHaveBeenCalledWith({
      where: { id: 'eval-1' },
      data: expect.objectContaining({
        score: 7.5,
        label: 'CON_HALLAZGOS',
        integrityFindings: sampleIntegrity.findings,
        qualitySubScores: sampleQuality.subScores,
        patternClassifications: samplePatterns.classifications,
        recommendationFindings: rec.findings,
        recommendationSummary: 'sum',
        extractedNeeds: needs,
        consolidatorExplanation: 'Moderate quality with some findings',
        promptVersions: expect.any(Object),
      }),
    })
  })

  it('should create an immutable snapshot', async () => {
    await service.consolidate({
      conversationId: 'conv-1',
      evaluationId: 'eval-1',
      integrity: sampleIntegrity,
      quality: sampleQuality,
      patterns: samplePatterns,
    })

    expect(prisma.snapshot.create).toHaveBeenCalledWith({
      data: {
        conversationId: 'conv-1',
        data: {
          integrity: sampleIntegrity,
          quality: sampleQuality,
          patterns: samplePatterns,
          recommendation: null,
          extractedNeeds: null,
          consolidator: {
            score: 7.5,
            label: 'con_hallazgos',
            explanation: 'Moderate quality with some findings',
          },
          promptVersions: expect.any(Object),
        },
      },
    })
  })

  it('should return the consolidator result', async () => {
    const result = await service.consolidate({
      conversationId: 'conv-1',
      evaluationId: 'eval-1',
      integrity: sampleIntegrity,
      quality: sampleQuality,
      patterns: samplePatterns,
    })

    expect(result.score).toBe(7.5)
    expect(result.label).toBe('con_hallazgos')
    expect(result.explanation).toBe('Moderate quality with some findings')
  })

  it('should map label "aprobada" to APROBADA', async () => {
    judge.consolidate.mockResolvedValue({
      score: 9.0,
      label: 'aprobada',
      explanation: 'Excellent',
    })

    await service.consolidate({
      conversationId: 'conv-1',
      evaluationId: 'eval-1',
      integrity: sampleIntegrity,
      quality: sampleQuality,
      patterns: samplePatterns,
    })

    expect(prisma.evaluation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ label: 'APROBADA' }),
      }),
    )
  })

  it('should map label "fallida" to FALLIDA', async () => {
    judge.consolidate.mockResolvedValue({
      score: 3.0,
      label: 'fallida',
      explanation: 'Poor quality',
    })

    await service.consolidate({
      conversationId: 'conv-1',
      evaluationId: 'eval-1',
      integrity: sampleIntegrity,
      quality: sampleQuality,
      patterns: samplePatterns,
    })

    expect(prisma.evaluation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ label: 'FALLIDA' }),
      }),
    )
  })

  it('should collect prompt versions from the prompt loader', async () => {
    await service.consolidate({
      conversationId: 'conv-1',
      evaluationId: 'eval-1',
      integrity: sampleIntegrity,
      quality: sampleQuality,
      patterns: samplePatterns,
    })

    // 6 judges x 2 files = 12 calls
    expect(promptLoader.getVersion).toHaveBeenCalledTimes(12)
    expect(promptLoader.getVersion).toHaveBeenCalledWith('integrity', 'system.md')
    expect(promptLoader.getVersion).toHaveBeenCalledWith('integrity', 'user.md')
    expect(promptLoader.getVersion).toHaveBeenCalledWith('quality', 'system.md')
    expect(promptLoader.getVersion).toHaveBeenCalledWith('consolidator', 'user.md')
    expect(promptLoader.getVersion).toHaveBeenCalledWith('extraction', 'system.md')
    expect(promptLoader.getVersion).toHaveBeenCalledWith('recommendation', 'user.md')
  })
})
