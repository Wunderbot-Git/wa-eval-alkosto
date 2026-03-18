import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PatternEvaluationService } from './pattern-evaluation.service'

function makePrismaStub() {
  return {
    pattern: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  }
}

function makeJudgeStub() {
  return {
    evaluate: vi.fn().mockResolvedValue({
      classifications: [
        {
          name: 'consulta_producto',
          isEmergent: false,
          explanation: 'Customer inquired about a product',
          evidence: 'Customer asked about product details',
        },
      ],
    }),
  }
}

const sampleMessages = [
  { role: 'CUSTOMER', content: 'Tell me about the Samsung TV', orderIndex: 0 },
  { role: 'AGENT', content: 'Sure, it has a 50 inch screen...', orderIndex: 1 },
]

describe('PatternEvaluationService', () => {
  let service: PatternEvaluationService
  let prisma: ReturnType<typeof makePrismaStub>
  let judge: ReturnType<typeof makeJudgeStub>

  beforeEach(() => {
    prisma = makePrismaStub()
    judge = makeJudgeStub()
    service = new PatternEvaluationService(prisma as any, judge)
  })

  it('should call the pattern judge with transcript', async () => {
    await service.evaluate('eval-1', sampleMessages)

    expect(judge.evaluate).toHaveBeenCalledWith(sampleMessages)
  })

  it('should persist patterns to the Pattern model', async () => {
    await service.evaluate('eval-1', sampleMessages)

    expect(prisma.pattern.createMany).toHaveBeenCalledWith({
      data: [
        {
          evaluationId: 'eval-1',
          name: 'consulta_producto',
          isEmergent: false,
          explanation: 'Customer inquired about a product',
          evidence: 'Customer asked about product details',
        },
      ],
    })
  })

  it('should return the judge result', async () => {
    const result = await service.evaluate('eval-1', sampleMessages)

    expect(result.classifications).toHaveLength(1)
    expect(result.classifications[0].name).toBe('consulta_producto')
    expect(result.classifications[0].isEmergent).toBe(false)
  })

  it('should not persist patterns when there are none', async () => {
    judge.evaluate.mockResolvedValue({ classifications: [] })

    const result = await service.evaluate('eval-1', sampleMessages)

    expect(result.classifications).toHaveLength(0)
    expect(prisma.pattern.createMany).not.toHaveBeenCalled()
  })

  it('should persist multiple patterns including emergent ones', async () => {
    judge.evaluate.mockResolvedValue({
      classifications: [
        {
          name: 'consulta_producto',
          isEmergent: false,
          explanation: 'Product inquiry',
          evidence: 'Asked about TV',
        },
        {
          name: 'new_pattern',
          isEmergent: true,
          explanation: 'A new pattern detected',
        },
      ],
    })

    const result = await service.evaluate('eval-1', sampleMessages)

    expect(result.classifications).toHaveLength(2)
    expect(prisma.pattern.createMany).toHaveBeenCalledWith({
      data: [
        {
          evaluationId: 'eval-1',
          name: 'consulta_producto',
          isEmergent: false,
          explanation: 'Product inquiry',
          evidence: 'Asked about TV',
        },
        {
          evaluationId: 'eval-1',
          name: 'new_pattern',
          isEmergent: true,
          explanation: 'A new pattern detected',
          evidence: null,
        },
      ],
    })
  })
})
