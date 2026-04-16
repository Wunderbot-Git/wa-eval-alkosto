import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EvaluationWorker } from './evaluation.worker'

function makePrismaStub() {
  return {
    conversation: {
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    catalogProduct: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    evaluation: {
      create: vi.fn().mockResolvedValue({ id: 'eval-1' }),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      aggregate: vi.fn().mockResolvedValue({ _avg: { score: 7.5 } }),
    },
    run: {
      update: vi.fn().mockResolvedValue({}),
    },
  }
}

function makeCatalogServiceStub() {
  return {
    findByDate: vi.fn(),
    findProductsByExternalIds: vi.fn().mockResolvedValue([]),
  }
}

function makeExtractionStub() {
  return {
    extract: vi.fn().mockResolvedValue({
      mentionedExternalIds: [],
      statedNeeds: {
        use_case: null,
        budget_min: null,
        budget_max: null,
        must_have_specs: [],
        deal_breakers: [],
      },
    }),
  }
}

function makeRecommendationEvalStub() {
  return {
    evaluate: vi.fn().mockResolvedValue({ findings: [], summary: 'no products' }),
  }
}

function makeIntegrityEvalStub() {
  return {
    evaluate: vi.fn().mockResolvedValue({
      findings: [
        { type: 'price_mismatch', severity: 'WARNING', description: 'Mismatch', evidence: 'ev' },
      ],
    }),
  }
}

function makeQualityEvalStub() {
  return {
    evaluate: vi.fn().mockResolvedValue({
      score: 7.5,
      subScores: { understanding: 7, recommendation: 8, fluency: 7.5 },
      findings: [],
    }),
  }
}

function makePatternEvalStub() {
  return {
    evaluate: vi.fn().mockResolvedValue({
      classifications: [
        { name: 'consulta_producto', isEmergent: false, explanation: 'inquiry', evidence: 'ev' },
      ],
    }),
  }
}

function makeConsolidatorStub() {
  return {
    consolidate: vi.fn().mockResolvedValue({
      score: 7.5,
      label: 'con_hallazgos',
      explanation: 'Moderate quality',
    }),
  }
}

const sampleConversation = {
  id: 'conv-1',
  runId: 'run-1',
  conversationDate: new Date(2026, 0, 28),
  messages: [
    { id: 'msg-1', role: 'CUSTOMER', content: 'Hello', orderIndex: 0 },
    { id: 'msg-2', role: 'AGENT', content: 'Hi!', orderIndex: 1 },
  ],
}

describe('EvaluationWorker', () => {
  let worker: EvaluationWorker
  let prisma: ReturnType<typeof makePrismaStub>
  let catalogService: ReturnType<typeof makeCatalogServiceStub>
  let integrityEval: ReturnType<typeof makeIntegrityEvalStub>
  let qualityEval: ReturnType<typeof makeQualityEvalStub>
  let patternEval: ReturnType<typeof makePatternEvalStub>
  let consolidator: ReturnType<typeof makeConsolidatorStub>
  let extractionService: ReturnType<typeof makeExtractionStub>
  let recommendationEval: ReturnType<typeof makeRecommendationEvalStub>

  beforeEach(() => {
    prisma = makePrismaStub()
    catalogService = makeCatalogServiceStub()
    integrityEval = makeIntegrityEvalStub()
    qualityEval = makeQualityEvalStub()
    patternEval = makePatternEvalStub()
    consolidator = makeConsolidatorStub()
    extractionService = makeExtractionStub()
    recommendationEval = makeRecommendationEvalStub()

    worker = new EvaluationWorker(
      prisma as any,
      catalogService as any,
      integrityEval as any,
      qualityEval as any,
      patternEval as any,
      consolidator as any,
      extractionService as any,
      recommendationEval as any,
    )
  })

  describe('processJob — catalog found', () => {
    beforeEach(() => {
      prisma.conversation.findUnique.mockResolvedValue(sampleConversation)
      catalogService.findByDate.mockResolvedValue({ id: 'cat-1', catalogDate: new Date(2026, 0, 28) })
      prisma.catalogProduct.findMany.mockResolvedValue([
        { externalId: '123', title: 'TV', listPrice: 1000, salePrice: 900 },
      ])
      prisma.conversation.groupBy.mockResolvedValue([
        { status: 'EVALUATED', _count: { status: 1 } },
      ])
    })

    it('should set conversation to EVALUATING then EVALUATED', async () => {
      await worker.processJob({ conversationId: 'conv-1', runId: 'run-1' })

      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'conv-1' },
        data: { status: 'EVALUATING' },
      })
      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'conv-1' },
        data: { status: 'EVALUATED' },
      })
    })

    it('should create evaluation record before calling services', async () => {
      await worker.processJob({ conversationId: 'conv-1', runId: 'run-1' })

      expect(prisma.evaluation.create).toHaveBeenCalledWith({
        data: {
          conversationId: 'conv-1',
          module: 'CONSOLIDATOR',
        },
      })
    })

    it('should call all evaluation services in order', async () => {
      await worker.processJob({ conversationId: 'conv-1', runId: 'run-1' })

      expect(extractionService.extract).toHaveBeenCalledWith(
        sampleConversation.messages,
        [{ externalId: '123', title: 'TV', listPrice: 1000, salePrice: 900 }],
      )
      expect(integrityEval.evaluate).toHaveBeenCalledWith(
        'eval-1',
        sampleConversation.messages,
        [{ externalId: '123', title: 'TV', listPrice: 1000, salePrice: 900 }],
        [],
      )
      expect(qualityEval.evaluate).toHaveBeenCalledWith(sampleConversation.messages)
      expect(patternEval.evaluate).toHaveBeenCalledWith('eval-1', sampleConversation.messages)
      expect(recommendationEval.evaluate).toHaveBeenCalledWith(
        'eval-1',
        sampleConversation.messages,
        expect.objectContaining({ use_case: null }),
        [],
        [],
      )
      expect(consolidator.consolidate).toHaveBeenCalledWith({
        conversationId: 'conv-1',
        evaluationId: 'eval-1',
        integrity: expect.objectContaining({ findings: expect.any(Array) }),
        quality: expect.objectContaining({ score: 7.5 }),
        patterns: expect.objectContaining({ classifications: expect.any(Array) }),
        recommendation: expect.objectContaining({ findings: expect.any(Array) }),
        statedNeeds: expect.objectContaining({ use_case: null }),
      })
    })

    it('should enrich integrity + recommendation with rawData specs for mentioned products', async () => {
      extractionService.extract.mockResolvedValue({
        mentionedExternalIds: ['123'],
        statedNeeds: {
          use_case: 'gaming',
          budget_min: null,
          budget_max: 5000000,
          must_have_specs: ['16GB RAM'],
          deal_breakers: [],
        },
      })
      catalogService.findProductsByExternalIds.mockResolvedValue([
        {
          externalId: '123',
          title: 'ASUS TUF A15',
          listPrice: 4500000,
          salePrice: 4200000,
          availability: 12,
          category: 'Computadores',
          brand: 'ASUS',
          rawData: {
            'Tarjeta Grafica': 'GeForce® RTX 3050',
            'Memoria RAM': '16 GB',
            'Procesador': 'AMD R7',
            'Software Incluidos': NaN,
            'Es convertible': null,
          },
        },
      ])
      prisma.catalogProduct.findMany.mockResolvedValue([
        { externalId: '123', title: 'ASUS TUF A15', listPrice: 4500000, salePrice: 4200000, category: 'Computadores', brand: 'ASUS' },
        { externalId: '999', title: 'HP Pavilion', listPrice: 4000000, salePrice: 3800000, category: 'Computadores', brand: 'HP' },
      ])

      await worker.processJob({ conversationId: 'conv-1', runId: 'run-1' })

      expect(catalogService.findProductsByExternalIds).toHaveBeenCalledWith('cat-1', ['123'])
      const integrityCall = integrityEval.evaluate.mock.calls[0]
      expect(integrityCall[3]).toEqual([
        expect.objectContaining({
          externalId: '123',
          specs: expect.objectContaining({
            'Tarjeta Grafica': 'GeForce® RTX 3050',
            'Memoria RAM': '16 GB',
          }),
        }),
      ])
      // NaN / null fields are stripped
      expect(integrityCall[3][0].specs).not.toHaveProperty('Software Incluidos')
      expect(integrityCall[3][0].specs).not.toHaveProperty('Es convertible')

      const recCall = recommendationEval.evaluate.mock.calls[0]
      expect(recCall[2]).toMatchObject({ use_case: 'gaming', budget_max: 5000000 })
      expect(recCall[4]).toEqual([
        expect.objectContaining({ externalId: '999', category: 'Computadores' }),
      ])
    })

    it('should update run counts and aggregate score', async () => {
      await worker.processJob({ conversationId: 'conv-1', runId: 'run-1' })

      expect(prisma.run.update).toHaveBeenCalledWith({
        where: { id: 'run-1' },
        data: expect.objectContaining({
          evaluatedCount: 1,
          aggregateScore: 7.5,
        }),
      })
    })
  })

  describe('processJob — catalog not found', () => {
    it('should mark conversation as NOT_EVALUABLE with reason', async () => {
      prisma.conversation.findUnique.mockResolvedValue(sampleConversation)
      catalogService.findByDate.mockResolvedValue(null)
      prisma.conversation.groupBy.mockResolvedValue([
        { status: 'NOT_EVALUABLE', _count: { status: 1 } },
      ])

      await worker.processJob({ conversationId: 'conv-1', runId: 'run-1' })

      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'conv-1' },
        data: {
          status: 'NOT_EVALUABLE',
          notEvaluableReason: expect.stringMatching(/^No catalog for date \d{4}-\d{2}-\d{2}$/),
        },
      })
      expect(integrityEval.evaluate).not.toHaveBeenCalled()
    })
  })

  describe('processJob — conversation not found', () => {
    it('should return early without error', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null)

      await worker.processJob({ conversationId: 'nonexistent', runId: 'run-1' })

      expect(prisma.conversation.update).not.toHaveBeenCalled()
    })
  })

  describe('processJob — error handling', () => {
    it('should mark conversation as FAILED on error', async () => {
      prisma.conversation.findUnique.mockResolvedValue(sampleConversation)
      catalogService.findByDate.mockResolvedValue({ id: 'cat-1' })
      prisma.catalogProduct.findMany.mockResolvedValue([])
      prisma.evaluation.create.mockRejectedValue(new Error('DB error'))
      prisma.conversation.groupBy.mockResolvedValue([
        { status: 'FAILED', _count: { status: 1 } },
      ])

      await worker.processJob({ conversationId: 'conv-1', runId: 'run-1' })

      expect(prisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'conv-1' },
        data: { status: 'FAILED' },
      })
    })
  })

  describe('processJob — run completion', () => {
    it('should set run status to COMPLETED when all conversations are done', async () => {
      prisma.conversation.findUnique.mockResolvedValue(sampleConversation)
      catalogService.findByDate.mockResolvedValue({ id: 'cat-1' })
      prisma.catalogProduct.findMany.mockResolvedValue([])
      prisma.conversation.groupBy.mockResolvedValue([
        { status: 'EVALUATED', _count: { status: 3 } },
      ])

      await worker.processJob({ conversationId: 'conv-1', runId: 'run-1' })

      expect(prisma.run.update).toHaveBeenCalledWith({
        where: { id: 'run-1' },
        data: expect.objectContaining({
          status: 'COMPLETED',
          evaluatedCount: 3,
        }),
      })
    })

    it('should set run status to COMPLETED_WITH_ERRORS when some conversations failed', async () => {
      prisma.conversation.findUnique.mockResolvedValue(sampleConversation)
      catalogService.findByDate.mockResolvedValue({ id: 'cat-1' })
      prisma.catalogProduct.findMany.mockResolvedValue([])
      prisma.conversation.groupBy.mockResolvedValue([
        { status: 'EVALUATED', _count: { status: 2 } },
        { status: 'FAILED', _count: { status: 1 } },
      ])

      await worker.processJob({ conversationId: 'conv-1', runId: 'run-1' })

      expect(prisma.run.update).toHaveBeenCalledWith({
        where: { id: 'run-1' },
        data: expect.objectContaining({
          status: 'COMPLETED_WITH_ERRORS',
          failedCount: 1,
        }),
      })
    })

    it('should set run status to PROCESSING when conversations are still pending', async () => {
      prisma.conversation.findUnique.mockResolvedValue(sampleConversation)
      catalogService.findByDate.mockResolvedValue({ id: 'cat-1' })
      prisma.catalogProduct.findMany.mockResolvedValue([])
      prisma.conversation.groupBy.mockResolvedValue([
        { status: 'EVALUATED', _count: { status: 1 } },
        { status: 'PENDING', _count: { status: 2 } },
      ])

      await worker.processJob({ conversationId: 'conv-1', runId: 'run-1' })

      expect(prisma.run.update).toHaveBeenCalledWith({
        where: { id: 'run-1' },
        data: expect.objectContaining({
          status: 'PROCESSING',
        }),
      })
    })
  })

  describe('processJob — multiple catalogs different dates', () => {
    it('should resolve catalog for specific conversation date', async () => {
      const conv1 = { ...sampleConversation, conversationDate: new Date(2026, 0, 28) }
      prisma.conversation.findUnique.mockResolvedValue(conv1)
      catalogService.findByDate.mockResolvedValue({ id: 'cat-jan28' })
      prisma.catalogProduct.findMany.mockResolvedValue([])
      prisma.conversation.groupBy.mockResolvedValue([
        { status: 'EVALUATED', _count: { status: 1 } },
      ])

      await worker.processJob({ conversationId: 'conv-1', runId: 'run-1' })

      expect(catalogService.findByDate).toHaveBeenCalledWith(
        new Date(Date.UTC(2026, 0, 28)),
      )
    })

    it('should handle different conversations with different catalog dates', async () => {
      // First conversation: Jan 28
      const conv1 = { ...sampleConversation, id: 'conv-1', conversationDate: new Date(2026, 0, 28) }
      prisma.conversation.findUnique.mockResolvedValueOnce(conv1)
      catalogService.findByDate.mockResolvedValueOnce({ id: 'cat-jan28' })
      prisma.catalogProduct.findMany.mockResolvedValueOnce([])
      prisma.conversation.groupBy.mockResolvedValue([
        { status: 'EVALUATED', _count: { status: 1 } },
        { status: 'PENDING', _count: { status: 1 } },
      ])

      await worker.processJob({ conversationId: 'conv-1', runId: 'run-1' })

      // Second conversation: Feb 1
      const conv2 = { ...sampleConversation, id: 'conv-2', conversationDate: new Date(2026, 1, 1) }
      prisma.conversation.findUnique.mockResolvedValueOnce(conv2)
      catalogService.findByDate.mockResolvedValueOnce({ id: 'cat-feb01' })
      prisma.catalogProduct.findMany.mockResolvedValueOnce([])
      prisma.conversation.groupBy.mockResolvedValue([
        { status: 'EVALUATED', _count: { status: 2 } },
      ])

      await worker.processJob({ conversationId: 'conv-2', runId: 'run-1' })

      expect(catalogService.findByDate).toHaveBeenCalledWith(new Date(Date.UTC(2026, 0, 28)))
      expect(catalogService.findByDate).toHaveBeenCalledWith(new Date(Date.UTC(2026, 1, 1)))
    })
  })
})
