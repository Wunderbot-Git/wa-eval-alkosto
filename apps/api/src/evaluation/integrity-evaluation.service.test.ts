import { describe, it, expect, vi, beforeEach } from 'vitest'
import { IntegrityEvaluationService } from './integrity-evaluation.service'

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
          type: 'price_mismatch',
          severity: 'WARNING',
          description: 'Price mismatch detected',
          evidence: 'Agent quoted $100 vs catalog $90',
        },
      ],
    }),
  }
}

const sampleMessages = [
  { role: 'CUSTOMER', content: 'How much is the TV?', orderIndex: 0 },
  { role: 'AGENT', content: 'It costs $100', orderIndex: 1 },
]

const sampleCatalog = [
  {
    externalId: '123',
    title: 'TV 50"',
    listPrice: 100,
    salePrice: 90,
    category: 'Electronics',
    brand: 'Samsung',
  },
]

describe('IntegrityEvaluationService', () => {
  let service: IntegrityEvaluationService
  let prisma: ReturnType<typeof makePrismaStub>
  let judge: ReturnType<typeof makeJudgeStub>

  beforeEach(() => {
    prisma = makePrismaStub()
    judge = makeJudgeStub()
    service = new IntegrityEvaluationService(prisma as any, judge)
  })

  it('should call the integrity judge with transcript and catalog', async () => {
    await service.evaluate('eval-1', sampleMessages, sampleCatalog)

    expect(judge.evaluate).toHaveBeenCalledWith(sampleMessages, sampleCatalog, [])
  })

  it('should forward mentioned product spec sheets to the judge', async () => {
    const specs = [
      {
        externalId: '123',
        title: 'TV 50"',
        salePrice: 90,
        category: 'Electronics',
        brand: 'Samsung',
        specs: { 'Tarjeta Grafica': 'GeForce® RTX 3050' },
      },
    ]
    await service.evaluate('eval-1', sampleMessages, sampleCatalog, specs as any)

    expect(judge.evaluate).toHaveBeenCalledWith(sampleMessages, sampleCatalog, specs)
  })

  it('should persist findings to the Finding model with module=integrity', async () => {
    await service.evaluate('eval-1', sampleMessages, sampleCatalog)

    expect(prisma.finding.createMany).toHaveBeenCalledWith({
      data: [
        {
          evaluationId: 'eval-1',
          module: 'integrity',
          type: 'price_mismatch',
          severity: 'WARNING',
          description: 'Price mismatch detected',
          evidence: 'Agent quoted $100 vs catalog $90',
        },
      ],
    })
  })

  it('should return the judge result', async () => {
    const result = await service.evaluate('eval-1', sampleMessages, sampleCatalog)

    expect(result.findings).toHaveLength(1)
    expect(result.findings[0].type).toBe('price_mismatch')
    expect(result.findings[0].severity).toBe('WARNING')
  })

  it('should not persist findings when there are none', async () => {
    judge.evaluate.mockResolvedValue({ findings: [] })

    const result = await service.evaluate('eval-1', sampleMessages, sampleCatalog)

    expect(result.findings).toHaveLength(0)
    expect(prisma.finding.createMany).not.toHaveBeenCalled()
  })

  it('should persist multiple findings', async () => {
    judge.evaluate.mockResolvedValue({
      findings: [
        {
          type: 'price_mismatch',
          severity: 'WARNING',
          description: 'Price mismatch',
          evidence: 'evidence 1',
        },
        {
          type: 'availability_error',
          severity: 'CRITICAL',
          description: 'Product unavailable but agent said it was in stock',
        },
      ],
    })

    const result = await service.evaluate('eval-1', sampleMessages, sampleCatalog)

    expect(result.findings).toHaveLength(2)
    expect(prisma.finding.createMany).toHaveBeenCalledWith({
      data: [
        {
          evaluationId: 'eval-1',
          module: 'integrity',
          type: 'price_mismatch',
          severity: 'WARNING',
          description: 'Price mismatch',
          evidence: 'evidence 1',
        },
        {
          evaluationId: 'eval-1',
          module: 'integrity',
          type: 'availability_error',
          severity: 'CRITICAL',
          description: 'Product unavailable but agent said it was in stock',
          evidence: null,
        },
      ],
    })
  })
})
