import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ReevaluationService } from './reevaluation.service'
import { NotFoundException } from '@nestjs/common'

function makePrismaStub() {
  return {
    run: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    conversation: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  }
}

function makePipelineStub() {
  return {
    launchRun: vi.fn().mockResolvedValue({ status: 'PROCESSING', queuedConversations: 2 }),
  }
}

describe('ReevaluationService', () => {
  let service: ReevaluationService
  let prisma: ReturnType<typeof makePrismaStub>
  let pipeline: ReturnType<typeof makePipelineStub>

  beforeEach(() => {
    prisma = makePrismaStub()
    pipeline = makePipelineStub()
    service = new ReevaluationService(prisma as any, pipeline as any)
  })

  describe('reevaluateRun', () => {
    it('should create a new run from original and launch evaluation', async () => {
      prisma.run.findUnique.mockResolvedValue({
        id: 'run-1',
        name: 'RUN-20260317-abc123',
      })
      prisma.conversation.findMany.mockResolvedValue([
        {
          id: 'conv-1',
          sessionId: 'sess_1',
          conversationDate: new Date(),
          messageCount: 2,
          messages: [
            { role: 'CUSTOMER', content: 'Hello', orderIndex: 0 },
            { role: 'AGENT', content: 'Hi', orderIndex: 1 },
          ],
        },
        {
          id: 'conv-2',
          sessionId: 'sess_2',
          conversationDate: new Date(),
          messageCount: 1,
          messages: [
            { role: 'CUSTOMER', content: 'Hey', orderIndex: 0 },
          ],
        },
      ])
      prisma.run.create.mockResolvedValue({
        id: 'new-run-1',
        name: 'REEVAL-RUN-20260317-abc123-20260317',
        status: 'PENDING',
      })
      prisma.conversation.create.mockResolvedValue({})

      const result = await service.reevaluateRun('run-1', 'user-1')

      expect(result.originalRunId).toBe('run-1')
      expect(result.newRunId).toBe('new-run-1')
      expect(result.newRunName).toContain('REEVAL-RUN-20260317-abc123')
      expect(result.conversationsCopied).toBe(2)
      expect(result.status).toBe('PROCESSING')

      // Should have created 2 conversations
      expect(prisma.conversation.create).toHaveBeenCalledTimes(2)
      // Should have launched the pipeline
      expect(pipeline.launchRun).toHaveBeenCalledWith('new-run-1')
    })

    it('should throw NotFoundException if original run not found', async () => {
      prisma.run.findUnique.mockResolvedValue(null)
      await expect(service.reevaluateRun('nonexistent', 'user-1')).rejects.toThrow(NotFoundException)
    })

    it('should throw NotFoundException if no conversations match filters', async () => {
      prisma.run.findUnique.mockResolvedValue({ id: 'run-1', name: 'RUN-1' })
      prisma.conversation.findMany.mockResolvedValue([])

      await expect(
        service.reevaluateRun('run-1', 'user-1', { status: 'FAILED' }),
      ).rejects.toThrow(NotFoundException)
    })

    it('should apply status filter', async () => {
      prisma.run.findUnique.mockResolvedValue({ id: 'run-1', name: 'RUN-1' })
      prisma.conversation.findMany.mockResolvedValue([
        {
          id: 'conv-1',
          sessionId: 'sess_1',
          conversationDate: new Date(),
          messageCount: 1,
          messages: [{ role: 'CUSTOMER', content: 'Hi', orderIndex: 0 }],
        },
      ])
      prisma.run.create.mockResolvedValue({ id: 'new-run-1', status: 'PENDING' })
      prisma.conversation.create.mockResolvedValue({})

      await service.reevaluateRun('run-1', 'user-1', { status: 'EVALUATED' })

      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            runId: 'run-1',
            status: 'EVALUATED',
          }),
        }),
      )
    })

    it('should apply label filter', async () => {
      prisma.run.findUnique.mockResolvedValue({ id: 'run-1', name: 'RUN-1' })
      prisma.conversation.findMany.mockResolvedValue([
        {
          id: 'conv-1',
          sessionId: 'sess_1',
          conversationDate: new Date(),
          messageCount: 1,
          messages: [{ role: 'CUSTOMER', content: 'Hi', orderIndex: 0 }],
        },
      ])
      prisma.run.create.mockResolvedValue({ id: 'new-run-1', status: 'PENDING' })
      prisma.conversation.create.mockResolvedValue({})

      await service.reevaluateRun('run-1', 'user-1', { label: 'FALLIDA' })

      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            runId: 'run-1',
            evaluation: expect.objectContaining({ label: 'FALLIDA' }),
          }),
        }),
      )
    })

    it('should apply findingType filter', async () => {
      prisma.run.findUnique.mockResolvedValue({ id: 'run-1', name: 'RUN-1' })
      prisma.conversation.findMany.mockResolvedValue([
        {
          id: 'conv-1',
          sessionId: 'sess_1',
          conversationDate: new Date(),
          messageCount: 1,
          messages: [{ role: 'CUSTOMER', content: 'Hi', orderIndex: 0 }],
        },
      ])
      prisma.run.create.mockResolvedValue({ id: 'new-run-1', status: 'PENDING' })
      prisma.conversation.create.mockResolvedValue({})

      await service.reevaluateRun('run-1', 'user-1', { findingType: 'wrong_price' })

      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            evaluation: expect.objectContaining({
              findings: { some: { type: 'wrong_price' } },
            }),
          }),
        }),
      )
    })

    it('should apply pattern filter', async () => {
      prisma.run.findUnique.mockResolvedValue({ id: 'run-1', name: 'RUN-1' })
      prisma.conversation.findMany.mockResolvedValue([
        {
          id: 'conv-1',
          sessionId: 'sess_1',
          conversationDate: new Date(),
          messageCount: 1,
          messages: [{ role: 'CUSTOMER', content: 'Hi', orderIndex: 0 }],
        },
      ])
      prisma.run.create.mockResolvedValue({ id: 'new-run-1', status: 'PENDING' })
      prisma.conversation.create.mockResolvedValue({})

      await service.reevaluateRun('run-1', 'user-1', { pattern: 'greeting' })

      expect(prisma.conversation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            evaluation: expect.objectContaining({
              patterns: { some: { name: 'greeting' } },
            }),
          }),
        }),
      )
    })
  })
})
