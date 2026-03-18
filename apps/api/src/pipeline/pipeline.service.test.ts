import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PipelineService } from './pipeline.service'
import { NotFoundException, BadRequestException } from '@nestjs/common'

function makePrismaStub() {
  return {
    run: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    conversation: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  }
}

function makeQueueStub() {
  return {
    addBatchJobs: vi.fn().mockResolvedValue([]),
  }
}

describe('PipelineService', () => {
  let service: PipelineService
  let prisma: ReturnType<typeof makePrismaStub>
  let queue: ReturnType<typeof makeQueueStub>

  beforeEach(() => {
    prisma = makePrismaStub()
    queue = makeQueueStub()
    service = new PipelineService(prisma as any, queue as any)
  })

  describe('launchRun', () => {
    it('should update run to PROCESSING and queue conversations', async () => {
      prisma.run.findUnique.mockResolvedValue({ id: 'run-1', status: 'PENDING' })
      prisma.run.update.mockResolvedValue({})
      prisma.conversation.findMany.mockResolvedValue([
        { id: 'conv-1' },
        { id: 'conv-2' },
      ])

      const result = await service.launchRun('run-1')

      expect(prisma.run.update).toHaveBeenCalledWith({
        where: { id: 'run-1' },
        data: { status: 'PROCESSING' },
      })
      expect(queue.addBatchJobs).toHaveBeenCalledWith(['conv-1', 'conv-2'], 'run-1')
      expect(result.status).toBe('PROCESSING')
      expect(result.queuedConversations).toBe(2)
    })

    it('should throw NotFoundException if run does not exist', async () => {
      prisma.run.findUnique.mockResolvedValue(null)
      await expect(service.launchRun('nonexistent')).rejects.toThrow(NotFoundException)
    })

    it('should throw BadRequestException if run is not PENDING', async () => {
      prisma.run.findUnique.mockResolvedValue({ id: 'run-1', status: 'PROCESSING' })
      await expect(service.launchRun('run-1')).rejects.toThrow(BadRequestException)
    })

    it('should handle run with no pending conversations', async () => {
      prisma.run.findUnique.mockResolvedValue({ id: 'run-1', status: 'PENDING' })
      prisma.run.update.mockResolvedValue({})
      prisma.conversation.findMany.mockResolvedValue([])

      const result = await service.launchRun('run-1')
      expect(queue.addBatchJobs).not.toHaveBeenCalled()
      expect(result.queuedConversations).toBe(0)
    })
  })

  describe('getRunStatus', () => {
    it('should return run status and counts', async () => {
      prisma.run.findUnique.mockResolvedValue({
        status: 'PROCESSING',
        totalConversations: 10,
        evaluatedCount: 5,
        notEvaluableCount: 2,
        failedCount: 1,
      })

      const result = await service.getRunStatus('run-1')
      expect(result.status).toBe('PROCESSING')
      expect(result.totalConversations).toBe(10)
      expect(result.evaluatedCount).toBe(5)
      expect(result.notEvaluableCount).toBe(2)
      expect(result.failedCount).toBe(1)
    })

    it('should throw NotFoundException if run not found', async () => {
      prisma.run.findUnique.mockResolvedValue(null)
      await expect(service.getRunStatus('nonexistent')).rejects.toThrow(NotFoundException)
    })
  })

  describe('cancelRun', () => {
    it('should cancel a PROCESSING run and mark pending conversations as NOT_EVALUABLE', async () => {
      prisma.run.findUnique.mockResolvedValue({ id: 'run-1', status: 'PROCESSING' })
      prisma.conversation.updateMany.mockResolvedValue({ count: 3 })
      prisma.run.update.mockResolvedValue({ id: 'run-1', status: 'CANCELLED' })

      const result = await service.cancelRun('run-1')

      expect(prisma.conversation.updateMany).toHaveBeenCalledWith({
        where: { runId: 'run-1', status: 'PENDING' },
        data: {
          status: 'NOT_EVALUABLE',
          notEvaluableReason: 'Run cancelled',
        },
      })
      expect(prisma.run.update).toHaveBeenCalledWith({
        where: { id: 'run-1' },
        data: { status: 'CANCELLED' },
      })
      expect(result.status).toBe('CANCELLED')
      expect(result.cancelledConversations).toBe(3)
    })

    it('should cancel a PENDING run', async () => {
      prisma.run.findUnique.mockResolvedValue({ id: 'run-1', status: 'PENDING' })
      prisma.conversation.updateMany.mockResolvedValue({ count: 5 })
      prisma.run.update.mockResolvedValue({ id: 'run-1', status: 'CANCELLED' })

      const result = await service.cancelRun('run-1')

      expect(result.status).toBe('CANCELLED')
      expect(result.cancelledConversations).toBe(5)
    })

    it('should throw NotFoundException if run does not exist', async () => {
      prisma.run.findUnique.mockResolvedValue(null)
      await expect(service.cancelRun('nonexistent')).rejects.toThrow(NotFoundException)
    })

    it('should throw BadRequestException if run is COMPLETED', async () => {
      prisma.run.findUnique.mockResolvedValue({ id: 'run-1', status: 'COMPLETED' })
      await expect(service.cancelRun('run-1')).rejects.toThrow(BadRequestException)
    })

    it('should throw BadRequestException if run is CANCELLED', async () => {
      prisma.run.findUnique.mockResolvedValue({ id: 'run-1', status: 'CANCELLED' })
      await expect(service.cancelRun('run-1')).rejects.toThrow(BadRequestException)
    })

    it('should throw BadRequestException if run is COMPLETED_WITH_ERRORS', async () => {
      prisma.run.findUnique.mockResolvedValue({ id: 'run-1', status: 'COMPLETED_WITH_ERRORS' })
      await expect(service.cancelRun('run-1')).rejects.toThrow(BadRequestException)
    })
  })
})
