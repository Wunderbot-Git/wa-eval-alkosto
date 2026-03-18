import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RunService } from './run.service'
import { ConversationParserService } from '../conversations/conversation-parser.service'
import { NotFoundException } from '@nestjs/common'

function makePrismaStub() {
  return {
    run: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    conversation: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    finding: {
      findMany: vi.fn(),
    },
  }
}

describe('RunService', () => {
  let service: RunService
  let prisma: ReturnType<typeof makePrismaStub>
  let parser: ConversationParserService

  beforeEach(() => {
    prisma = makePrismaStub()
    parser = new ConversationParserService()
    service = new RunService(prisma as any, parser)
  })

  describe('generateRunName', () => {
    it('should produce RUN-YYYYMMDD-{6chars} format', () => {
      const name = service.generateRunName()
      expect(name).toMatch(/^RUN-\d{8}-[a-f0-9]{6}$/)
    })

    it('should generate unique names', () => {
      const names = new Set(Array.from({ length: 10 }, () => service.generateRunName()))
      expect(names.size).toBe(10)
    })
  })

  describe('createRun', () => {
    it('should create run with valid conversations', async () => {
      const conversations = [
        {
          session_id: 'sess_1',
          date: '2026-01-23T11:00:00Z',
          messages: [
            { role: 'customer', content: 'Hello' },
            { role: 'agent', content: 'Hi' },
          ],
        },
        {
          session_id: 'sess_2',
          date: '1/24/2026, 2:00:00 PM',
          messages: [{ role: 'customer', content: 'Hey' }],
        },
      ]

      const file = {
        originalname: 'conversations.json',
        buffer: Buffer.from(JSON.stringify(conversations)),
      }

      prisma.run.create.mockResolvedValue({
        id: 'run-1',
        name: 'RUN-20260317-abc123',
        status: 'PENDING',
        totalConversations: 2,
        notEvaluableCount: 0,
        createdAt: new Date(),
      })
      prisma.conversation.create.mockResolvedValue({})

      const result = await service.createRun(file, 'user-1')
      expect(result.totalConversations).toBe(2)
      expect(result.validCount).toBe(2)
      expect(result.notEvaluableCount).toBe(0)
      expect(prisma.run.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'PENDING',
            createdBy: 'user-1',
            totalConversations: 2,
            notEvaluableCount: 0,
          }),
        }),
      )
      expect(prisma.conversation.create).toHaveBeenCalledTimes(2)
    })

    it('should handle mix of valid and invalid conversations', async () => {
      const conversations = [
        {
          session_id: 'sess_1',
          date: '2026-01-23T11:00:00Z',
          messages: [{ role: 'customer', content: 'Hello' }],
        },
        {
          // Missing session_id
          date: '2026-01-23T11:00:00Z',
          messages: [{ role: 'customer', content: 'Hi' }],
        },
      ]

      const file = {
        originalname: 'conversations.json',
        buffer: Buffer.from(JSON.stringify(conversations)),
      }

      prisma.run.create.mockResolvedValue({
        id: 'run-2',
        name: 'RUN-20260317-def456',
        status: 'PENDING',
        totalConversations: 2,
        notEvaluableCount: 1,
        createdAt: new Date(),
      })
      prisma.conversation.create.mockResolvedValue({})

      const result = await service.createRun(file, 'user-1')
      expect(result.totalConversations).toBe(2)
      expect(result.validCount).toBe(1)
      expect(result.notEvaluableCount).toBe(1)
      // 1 valid + 1 invalid = 2 conversation.create calls
      expect(prisma.conversation.create).toHaveBeenCalledTimes(2)

      // Check that the invalid conversation has NOT_EVALUABLE status
      const invalidCall = prisma.conversation.create.mock.calls[1][0]
      expect(invalidCall.data.status).toBe('NOT_EVALUABLE')
      expect(invalidCall.data.notEvaluableReason).toBeTruthy()
    })

    it('should create messages for valid conversations', async () => {
      const conversations = [
        {
          session_id: 'sess_1',
          date: '2026-01-23T11:00:00Z',
          messages: [
            { role: 'customer', content: 'Hello' },
            { role: 'agent', content: 'Hi there' },
          ],
        },
      ]

      const file = {
        originalname: 'conversations.json',
        buffer: Buffer.from(JSON.stringify(conversations)),
      }

      prisma.run.create.mockResolvedValue({
        id: 'run-3',
        name: 'RUN-20260317-ghi789',
        status: 'PENDING',
        totalConversations: 1,
        notEvaluableCount: 0,
        createdAt: new Date(),
      })
      prisma.conversation.create.mockResolvedValue({})

      await service.createRun(file, 'user-1')

      const convCall = prisma.conversation.create.mock.calls[0][0]
      expect(convCall.data.messages.create).toHaveLength(2)
      expect(convCall.data.messages.create[0]).toEqual({
        role: 'CUSTOMER',
        content: 'Hello',
        orderIndex: 0,
      })
      expect(convCall.data.messages.create[1]).toEqual({
        role: 'AGENT',
        content: 'Hi there',
        orderIndex: 1,
      })
    })
  })

  describe('findAll', () => {
    it('should return paginated runs with label distribution', async () => {
      prisma.run.findMany.mockResolvedValue([
        {
          id: 'run-1',
          name: 'RUN-20260317-abc123',
          conversations: [
            { id: 'c1', status: 'EVALUATED', evaluation: { label: 'APROBADA' } },
            { id: 'c2', status: 'NOT_EVALUABLE', evaluation: null },
          ],
        },
      ])
      prisma.run.count.mockResolvedValue(1)

      const result = await service.findAll('user-1', 1, 20)
      expect(result.data).toHaveLength(1)
      expect(result.data[0].labelDistribution.APROBADA).toBe(1)
      expect(result.data[0].labelDistribution.NOT_EVALUABLE).toBe(1)
      expect(result.total).toBe(1)
      expect(result.page).toBe(1)
      expect(result.totalPages).toBe(1)
    })

    it('should calculate correct pagination offset', async () => {
      prisma.run.findMany.mockResolvedValue([])
      prisma.run.count.mockResolvedValue(50)

      const result = await service.findAll('user-1', 3, 10)
      expect(result.page).toBe(3)
      expect(result.totalPages).toBe(5)
      expect(prisma.run.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      )
    })
  })

  describe('findById', () => {
    it('should return run with conversation count', async () => {
      prisma.run.findUnique.mockResolvedValue({
        id: 'run-1',
        name: 'RUN-20260317-abc123',
        _count: { conversations: 5 },
      })

      const result = await service.findById('run-1')
      expect(result.id).toBe('run-1')
      expect(result._count.conversations).toBe(5)
    })

    it('should throw NotFoundException if run not found', async () => {
      prisma.run.findUnique.mockResolvedValue(null)
      await expect(service.findById('nonexistent')).rejects.toThrow(
        NotFoundException,
      )
    })
  })

  describe('findLatest', () => {
    it('should return the latest run with label distribution', async () => {
      prisma.run.findFirst.mockResolvedValue({
        id: 'run-1',
        name: 'RUN-20260317-abc123',
        status: 'COMPLETED',
      })
      prisma.conversation.findMany.mockResolvedValue([
        { status: 'EVALUATED', evaluation: { label: 'APROBADA' } },
        { status: 'EVALUATED', evaluation: { label: 'CON_HALLAZGOS' } },
        { status: 'NOT_EVALUABLE', evaluation: null },
      ])

      const result = await service.findLatest('user-1')
      expect(result).not.toBeNull()
      expect(result!.labelDistribution.APROBADA).toBe(1)
      expect(result!.labelDistribution.CON_HALLAZGOS).toBe(1)
      expect(result!.labelDistribution.NOT_EVALUABLE).toBe(1)
    })

    it('should return null when no runs exist', async () => {
      prisma.run.findFirst.mockResolvedValue(null)
      const result = await service.findLatest('user-1')
      expect(result).toBeNull()
    })
  })

  describe('getRunSummary', () => {
    it('should return run summary with label distribution and top findings', async () => {
      prisma.run.findUnique.mockResolvedValue({
        id: 'run-1',
        name: 'RUN-20260317-abc123',
        status: 'COMPLETED',
      })
      prisma.conversation.findMany.mockResolvedValue([
        { status: 'EVALUATED', evaluation: { label: 'APROBADA', score: 0.9 } },
        { status: 'EVALUATED', evaluation: { label: 'FALLIDA', score: 0.3 } },
      ])
      prisma.finding.findMany.mockResolvedValue([
        { type: 'wrong_price' },
        { type: 'wrong_price' },
        { type: 'missing_info' },
      ])

      const result = await service.getRunSummary('run-1')
      expect(result.run.id).toBe('run-1')
      expect(result.labelDistribution.APROBADA).toBe(1)
      expect(result.labelDistribution.FALLIDA).toBe(1)
      expect(result.topFindings).toHaveLength(2)
      expect(result.topFindings[0].type).toBe('wrong_price')
      expect(result.topFindings[0].count).toBe(2)
    })

    it('should throw NotFoundException for missing run', async () => {
      prisma.run.findUnique.mockResolvedValue(null)
      await expect(service.getRunSummary('nonexistent')).rejects.toThrow(NotFoundException)
    })
  })

  describe('getRunComparison', () => {
    it('should return comparison with previous run', async () => {
      prisma.run.findUnique.mockResolvedValue({
        id: 'run-2',
        aggregateScore: 0.85,
        createdAt: new Date('2026-03-18'),
        createdBy: 'user-1',
      })

      // Current run conversations
      prisma.conversation.findMany.mockResolvedValueOnce([
        { status: 'EVALUATED', evaluation: { label: 'APROBADA' } },
        { status: 'EVALUATED', evaluation: { label: 'APROBADA' } },
        { status: 'EVALUATED', evaluation: { label: 'CON_HALLAZGOS' } },
        { status: 'EVALUATED', evaluation: { label: 'FALLIDA' } },
      ])

      // Previous run
      prisma.run.findFirst.mockResolvedValue({
        id: 'run-1',
        aggregateScore: 0.70,
      })

      // Previous run conversations
      prisma.conversation.findMany.mockResolvedValueOnce([
        { status: 'EVALUATED', evaluation: { label: 'APROBADA' } },
        { status: 'EVALUATED', evaluation: { label: 'CON_HALLAZGOS' } },
        { status: 'EVALUATED', evaluation: { label: 'FALLIDA' } },
        { status: 'EVALUATED', evaluation: { label: 'FALLIDA' } },
      ])

      const result = await service.getRunComparison('run-2')

      expect(result.current.score).toBe(0.85)
      expect(result.current.aprobadas).toBe(2)
      expect(result.current.conHallazgos).toBe(1)
      expect(result.current.fallidas).toBe(1)
      expect(result.current.total).toBe(4)

      expect(result.previous).not.toBeNull()
      expect(result.previous!.score).toBe(0.70)
      expect(result.previous!.aprobadas).toBe(1)
      expect(result.previous!.fallidas).toBe(2)

      expect(result.deltas).not.toBeNull()
      expect(result.deltas!.score).toBeCloseTo(0.15)
      expect(result.deltas!.aprobadas).toBe(1)
      expect(result.deltas!.conHallazgos).toBe(0)
      expect(result.deltas!.fallidas).toBe(-1)
    })

    it('should return null previous and deltas when no previous run exists', async () => {
      prisma.run.findUnique.mockResolvedValue({
        id: 'run-1',
        aggregateScore: 0.85,
        createdAt: new Date('2026-03-18'),
        createdBy: 'user-1',
      })

      prisma.conversation.findMany.mockResolvedValueOnce([
        { status: 'EVALUATED', evaluation: { label: 'APROBADA' } },
      ])

      prisma.run.findFirst.mockResolvedValue(null)

      const result = await service.getRunComparison('run-1')

      expect(result.current.aprobadas).toBe(1)
      expect(result.previous).toBeNull()
      expect(result.deltas).toBeNull()
    })

    it('should handle null scores gracefully', async () => {
      prisma.run.findUnique.mockResolvedValue({
        id: 'run-2',
        aggregateScore: null,
        createdAt: new Date('2026-03-18'),
        createdBy: 'user-1',
      })

      prisma.conversation.findMany.mockResolvedValueOnce([])

      prisma.run.findFirst.mockResolvedValue({
        id: 'run-1',
        aggregateScore: 0.70,
      })

      prisma.conversation.findMany.mockResolvedValueOnce([
        { status: 'EVALUATED', evaluation: { label: 'APROBADA' } },
      ])

      const result = await service.getRunComparison('run-2')

      expect(result.deltas!.score).toBeNull()
      expect(result.deltas!.aprobadas).toBe(-1)
    })

    it('should throw NotFoundException for missing run', async () => {
      prisma.run.findUnique.mockResolvedValue(null)
      await expect(service.getRunComparison('nonexistent')).rejects.toThrow(NotFoundException)
    })
  })

  describe('getRunConversations', () => {
    it('should return paginated conversations for a run', async () => {
      prisma.run.findUnique.mockResolvedValue({ id: 'run-1' })
      prisma.conversation.findMany.mockResolvedValue([
        { id: 'conv-1', sessionId: 'sess_1', status: 'EVALUATED', evaluation: { score: 0.9, label: 'APROBADA' } },
      ])
      prisma.conversation.count.mockResolvedValue(1)

      const result = await service.getRunConversations('run-1', 1, 20)
      expect(result.data).toHaveLength(1)
      expect(result.total).toBe(1)
    })

    it('should filter by status', async () => {
      prisma.run.findUnique.mockResolvedValue({ id: 'run-1' })
      prisma.conversation.findMany.mockResolvedValue([])
      prisma.conversation.count.mockResolvedValue(0)

      await service.getRunConversations('run-1', 1, 20, 'EVALUATED')
      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { runId: 'run-1', status: 'EVALUATED' },
        }),
      )
    })

    it('should filter by label', async () => {
      prisma.run.findUnique.mockResolvedValue({ id: 'run-1' })
      prisma.conversation.findMany.mockResolvedValue([])
      prisma.conversation.count.mockResolvedValue(0)

      await service.getRunConversations('run-1', 1, 20, undefined, 'APROBADA')
      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { runId: 'run-1', evaluation: { label: 'APROBADA' } },
        }),
      )
    })

    it('should throw NotFoundException for missing run', async () => {
      prisma.run.findUnique.mockResolvedValue(null)
      await expect(service.getRunConversations('nonexistent')).rejects.toThrow(NotFoundException)
    })
  })
})
