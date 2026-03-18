import { describe, it, expect, vi } from 'vitest'
import { SessionCleanupService } from './session-cleanup.service'

describe('SessionCleanupService', () => {
  function createService() {
    const prisma = {
      session: {
        deleteMany: vi.fn(),
      },
    } as any

    const service = new SessionCleanupService(prisma)
    return { service, prisma }
  }

  it('should delete expired sessions', async () => {
    const { service, prisma } = createService()
    prisma.session.deleteMany.mockResolvedValue({ count: 5 })

    const result = await service.cleanupExpiredSessions()

    expect(result.deleted).toBe(5)
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({
      where: {
        expiresAt: { lte: expect.any(Date) },
      },
    })
  })

  it('should return 0 when no expired sessions', async () => {
    const { service, prisma } = createService()
    prisma.session.deleteMany.mockResolvedValue({ count: 0 })

    const result = await service.cleanupExpiredSessions()
    expect(result.deleted).toBe(0)
  })
})
