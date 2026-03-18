import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConversationController } from './conversation.controller'
import { NotFoundException } from '@nestjs/common'

function makePrismaStub() {
  return {
    conversation: {
      findUnique: vi.fn(),
    },
  }
}

function makeSharingStub() {
  return {
    isConversationShared: vi.fn().mockResolvedValue(true),
  }
}

function makeRequest(role = 'ADMIN') {
  return { user: { id: 'user-1', role } } as any
}

describe('ConversationController', () => {
  let controller: ConversationController
  let prisma: ReturnType<typeof makePrismaStub>
  let sharing: ReturnType<typeof makeSharingStub>

  beforeEach(() => {
    prisma = makePrismaStub()
    sharing = makeSharingStub()
    controller = new ConversationController(prisma as any, sharing as any)
  })

  describe('getConversation', () => {
    it('should return conversation with messages, evaluation, and snapshot', async () => {
      const mockConversation = {
        id: 'conv-1',
        sessionId: 'sess_1',
        status: 'EVALUATED',
        messages: [
          { id: 'msg-1', role: 'CUSTOMER', content: 'Hello', orderIndex: 0 },
          { id: 'msg-2', role: 'AGENT', content: 'Hi there', orderIndex: 1 },
        ],
        evaluation: {
          id: 'eval-1',
          score: 0.85,
          label: 'APROBADA',
          findings: [{ id: 'f-1', type: 'wrong_price', severity: 'WARNING' }],
          patterns: [{ id: 'p-1', name: 'greeting', isEmergent: false }],
        },
        snapshot: { id: 'snap-1', data: {} },
      }

      prisma.conversation.findUnique.mockResolvedValue(mockConversation)

      const result = await controller.getConversation('conv-1', makeRequest())
      expect(result.id).toBe('conv-1')
      expect(result.messages).toHaveLength(2)
      expect(result.evaluation!.findings).toHaveLength(1)
      expect(result.evaluation!.patterns).toHaveLength(1)

      expect(prisma.conversation.findUnique).toHaveBeenCalledWith({
        where: { id: 'conv-1' },
        include: {
          messages: { orderBy: { orderIndex: 'asc' } },
          evaluation: {
            include: {
              findings: true,
              patterns: true,
            },
          },
          snapshot: true,
        },
      })
    })

    it('should throw NotFoundException if conversation not found', async () => {
      prisma.conversation.findUnique.mockResolvedValue(null)

      await expect(controller.getConversation('nonexistent', makeRequest())).rejects.toThrow(
        NotFoundException,
      )
    })

    it('should check sharing for YALO_READER users', async () => {
      sharing.isConversationShared.mockResolvedValue(true)
      prisma.conversation.findUnique.mockResolvedValue({
        id: 'conv-1',
        messages: [],
        evaluation: null,
        snapshot: null,
      })

      await controller.getConversation('conv-1', makeRequest('YALO_READER'))
      expect(sharing.isConversationShared).toHaveBeenCalledWith('conv-1')
    })

    it('should throw ForbiddenException for YALO_READER when conversation not shared', async () => {
      sharing.isConversationShared.mockResolvedValue(false)

      await expect(
        controller.getConversation('conv-1', makeRequest('YALO_READER')),
      ).rejects.toThrow()
    })
  })
})
