import { describe, it, expect, vi, beforeEach } from 'vitest'
import { UserService } from './user.service'
import { NotFoundException, BadRequestException } from '@nestjs/common'

function makePrismaStub() {
  return {
    user: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    session: {
      deleteMany: vi.fn(),
    },
  }
}

function makeAuthServiceStub() {
  return {
    hashPassword: vi.fn().mockReturnValue('salt:hash'),
  }
}

describe('UserService', () => {
  let service: UserService
  let prisma: ReturnType<typeof makePrismaStub>
  let authService: ReturnType<typeof makeAuthServiceStub>

  beforeEach(() => {
    prisma = makePrismaStub()
    authService = makeAuthServiceStub()
    service = new UserService(prisma as any, authService as any)
  })

  describe('listUsers', () => {
    it('should return all users with selected fields', async () => {
      const users = [
        { id: 'u1', email: 'a@b.com', role: 'ADMIN', isActive: true, createdAt: new Date(), updatedAt: new Date() },
        { id: 'u2', email: 'c@d.com', role: 'INTERNAL_ALKOSTO', isActive: true, createdAt: new Date(), updatedAt: new Date() },
      ]
      prisma.user.findMany.mockResolvedValue(users)

      const result = await service.listUsers()
      expect(result).toEqual(users)
      expect(prisma.user.findMany).toHaveBeenCalledWith({
        select: {
          id: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
      })
    })
  })

  describe('deactivateUser', () => {
    it('should deactivate user and delete sessions', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', isActive: true })
      prisma.user.update.mockResolvedValue({ id: 'u1', email: 'a@b.com', role: 'ADMIN', isActive: false })
      prisma.session.deleteMany.mockResolvedValue({ count: 2 })

      const result = await service.deactivateUser('u1')
      expect(result.isActive).toBe(false)
      expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } })
    })

    it('should throw NotFoundException if user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null)

      await expect(service.deactivateUser('bad-id')).rejects.toThrow(NotFoundException)
    })
  })

  describe('changeRole', () => {
    it('should update user role', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', role: 'INTERNAL_ALKOSTO' })
      prisma.user.update.mockResolvedValue({ id: 'u1', email: 'a@b.com', role: 'ADMIN', isActive: true })

      const result = await service.changeRole('u1', 'ADMIN' as any)
      expect(result.role).toBe('ADMIN')
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { role: 'ADMIN' },
        select: { id: true, email: true, role: true, isActive: true },
      })
    })

    it('should throw NotFoundException if user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null)

      await expect(service.changeRole('bad-id', 'ADMIN' as any)).rejects.toThrow(NotFoundException)
    })

    it('should throw BadRequestException for invalid role', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' })

      await expect(service.changeRole('u1', 'FAKE_ROLE' as any)).rejects.toThrow(BadRequestException)
    })
  })

  describe('resetPassword', () => {
    it('should generate temp password, hash it, and delete sessions', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' })
      prisma.user.update.mockResolvedValue({})
      prisma.session.deleteMany.mockResolvedValue({ count: 1 })

      const result = await service.resetPassword('u1')
      expect(result.tempPassword).toBeDefined()
      expect(typeof result.tempPassword).toBe('string')
      expect(result.tempPassword.length).toBeGreaterThan(0)
      expect(authService.hashPassword).toHaveBeenCalled()
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { passwordHash: 'salt:hash' },
      })
      expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } })
    })

    it('should throw NotFoundException if user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null)

      await expect(service.resetPassword('bad-id')).rejects.toThrow(NotFoundException)
    })
  })
})
