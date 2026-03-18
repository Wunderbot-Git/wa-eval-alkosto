import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SharingService } from './sharing.service'
import { NotFoundException, ForbiddenException } from '@nestjs/common'

function makePrismaStub() {
  return {
    run: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    shareRecord: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    conversation: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
  }
}

describe('SharingService', () => {
  let service: SharingService
  let prisma: ReturnType<typeof makePrismaStub>

  beforeEach(() => {
    prisma = makePrismaStub()
    service = new SharingService(prisma as any)
  })

  describe('shareRun', () => {
    it('should share a run and its conversations', async () => {
      prisma.run.findUnique.mockResolvedValue({
        id: 'run-1',
        conversations: [{ id: 'conv-1' }, { id: 'conv-2' }],
      })
      prisma.shareRecord.findFirst.mockResolvedValue(null)
      prisma.shareRecord.create.mockResolvedValue({})

      const result = await service.shareRun('run-1', 'user-1')
      expect(result.shared).toBe(true)
      expect(result.conversationsShared).toBe(2)
      // 1 for run + 2 for conversations = 3 create calls
      expect(prisma.shareRecord.create).toHaveBeenCalledTimes(3)
    })

    it('should return alreadyShared if run is already shared', async () => {
      prisma.run.findUnique.mockResolvedValue({
        id: 'run-1',
        conversations: [],
      })
      prisma.shareRecord.findFirst.mockResolvedValue({ id: 'share-1' })

      const result = await service.shareRun('run-1', 'user-1')
      expect(result.alreadyShared).toBe(true)
      expect(prisma.shareRecord.create).not.toHaveBeenCalled()
    })

    it('should throw NotFoundException if run not found', async () => {
      prisma.run.findUnique.mockResolvedValue(null)
      await expect(service.shareRun('nonexistent', 'user-1')).rejects.toThrow(NotFoundException)
    })
  })

  describe('shareConversation', () => {
    it('should share a conversation', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'conv-1' })
      prisma.shareRecord.findFirst.mockResolvedValue(null)
      prisma.shareRecord.create.mockResolvedValue({})

      const result = await service.shareConversation('conv-1', 'user-1')
      expect(result.shared).toBe(true)
      expect(result.conversationId).toBe('conv-1')
    })

    it('should return alreadyShared if conversation is already shared', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ id: 'conv-1' })
      prisma.shareRecord.findFirst.mockResolvedValue({ id: 'share-1' })

      const result = await service.shareConversation('conv-1', 'user-1')
      expect(result.alreadyShared).toBe(true)
    })

    it('should throw NotFoundException if conversation not found', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null)
      await expect(service.shareConversation('nonexistent', 'user-1')).rejects.toThrow(NotFoundException)
    })
  })

  describe('getSharedRuns', () => {
    it('should return paginated shared runs', async () => {
      prisma.shareRecord.findMany.mockResolvedValue([
        { runId: 'run-1' },
        { runId: 'run-2' },
      ])
      prisma.run.findMany.mockResolvedValue([
        {
          id: 'run-1',
          name: 'RUN-1',
          conversations: [
            { id: 'c1', status: 'EVALUATED', evaluation: { label: 'APROBADA' } },
          ],
        },
      ])

      const result = await service.getSharedRuns(1, 20)
      expect(result.total).toBe(2)
      expect(result.data).toHaveLength(1)
      expect(result.data[0].labelDistribution.APROBADA).toBe(1)
    })
  })

  describe('getSharedConversations', () => {
    it('should return conversations for a shared run', async () => {
      prisma.shareRecord.findFirst.mockResolvedValue({ id: 'share-1', runId: 'run-1' })
      prisma.conversation.findMany.mockResolvedValue([
        { id: 'conv-1', sessionId: 'sess_1', status: 'EVALUATED' },
      ])
      prisma.conversation.count.mockResolvedValue(1)

      const result = await service.getSharedConversations('run-1', 1, 20)
      expect(result.data).toHaveLength(1)
      expect(result.total).toBe(1)
    })

    it('should throw ForbiddenException if run is not shared', async () => {
      prisma.shareRecord.findFirst.mockResolvedValue(null)
      await expect(service.getSharedConversations('run-1')).rejects.toThrow(ForbiddenException)
    })
  })

  describe('isShared', () => {
    it('should return true if run is shared', async () => {
      prisma.shareRecord.findFirst.mockResolvedValue({ id: 'share-1' })
      const result = await service.isShared('run-1')
      expect(result).toBe(true)
    })

    it('should return false if run is not shared', async () => {
      prisma.shareRecord.findFirst.mockResolvedValue(null)
      const result = await service.isShared('run-1')
      expect(result).toBe(false)
    })
  })

  describe('isConversationShared', () => {
    it('should return true if conversation is shared', async () => {
      prisma.shareRecord.findFirst.mockResolvedValue({ id: 'share-1' })
      const result = await service.isConversationShared('conv-1')
      expect(result).toBe(true)
    })

    it('should return false if conversation is not shared', async () => {
      prisma.shareRecord.findFirst.mockResolvedValue(null)
      const result = await service.isConversationShared('conv-1')
      expect(result).toBe(false)
    })
  })
})
