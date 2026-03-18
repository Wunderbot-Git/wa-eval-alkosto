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

  it('should call the consolidator judge with all three judge results', async () => {
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
    )
  })

  it('should update the evaluation record with consolidated results', async () => {
    await service.consolidate({
      conversationId: 'conv-1',
      evaluationId: 'eval-1',
      integrity: sampleIntegrity,
      quality: sampleQuality,
      patterns: samplePatterns,
    })

    expect(prisma.evaluation.update).toHaveBeenCalledWith({
      where: { id: 'eval-1' },
      data: expect.objectContaining({
        score: 7.5,
        label: 'CON_HALLAZGOS',
        integrityFindings: sampleIntegrity.findings,
        qualitySubScores: sampleQuality.subScores,
        patternClassifications: samplePatterns.classifications,
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

    // 4 judges x 2 files = 8 calls
    expect(promptLoader.getVersion).toHaveBeenCalledTimes(8)
    expect(promptLoader.getVersion).toHaveBeenCalledWith('integrity', 'system.md')
    expect(promptLoader.getVersion).toHaveBeenCalledWith('integrity', 'user.md')
    expect(promptLoader.getVersion).toHaveBeenCalledWith('quality', 'system.md')
    expect(promptLoader.getVersion).toHaveBeenCalledWith('consolidator', 'user.md')
  })
})
