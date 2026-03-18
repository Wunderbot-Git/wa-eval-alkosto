import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RetentionService } from './retention.service'

function makePrismaStub() {
  return {
    run: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      deleteMany: vi.fn(),
    },
    conversation: {
      findMany: vi.fn(),
    },
    shareRecord: {
      deleteMany: vi.fn(),
    },
    exportJob: {
      deleteMany: vi.fn(),
    },
  }
}

describe('RetentionService', () => {
  let service: RetentionService
  let prisma: ReturnType<typeof makePrismaStub>

  beforeEach(() => {
    prisma = makePrismaStub()
    service = new RetentionService(prisma as any)
  })

  describe('setExpiration', () => {
    it('should set expiresAt to createdAt + 3 months', async () => {
      const createdAt = new Date('2026-01-15T10:00:00Z')
      prisma.run.findUnique.mockResolvedValue({ createdAt })
      prisma.run.update.mockResolvedValue({})

      const result = await service.setExpiration('run-1')
      expect(result).toBeDefined()
      expect(result!.runId).toBe('run-1')

      const expectedExpiry = new Date('2026-04-15T10:00:00Z')
      expect(result!.expiresAt.getTime()).toBe(expectedExpiry.getTime())

      expect(prisma.run.update).toHaveBeenCalledWith({
        where: { id: 'run-1' },
        data: { expiresAt: expect.any(Date) },
      })
    })

    it('should return undefined if run not found', async () => {
      prisma.run.findUnique.mockResolvedValue(null)
      const result = await service.setExpiration('nonexistent')
      expect(result).toBeUndefined()
    })
  })

  describe('cleanupExpired', () => {
    it('should delete expired runs and related data', async () => {
      prisma.run.findMany.mockResolvedValue([
        { id: 'run-1', name: 'RUN-1' },
        { id: 'run-2', name: 'RUN-2' },
      ])
      prisma.conversation.findMany.mockResolvedValue([
        { id: 'conv-1' },
        { id: 'conv-2' },
      ])
      prisma.shareRecord.deleteMany.mockResolvedValue({ count: 2 })
      prisma.exportJob.deleteMany.mockResolvedValue({ count: 1 })
      prisma.run.deleteMany.mockResolvedValue({ count: 2 })

      const result = await service.cleanupExpired()
      expect(result.deleted).toBe(2)
      expect(prisma.shareRecord.deleteMany).toHaveBeenCalledTimes(2)
      expect(prisma.exportJob.deleteMany).toHaveBeenCalledTimes(1)
      expect(prisma.run.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ['run-1', 'run-2'] } },
      })
    })

    it('should return 0 when no expired runs', async () => {
      prisma.run.findMany.mockResolvedValue([])
      const result = await service.cleanupExpired()
      expect(result.deleted).toBe(0)
    })
  })

  describe('getStats', () => {
    it('should return retention statistics', async () => {
      prisma.run.count
        .mockResolvedValueOnce(50) // totalRuns
        .mockResolvedValueOnce(5)  // expiringSoon
        .mockResolvedValueOnce(2)  // expired
      prisma.run.findMany.mockResolvedValue([
        { id: 'run-1', name: 'RUN-1', expiresAt: new Date(), totalConversations: 10 },
      ])

      const result = await service.getStats()
      expect(result.totalRuns).toBe(50)
      expect(result.expiringSoonCount).toBe(5)
      expect(result.expiredCount).toBe(2)
      expect(result.runsExpiringSoon).toHaveLength(1)
    })
  })
})
