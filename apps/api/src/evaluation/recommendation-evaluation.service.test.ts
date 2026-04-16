import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RecommendationEvaluationService } from './recommendation-evaluation.service'

function makePrismaStub() {
  return {
    finding: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  }
}

function makeJudgeStub() {
  return {
    evaluate: vi.fn().mockResolvedValue({
      findings: [
        {
          type: 'under_spec_for_need',
          severity: 'CRITICAL',
          description: 'too weak',
          evidence: 'agent quote',
        },
      ],
      summary: 'insufficient',
    }),
  }
}

const sampleMessages = [
  { role: 'CUSTOMER', content: 'Need autocad laptop', orderIndex: 0 },
] as any
const sampleNeeds = {
  use_case: 'autocad',
  budget_min: null,
  budget_max: null,
  must_have_specs: [],
  deal_breakers: [],
}
const sampleSpecs = [
  { externalId: '1', title: 'cheap pavilion', specs: { 'Memoria RAM': '8 GB' } },
] as any

describe('RecommendationEvaluationService', () => {
  let service: RecommendationEvaluationService
  let prisma: ReturnType<typeof makePrismaStub>
  let judge: ReturnType<typeof makeJudgeStub>

  beforeEach(() => {
    prisma = makePrismaStub()
    judge = makeJudgeStub()
    service = new RecommendationEvaluationService(prisma as any, judge as any)
  })

  it('passes all inputs through to the judge', async () => {
    await service.evaluate('eval-1', sampleMessages, sampleNeeds, sampleSpecs, [])
    expect(judge.evaluate).toHaveBeenCalledWith(sampleMessages, sampleNeeds, sampleSpecs, [])
  })

  it('persists findings tagged with module=recommendation', async () => {
    await service.evaluate('eval-1', sampleMessages, sampleNeeds, sampleSpecs, [])
    expect(prisma.finding.createMany).toHaveBeenCalledWith({
      data: [
        {
          evaluationId: 'eval-1',
          module: 'recommendation',
          type: 'under_spec_for_need',
          severity: 'CRITICAL',
          description: 'too weak',
          evidence: 'agent quote',
        },
      ],
    })
  })

  it('does not persist when no findings', async () => {
    judge.evaluate.mockResolvedValue({ findings: [], summary: 'ok' })
    await service.evaluate('eval-1', sampleMessages, sampleNeeds, sampleSpecs, [])
    expect(prisma.finding.createMany).not.toHaveBeenCalled()
  })

  it('returns the judge result including summary', async () => {
    const r = await service.evaluate('eval-1', sampleMessages, sampleNeeds, sampleSpecs, [])
    expect(r.summary).toBe('insufficient')
    expect(r.findings).toHaveLength(1)
  })
})
